import C15tReactNative
import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?
  private var e2eTimer: DispatchSourceTimer?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    if let endpoint = Bundle.main.object(forInfoDictionaryKey: "C15tAppE2EURL") as? String,
       URL(string: endpoint)?.host == "localhost" {
      // The test-only artifact opts out of automatic bootstrap. One protected core owns UI and gates.
      do {
        _ = try C15tApple.install(CoreConfig(store: KeychainStore(service: "com.c15t.bare.e2e"),
          transport: HostedTransport(baseURL: URL(string: endpoint + "/api/self-host")!),
          consentCategories: [.necessary, .functionality, .measurement, .marketing],
          iab: IABConfiguration(cmpId: 53, cmpVersion: 7, publisherCountryCode: "GB"), storageBus: UserDefaultsStorageBus()))
      } catch { fatalError("E2E protected native installation failed: \(error)") }
    }
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "C15tBare",
      in: window,
      launchOptions: demoLaunchOptions(launchOptions)
    )

    if let endpoint = Bundle.main.object(forInfoDictionaryKey: "C15tAppE2EURL") as? String,
       URL(string: endpoint)?.host == "localhost" {
      let timer = DispatchSource.makeTimerSource(queue: DispatchQueue(label: "c15t.fixture-observer"))
      timer.schedule(deadline: .now(), repeating: .milliseconds(500))
      timer.setEventHandler {
        guard let snapshot = try? JSONSerialization.jsonObject(with: Data(C15tPayload.snapshot(C15t.snapshot()).utf8)) else { return }
        let gates = ["functionality": C15t.isAllowed(.functionality), "measurement": C15t.isAllowed(.measurement), "marketing": C15t.isAllowed(.marketing)]
        let body: [String: Any] = ["snapshot": snapshot, "gates": gates, "source": "native-core", "pendingSaves": C15t.current?.pendingSaveCount() ?? 0, "iabConsent": (C15t.current?.iabConsent()).flatMap { try? JSONSerialization.jsonObject(with: JSONEncoder().encode($0)) } ?? NSNull()]
        var request = URLRequest(url: URL(string: endpoint + "/e2e/native")!)
        request.httpMethod = "POST"
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        URLSession.shared.dataTask(with: request).resume()
      }
      timer.resume()
      e2eTimer = timer
    }
    return true
  }

  // A headless run cannot answer the "Open in c15t Bare?" confirmation that iOS raises
  // before it hands an incoming `c15t-demo://` open to the app, and a CI machine has no
  // finger for it. The same link therefore also arrives as the `C15T_DEMO_LINK` variable,
  // which `simctl launch` passes through from its `SIMCTL_CHILD_` prefixed names.
  //
  // It enters as a launch URL rather than as a second channel, so JavaScript cannot tell
  // the two apart: `Linking.getInitialURL()` returns it and the verb table runs unchanged.
  // A link the OS already delivered wins, which keeps a tapped open authoritative.
  private func demoLaunchOptions(
    _ launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> [UIApplication.LaunchOptionsKey: Any] {
    var options = launchOptions ?? [:]

    if options[.url] == nil,
       let link = ProcessInfo.processInfo.environment["C15T_DEMO_LINK"],
       let url = URL(string: link) {
      options[.url] = url
    }

    return options
  }

  // Hand the demo link to React Native. `RCTLinkingManager` records the launch URL for
  // `Linking.getInitialURL()` and posts the event `Linking.addEventListener('url')`
  // listens for, which is how one verb reaches JavaScript on both platforms. Without
  // this method an incoming URL is dropped by the OS and the app never hears about it.
  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    RCTLinkingManager.application(app, open: url, options: options)
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
