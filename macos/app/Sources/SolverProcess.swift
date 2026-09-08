import Foundation
import Security

/// The embedded solver: start it, know when it is ready, take it down with us.
///
/// The app is the only client this server will ever have, so it is started the
/// way a private service should be — on the loopback interface, on a port
/// nothing published, behind a token minted for this launch and handed over
/// through the environment. The same string is injected into the web view
/// (`window.__ZIGSOLVER__.token`, see WebController), and nothing writes it
/// down: quitting the app ends the only two copies of it that existed.
///
/// That is what "not reachable from outside the app" means here, concretely:
///
///   * loopback bind — nothing off the machine can open the socket at all;
///   * a token (api/auth.py) — nothing else ON the machine can use it, which is
///     the half a bind address cannot cover;
///   * a fresh token per launch — a token that leaked is worthless by the next
///     launch, and there is no file anywhere for one to leak out of.
final class SolverProcess {

    enum State {
        case starting                 // launched, no answer yet
        case ready                    // /health came back 200
        case failed(String)           // it stopped, or never answered
    }

    /// `http://127.0.0.1:<port>` once `start()` has picked one.
    private(set) var baseURL = ""
    /// This launch's bearer token. Generated here, never persisted.
    let token: String = SolverProcess.mintToken()

    /// Called on the main queue whenever the state changes.
    var onState: ((State) -> Void)?
    /// Called on the main queue for every line the server writes.
    var onLog: ((String) -> Void)?

    private var process: Process?
    private var pipe: Pipe?
    private var logFile: FileHandle?
    private var pending = ""                  // a partial line across reads
    private var stopping = false
    private var polls = 0

    /// How long to keep asking before calling it a failure. A first launch
    /// loads torch, the value net and two xgboost children before uvicorn
    /// serves anything, and a cold page cache makes that minutes rather than
    /// seconds — so this is generous on purpose.
    private let pollInterval = 0.7
    private let pollLimit = Int(8 * 60 / 0.7)

    // MARK: - starting

    func start() {
        stopping = false
        polls = 0

        let problems = Runtime.problems()
        guard problems.isEmpty else {
            emit(.failed(problems.joined(separator: "\n")))
            return
        }
        guard let port = Self.freePort() else {
            emit(.failed("Could not find a free port on the loopback interface."))
            return
        }
        baseURL = "http://127.0.0.1:\(port)"

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: Runtime.venvPython)
        proc.currentDirectoryURL = URL(fileURLWithPath: Runtime.runtimeDir)
        proc.arguments = [
            "-u",                                    // unbuffered: the log is live
            Runtime.launcher,
            "--parent-pid", String(ProcessInfo.processInfo.processIdentifier),
            "--host", "127.0.0.1",
            "--port", String(port),
            // The server's own daily log file lives in the runtime tree; this
            // one is per launch and belongs to the person, not the install.
            "--log-file", Self.launchLogPath(),
        ]

        var env = ProcessInfo.processInfo.environment
        env["ZS_API_TOKEN"] = token                  // never on the command line
        env["PYTHONUNBUFFERED"] = "1"
        env["PYTHONPATH"] = Runtime.runtimeDir
        // Homebrew's python is not necessarily on a GUI app's PATH, and the
        // service shells out to its own binaries by absolute path anyway; give
        // it a sane one rather than launchd's bare default.
        env["PATH"] = (env["PATH"].map { $0 + ":" } ?? "")
            + "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        proc.environment = env

