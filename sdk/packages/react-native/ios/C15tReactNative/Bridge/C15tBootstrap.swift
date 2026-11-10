#if canImport(C15tApple)
import C15tApple
#endif
#if canImport(C15tCore)
// SwiftPM builds the consent kernel as its own module. CocoaPods compiles the vendored
// copy into this module instead, where the import would fail, so it is conditional
// rather than assumed.
import C15tCore
#endif
import Foundation

/// Everything the iOS bridge needs from the host app, read from `Info.plist`.
///
/// The consent core needs a store, a transport, and a language before the first
/// JavaScript frame, which is before any Swift or JavaScript the app writes has run.
/// `Info.plist` is the one place available that early, it is what Expo already
/// surfaces through `app.json`'s `ios.infoPlist`, and it keeps the Android and iOS
/// set-up stories the same shape: declare the backend, install, rebuild.
///
/// An app that needs more than these keys can install a configured core itself with
/// ``C15tReactNativeBootstrap/install(_:)`` and set `com.c15t.reactnative.AutoBootstrap`
/// to `false`.
public struct C15tBridgeConfiguration: Sendable, Equatable {
    /// How the core reaches a backend.
    ///
    /// The raw values are the spellings accepted in `Info.plist`, which is why
    /// `self-hosted` is kebab-case: an `Info.plist` value is typed by hand, and
    /// `selfHosted` is the kind of thing people write as `self-hosted`.
    public enum TransportMode: String, Sendable {
        /// The c15t cloud project URL in `com.c15t.backend.url`.
        case hosted = "hosted"
        /// A self-hosted `@c15t/backend` base URL, same wire.
        case selfHosted = "self-hosted"
        /// Never send. Saves queue up and apply locally.
        case offline = "offline"
        /// No transport at all: async commands become no-ops. For preview builds.
        ///
        /// Named `disabled`, not `none`. An enum case called `none` is shadowed by
        /// `Optional.none` wherever an optional mode is in scope, which the Xcode
        /// compiler rejects outright; the `Info.plist` spelling stays `none`.
        case disabled = "none"

