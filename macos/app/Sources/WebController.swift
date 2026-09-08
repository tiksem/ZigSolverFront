import AppKit
import WebKit

/// One tab's contents: the packed UI in a web view that can only reach it.
///
/// There is one of these per window — the tables list in the root tab, and one
/// per table beside it (AppDelegate does the tabbing). Each is an independent
/// web view with its own page, which is what makes a table that hangs a tab
/// that hangs rather than an app that hangs; they share the origin, so they
/// share localStorage and therefore the settings, the theme and the host.
///
/// Three things are arranged here, and each is one of the app's actual
/// requirements rather than incidental plumbing.
///
/// **The page has no address.** It is loaded over `zigsolver://app/index.html`,
/// resolved by AppSchemeHandler out of the encrypted pack. No HTTP server, no
/// port, no file URL into the bundle.
///
/// **The page cannot go anywhere else.** The navigation delegate refuses every
/// navigation that is not our own scheme; a link to a real site opens in the
/// user's browser, where it belongs. So the injected token below is only ever
/// in a document this app built.
///
/// **The solver arrives injected.** `window.__ZIGSOLVER__` is evaluated before
/// the bundle's first line runs (`src/lib/native.js` reads it), which is what
/// removes the ZigSolver API field from the UI: there is nothing to type,
/// because the endpoint is this app's own process and the token is this
/// launch's.
final class WebController: NSObject, WKNavigationDelegate, WKUIDelegate,
                           WKScriptMessageHandler {

    /// Message handler name, matched by the bridge in src/lib/native.js.
    private static let bridgeName = "zigsolver"
    private static let hostKey = "botHost"

    /// Nil once `detach()` has run — a closed tab has no web view.
    private(set) var webView: WKWebView!
    private let solver: SolverProcess

    /// The hash route this tab opens on — "" for the tables list,
    /// "#/table/5" for a table.
    let route: String

    /// The bot host the page last connected to — restored into the injected
    /// config so a relaunch opens where the last session left off. Shared by
    /// every tab, because it is one setting about one runner.
    static var botHost: String {
        get { UserDefaults.standard.string(forKey: hostKey) ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: hostKey) }
    }

    /// The page asked for a table in a new tab.
    var onOpenTable: ((Int) -> Void)?
    /// The page reported a new bot host.
    var onHostChanged: ((String) -> Void)?
    /// `document.title` changed — this is the tab's name.
    var onTitle: ((String) -> Void)?

    private var titleObservation: NSKeyValueObservation?

    init(pack: AssetPack, solver: SolverProcess, route: String = "") {
        self.solver = solver
        self.route = route
        super.init()

        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(AppSchemeHandler(pack: pack),
                                   forURLScheme: AppSchemeHandler.scheme)

        let content = WKUserContentController()
        content.addUserScript(WKUserScript(source: bootstrapScript(),
                                           injectionTime: .atDocumentStart,
                                           forMainFrameOnly: true))
        content.add(self, name: Self.bridgeName)
        config.userContentController = content

        // The default store, deliberately: it is this app's container and not
        // Safari's, and every tab wants the same one — the settings, the theme,
        // the language and the typed HUD stats are per person, not per table.
        config.websiteDataStore = .default()
        config.suppressesIncrementalRendering = false

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        // Pinch is handled as PAGE zoom (Zoom.swift), the way a browser does
        // it; WebKit's own magnification is a transform over the rendered layer
        // and leaves the text soft.
        webView.allowsMagnification = false
        webView.allowsBackForwardNavigationGestures = false
        webView.setValue(false, forKey: "drawsBackground")   // let the felt show
        webView.pageZoom = Zoom.current

        // The inspector is a way to read the very thing the pack exists to
        // keep to itself, so it is off unless a developer asks for it by name.
        if ProcessInfo.processInfo.environment["ZIGSOLVER_DEVTOOLS"] == "1" {
            if #available(macOS 13.3, *) { webView.isInspectable = true }
        }

        titleObservation = webView.observe(\.title, options: [.new]) { [weak self] view, _ in
            guard let title = view.title, !title.isEmpty else { return }
            self?.onTitle?(title)
        }
    }

    deinit {
        detach()
    }

    /// Let go of the web view, and of this object.
    ///
    /// Not housekeeping — the one thing here that leaks if it is skipped.
    /// `WKUserContentController` retains a script message handler STRONGLY, and
    /// the web view retains the controller, so the cycle
    ///
    ///     webView -> userContentController -> WebController -> webView
    ///
    /// keeps a closed tab's entire web content process alive for the rest of
    /// the session. `deinit` cannot break it, because the cycle is exactly what
    /// stops `deinit` from running. So a closing window calls this.
    ///
    /// Idempotent: closing a window that was already torn down is normal
    /// (AppDelegate closes the tables when the solver dies, and each of those
    /// then reports its own close).
    func detach() {
        guard let view = webView else { return }
        titleObservation?.invalidate()
        titleObservation = nil
        view.configuration.userContentController
            .removeScriptMessageHandler(forName: Self.bridgeName)
        view.navigationDelegate = nil
        view.uiDelegate = nil
        view.stopLoading()
        view.removeFromSuperview()
        onOpenTable = nil
        onHostChanged = nil
        onTitle = nil
        webView = nil
    }

    func load() {
        webView?.load(URLRequest(url: AppSchemeHandler.url(route: route)))
    }

    func reload() {
        // reload() would re-fetch the current URL; this also re-runs the
        // bootstrap against a solver that may have been restarted since, and
        // puts the tab back on the route it was opened for.
        load()
    }

    // MARK: - what the page is told

    private func bootstrapScript() -> String {
        let config: [String: Any] = [
            "api": solver.baseURL,
            "token": solver.token,
            "version": Runtime.version,
            "host": Self.botHost,
        ]
        let json = (try? JSONSerialization.data(withJSONObject: config))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        // Frozen and non-writable: the page has no business rewriting the
        // endpoint it was given, and a mistake in the bundle should fail
        // loudly rather than quietly point the token somewhere else.
        return """
        Object.defineProperty(window, '__ZIGSOLVER__', {
          value: Object.freeze(\(json)),
          writable: false, configurable: false, enumerable: false
        });
        """
    }

    func userContentController(_ controller: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == Self.bridgeName,
              let body = message.body as? [String: Any] else { return }

        switch body["type"] as? String {
        case "host":
            let host = String((body["host"] as? String ?? "").prefix(200))
                .trimmingCharacters(in: .whitespaces)
            Self.botHost = host
            onHostChanged?(host)
        case "openTable":
            // A JS number arrives as NSNumber; a table index is small and
            // non-negative, and anything else is not a request we made.
            guard let raw = body["index"] as? NSNumber else { return }
            let index = raw.intValue
            guard index >= 0, index < 1_000_000 else { return }
            onOpenTable?(index)
        default:
            break
        }
    }

    // MARK: - where the page may go

    func webView(_ webView: WKWebView,
                 decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else {
            decisionHandler(.cancel)
            return
        }
        if url.scheme == AppSchemeHandler.scheme, url.host == AppSchemeHandler.host {
            decisionHandler(.allow)
            return
        }
        // Anything else is a link out. Opened in the browser rather than
        // followed here: this window is the app, not a browser, and a page
        // loaded into it would be a page holding the solver's token.
        if let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" {
            NSWorkspace.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    /// `target="_blank"` and `window.open` — same rule, no second window.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, let scheme = url.scheme?.lowercased(),
           scheme == "http" || scheme == "https" {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    /// A page that manages to crash takes the tab's contents with it; get it
    /// back rather than leaving a white rectangle.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        load()
    }
}
