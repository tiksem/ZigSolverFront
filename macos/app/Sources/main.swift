import AppKit

/// Entry point. No nib, no storyboard: the menu and the window are built in
/// AppDelegate, which keeps the whole app readable as source and keeps
/// `buildinstaller.sh` to a plain `swiftc` invocation with no Xcode project to
/// keep in sync.
let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.setActivationPolicy(.regular)
application.run()