        /// Read a mode name tolerantly, so casing and separator choices in the plist
        /// do not silently fall back to a different mode.
        ///
        /// - Returns: The mode, or `nil` for a name this build does not know. An
        ///   unknown name is treated as "not declared" and inferred from the URL.
        public static func parse(_ raw: String) -> TransportMode? {
            switch raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
            case "hosted", "host", "cloud": return .hosted
            case "self-hosted", "selfhosted", "self_hosted": return .selfHosted
            case "offline": return .offline
            case "none": return .disabled
            default: return nil
            }
        }
    }

    /// Where the snapshot envelope and consent records live.
    public enum StorageMode: String, Sendable {
        /// Keychain generic password items. The contract's requirement, and the default.
        case keychain = "keychain"
        /// Application Support. Development only: consent is readable without the
        /// Keychain's protections, and a device backup carries it.
        case file = "file"
        /// Nothing survives relaunch. Tests and preview builds.
        case memory = "memory"

        /// Read a storage name tolerantly, the same way ``TransportMode/parse(_:)``
        /// does, so a typo becomes the Keychain rather than a plaintext store.
        public static func parse(_ raw: String) -> StorageMode? {
            switch raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
            case "keychain": return .keychain
            case "file", "disk": return .file
            case "memory", "in-memory": return .memory
            default: return nil
            }
        }
    }

    /// Build a configuration directly, for a host that wants to start the core from
    /// code rather than from `Info.plist`.
    ///
    /// Every parameter is defaulted so an app that only cares about the backend names
    /// the two fields that matter and inherits the contract's defaults elsewhere.
    public init(
        autoBootstrap: Bool = true,
        transportMode: TransportMode = .offline,
        backendURL: URL? = nil,
        initURL: URL? = nil,
        domain: String? = nil,
        storageMode: StorageMode = .keychain,
        keychainService: String = C15tBridgeConfiguration.defaultKeychainService,
        overrides: ConsentOverrides = .default(),
        consentCategories: [ConsentCategory]? = nil,
        vendors: [Int]? = nil,
        gpc: Bool? = nil,
        bundledPolicyResource: String? = nil,
        iab: IABConfiguration? = nil,
        gpp: GPPOptions? = nil
    ) {
        self.autoBootstrap = autoBootstrap
        self.transportMode = transportMode
        self.backendURL = backendURL
        self.initURL = initURL
        self.domain = domain
        self.storageMode = storageMode
        self.keychainService = keychainService
        self.overrides = overrides
        self.consentCategories = consentCategories
        self.vendors = vendors
        self.gpc = gpc
        self.bundledPolicyResource = bundledPolicyResource
        self.iab = iab
        self.gpp = gpp
    }

    /// Whether the launch hook should start the core.
    public var autoBootstrap: Bool
    public var transportMode: TransportMode
    /// Hosted project URL or self-hosted base URL, depending on `transportMode`.
    public var backendURL: URL?
    /// The URL used for `GET /init`, or `nil` for `${backendURL}/init`.
    ///
    /// The override exists for a same-origin proxy that resolves init from its own
    /// route while consent saves still go to the backend. It is honoured exactly the
    /// way `@c15t/core` and the Android core honour theirs: the value is used as
    /// given, and only an absent key falls back to `${backendURL}/init`.
    public var initURL: URL?
    /// The `domain` field sent on `POST /subjects`.
    public var domain: String?
    public var storageMode: StorageMode
    public var keychainService: String
    public var overrides: ConsentOverrides
    /// Categories to offer. `nil` declares none: a strict policy offers its full
    /// scope and a permissive one offers `necessary` alone.
    public var consentCategories: [ConsentCategory]?
    /// The IAB vendor ids the app declares, or `nil` when it declares no scope.
    ///
    /// `com.c15t.vendors`, the iOS spelling of the `iab.vendors` array a web host passes to its
    /// provider and of the comma-separated `com.c15t.VENDORS` Android meta-data. It goes into
    /// ``makeCoreConfiguration`` as ``CoreConfig/vendors``, where two things follow from it: the
    /// vendor list served to this device is pruned to these ids on every path it arrives by, and the
    /// declaration travels on `/init` as `x-c15t-vendors` so the request stops carrying what the
    /// app is going to prune anyway.
    ///
    /// The prune is the promise and the header is the saving, so an over-long declaration that
    /// ``c15t/maxVendorScopeHeaderIds`` will not fit on a request line still produces a device
    /// that discloses only these ids. `nil` and an empty declaration both mean "no scope", which
    /// keeps every vendor the producer serves: a host that means no vendors has to say so with a
    /// scope that names none, not by leaving this key out.
    public var vendors: [Int]?
    /// Filename of an endpoint-bound policy export in the main app bundle.
    public var bundledPolicyResource: String?
    /// The host app's Global Privacy Control signal, or `nil` when it has none.
    public var gpc: Bool?
    /// Registered CMP identity and publisher settings, or `nil` to leave IAB TCF off.
    ///
    /// Read from the `com.c15t.iab.*` keys. The core writes `IABTCF_CmpSdkID` and
    /// `IABTCF_CmpSdkVersion` from it at startup. There is no default CMP ID: a
    /// declaration without one, or with any value out of range, leaves this `nil`
    /// and ``iabIssue(in:)`` explains why.
    public var iab: IABConfiguration?
    /// GPP options, or `nil` to write no GPP signal. Read from the `com.c15t.gpp*` keys.
    public var gpp: GPPOptions?

    /// Keys read out of `Info.plist`. All optional.
    public enum InfoPlistKey {
        public static let autoBootstrap = "com.c15t.reactnative.AutoBootstrap"
        public static let backendURL = "com.c15t.backend.url"
        public static let transportMode = "com.c15t.backend.mode"
        public static let domain = "com.c15t.backend.domain"
        public static let initURL = "com.c15t.backend.initUrl"
        public static let storageMode = "com.c15t.storage"
        public static let keychainService = "com.c15t.keychain.service"
        public static let country = "com.c15t.country"
        public static let region = "com.c15t.region"
        public static let language = "com.c15t.language"
        public static let categories = "com.c15t.categories"
        /// Comma-separated IAB vendor ids, the numeric twin of the ``categories`` array.
        ///
        /// A string rather than an array of numbers because that is the shape Android's
        /// `com.c15t.VENDORS` meta-data has to take, and one spelling for the same declaration on
        /// both platforms is the reason either key is readable at all.
        public static let vendors = "com.c15t.vendors"
        public static let forceGPC = "com.c15t.forceGPC"
        public static let bundledPolicyResource = "com.c15t.policy.resource"
        /// IAB Europe CMP ID, 2 to 4095. Required when any `com.c15t.iab.*` key is present.
        public static let iabCmpId = "com.c15t.iab.cmpId"
        /// Your CMP version, 0 to 4095. Required with ``iabCmpId``.
        public static let iabCmpVersion = "com.c15t.iab.cmpVersion"
        /// Two-letter publisher country code. Required with ``iabCmpId``.
        public static let iabPublisherCountryCode = "com.c15t.iab.publisherCountryCode"
        /// Optional consent screen number, 0 to 63. The core's default is 1.
        public static let iabConsentScreen = "com.c15t.iab.consentScreen"
        /// `true` turns on the IAB GPP string and the `IABGPP_*` keys.
        public static let gpp = "com.c15t.gpp"
        /// `opt-out-option` or `service-provider`. Only for MSPA signatories.
        public static let gppMspaMode = "com.c15t.gpp.mspaMode"
        /// Categories whose refusal reports a GPP opt-out. Defaults to `["marketing"]`.
        public static let gppOptOutCategories = "com.c15t.gpp.optOutCategories"
        /// `false` leaves the TCF EU section out of the GPP string.
        public static let gppTCF = "com.c15t.gpp.tcf"
    }

    /// A key a host app may still have in `Info.plist` that this build does not model.
    ///
    /// `replacement` is why the pair exists: the useful answer to a retired key is not
    /// "ignored", it is "here is what to write instead". Dropping the key quietly would
    /// leave a host believing a mode was on that nothing turned on.
    public struct RetiredInfoPlistKey: Sendable, Equatable {
        public let key: String
        public let replacement: String

        public init(key: String, replacement: String) {
            self.key = key
            self.replacement = replacement
        }
    }

    /// The retired keys this build looks for, and the key a host should write instead.
    ///
    /// `com.c15t.test` set the publisher test mode the first draft of
    /// `native/CONTRACT.md` described as an override. It never was one: test mode is a
    /// client option that never reaches a save body, and ``ConsentOverrides`` has no
    /// property for it. ``RetiredEnvelope`` refuses a stored envelope that carries
    /// `overrides.test`; refusing the plist key here is the same rule on the way in.
    /// `com.c15t.forceGPC` is offered because it is the key a host reaching for test mode
    /// usually wants, and it is the GPC signal, which is a different thing: it feeds
    /// the core's detection, never ``ConsentOverrides/gpc``. The Expo config plugin
    /// writes none of these keys.
    public static let retiredInfoPlistKeys: [RetiredInfoPlistKey] = [
        RetiredInfoPlistKey(key: "com.c15t.test", replacement: "com.c15t.forceGPC"),
    ]

    /// The retired keys present in `infoPlist`, in declaration order.
    public static func retiredKeys(in infoPlist: [String: Any]) -> [RetiredInfoPlistKey] {
        retiredInfoPlistKeys.filter { infoPlist[$0.key] != nil }
    }

    /// The reason this build will not start a core from `infoPlist`, or `nil`.
    ///
    /// - Returns: An error naming every retired key found and what replaces it. It is
    ///   the same sentence the launch hook logs and the module reports, so the console
    ///   and the JavaScript rejection cannot disagree.
    public static func retirementIssue(in infoPlist: [String: Any]) -> C15tBridgeError? {
        let retired = retiredKeys(in: infoPlist)
        guard !retired.isEmpty else { return nil }
        let named = retired
            .map { "\($0.key) (use \($0.replacement) instead)" }
            .joined(separator: ", ")
        return C15tBridgeError(
            code: "C15T_CONFIGURATION_RETIRED",
            message: "Info.plist declares the retired key(s) \(named), which this build does "
                + "not reinterpret: publisher test mode is a client option that never reaches "
                + "a save body, and there is no test-mode override in the protocol. The "
                + "consent core was not started, so consent reads deny-all until the key is "
                + "removed or the core is installed from code."
        )
    }

    /// The default Keychain service, which matches the core's own default so a core
    /// installed by the app and one installed by the bridge read the same items.
    public static let defaultKeychainService = "com.c15t.core"

    /// Read the configuration a host app declared.
    ///
    /// Bad values fall back to the safe option rather than failing the launch: an
    /// unparseable storage mode becomes the Keychain, and a malformed URL becomes no
    /// transport, which keeps consent local instead of sending it somewhere the app
    /// did not intend.
    ///
    /// - Parameter infoPlist: The bundle's `Info.plist`, `Bundle.main.infoDictionary`
    ///   by default.
    public static func from(infoPlist: [String: Any] = Bundle.main.infoDictionary ?? [:]) -> C15tBridgeConfiguration {
        let urlString = (infoPlist[InfoPlistKey.backendURL] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let url = (urlString?.isEmpty == false) ? URL(string: urlString!) : nil

        // An empty string is a value that parses to nothing, so it stays absent, which
        // is the same call `backendURL` makes about an empty string.
        let initURLString = (infoPlist[InfoPlistKey.initURL] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let initURL = (initURLString?.isEmpty == false) ? URL(string: initURLString!) : nil

        let declaredMode = (infoPlist[InfoPlistKey.transportMode] as? String)
            .flatMap(TransportMode.parse(_:))
        // An unreadable mode string is an unreadable mode, not a request to go
        // offline. A URL without a declared mode is hosted: that is the common case,
        // and guessing `offline` would silently stop a working integration syncing.
        let mode = declaredMode ?? (url == nil ? .offline : .hosted)

        let deviceLanguage = Locale.preferredLanguages.first ?? C15tPayload.defaultLanguage
        let language = (infoPlist[InfoPlistKey.language] as? String)
            .flatMap { $0.isEmpty ? nil : $0 } ?? deviceLanguage

        let categories = (infoPlist[InfoPlistKey.categories] as? [String])?
            .compactMap { ConsentCategory(rawValue: $0) }

        return C15tBridgeConfiguration(
            autoBootstrap: (infoPlist[InfoPlistKey.autoBootstrap] as? Bool) ?? true,
            transportMode: mode,
            backendURL: url,
            initURL: initURL,
            domain: infoPlist[InfoPlistKey.domain] as? String,
            storageMode: (infoPlist[InfoPlistKey.storageMode] as? String)
                .flatMap(StorageMode.parse(_:)) ?? .keychain,
            keychainService: (infoPlist[InfoPlistKey.keychainService] as? String)
                .flatMap { $0.isEmpty ? nil : $0 } ?? defaultKeychainService,
            overrides: ConsentOverrides(
                country: infoPlist[InfoPlistKey.country] as? String,
                region: infoPlist[InfoPlistKey.region] as? String,
                language: language,
                gpc: nil
            ),
            consentCategories: categories?.isEmpty == true ? nil : categories,
            vendors: declaredVendors(infoPlist[InfoPlistKey.vendors]),
            gpc: infoPlist[InfoPlistKey.forceGPC] as? Bool,
            bundledPolicyResource: infoPlist[InfoPlistKey.bundledPolicyResource] as? String,
            iab: (try? declaredIAB(in: infoPlist).get()).flatMap { $0 }.map { declared in
                // The backend serves disclosures in `language`; the TC String and the screens
                // declare the same one. Codes TCF can't carry keep the default EN.
                var configuration = declared
                if let code = iabConsentLanguage(language) { configuration.consentLanguage = code }
                return configuration
            },
            gpp: declaredGPP(in: infoPlist)
        )
    }

    /// Read the GPP options a host declared: `nil` unless `com.c15t.gpp` is `true`.
    ///
    /// An MSPA mode this build does not name reads as no mode, which reports the
    /// transaction as not covered rather than claiming a coverage nobody configured.
    public static func declaredGPP(in infoPlist: [String: Any]) -> GPPOptions? {
        guard infoPlist[InfoPlistKey.gpp] as? Bool == true else { return nil }
        let categories = ((infoPlist[InfoPlistKey.gppOptOutCategories] as? [String]) ?? [])
            .compactMap { ConsentCategory(rawValue: $0) }
        return GPPOptions(
            mspaMode: (infoPlist[InfoPlistKey.gppMspaMode] as? String).flatMap(GPPMspaMode.init(rawValue:)),
            optOutCategories: categories.isEmpty ? [.marketing] : categories,
            tcf: infoPlist[InfoPlistKey.gppTCF] as? Bool ?? true
        )
    }

    /// A language tag as a TCF consent language: its primary subtag in two uppercase letters, or
    /// `nil` when it has no two-letter form.
    static func iabConsentLanguage(_ tag: String) -> String? {
        let primary = tag.split(whereSeparator: { $0 == "-" || $0 == "_" }).first.map(String.init) ?? ""
        guard primary.count == 2, primary.unicodeScalars.allSatisfy({ ("a"..."z").contains($0) || ("A"..."Z").contains($0) }) else { return nil }
        return primary.uppercased()
    }

    /// Every `com.c15t.iab.*` key this build reads.
    static let iabKeys = [
        InfoPlistKey.iabCmpId, InfoPlistKey.iabCmpVersion,
        InfoPlistKey.iabPublisherCountryCode, InfoPlistKey.iabConsentScreen,
    ]

    /// Read the IAB settings a host declared.
    ///
    /// No `com.c15t.iab.*` key means IAB stays off. Once any of them is present, CMP ID,
    /// CMP version and publisher country code are all required and must be in range. A
    /// declaration that fails is refused whole, so the core never writes a CMP ID the
    /// publisher did not register.
    ///
    /// - Returns: The configuration, `nil` when nothing is declared, or the reason the
    ///   declaration was refused.
    public static func declaredIAB(in infoPlist: [String: Any]) -> Result<IABConfiguration?, C15tBridgeError> {
        guard iabKeys.contains(where: { infoPlist[$0] != nil }) else { return .success(nil) }
        func refuse(_ reason: String) -> Result<IABConfiguration?, C15tBridgeError> {
            .failure(C15tBridgeError(
                code: "C15T_CONFIGURATION_IAB_INVALID",
                message: "Info.plist IAB settings were refused: \(reason) The consent core starts "
                    + "without IAB TCF, so no IABTCF_CmpSdkID is written and IAB saves fail until "
                    + "the com.c15t.iab.* keys are fixed."
            ))
        }
        guard let cmpId = declaredInteger(infoPlist[InfoPlistKey.iabCmpId]) else {
            return refuse("\(InfoPlistKey.iabCmpId) must be your registered CMP ID, a whole number.")
        }
        guard let cmpVersion = declaredInteger(infoPlist[InfoPlistKey.iabCmpVersion]) else {
            return refuse("\(InfoPlistKey.iabCmpVersion) must be a whole number.")
        }
        guard let country = (infoPlist[InfoPlistKey.iabPublisherCountryCode] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines).uppercased(), !country.isEmpty else {
            return refuse("\(InfoPlistKey.iabPublisherCountryCode) must be a two-letter country code.")
        }
        var consentScreen = 1
        if let raw = infoPlist[InfoPlistKey.iabConsentScreen] {
            guard let screen = declaredInteger(raw) else {
                return refuse("\(InfoPlistKey.iabConsentScreen) must be a whole number.")
            }
            consentScreen = screen
        }
        let configuration = IABConfiguration(
            cmpId: cmpId, cmpVersion: cmpVersion,
            publisherCountryCode: country, consentScreen: consentScreen
        )
        if let issue = C15tApple.iabIssue(configuration) { return refuse(issue) }
        return .success(configuration)
    }

    /// The reason the declared IAB settings were refused, or `nil`.
    public static func iabIssue(in infoPlist: [String: Any]) -> C15tBridgeError? {
        if case let .failure(issue) = declaredIAB(in: infoPlist) { return issue }
        return nil
    }

    /// A whole number from a plist `integer` or a digit string. Booleans and fractions are refused.
    private static func declaredInteger(_ raw: Any?) -> Int? {
        switch raw {
        case let number as NSNumber:
            guard CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
            return Int(exactly: number.doubleValue)
        case let text as String:
            return Int(text.trimmingCharacters(in: .whitespacesAndNewlines))
        default:
            return nil
        }
    }

    /// Parse a declared vendor scope out of an `Info.plist` entry.
    ///
    /// The value is a comma-separated list of ids. Spaces around an id are decoration, and an entry
    /// that is not a positive whole number is dropped rather than trusted -- the same call
    /// ``from(infoPlist:)`` makes about a category name this build does not model, so a typo in an id
    /// cannot install a disclosure the framework never assigned. Duplicates go here rather than being
    /// carried: the request half sorts and dedupes anyway, and a device that stored one id twice would
    /// report a wider partner list than the app has.
    ///
    /// An id the served vendor list does not carry stays in the declaration and costs nothing, because
    /// pruning a served document never adds an entry to satisfy a scope. Reading ids rather than
    /// resolving them is the point: nothing this key declares has to be verifiable at launch.
    ///
    /// A number written as a plist `number` is accepted as one id, since that is the shape a
    /// hand-declared plist is most likely to hold for a single partner.
    ///
    /// - Parameter raw: the raw `Info.plist` entry, typically `infoPlist[key]`.
    /// - Returns: the declared ids in declaration order and without repeats, or `nil` when nothing
    ///   usable is declared, which tells the core to keep every vendor it is served.
    public static func declaredVendors(_ raw: Any?) -> [Int]? {
        let entries: [String]
        switch raw {
        case let text as String:
            entries = text.components(separatedBy: ",")
        case let number as NSNumber:
            entries = [number.stringValue]
        case let numbers as [NSNumber]:
            entries = numbers.map(\.stringValue)
        case let strings as [String]:
            entries = strings.flatMap { $0.components(separatedBy: ",") }
        default:
            return nil
        }
        let ids = entries
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .compactMap { Int($0) }
            .filter { $0 > 0 }
        let deduped = dedupe(ids)
        return deduped.isEmpty ? nil : deduped
    }

    /// The ids in order of first appearance, without repeats.
    private static func dedupe(_ ids: [Int]) -> [Int] {
        var seen = Set<Int>()
        return ids.filter { seen.insert($0).inserted }
    }

    /// Build the core configuration this maps to.
    ///
    /// Every core this installs carries the `IABTCF_*` bus over standard
    /// `NSUserDefaults`, with no `Info.plist` key and no host step to switch it on.
    /// The readers it exists for are ad SDKs linked into the host binary, which read
    /// the bus whether or not the app asked for one, and an empty table reads to them
    /// as "no CMP on this device" -- the claim this exists to make false. Leaving the
    /// bus off stays the host's own option, by installing a configured core directly
    /// (see ``C15tReactNativeBootstrap/install(_:)``); the record is unaffected either
    /// way, because the Keychain stays authoritative and nothing here reads the mirror
    /// back.
    ///
    /// - Returns: The config, or `nil` when storage or backend configuration is refused,
    ///   such as a Keychain on a platform without one or HTTP outside exact loopback hosts.
    ///   Starting with an unencrypted store because the intended one is unavailable
    ///   is not a fallback this makes quietly.
    public func makeCoreConfiguration(fileStoreDirectory: URL? = nil) -> CoreConfig? {
        try? appleConfiguration(fileStoreDirectory: fileStoreDirectory).makeCoreConfiguration()
    }

    /// The store for this configuration, or `nil` when the requested one is
    /// unavailable.
    public func makeStore(fileStoreDirectory: URL? = nil) -> (any ConsentStore)? {
        try? appleStorage(fileStoreDirectory: fileStoreDirectory).makeStore()
    }

    private func appleStorage(fileStoreDirectory: URL?) -> C15tAppleConfiguration.Storage {
        switch storageMode {
        case .memory: return .memory
        case .file: return .file(directory: fileStoreDirectory)
        case .keychain: return .keychain(service: keychainService)
        }
    }

    /// The transport, or `nil` when disabled or the backend URL is refused.
    /// The startup path logs configuration refusals before returning `false`.
    public func makeTransport() -> (any C15tTransport)? {
        try? appleConfiguration(fileStoreDirectory: nil).makeTransport()
    }

    fileprivate func appleConfiguration(fileStoreDirectory: URL?) -> C15tAppleConfiguration {
        let transport: C15tAppleConfiguration.Transport
        switch transportMode {
        case .disabled: transport = .disabled
        case .offline: transport = .offline
        case .hosted: transport = backendURL.map(C15tAppleConfiguration.Transport.hosted) ?? .offline
        case .selfHosted: transport = backendURL.map(C15tAppleConfiguration.Transport.selfHosted) ?? .offline
        }
        return C15tAppleConfiguration(
            transport: transport, storage: appleStorage(fileStoreDirectory: fileStoreDirectory),
            initURL: initURL, domain: domain, consentCategories: consentCategories,
            vendors: vendors, overrides: overrides, gpc: gpc,
            bundledPolicy: bundledPolicyResource.flatMap { name -> BundledPolicyResource? in
                guard let endpoint = backendURL?.absoluteString, let url = Bundle.main.url(forResource: name, withExtension: nil) else { return nil }
                return BundledPolicyResource(url: url, endpoint: endpoint)
            },
            iab: iab,
            gpp: gpp
        )
    }
}

/// Starts the consent core ahead of React Native, once.
///
/// Hydration is the reason this exists as its own step: ``ConsentCore/bootstrap(_:)``
/// reads the stored envelope synchronously before it puts anything on a worker, so a
/// hook that runs before the runtime initializes means the first JavaScript frame
/// already resolves `getBootstrap()` and `getSnapshot()` against real stored consent
/// instead of an empty deny-all.
///
/// An app that owns its own set-up sets `com.c15t.reactnative.AutoBootstrap` to
/// `false`. The bridge then keeps answering reads deny-all until that app calls
/// ``start(configuration:)`` or ``install(_:)``, and works against whatever core is
/// installed afterwards.
public enum C15tReactNativeBootstrap {
    /// Stop native lifecycle subscriptions, leaving consent state installed.
    public static func shutdown() { C15tApple.shutdown() }

    /// Replay queued decisions before policy refresh on native lifecycle recovery.
    @Sendable static func replayThenRefresh() { C15t.current?.replayThenRefresh() }


    /// Start the core from the values in `Info.plist`.
    ///
    /// - Returns: `true` when a core is installed after the call.
    @discardableResult
    public static func start(
        infoPlist: [String: Any] = Bundle.main.infoDictionary ?? [:],
        fileStoreDirectory: URL? = nil
    ) -> Bool {
        let configuration = C15tBridgeConfiguration.from(infoPlist: infoPlist)
        guard configuration.autoBootstrap else { return C15t.current != nil }

        // A core the app installed itself outranks `Info.plist`, so the retired-key
        // check belongs to the only path that would build a core from that plist.
        // Refusing rather than starting with the recognised keys is the same call the
        // store makes about a retired stored envelope: a configuration this build
        // cannot read completely is not a configuration to start from, and deny-all
        // with one clear console line beats a consent state whose cause nobody can say.
        if C15t.current == nil, let issue = C15tBridgeConfiguration.retirementIssue(in: infoPlist) {
            NSLog("%@", "c15t: \(issue.message)")
            return false
        }

        // Refuse IAB, not the whole core: category consent still works, and no CMP ID
        // reaches the IABTCF_* keys that the publisher did not declare correctly.
        if C15t.current == nil, let issue = C15tBridgeConfiguration.iabIssue(in: infoPlist) {
            NSLog("%@", "c15t: \(issue.message)")
        }

        return start(configuration: configuration, fileStoreDirectory: fileStoreDirectory)
    }

    /// Start the core with an explicit configuration.
    ///
    /// - Returns: `true` when a core is installed after the call.
    @discardableResult
    public static func start(
        configuration: C15tBridgeConfiguration,
        fileStoreDirectory: URL? = nil
    ) -> Bool {
        // The opt-out is honoured here as well as in the `Info.plist` entry point, so
        // `autoBootstrap == false` means "the app starts it" whichever door is used.
        guard configuration.autoBootstrap else { return observeInstalledCore() }
        if C15t.current == nil {
            do {
                let coreConfiguration = try configuration
                    .appleConfiguration(fileStoreDirectory: fileStoreDirectory)
                    .makeCoreConfiguration()
                try C15tApple.install(coreConfiguration)
            } catch {
                NSLog("%@", "c15t: Apple installation failed: \(error)")
                return false
            }
        }
        return observeInstalledCore()
    }

    /// Adopt a core the app already built and started.
    ///
    /// This is the escape hatch for a host that configures stores, transports, or
    /// headers the `Info.plist` keys cannot express. Call it before the first
    /// JavaScript frame; the bridge attaches to this core and never builds its own.
    ///
    /// - Returns: `true` when `core` is the instance the bridge will use.
    @discardableResult
    public static func install(_ core: ConsentCore) -> Bool {
        C15tApple.attach(core)
    }

    /// Whether a core is installed and started.
    public static var isRunning: Bool {
        guard let core = C15t.current else { return false }
        return core.isBootstrapped
    }

    /// Arm the lifecycle legs against the installed core and report whether it is running.
    ///
    /// Every exit from a start that found or made a core goes through here, so the legs
    /// follow the core rather than one particular way of starting it. That includes the
    /// host that set `AutoBootstrap` to `false`, bootstrapped a core itself before React
    /// Native, and reaches this enum only through the module's `ensureCore()`: it gets the
    /// foreground leg like everyone else, because launch and foreground are the two legs
    /// the contract says are never optional.
    private static func observeInstalledCore() -> Bool {
        guard let core = C15t.current else { return false }
        _ = C15tApple.attach(core)
        return core.isBootstrapped
    }
}
