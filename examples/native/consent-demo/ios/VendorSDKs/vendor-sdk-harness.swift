#if DEBUG
import InthApple
import InthCore
import FirebaseAnalytics
import FirebaseCore
import Mixpanel
import os
import PostHog
import Sentry
import UIKit

/// Debug-only wiring of the real PostHog, Mixpanel, Sentry Replay and Firebase SDKs.
///
/// It exists for `run-vendor-e2e.sh`: a launch that sets `C15T_VENDOR_BASE` to the
/// local capture server gets every SDK configured in its denied state, bound to the
/// Inth Swift helpers, and a probe button that sends one event through each SDK.
/// Without that variable the demo links the SDKs but never starts them.
@MainActor
final class VendorSDKHarness {
    static let log = Logger(subsystem: "com.inth.vendor-e2e", category: "app")

    /// Returns a harness when the launch asks for one. Only a loopback HTTP base is accepted.
    static func fromEnvironment() -> VendorSDKHarness? {
        guard let raw = ProcessInfo.processInfo.environment["C15T_VENDOR_BASE"],
              let base = URL(string: raw), base.scheme == "http",
              let host = base.host, ["localhost", "127.0.0.1"].contains(host), let port = base.port
        else { return nil }
        return VendorSDKHarness(base: base, host: host, port: port)
    }

    private let base: URL
    private let host: String
    private let port: Int
    private var bindings: [AnyObject] = []
    private var probeWindow: VendorProbeWindow?
    private var probes = 0

    private init(base: URL, host: String, port: Int) {
        self.base = base
        self.host = host
        self.port = port
    }

    /// Configures each SDK with collection off, then binds it to the measurement category.
    /// Every binding applies the stored decision before this method returns.
    func start(core: ConsentCore) {
        let log = Self.log
        let vendorBase = base.absoluteString.hasSuffix("/") ? String(base.absoluteString.dropLast()) : base.absoluteString

        let posthog = PostHogConfig(projectToken: "phc_inth_fake_local_token", host: vendorBase + "/vendor/posthog")
        posthog.optOut = true
        posthog.debug = true
        PostHogSDK.shared.setup(posthog)
        bindings.append(PostHogIntegration(
            core: core,
            optIn: { log.notice("binding posthog optIn"); PostHogSDK.shared.optIn() },
            optOut: { log.notice("binding posthog optOut"); PostHogSDK.shared.optOut() }))

        let mixpanel = Mixpanel.initialize(
            token: "inth-fake-mixpanel-token", trackAutomaticEvents: true,
            optOutTrackingByDefault: true, serverURL: vendorBase + "/vendor/mixpanel")
        mixpanel.loggingEnabled = true
        bindings.append(MixpanelIntegration(
            core: core,
            optInTracking: { log.notice("binding mixpanel optIn"); Mixpanel.mainInstance().optInTracking() },
            optOutTracking: { log.notice("binding mixpanel optOut"); Mixpanel.mainInstance().optOutTracking() }))

        let dsn = "http://public@\(host):\(port)/vendor/sentry/1"
        SentrySDK.start { options in
            options.dsn = dsn
            options.debug = true
            // Replay is started and stopped only by the Inth binding.
            options.sessionReplay.sessionSampleRate = 0
            options.sessionReplay.onErrorSampleRate = 0
            // Keep other Sentry products quiet so the capture log shows replay alone.
            options.enableAutoSessionTracking = false
            options.enableAppHangTracking = false
            options.enableWatchdogTerminationTracking = false
            options.enableAutoPerformanceTracing = false
        }
        bindings.append(SentryReplayIntegration(
            core: core,
            start: { log.notice("binding sentry replay start"); SentrySDK.replay.start() },
            stop: { log.notice("binding sentry replay stop"); SentrySDK.replay.stop() }))

        // Firebase cannot be pointed at the capture server. A fake project is enough to
        // run Analytics, whose debug log records collection and consent changes.
        FirebaseConfiguration.shared.setLoggerLevel(.debug)
        if let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
           let options = FirebaseOptions(contentsOfFile: path) {
            FirebaseApp.configure(options: options)
            bindings.append(FirebaseAnalyticsIntegration(
                core: core,
                setConsent: { consent in
                    log.notice("binding firebase consent analytics_storage=\(consent.analyticsStorage ? "granted" : "denied", privacy: .public)")
                    Analytics.setConsent([
                        .analyticsStorage: consent.analyticsStorage ? .granted : .denied,
                        .adStorage: consent.adStorage ? .granted : .denied,
                        .adUserData: consent.adUserData ? .granted : .denied,
                        .adPersonalization: consent.adPersonalization ? .granted : .denied,
                    ])
                },
                setCollectionEnabled: { enabled in
                    log.notice("binding firebase collection=\(enabled ? "enabled" : "disabled", privacy: .public)")
                    Analytics.setAnalyticsCollectionEnabled(enabled)
                }))
        } else {
            log.error("GoogleService-Info.plist is missing; Firebase is not configured")
        }

        showProbeControl()
        log.notice("vendor sdks started base=\(vendorBase, privacy: .public)")
    }

