// CocoaPods RN host only. Do not import a separately linked C15tCore or C15tApple.
import C15tReactNative
import Foundation

enum CocoaPodsHostConsent {
    // Set com.c15t.reactnative.AutoBootstrap=false in Info.plist.
    // Call before starting the React host; retry protected-storage failures after unlock.
    @discardableResult
    static func install() throws -> Bool {
        let core = try C15tApple.install(C15tAppleConfiguration(
            transport: .hosted(URL(string: "https://your-project.inth.app")!),
            consentCategories: [.necessary, .measurement, .marketing]
        ))
        return C15tReactNativeBootstrap.install(core)
    }
}
