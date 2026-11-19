// The E2E artifact is a Release build that talks to a loopback backend, which only
// the SDK's internal install path allows. An app imports InthReactNative plainly.
@_spi(InthInternal) import InthReactNative
import FirebaseCore
import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?
  private var e2eTimer: DispatchSourceTimer?
  private let e2eClock = FixtureClock()

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // firebase.json keeps collection off and every consent type denied until Inth
    // grants measurement. The Firebase project in GoogleService-Info.plist is fake.
    FirebaseApp.configure()
    if let endpoint = Bundle.main.object(forInfoDictionaryKey: "InthAppE2EURL") as? String,
       URL(string: endpoint)?.host == "localhost" {
      let control = fixtureControl(endpoint)
      if let now = control["now"] as? Int64 { e2eClock.set(now) }
      let declared = (control["categories"] as? [String])?.compactMap(ConsentCategory.init(rawValue:)) ?? [.necessary, .functionality, .experience, .measurement, .marketing]
      // The test-only artifact opts out of automatic bootstrap. One protected core owns UI and gates.
      do {
        _ = try InthApple.install(CoreConfig(store: KeychainStore(service: "com.inth.bare.e2e"),
          bundledPolicy: Bundle.main.url(forResource: "inth-policy", withExtension: "json").flatMap { BundledPolicyResource(url: $0, endpoint: endpoint + "/api/self-host") },
          transport: HostedTransport(baseURL: URL(string: endpoint + "/api/self-host")!),
          consentCategories: declared,
          iab: IABConfiguration(cmpId: 53, cmpVersion: 7, publisherCountryCode: "GB"), now: e2eClock.read, storageBus: UserDefaultsStorageBus()))
      } catch { fatalError("E2E protected native installation failed: \(error)") }
    }
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "InthBare",
      in: window,
      launchOptions: demoLaunchOptions(launchOptions)
    )

    if let endpoint = Bundle.main.object(forInfoDictionaryKey: "InthAppE2EURL") as? String,
       URL(string: endpoint)?.host == "localhost" {
      let timer = DispatchSource.makeTimerSource(queue: DispatchQueue(label: "inth.fixture-observer"))
      timer.schedule(deadline: .now(), repeating: .milliseconds(500))
      timer.setEventHandler { [self] in
        let control = fixtureControl(endpoint)
        if let now = control["now"] as? Int64 { e2eClock.set(now) }
        guard let snapshot = try? JSONSerialization.jsonObject(with: Data(InthPayload.snapshot(Inth.snapshot()).utf8)) else { return }
        let gates = ["experience": Inth.isAllowed(.experience), "functionality": Inth.isAllowed(.functionality), "measurement": Inth.isAllowed(.measurement), "marketing": Inth.isAllowed(.marketing)]
        let body: [String: Any] = ["snapshot": snapshot, "gates": gates, "process": ProcessInfo.processInfo.processIdentifier, "clock": e2eClock.read(), "control": control, "source": "native-core", "pendingSaves": Inth.current?.pendingSaveCount() ?? 0, "iabConsent": (Inth.current?.iabConsent()).flatMap { try? JSONSerialization.jsonObject(with: JSONEncoder().encode($0)) } ?? NSNull()]
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

  // A headless run cannot answer the "Open in Inth Bare?" confirmation that iOS raises
  // before it hands an incoming `inth-demo://` open to the app, and a CI machine has no
  // finger for it. The same link therefore also arrives as the `INTH_DEMO_LINK` variable,
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
       let link = ProcessInfo.processInfo.environment["INTH_DEMO_LINK"],
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

// Available only to the artifact with InthAppE2EURL set to loopback by the runner.
private final class FixtureClock: @unchecked Sendable {
  private let lock = NSLock()
  private var value: Int64?
  func set(_ now: Int64) { lock.lock(); value = now; lock.unlock() }
  func read() -> Int64 { lock.lock(); defer { lock.unlock() }; return value ?? Int64(Date().timeIntervalSince1970 * 1000) }
}

private func fixtureControl(_ endpoint: String) -> [String: Any] {
  let done = DispatchSemaphore(value: 0)
  var body: [String: Any] = [:]
  var request = URLRequest(url: URL(string: endpoint + "/e2e/control")!)
  request.timeoutInterval = 2
  URLSession.shared.dataTask(with: request) { data, _, _ in
    if let data { body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:] }
    done.signal()
  }.resume()
  _ = done.wait(timeout: .now() + 3)
  return body
}
