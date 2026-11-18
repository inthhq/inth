import Foundation

#if canImport(ObjectiveC)
import ObjectiveC.runtime
#endif

#if canImport(AppTrackingTransparency)
import AppTrackingTransparency
#endif

#if canImport(ObjectiveC)
/// The shape of Apple's expanded European Union tracking request.
///
/// Written out as a C function type because the declaration does not exist in the SDK this
/// package builds against: the request arrives with iOS and iPadOS 27.2. A block parameter
/// is an `id` to the caller, and App Tracking Transparency's own block types take and return
/// exactly what is written here, which is what makes the cast honest rather than hopeful.
private typealias InthExpandedRequestFunction = @convention(c) (
    AnyObject,
    Selector,
    ObjCBool,
    (@convention(block) () -> Void)?,
    @convention(block) (Int) -> Void
) -> Void
#endif

/// The only file in this package that talks to App Tracking Transparency.
///
/// Two facts come out of here: whether this binary is allowed to show Apple's dialog, and
/// what Apple currently answers. Neither is a consent statement, and neither is derived
/// from one. The decisions those facts lead to live in ``InthTrackingGate``, which is why
/// this file holds no `if` that a test cannot reach without a device.
///
/// The availability guard is not for old iPhones. The pod's deployment floor is iOS 16.4,
/// a release after ATT became the only route to the identifier, so on every device this
/// package supports ATT is there. The guard is for the builds that compile this target
/// without an iPhone in sight: a macOS `swift test` run, and anything else where the
/// framework is not in the SDK. Those reads answer `nil`, which the gate turns into
/// `unsupported`, rather than failing to link.
public enum InthTracking {
    /// The `Info.plist` key that makes the Apple dialog possible.
    ///
    /// This is the runtime half of the Expo plugin's `enableAppTrackingTransparency`, and
    /// the plugin writes the key only under that flag. Reading the key rather than a
    /// inth-namespaced setting is deliberate: it is the same check Apple performs, so a
    /// host that wrote the string by hand without the plugin is not refused a prompt it
    /// can genuinely show.
    public static let promptStringKey = "NSUserTrackingUsageDescription"

    /// Whether this binary can show the Apple dialog.
    ///
    /// A key present but empty is not a prompt string: Apple's own check is on a usable
    /// string, and the plugin refuses to invent one, so an empty value would suppress the
    /// dialog exactly as a missing one does.
    public static func promptStringPresent(in bundle: Bundle = .main) -> Bool {
        guard let value = bundle.infoDictionary?[promptStringKey] as? String else { return false }
        return !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Apple's current answer, or `nil` where this platform has no ATT to ask.
    public static func platformStatus() -> InthTrackingPlatformStatus? {
        #if canImport(AppTrackingTransparency) && os(iOS)
        if #available(iOS 14.0, *) {
            return platformStatus(ATTrackingManager.trackingAuthorizationStatus)
        }
        #endif
        return nil
    }