    /// Sends one probe event through every SDK and asks each to deliver now.
    /// Replay has no event; its segments upload on Sentry's own interval while recording.
    func probe() {
        probes += 1
        let probe = probes
        Self.log.notice("probe \(probe) sent")
        PostHogSDK.shared.capture("inth_probe", properties: ["probe": probe])
        Mixpanel.mainInstance().track(event: "inth_probe", properties: ["probe": probe])
        Analytics.logEvent("inth_probe", parameters: ["probe": probe])
        flush()
        probeWindow?.count.text = "probes: \(probe)"
    }

    /// Delivers what each SDK already queued, without adding events. PostHog keeps sending
    /// events captured before an opt-out, so the journey drains them before it measures.
    func flush() {
        Self.log.notice("flush")
        PostHogSDK.shared.flush()
        Mixpanel.mainInstance().flush()
        // Transport flush only. SentrySDK.replay.flush() would start a replay when none runs.
        Task.detached { SentrySDK.flush(timeout: 5) }
    }

    /// The first layer is a full-screen cover, so the probe lives in its own window above it.
    private func showProbeControl() {
        guard probeWindow == nil,
              let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first
        else { return }
        let window = VendorProbeWindow(windowScene: scene)
        window.button.addAction(UIAction { [weak self] _ in self?.probe() }, for: .touchUpInside)
        window.flushButton.addAction(UIAction { [weak self] _ in self?.flush() }, for: .touchUpInside)
        window.isHidden = false
        probeWindow = window
    }
}

/// A pass-through window holding only the probe and flush buttons and the probe counter.
final class VendorProbeWindow: UIWindow {
    let button = UIButton(type: .system)
    let flushButton = UIButton(type: .system)
    let count = UILabel()

    override init(windowScene: UIWindowScene) {
        super.init(windowScene: windowScene)
        windowLevel = .alert + 1
        backgroundColor = .clear
        let root = UIViewController()
        root.view.backgroundColor = .clear
        var config = UIButton.Configuration.filled()
        config.title = "Probe vendors"
        config.buttonSize = .small
        button.configuration = config
        button.accessibilityIdentifier = "vendor.probe"
        var flushConfig = UIButton.Configuration.gray()
        flushConfig.title = "Flush"
        flushConfig.buttonSize = .small
        flushButton.configuration = flushConfig
        flushButton.accessibilityIdentifier = "vendor.flush"
        count.text = "probes: 0"
        count.font = .preferredFont(forTextStyle: .caption2)
        count.accessibilityIdentifier = "vendor.probe.count"
        let stack = UIStackView(arrangedSubviews: [count, flushButton, button])
        stack.spacing = 8
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false
        root.view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: root.view.safeAreaLayoutGuide.topAnchor),
            stack.trailingAnchor.constraint(equalTo: root.view.safeAreaLayoutGuide.trailingAnchor, constant: -12),
            button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
            flushButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
        ])
        rootViewController = root
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let view = super.hitTest(point, with: event)
        // Touches outside the controls reach the app and the consent screens below.
        return view === rootViewController?.view ? nil : view
    }
}
#endif
