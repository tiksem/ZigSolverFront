import Foundation
import WebKit

/// Serves `zigsolver://app/…` out of the pack, and nothing else from anywhere.
///
/// This is what replaces the HTTP server a web app would normally need. There
/// is no socket, no port and no listener: WebKit asks this object for a URL and
/// it answers from memory. Which means the UI has no address — not one another
/// browser can open, not one another process can fetch, not one the network can
/// reach — and the origin the page runs under is a scheme only this app has
/// registered.
///
/// The security-relevant part is the path handling below, and it is meant to be
/// boring: an exact lookup in the pack's index. There is no filesystem
/// underneath to escape onto, so `..` is not a traversal risk so much as a
/// symptom, and it is refused on sight.
final class AppSchemeHandler: NSObject, WKURLSchemeHandler {

    static let scheme = "zigsolver"
    static let host = "app"

    /// The page, at a hash route. The router is hash-based, so a tab's route is
    /// a fragment — which never reaches `normalize` below, because a fragment
    /// is not part of a request URL's path.
    static func url(route: String = "") -> URL {
        URL(string: "\(scheme)://\(host)/index.html\(route)")!
    }

    private let pack: AssetPack

    /// Tasks WebKit has not stopped yet.
    ///
    /// Answering a stopped task is an unhandled Objective-C exception, not an
    /// error return — and WebKit stops them routinely (a navigation away, a
    /// cancelled image). Everything here happens on the main queue, so a plain
    /// set is enough to know which are still owed a reply.
    private var live = Set<ObjectIdentifier>()

    init(pack: AssetPack) {
        self.pack = pack
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        let id = ObjectIdentifier(task)
        live.insert(id)

        guard let url = task.request.url, let path = Self.normalize(url) else {
            finish(task, id: id, status: 400, body: Data(), type: "text/plain")
            return
        }
        guard let file = pack.file(at: path) else {
            finish(task, id: id, status: 404,
                   body: Data("Not in the bundle: \(path)".utf8), type: "text/plain")
            return
        }
        finish(task, id: id, status: 200, body: file.data, type: file.contentType)
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        live.remove(ObjectIdentifier(task))
    }

    // MARK: - internals

    /// A request URL -> a path in the pack, or nil to refuse it.
    ///
    /// `zigsolver://app/`            -> `index.html`
    /// `zigsolver://app/assets/x.js` -> `assets/x.js`
    ///
    /// The host is checked because the scheme is ours and `zigsolver://evil/x`
    /// should not be a way to ask for anything at all.
    static func normalize(_ url: URL) -> String? {
        guard url.scheme == scheme, url.host == host else { return nil }
        var path = url.path
        while path.hasPrefix("/") { path.removeFirst() }
        if path.isEmpty { path = "index.html" }
        // Hash routing means the router's paths never reach here; anything
        // wearing a `..` was not written by this app.
        let parts = path.split(separator: "/", omittingEmptySubsequences: false)
        if parts.contains("..") || parts.contains("") { return nil }
        return path
    }

    private func finish(_ task: WKURLSchemeTask, id: ObjectIdentifier,
                        status: Int, body: Data, type: String) {
        guard live.contains(id) else { return }
        let headers = [
            "Content-Type": type,
            "Content-Length": String(body.count),
            // The pack is rebuilt with the app, and a stale entry cached from a
            // previous version against a hashed filename that changed is a
            // debugging session nobody needs.
            "Cache-Control": "no-store",
        ]
        let response = HTTPURLResponse(url: task.request.url!, statusCode: status,
                                       httpVersion: "HTTP/1.1", headerFields: headers)!
        task.didReceive(response)
        task.didReceive(body)
        task.didFinish()
        live.remove(id)
    }
}
