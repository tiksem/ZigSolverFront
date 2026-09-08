import AppKit

/// What the window shows while the solver comes up, and if it does not.
///
/// The solver is not a thing that starts instantly: a cold launch loads torch,
/// the turn value net and two model workers before uvicorn answers anything,
/// which is tens of seconds and sometimes minutes. An app that showed an empty
/// window for that long would read as broken, and one that showed a spinner and
/// nothing else would be unfixable when it failed. So this shows the elapsed
/// time, and the server's own output is one click away — the log is the whole
/// diagnosis when a model is missing or a wheel did not install.
final class StartupView: NSView {

    /// Retry, when there is something to retry.
    var onRetry: (() -> Void)?

    private let titleLabel = NSTextField(labelWithString: "ZigSolver")
    private let statusLabel = NSTextField(labelWithString: "")
    private let detailLabel = NSTextField(wrappingLabelWithString: "")
    private let spinner = NSProgressIndicator()
    private let disclosure = NSButton()
    private let retry = NSButton()
    private let logView = NSTextView()
    private let logScroll = NSScrollView()

    private var started = Date()
    private var ticker: Timer?
    private var showingLog = false

    override init(frame: NSRect) {
        super.init(frame: frame)
        build()
    }

    required init?(coder: NSCoder) { fatalError("not from a nib") }

    // MARK: - state

    func beginStarting() {
        started = Date()
        spinner.startAnimation(nil)
        spinner.isHidden = false
        retry.isHidden = true
        detailLabel.stringValue = ""
        detailLabel.isHidden = true
        statusLabel.textColor = .secondaryLabelColor
        tick()
        ticker?.invalidate()
        ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            self?.tick()
        }
    }

    func fail(_ reason: String) {
        ticker?.invalidate()
        ticker = nil
        spinner.stopAnimation(nil)
        spinner.isHidden = true
        statusLabel.stringValue = "The solver did not start"
        statusLabel.textColor = .systemRed
        detailLabel.stringValue = reason
        detailLabel.isHidden = false
        retry.isHidden = false
        // The answer is almost always in the last few lines, so stop making
        // people find the button.
        if !showingLog { toggleLog(disclosure) }
    }

    func finish() {
        ticker?.invalidate()
        ticker = nil
        spinner.stopAnimation(nil)
    }

    func append(_ line: String) {
        let storage = logView.textStorage
        let wasAtBottom = logScroll.verticalScroller.map { $0.floatValue > 0.99 } ?? true
        storage?.append(NSAttributedString(
            string: line + "\n",
            attributes: [.font: NSFont.monospacedSystemFont(ofSize: 11, weight: .regular),
                         .foregroundColor: NSColor.secondaryLabelColor]))
        // A long startup writes hundreds of lines and none of the early ones is
        // ever read; keep the tail bounded so the view stays responsive.
        if let storage, storage.length > 400_000 {
            storage.deleteCharacters(in: NSRange(location: 0, length: 200_000))
        }
        if wasAtBottom { logView.scrollToEndOfDocument(nil) }
    }

    private func tick() {
        let seconds = Int(Date().timeIntervalSince(started))
        let elapsed = seconds < 60 ? "\(seconds)s" : "\(seconds / 60)m \(seconds % 60)s"
        statusLabel.stringValue = "Starting the solver — \(elapsed)"
    }

    // MARK: - layout

    private func build() {
        let stack = NSStackView()
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false

        titleLabel.font = .systemFont(ofSize: 22, weight: .semibold)

        statusLabel.font = .systemFont(ofSize: 13)
        statusLabel.textColor = .secondaryLabelColor

        detailLabel.font = .systemFont(ofSize: 12)
        detailLabel.textColor = .secondaryLabelColor
        detailLabel.alignment = .center
        detailLabel.isHidden = true
        detailLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        spinner.style = .spinning
        spinner.controlSize = .small
        spinner.isDisplayedWhenStopped = false

        disclosure.title = "Show log"
        disclosure.bezelStyle = .accessoryBarAction
        disclosure.setButtonType(.momentaryPushIn)
        disclosure.target = self
        disclosure.action = #selector(toggleLog(_:))

        retry.title = "Try again"
        retry.bezelStyle = .rounded
        retry.keyEquivalent = "\r"
        retry.target = self
        retry.action = #selector(retryTapped)
        retry.isHidden = true

        logView.isEditable = false
        logView.isSelectable = true
        logView.drawsBackground = false
        logView.textContainerInset = NSSize(width: 8, height: 8)
        logScroll.documentView = logView
        logScroll.hasVerticalScroller = true
        logScroll.drawsBackground = true
        logScroll.borderType = .lineBorder
        logScroll.isHidden = true
        logScroll.translatesAutoresizingMaskIntoConstraints = false

        let buttons = NSStackView(views: [disclosure, retry])
        buttons.orientation = .horizontal
        buttons.spacing = 10

        stack.addArrangedSubview(titleLabel)
        stack.addArrangedSubview(spinner)
        stack.addArrangedSubview(statusLabel)
        stack.addArrangedSubview(detailLabel)
        stack.addArrangedSubview(buttons)
        stack.setCustomSpacing(16, after: titleLabel)
        stack.setCustomSpacing(14, after: statusLabel)

        addSubview(stack)
        addSubview(logScroll)

        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.topAnchor.constraint(equalTo: topAnchor, constant: 90),
            stack.widthAnchor.constraint(lessThanOrEqualToConstant: 460),
            detailLabel.widthAnchor.constraint(lessThanOrEqualToConstant: 460),

            logScroll.topAnchor.constraint(equalTo: stack.bottomAnchor, constant: 18),
            logScroll.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 24),
            logScroll.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -24),
            logScroll.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -24),
        ])
    }

    @objc private func toggleLog(_ sender: NSButton) {
        showingLog.toggle()
        logScroll.isHidden = !showingLog
        disclosure.title = showingLog ? "Hide log" : "Show log"
        if showingLog { logView.scrollToEndOfDocument(nil) }
    }

    @objc private func retryTapped() {
        onRetry?()
    }
}
