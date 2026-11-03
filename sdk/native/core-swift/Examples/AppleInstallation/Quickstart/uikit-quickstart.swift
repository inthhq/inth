// #region docs:swift-uikit-app title="AppDelegate.swift"
import SwiftUI
import UIKit

@main
@MainActor
final class AppDelegate: UIResponder, UIApplicationDelegate {
    private(set) var consent: ConsentModel?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        consent = ConsentModel(backendURL: URL(string: "https://your-project.inth.app")!)
        return true
    }

    func application(
        _ application: UIApplication,
        configurationForConnecting session: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Main", sessionRole: session.role)
        configuration.delegateClass = SceneDelegate.self
        configuration.storyboard = nil
        return configuration
    }
}

@MainActor
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let scene = scene as? UIWindowScene,
              let consent = (UIApplication.shared.delegate as? AppDelegate)?.consent else { return }
        let window = UIWindow(windowScene: scene)
        window.rootViewController = UIHostingController(rootView: ConsentRoot(
            consent: consent,
            privacyPolicyURL: URL(string: "https://example.com/privacy")!
        ))
        window.makeKeyAndVisible()
        self.window = window
    }
}
// #endregion docs:swift-uikit-app
