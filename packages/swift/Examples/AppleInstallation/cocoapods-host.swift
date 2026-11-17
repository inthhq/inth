// CocoaPods RN host only. Do not import a separately linked InthCore or InthApple.
import InthReactNative
import Foundation

enum CocoaPodsHostConsent {
    // Set com.inth.reactnative.AutoBootstrap=false in Info.plist.
    // Call before starting the React host; retry protected-storage failures after unlock.
    @discardableResult
    static func install() throws -> Bool {
        let core = try InthApple.install(InthAppleConfiguration(
            backendURL: "https://your-project.inth.app",
            consentCategories: [.necessary, .measurement, .marketing]
        ))
        return InthReactNativeBootstrap.install(core)
    }
}
