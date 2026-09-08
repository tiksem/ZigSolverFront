import Foundation

/// Where the installer put the things this app runs, and whether they are there.
///
/// The app bundle holds the UI and nothing else. The solver — the Python
/// service, its virtualenv, the models, the showdown cache, the two Zig
/// binaries — is several gigabytes and is installed beside the app rather than
/// inside it, so that reinstalling the app does not re-download torch and so a
/// bundle is a bundle rather than a filesystem.
///
/// One layout, two halves:
///
///     /Library/Application Support/ZigSolver/
///         runtime/          the service and its data, laid out like the repo
///                           (api/, turn_net/, models/, zig-out/, cache/…)
///         venv/             python3 -m venv, with fastapi/torch/xgboost in it
///
///     ~/Library/Application Support/ZigSolver/
///         logs/             what the server said, one file per launch
///
/// `runtime/` is WRITABLE by the user the installer ran for, deliberately: the
/// service writes into its own tree the way it does from a checkout — the
/// multiplayer abstraction cache, `logs/`, `screenerrors/`, `predfails/`, a
/// showdown matrix computed on a miss — and pointing every one of those
/// somewhere else would be a fork of the service's own path handling for no
/// gain on a single-user machine.
enum Runtime {

    /// `ZIGSOLVER_ROOT` overrides the installed location — which is how
    /// `buildinstaller.sh --run` can drive a staged tree without installing it.
    static let root: String = {
        if let override = ProcessInfo.processInfo.environment["ZIGSOLVER_ROOT"],
           !override.isEmpty {
            return (override as NSString).expandingTildeInPath
        }
        return "/Library/Application Support/ZigSolver"
    }()

    static var runtimeDir: String { root + "/runtime" }
    static var venvPython: String { root + "/venv/bin/python3" }

    /// The `-m api.server` wrapper: it exists to put the server in its own
    /// process group and to make it die with this app (macos/app/zigsolver_serve.py).
    static var launcher: String { runtimeDir + "/zigsolver_serve.py" }

    /// Per-user state. Not under `root`, because this is the one part that is
    /// genuinely about the person rather than the installation.
    static let support: String = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory,
                                            in: .userDomainMask).first
        return (base?.path ?? NSHomeDirectory() + "/Library/Application Support")
            + "/ZigSolver"
    }()

    static var logsDir: String { support + "/logs" }

    /// Everything that must exist before there is any point in starting.
    /// Returns the problems in the order a person would fix them, or empty.
    static func problems() -> [String] {
        let fm = FileManager.default
        var out: [String] = []

        if !fm.fileExists(atPath: runtimeDir) {
            out.append("The solver runtime is not installed (\(runtimeDir) does not exist).")
            return out                        // everything below would repeat it
        }
        if !fm.isExecutableFile(atPath: venvPython) {
            out.append("No Python environment at \(venvPython).")
        }
        if !fm.fileExists(atPath: launcher) {
            out.append("The server launcher is missing (\(launcher)).")
        }
        for required in ["api/server.py", "zig-out/bin/zigsolver",
                         "zig-out/lib/libzigsolver.dylib"] {
            if !fm.fileExists(atPath: runtimeDir + "/" + required) {
                out.append("The runtime is incomplete — \(required) is missing.")
            }
        }
        // A read-only runtime starts and then fails hours later on the first
        // cache write, which is a miserable way to find out.
        if fm.fileExists(atPath: runtimeDir), !fm.isWritableFile(atPath: runtimeDir) {
            out.append("\(runtimeDir) is not writable by \(NSUserName()) — the "
                       + "solver keeps its caches there.")
        }
        return out
    }

    /// Make the per-user directories. Failure is not fatal: the log is a
    /// convenience and the app runs without one.
    static func prepare() {
        try? FileManager.default.createDirectory(atPath: logsDir,
                                                 withIntermediateDirectories: true)
    }

    /// This build's version, from the bundle.
    static var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "0"
        let build = info?["CFBundleVersion"] as? String ?? "0"
        return short == build ? short : "\(short) (\(build))"
    }
}
