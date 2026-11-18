#if canImport(InthCore)
// SwiftPM builds the consent kernel as its own module. CocoaPods compiles the vendored
// copy into this module instead, where the import would fail, so it is conditional
// rather than assumed.
import InthCore
#endif
#if canImport(InthReactNativeBridge)
// SwiftPM builds the wire layer as its own module. CocoaPods compiles it into this
// module instead, where the import would fail, so it is conditional rather than
// assumed.
import InthReactNativeBridge
#endif
import Foundation

/// The Objective-C entry point for starting the consent core.
///
/// Two things need to reach the bootstrap from Objective-C: the constructor in
/// `InthReactNativeRuntimeInitializer.mm`, which runs before React Native
/// initializes, and a host app that would rather call it itself. This is the `@objc`
/// surface; the decisions live in `InthReactNativeBootstrap`.
///
/// `InthReactNativeEarlyStart`, which lives beside that launch hook in
/// `InthReactNativeRuntimeInitializer.mm`, is what gets this called with no app wiring.
/// The pod is a static archive, so the file holding the hook survives a host's link only
/// because it also defines an Objective-C class.
@objc(InthReactNativeRuntime)
public final class InthReactNativeRuntime: NSObject {
    /// Start the core from `Info.plist`, unless the app opted out.
    ///
    /// Safe to call more than once and from any thread: the core's own bootstrap is
    /// idempotent, and hydration completes before this returns so the caller can read
    /// stored consent on the next line.
    ///
    /// - Returns: `true` when a core is running afterwards.
    @objc @discardableResult
    public static func startCoreIfNeeded() -> Bool {
        InthReactNativeBootstrap.start()
    }

    /// Start the core even though the app opted out of automatic startup.
    ///
    /// For an app that set `com.inth.reactnative.AutoBootstrap` to `false` and wants
    /// the `Info.plist` values after all, at a moment it chose.
    @objc @discardableResult
    public static func startCore() -> Bool {
        let infoPlist = Bundle.main.infoDictionary ?? [:]
        // A retired key refuses this start too, as it does the launch hook.
        if Inth.current == nil, let issue = InthBridgeConfiguration.retirementIssue(in: infoPlist) {
            NSLog("%@", "Inth: \(issue.message)")
            return false
        }
        return InthReactNativeBootstrap.start(
            configuration: InthBridgeConfiguration.from(infoPlist: infoPlist)
        )
    }

    /// Adopt a core the app built itself.
    ///
    /// Call this from `application(_:didFinishLaunchingWithOptions:)` before the React
    /// host starts, with the core `InthApple.install(InthAppleConfiguration(backendURL:))`
    /// returned. The bridge attaches to this core and never builds its own.
    ///
    /// Swift only, and deliberately so. `ConsentCore` has no Objective-C representation,
    /// so an `@objc` declaration of this method cannot compile. The pod does not need
    /// one: the only Objective-C caller inside it is the launch hook, and that calls
    /// `startCoreIfNeeded`. A host that owns its own core installs it from Swift, which
    /// is the only language in which a `ConsentCore` gets built anyway.
    ///
    /// - Returns: `true` when `core` is the instance the bridge will use.
    @discardableResult
    public static func install(core: ConsentCore) -> Bool {
        InthReactNativeBootstrap.install(core)
    }

    /// Whether a core is running.
    @objc public static func isCoreRunning() -> Bool {
        InthReactNativeBootstrap.isRunning
    }
}
