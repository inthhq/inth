import SwiftUI
import UIKit

@main
final class ConsentDemoAppDelegate: UIResponder, UIApplicationDelegate {}

/// The UIKit scene owns its window and hosts the shared native consent screens.
final class ConsentDemoSceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let scene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: scene)
        window.rootViewController = UIHostingController(rootView: ConsentDemoContent())
        window.makeKeyAndVisible()
        self.window = window
    }
}
