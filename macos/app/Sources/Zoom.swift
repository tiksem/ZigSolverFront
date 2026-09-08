import AppKit
import WebKit

/// Page zoom, with a browser's shortcuts and a browser's ladder.
///
/// ⌘+ / ⌘- / ⌘0 in the View menu, ⌘= as well because that is the key people
/// actually press, ⌘-scroll and pinch. Page zoom rather than WebKit's own
/// magnification: magnification scales the rendered layer and the text goes
/// soft, and every browser reflows instead.
///
/// The level is one setting for the whole app, not one per tab. Browsers key
/// zoom to the site, and every tab here is the same site — so a table opened
/// after the zoom was changed comes up at the size everything else is at, which
/// is what makes it feel like one app rather than a pile of windows.
enum Zoom {

    private static let key = "pageZoom"

    /// Safari's ladder: coarse at the ends, fine around 100%.
    private static let steps: [CGFloat] = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0,
                                           1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0]

    /// Every web view that should follow the level. AppDelegate keeps it fed.
    static var views: () -> [WKWebView] = { [] }

    static var current: CGFloat {
        let stored = UserDefaults.standard.double(forKey: key)
        guard stored > 0 else { return 1 }
        return clamp(CGFloat(stored))
    }

    static func zoomIn() {
        set(steps.first { $0 > current + 0.001 } ?? steps.last!)
    }

    static func zoomOut() {
        set(steps.last { $0 < current - 0.001 } ?? steps.first!)
    }

    static func reset() {
        set(1)
    }

    private static func set(_ value: CGFloat) {
        let level = clamp(value)
        UserDefaults.standard.set(Double(level), forKey: key)
        for view in views() { view.pageZoom = level }
    }

    private static func clamp(_ value: CGFloat) -> CGFloat {
        min(max(value, steps.first!), steps.last!)
    }

    // MARK: - the input a menu cannot carry

    private static var monitors: [Any] = []

    /// Installed once, for the whole application.
    ///
    /// Once, and not once per tab: a local monitor is application-wide, so a
    /// monitor per web view would fire N times for one ⌘-scroll and take N
    /// steps up the ladder. The View menu owns ⌘+, ⌘- and ⌘0; what is left
    /// here is the three things a menu equivalent cannot express.
    static func installMonitors() {
        guard monitors.isEmpty else { return }
        var scrolled: CGFloat = 0
        var pinched: CGFloat = 0

        // ⌘= — the unshifted key. A menu equivalent is one character and "+" is
        // the one worth displaying, so its twin is caught by hand.
        let keys = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
            guard event.modifierFlags.contains(.command),
                  event.charactersIgnoringModifiers == "=" else { return event }
            zoomIn()
            return nil
        }

        // ⌘-scroll, accumulated: one notch of a trackpad is a fraction of a
        // line, and stepping per event would fly off the ladder.
        let scroll = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { event in
            guard event.modifierFlags.contains(.command) else { return event }
            scrolled += event.hasPreciseScrollingDeltas ? event.scrollingDeltaY / 24
                                                        : event.scrollingDeltaY / 2
            while scrolled >= 1 { scrolled -= 1; zoomIn() }
            while scrolled <= -1 { scrolled += 1; zoomOut() }
            return nil
        }

        // Pinch, same idea in magnification units.
        let pinch = NSEvent.addLocalMonitorForEvents(matching: .magnify) { event in
            if event.phase == .began { pinched = 0 }
            pinched += event.magnification
            while pinched >= 0.12 { pinched -= 0.12; zoomIn() }
            while pinched <= -0.12 { pinched += 0.12; zoomOut() }
            return nil
        }

        monitors = [keys, scroll, pinch].compactMap { $0 }
    }
}