        let out = Pipe()
        proc.standardOutput = out
        proc.standardError = out
        pipe = out
        openLaunchLog()
        out.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else { return }
            self?.absorb(data)
        }

        proc.terminationHandler = { [weak self] p in
            DispatchQueue.main.async { self?.processEnded(p) }
        }

        do {
            try proc.run()
        } catch {
            emit(.failed("Could not start \(Runtime.venvPython): "
                         + error.localizedDescription))
            return
        }
        process = proc
        emit(.starting)
        line("[app] solver starting on \(baseURL) (pid \(proc.processIdentifier))")
        schedulePoll()
    }

    // MARK: - readiness

    private func schedulePoll() {
        DispatchQueue.main.asyncAfter(deadline: .now() + pollInterval) { [weak self] in
            self?.poll()
        }
    }

    private func poll() {
        guard !stopping, let proc = process, proc.isRunning else { return }
        polls += 1
        if polls > pollLimit {
            line("[app] gave up waiting for \(baseURL)/health")
            emit(.failed("The solver did not answer in \(Int(Double(pollLimit) * pollInterval / 60)) "
                         + "minutes. The log below is what it said."))
            return
        }

        var req = URLRequest(url: URL(string: baseURL + "/health")!)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.timeoutInterval = 4
        req.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        URLSession.shared.dataTask(with: req) { [weak self] data, response, _ in
            DispatchQueue.main.async {
                guard let self, !self.stopping else { return }
                let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                if code == 200, let data, self.isOurServer(data) {
                    self.line("[app] solver ready")
                    self.emit(.ready)
                } else if code == 401 {
                    // Something is on our port that is not the process we
                    // started — say that, rather than retrying for eight
                    // minutes against a stranger.
                    self.emit(.failed("Port \(self.baseURL) is answering, but not "
                                      + "with this launch's token. Something else "
                                      + "is listening there."))
                } else {
                    self.schedulePoll()
                }
            }
        }.resume()
    }

    /// `/health.auth.required` is true and the token fingerprint is the one we
    /// gave out — proof this is the server we launched and not a leftover.
    private func isOurServer(_ data: Data) -> Bool {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return false }
        guard let auth = json["auth"] as? [String: Any] else {
            return false                       // a build from before the token
        }
        return (auth["required"] as? Bool) == true
    }

    // MARK: - stopping

    /// Signal the whole group and wait briefly for it to go.
    ///
    /// The group, not the process: a solve in flight is a `zigsolver`
    /// subprocess plus two model workers, and killing only the interpreter
    /// leaves them running (see macos/app/zigsolver_serve.py).
    func stop(timeout: TimeInterval = 6) {
        stopping = true
        guard let proc = process, proc.isRunning else { return }
        let pid = proc.processIdentifier

        signalGroup(pid, SIGTERM)
        let deadline = Date().addingTimeInterval(timeout)
        while proc.isRunning, Date() < deadline {
            usleep(50_000)
        }
        if proc.isRunning {
            line("[app] the solver did not stop — killing it")
            signalGroup(pid, SIGKILL)
            proc.waitUntilExit()
        }
        cleanUp()
    }

    /// `killpg` only when the child really is the leader of its own group.
    ///
    /// It becomes one in the first instants of `zigsolver_serve.py`, and until
    /// then it is still in OURS — where `killpg(pid)` would be a request to
    /// terminate this app. Checking is the difference between a stop and a
    /// crash on a solver that was quit half a second after launch.
    private func signalGroup(_ pid: pid_t, _ sig: Int32) {
        if getpgid(pid) == pid {
            killpg(pid, sig)
        } else {
            kill(pid, sig)
        }
    }

    private func processEnded(_ proc: Process) {
        cleanUp()
        guard !stopping else { return }
        let how = proc.terminationReason == .uncaughtSignal
            ? "was killed by signal \(proc.terminationStatus)"
            : "exited with status \(proc.terminationStatus)"
        line("[app] the solver \(how)")
        emit(.failed("The solver stopped on its own (\(how)). "
                     + "The log below is what it said."))
    }

    private func cleanUp() {
        pipe?.fileHandleForReading.readabilityHandler = nil
        // Whatever arrived after the last newline is still a line worth having.
        if !pending.isEmpty {
            let last = pending
            pending = ""
            DispatchQueue.main.async { [weak self] in self?.line(last) }
        }
        pipe = nil
        process = nil
        try? logFile?.close()
        logFile = nil
    }

    // MARK: - the log

    private func absorb(_ data: Data) {
        logFile?.write(data)
        guard let text = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.pending += text
            var parts = self.pending.components(separatedBy: "\n")
            self.pending = parts.removeLast()   // the tail, still incomplete
            for part in parts where !part.isEmpty { self.onLog?(part) }
        }
    }

    private func line(_ text: String) {
        onLog?(text)
        if let data = (text + "\n").data(using: .utf8) { logFile?.write(data) }
    }

    private static func launchLogPath() -> String {
        let stamp = ISO8601DateFormatter()
        stamp.formatOptions = [.withYear, .withMonth, .withDay, .withTime,
                               .withDashSeparatorInDate, .withColonSeparatorInTime]
        let name = stamp.string(from: Date())
            .replacingOccurrences(of: ":", with: "")
        return Runtime.logsDir + "/server-\(name).log"
    }

    private func openLaunchLog() {
        Runtime.prepare()
        let path = Self.launchLogPath()
        FileManager.default.createFile(atPath: path, contents: nil)
        logFile = FileHandle(forWritingAtPath: path)
        pruneLogs()
    }

    /// Keep the last 20 launches. A log a month old has never been read.
    private func pruneLogs() {
        let fm = FileManager.default
        guard let names = try? fm.contentsOfDirectory(atPath: Runtime.logsDir) else { return }
        let logs = names.filter { $0.hasPrefix("server-") }.sorted()
        for name in logs.dropLast(20) {
            try? fm.removeItem(atPath: Runtime.logsDir + "/" + name)
        }
    }

    private func emit(_ state: State) {
        DispatchQueue.main.async { [weak self] in self?.onState?(state) }
    }

    // MARK: - odds and ends

    /// 32 bytes of the system CSPRNG as hex.
    private static func mintToken() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        if SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) != errSecSuccess {
            // Never observed; a predictable token would be worse than no app.
            fatalError("the system random number generator is unavailable")
        }
        return bytes.map { String(format: "%02x", $0) }.joined()
    }

    /// A port the kernel says is free: bind :0 on loopback, read what we got,
    /// let it go. The window between here and uvicorn's own bind is the usual
    /// unavoidable one, and losing that race shows up as a clear startup
    /// failure rather than as a silent misconnection.
    private static func freePort() -> Int? {
        let fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP)
        guard fd >= 0 else { return nil }
        defer { close(fd) }

        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = 0                                  // "pick one"
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")
        addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)

        let bound = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard bound == 0 else { return nil }

        var actual = sockaddr_in()
        var length = socklen_t(MemoryLayout<sockaddr_in>.size)
        let named = withUnsafeMutablePointer(to: &actual) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                getsockname(fd, $0, &length)
            }
        }
        guard named == 0 else { return nil }
        return Int(UInt16(bigEndian: actual.sin_port))
    }
}
