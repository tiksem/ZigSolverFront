import AppKit
import WebKit

/// The window and its tabs, the solver behind them, and the menu that drives
/// both.
///
/// The shape is a browser's, because that is what the tool is: one window whose
/// **root tab is the tables list** — always there, cannot be closed, because it
/// is where every other tab comes from and the only thing watching tables
/// appear and disappear — and **one tab per table**, opened by clicking it and
/// closed with ⌘W or the tab's ✕ like any other.
///
/// Native tabs rather than a tab strip drawn inside the page, for a reason
/// worth stating: each tab is then its own web view with its own content
/// process, so a table whose page wedges is a wedged tab and not a wedged app.
/// Two tables at once is the normal way this gets used.
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {

    private let solver = SolverProcess()
    private var pack: AssetPack?

    private var rootWindow: NSWindow!
    private var startup: StartupView!
    private var rootWeb: WebController?

    /// Table index -> its window, so clicking a table that is already open
    /// selects that tab instead of opening a second one.
    private var tableWindows: [Int: NSWindow] = [:]
    /// Every window's controller, keyed by the window.
    private var controllers: [ObjectIdentifier: WebController] = [:]

    private var showingWeb = false

    // MARK: - lifecycle

    func applicationDidFinishLaunching(_ note: Notification) {
        Runtime.prepare()
        NSWindow.allowsAutomaticWindowTabbing = true
        Zoom.views = { [weak self] in
            guard let self else { return [] }
            return self.controllers.values.map(\.webView)
        }
        Zoom.installMonitors()

        buildMenu()
        buildRootWindow()

        // The pack is opened before anything else: an app whose UI cannot be
        // decrypted has nothing to show whether the solver starts or not, and
        // saying so immediately beats saying it after a two-minute startup.
        do {
            pack = try AssetPack(url: Self.packURL(), key: Secrets.assetKey)
        } catch {
            startup.beginStarting()
            startup.fail(error.localizedDescription)
            startup.append("[app] \(error)")
            return
        }

        solver.onLog = { [weak self] line in self?.startup.append(line) }
        solver.onState = { [weak self] state in self?.handle(state) }
        startSolver()
    }

    func applicationWillTerminate(_ note: Notification) {
        solver.stop()
    }

    /// False, because the one window that matters cannot be closed and the
    /// others are its tabs — quitting is ⌘Q, deliberately.
    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool {
        false
    }

    /// macOS 14 asks; the answer is yes — nothing here restores secrets.
    func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool {
        true
    }

    // MARK: - the solver

    private func startSolver() {
        startup.beginStarting()
        solver.start()
    }

    private func handle(_ state: SolverProcess.State) {
        switch state {
        case .starting:
            break                                    // the view is already saying so
        case .ready:
            startup.finish()
            showWeb()
        case .failed(let reason):
            if showingWeb {
                // The solver died with the UI up. Every tab is now a page whose
                // every solve would fail with a connection error, so they go and
                // the root window says what happened.
                closeAllTables()
                teardownRootWeb()
            }
            startup.fail(reason)
        }
    }

    // MARK: - the root window, and its two faces

    private func buildRootWindow() {
        rootWindow = makeWindow(title: "ZigSolver")
        // The tab that stays. `windowShouldClose` is what actually refuses ⌘W,
        // the tab's ✕ and this button; disabling the button is so the title bar
        // shows that rather than only saying it after the fact.
        rootWindow.standardWindowButton(.closeButton)?.isEnabled = false
        // Only this one remembers where it was: a shared autosave name across
        // the tabs would have them overwrite each other's frame, and a tab
        // takes the window's size anyway.
        rootWindow.setFrameAutosaveName("ZigSolverWindow")

        let container = NSView(frame: rootWindow.contentLayoutRect)
        rootWindow.contentView = container

        startup = StartupView(frame: container.bounds)
        startup.translatesAutoresizingMaskIntoConstraints = false
        startup.onRetry = { [weak self] in self?.startSolver() }
        container.addSubview(startup)
        pin(startup, to: container)

        rootWindow.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func showWeb() {
        guard let pack, rootWeb == nil else { return }
        // Built here, not at launch: the bootstrap script it injects carries
        // the port and the token, and neither exists until the solver is up.
        let controller = makeController(pack: pack, route: "", window: rootWindow)
        rootWeb = controller

        guard let container = rootWindow.contentView else { return }
        container.addSubview(controller.webView)
        pin(controller.webView, to: container)
        startup.isHidden = true
        showingWeb = true
        rootWindow.subtitle = WebController.botHost
        controller.load()
    }

    private func teardownRootWeb() {
        rootWeb?.detach()
        if let root = rootWindow { controllers.removeValue(forKey: ObjectIdentifier(root)) }
        rootWeb = nil
        startup.isHidden = false
        showingWeb = false
        rootWindow.subtitle = ""
    }

    // MARK: - table tabs

    private func openTable(_ index: Int) {
        guard let pack else { return }
        // Already open: select it. A second tab on one table would be two
        // sockets on it and two solves per snapshot.
        if let existing = tableWindows[index] {
            existing.makeKeyAndOrderFront(nil)
            return
        }

        let window = makeWindow(title: "Table \(index)")
        let controller = makeController(pack: pack, route: "#/table/\(index)", window: window)

        let container = NSView(frame: window.contentLayoutRect)
        window.contentView = container
        container.addSubview(controller.webView)
        pin(controller.webView, to: container)

        tableWindows[index] = window
        // .above, so the new tab lands next to the one it was opened from
        // rather than at the end of a long strip.
        rootWindow.addTabbedWindow(window, ordered: .above)
        window.makeKeyAndOrderFront(nil)
        controller.load()
    }

    private func closeAllTables() {
        for window in tableWindows.values { window.close() }
        tableWindows.removeAll()
    }

    // MARK: - windows

    /// Every window is `.closable`, INCLUDING the root one that never closes.
    ///
    /// That looks backwards and is load-bearing. Taking `.closable` out of the
    /// mask does stop the window closing, but it also takes it out of AppKit's
    /// dispatch for `performClose:` — and the tab bar draws a ✕ on the tab
    /// regardless. Clicking that ✕ then walks the responder chain to the KEY
    /// window and closes *that* instead, so pressing the tables tab's ✕ shuts
    /// whichever table happens to be in front. (Observed, then fixed.)
    ///
    /// Closable in the mask means the close targets this window, where
    /// `windowShouldClose` refuses it. The ✕ on the root tab is inert, which is
    /// the whole intent; the red button beside it is disabled below so at least
    /// one of the two says so.
    private func makeWindow(title: String) -> NSWindow {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1180, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false)
        window.title = title
        window.minSize = NSSize(width: 720, height: 520)
        window.delegate = self
        window.isReleasedWhenClosed = false
        // The same identifier on every window is what makes them tabs of one
        // another rather than separate windows that happen to look alike.
        window.tabbingIdentifier = "ZigSolver"
        window.tabbingMode = .preferred
        window.center()
        return window
    }

    private func makeController(pack: AssetPack, route: String,
                                window: NSWindow) -> WebController {
        let controller = WebController(pack: pack, solver: solver, route: route)
        controller.onOpenTable = { [weak self] index in self?.openTable(index) }
        controller.onHostChanged = { [weak self] host in
            // One runner, so every tab's title bar says the same thing.
            self?.rootWindow.subtitle = host
        }
        controller.onTitle = { [weak window] title in window?.title = title }
        controllers[ObjectIdentifier(window)] = controller
        return controller
    }

    private func pin(_ view: NSView, to container: NSView) {
        view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            view.topAnchor.constraint(equalTo: container.topAnchor),
            view.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            view.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            view.trailingAnchor.constraint(equalTo: container.trailingAnchor),
        ])
    }

    /// The root tab stays. Everything else closes.
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        sender !== rootWindow
    }

    func windowWillClose(_ note: Notification) {
        guard let window = note.object as? NSWindow, window !== rootWindow else { return }
        // detach() before dropping the reference: the web view holds this
        // controller through its message handler, so letting go is not enough
        // to free the tab's content process (WebController.detach).
        controllers.removeValue(forKey: ObjectIdentifier(window))?.detach()
        if let index = tableWindows.first(where: { $0.value === window })?.key {
            tableWindows.removeValue(forKey: index)
        }
    }

    /// The controller for whichever tab is in front — what the View menu acts on.
    private var frontController: WebController? {
        guard let key = NSApp.keyWindow else { return rootWeb }
        return controllers[ObjectIdentifier(key)] ?? rootWeb
    }

    private static func packURL() -> URL {
        Bundle.main.url(forResource: "app", withExtension: "zsp")
            ?? Bundle.main.bundleURL.appendingPathComponent("Contents/Resources/app.zsp")
    }

    // MARK: - the menu

    /// Assembled in code because there is no nib. Two of these are not
    /// decoration: without an **Edit** menu ⌘C/⌘V do not work in the web view's
    /// text fields, and **Window** is where macOS puts the tab commands (Show
    /// Next Tab, Move Tab to New Window) once tabbing is on.
    private func buildMenu() {
        let main = NSMenu()

        // --- application ---
        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About ZigSolver", action: #selector(about), keyEquivalent: "")
            .target = self
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Open Log Folder", action: #selector(openLogs), keyEquivalent: "")
            .target = self
        appMenu.addItem(withTitle: "Restart Solver", action: #selector(restartSolver), keyEquivalent: "")
            .target = self
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide ZigSolver", action: #selector(NSApplication.hide(_:)),
                        keyEquivalent: "h")
        let hideOthers = appMenu.addItem(withTitle: "Hide Others",
                                         action: #selector(NSApplication.hideOtherApplications(_:)),
                                         keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(withTitle: "Show All",
                        action: #selector(NSApplication.unhideAllApplications(_:)),
                        keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit ZigSolver", action: #selector(NSApplication.terminate(_:)),
                        keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)

        // --- file: the tab commands people look for here ---
        let fileItem = NSMenuItem()
        let file = NSMenu(title: "File")
        // Close the tab, not the app. On the root tab windowShouldClose refuses
        // and AppKit greys the item out on its own.
        file.addItem(withTitle: "Close Tab", action: #selector(NSWindow.performClose(_:)),
                     keyEquivalent: "w")
        fileItem.submenu = file
        main.addItem(fileItem)

        // --- edit: the responder-chain selectors the web view answers ---
        let editItem = NSMenuItem()
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)),
                     keyEquivalent: "a")
        editItem.submenu = edit
        main.addItem(editItem)

        // --- view: reload and zoom, with a browser's shortcuts ---
        let viewItem = NSMenuItem()
        let view = NSMenu(title: "View")
        view.addItem(withTitle: "Reload", action: #selector(reload), keyEquivalent: "r").target = self
        view.addItem(.separator())
        // "+" is what a browser displays, and AppKit matches it on ⌘⇧= ; plain
        // ⌘= is caught by Zoom's key monitor, which is the other half of the
        // same shortcut.
        view.addItem(withTitle: "Zoom In", action: #selector(zoomIn), keyEquivalent: "+").target = self
        view.addItem(withTitle: "Zoom Out", action: #selector(zoomOut), keyEquivalent: "-").target = self
        view.addItem(withTitle: "Actual Size", action: #selector(zoomReset), keyEquivalent: "0").target = self
        view.addItem(.separator())
        let fullScreen = view.addItem(withTitle: "Enter Full Screen",
                                      action: #selector(NSWindow.toggleFullScreen(_:)),
                                      keyEquivalent: "f")
        fullScreen.keyEquivalentModifierMask = [.command, .control]
        viewItem.submenu = view
        main.addItem(viewItem)

        // --- window: AppKit adds the tab items to this one itself ---
        let windowItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.miniaturize(_:)),
                           keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.zoom(_:)), keyEquivalent: "")
        windowMenu.addItem(.separator())
        windowItem.submenu = windowMenu
        main.addItem(windowItem)
        NSApp.windowsMenu = windowMenu

        NSApp.mainMenu = main
    }

    // MARK: - menu actions

    @objc private func reload() { frontController?.reload() }
    @objc private func zoomIn() { Zoom.zoomIn() }
    @objc private func zoomOut() { Zoom.zoomOut() }
    @objc private func zoomReset() { Zoom.reset() }

    @objc private func openLogs() {
        Runtime.prepare()
        NSWorkspace.shared.open(URL(fileURLWithPath: Runtime.logsDir))
    }

    @objc private func restartSolver() {
        solver.stop()
        closeAllTables()
        if showingWeb { teardownRootWeb() }
        startSolver()
    }

    @objc private func about() {
        let alert = NSAlert()
        alert.messageText = "ZigSolver \(Runtime.version)"
        alert.informativeText = """
            The interface is served from inside this app; the solver runs beside \
            it on the loopback interface, behind a token minted for this launch.

            Runtime: \(Runtime.root)
            Solver:  \(solver.baseURL.isEmpty ? "not running" : solver.baseURL)
            """
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }
}