    /// Show Apple's dialog and report the answer.
    ///
    /// Apple presents the prompt from the main thread, and a synchronous module method
    /// runs on the JavaScript thread, so the hop is not a courtesy: without it the
    /// dialog is what triggers the main-thread checker in a debug build.
    ///
    /// Call it only when ``InthTrackingGate/request(platform:promptStringPresent:)`` said
    /// `.prompt`. The handler enforces that, because calling this on a build without a
    /// prompt string is how an install spends its one dialog on nothing.
    ///
    /// - Parameter completion: runs wherever Apple delivers its answer.
    public static func requestPrompt(
        completion: @escaping (InthTrackingPlatformStatus?) -> Void
    ) {
        #if canImport(AppTrackingTransparency) && os(iOS)
        if #available(iOS 14.0, *) {
            DispatchQueue.main.async {
                ATTrackingManager.requestTrackingAuthorization { status in
                    completion(platformStatus(status))
                }
            }
            return
        }
        #endif
        completion(nil)
    }

    /// The Objective-C selector the expanded European Union request ships under.
    ///
    /// Spelled by hand because `#selector` cannot reach a declaration this build never saw:
    /// the request arrives with iOS and iPadOS 27.2, newer than the SDK the pod compiles
    /// against. The string is Apple's own, from the symbol identifier behind
    /// `requestTrackingAuthorization(preferExpandedInterface:additionalInformationAction:completionHandler:)`.
    /// It is a public constant and the test target pins it, so if Apple renames the method
    /// before it leaves beta the failure is a red test rather than a permission prompt that
    /// quietly never appears.
    public static let expandedRequestSelectorName =
        "requestTrackingAuthorizationPreferringExpandedInterface:additionalInformationAction:completionHandler:"

    #if canImport(ObjectiveC)
    /// The selector ``expandedRequestSelectorName`` names.
    public static var expandedRequestSelector: Selector {
        Selector(expandedRequestSelectorName)
    }
    #endif

    /// Whether this runtime has the expanded European Union request.
    ///
    /// A lookup rather than an `#available`, and that choice is the whole mechanism. The
    /// method is newer than the SDK this package builds against, so there is no declaration
    /// to gate a call on, and a version check would be a claim about Apple's release notes
    /// instead of a fact about the process this code runs in. Asking the class whether it
    /// answers the selector is the same question the runtime asks before it dispatches, so
    /// the answer is right for reasons that need no changelog: true on a system that has it,
    /// false on every older one, and false on a build that never linked App Tracking
    /// Transparency, where the class itself is absent.
    ///
    /// This says nothing about the European Union. Apple keeps the expanded *presentation*
    /// to devices sitting in a specific EU country and signed in with an Apple Account from a
    /// specific EU country or region, and reads none of that from this process. A `true` here
    /// means the call exists, and the call is what asks Apple the regional question.
    public static func expandedInterfaceAvailable() -> Bool {
        expandedInterfaceAvailable(on: trackingManagerClass())
    }

    /// ``expandedInterfaceAvailable()`` asked of `managerClass`. Internal so a test can hand it
    /// a class of its own instead of registering a fake `ATTrackingManager`.
    static func expandedInterfaceAvailable(on managerClass: AnyClass?) -> Bool {
        #if canImport(ObjectiveC)
        guard let managerClass else { return false }
        return (managerClass as AnyObject).responds(to: expandedRequestSelector)
        #else
        return false
        #endif
    }

    /// Ask Apple through the expanded request, if this runtime has it.
    ///
    /// - Parameters:
    ///   - preferExpandedInterface: Passed straight through as Apple's
    ///     `preferExpandedInterface`. The full-page sheet Apple shows for it depends on
    ///     `NSUserTrackingMarkdownUsageDescription` being in the binary, and Apple may show
    ///     the plain alert anyway outside the EU, so this is a preference and not a promise.
    ///   - additionalInformationSelected: Runs when the subject taps Additional Information.
    ///     `nil` passes no action, so Apple shows no button: nothing would handle the tap.
    ///     Apple closes its sheet without recording an answer, runs this, and still calls the
    ///     completion handler with `notDetermined`, so the caller must treat its own closure
    ///     as a pause and not as a refusal.
    ///   - completion: Runs wherever Apple delivers its answer.
    /// - Returns: `true` when the call was made. `false` means nothing was asked and the
    ///   caller should fall back to ``requestPrompt(completion:)``, which every supported
    ///   system has. That fallback is not theoretical: the capability probe and the call are
    ///   two looks at the runtime, and a binary that linked the class lazily can answer the
    ///   first one and not the second.
    public static func requestExpandedPrompt(
        preferExpandedInterface: Bool,
        additionalInformationSelected: (() -> Void)?,
        completion: @escaping (InthTrackingPlatformStatus?) -> Void
    ) -> Bool {
        requestExpandedPrompt(on: trackingManagerClass(), preferExpandedInterface: preferExpandedInterface,
                              additionalInformationSelected: additionalInformationSelected, completion: completion)
    }

    /// ``requestExpandedPrompt(preferExpandedInterface:additionalInformationSelected:completion:)``
    /// made on `managerClass`. Internal so a test can hand it a class of its own.
    static func requestExpandedPrompt(
        on managerClass: AnyClass?,
        preferExpandedInterface: Bool,
        additionalInformationSelected: (() -> Void)?,
        completion: @escaping (InthTrackingPlatformStatus?) -> Void
    ) -> Bool {
        #if canImport(ObjectiveC)
        guard let managerClass else { return false }
        let trackingManager: AnyObject = managerClass
        let selector = expandedRequestSelector
        // A class method is looked up on the class itself. Passing its metaclass happens to work
        // too, because the runtime treats a metaclass as its own meta, but that is not the API.
        guard let method = class_getClassMethod(managerClass, selector) else { return false }
        // Receiver, selector and the three parameters. Anything else is not the method this
        // cast describes, and calling it through the cast would be undefined, so fall back.
        guard method_getNumberOfArguments(method) == 5 else { return false }

        // `nil` reaches Apple as a nil block, which is what keeps the button off its sheet.
        let action: (@convention(block) () -> Void)? = additionalInformationSelected.map { selected in
            let block: @convention(block) () -> Void = { selected() }
            return block
        }
        let implementation = method_getImplementation(method)
        let request = unsafeBitCast(implementation, to: InthExpandedRequestFunction.self)

        // The same main-thread hop `requestPrompt` makes, and for the same reason: Apple
        // presents from the main thread and a module method runs on the JavaScript thread.
        DispatchQueue.main.async {
            request(
                trackingManager,
                selector,
                ObjCBool(preferExpandedInterface),
                action,
                { raw in completion(InthTrackingPlatformStatus(rawValue: raw)) }
            )
        }
        return true
        #else
        return false
        #endif
    }

    /// The App Tracking Transparency class, without naming the framework.
    ///
    /// Looked up by name so this file needs no link-time dependency for the expanded path:
    /// the plain reads already import the framework where the SDK has it, and the expanded
    /// call works whether or not this build ever saw that header.
    private static func trackingManagerClass() -> AnyClass? {
        NSClassFromString("ATTrackingManager")
    }

    /// Translate Apple's enum without importing it anywhere else.
    #if canImport(AppTrackingTransparency) && os(iOS)
    @available(iOS 14.0, *)
    private static func platformStatus(
        _ status: ATTrackingManager.AuthorizationStatus
    ) -> InthTrackingPlatformStatus {
        switch status {
        case .authorized: return .authorized
        case .denied: return .denied
        case .notDetermined: return .notDetermined
        case .restricted: return .restricted
        @unknown default:
            // An arm Apple adds later is not permission. `restricted` is the arm that
            // reads "someone else decides, and it was not you", which is the safe
            // reading of a state this build has never seen.
            return .restricted
        }
    }
    #endif
}
