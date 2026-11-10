import Foundation
import XCTest
@testable import C15tCore

/// `native/protocol/gpp/cases.json`: the strings and in-app keys `core-android` and the
/// web encoder produce for the same inputs. `GppTest.kt` runs the same cases.
final class GPPFixtureTests: XCTestCase {
    static let fixtureURL = IABCommitTests.fixtureURL.deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("gpp/cases.json")

    private func fixture() throws -> [String: JSONValue] {
        try XCTUnwrap(C15tJSON.parse(Data(contentsOf: Self.fixtureURL))?.objectValue)
    }

    private func fields(_ values: [String: JSONValue]) -> [String: [Int]] {
        values.mapValues { value in
            if let items = value.arrayValue { return items.compactMap { $0.intValue.map(Int.init) } }
            return [Int(value.intValue ?? -1)]
        }
    }

    func testEncoderCasesMatchTheSharedStrings() throws {
        for item in try XCTUnwrap(fixture()["encoder"]?.arrayValue) {
            let testCase = try XCTUnwrap(item.objectValue)
            let id = testCase["id"]?.stringValue ?? "?"
            let sections = try XCTUnwrap(testCase["sections"]?.arrayValue).map { raw -> GPPSection in
                let section = raw.objectValue ?? [:]
                let sectionID = Int(section["id"]?.intValue ?? 0)
                if sectionID == GPPUSNational.id {
                    return GPPSection(id: sectionID, encoded: try GPPEncoder.encodeUSNational(
                        core: fields(section["usnat"]?.objectValue ?? [:]),
                        gpc: section["gpc"]?.boolValue ?? false))
                }
                return GPPSection(id: sectionID, encoded: section["encoded"]?.stringValue ?? "")
            }
            XCTAssertEqual(try GPPEncoder.encodeGPPString(sections), testCase["expected"]?.stringValue, id)
        }
    }

    func testResolverCasesMatchTheSharedStringsAndStorageRows() throws {
        for item in try XCTUnwrap(fixture()["resolver"]?.arrayValue) {
            let testCase = try XCTUnwrap(item.objectValue)
            let id = testCase["id"]?.stringValue ?? "?"
            let input = try XCTUnwrap(testCase["input"]?.objectValue)
            let expected = try XCTUnwrap(testCase["expected"]?.objectValue)
            let snapshot = try snapshot(input)
            let policy = try policy(input)
            let options = options(input)
            let tcString = input["tcString"]?.stringValue
            let signal = GPPResolver.resolve(snapshot, policy: policy, tcString: tcString, options: options)
            XCTAssertEqual(signal?.gppString, expected["gppString"]?.stringValue, id)
            XCTAssertEqual(signal?.sectionIDs ?? [], (expected["sectionIds"]?.arrayValue ?? []).compactMap { $0.intValue.map(Int.init) }, id)
            if var usnat = expected["usnat"]?.objectValue, let policy, let options {
                usnat["Gpc"] = nil
                XCTAssertEqual(GPPResolver.usNationalValues(snapshot, policy: policy, options: options), fields(usnat), id)
            }
            let storage = GPPStorageBus.values(signal, iabConsent: tcString.map(committed))
            var want: [String: TcBusValue] = [:]
            for (key, value) in expected["storage"]?.objectValue ?? [:] {
                want[key] = value.stringValue.map { .text($0) } ?? .number(Int(value.intValue ?? -1))
            }
            XCTAssertEqual(storage, want, id)
            XCTAssertTrue(storage.keys.allSatisfy(GPPStorageBusKeys.allNames.contains), "\(id): a key the bus does not own")
        }
    }

    private func snapshot(_ input: [String: JSONValue]) throws -> ConsentSnapshot {
        let permissions = try XCTUnwrap(input["effectivePermissions"]?.objectValue)
        func allowed(_ name: String) -> Bool { permissions[name]?.boolValue ?? false }
        var draft = ConsentSnapshot.Draft(current: .coldStart)
        draft.ready = input["ready"]?.boolValue ?? false
        draft.policyPending = input["policyPending"]?.boolValue ?? true
        draft.resolution = PolicyResolutionInfo(
            status: PolicyResolutionInfo.Status(rawValue: input["resolution"]?.stringValue ?? "") ?? .unconfigured,
            policyId: "fixture", fingerprint: "f")
        draft.location = LocationContext(countryCode: input["location"]?.stringValue, regionCode: nil)
        draft.overrides = ConsentOverrides(country: input["overrideCountry"]?.stringValue, region: nil, language: "en")
        draft.effectivePermissions = ConsentState(
            necessary: true, functionality: allowed("functionality"), experience: allowed("experience"),
            measurement: allowed("measurement"), marketing: allowed("marketing"))
        draft.privacySignals = PrivacySignals(detected: input["gpc"]?.boolValue ?? false, override: nil)
        return draft.build(revision: 1)
    }

    private func policy(_ input: [String: JSONValue]) throws -> EvaluationPolicy? {
        guard let raw = input["policy"]?.objectValue else { return nil }
        let model = try XCTUnwrap(ConsentModel(rawValue: raw["model"]?.stringValue ?? ""))
        return EvaluationPolicy(
            model: model, prompt: .choice, scope: OptionalConsentCategory.ordered, scopeMode: .permissive,
            gpcDenyCategories: [], choiceMaxAgeMs: 1_000, noticeMaxAgeMs: 1_000,
            rights: (raw["rights"]?.arrayValue ?? []).compactMap { $0.stringValue.flatMap(PolicyRight.init(rawValue:)) })
    }

    private func options(_ input: [String: JSONValue]) -> GPPOptions? {
        guard let raw = input["options"]?.objectValue else { return nil }
        return GPPOptions(
            mspaMode: raw["mspaMode"]?.stringValue.flatMap(GPPMspaMode.init(rawValue:)),
            optOutCategories: raw["optOutCategories"]?.arrayValue?.compactMap { $0.stringValue.flatMap(ConsentCategory.init(rawValue:)) }
                ?? [.marketing],
            tcf: raw["tcf"]?.boolValue ?? true)
    }

    private func committed(_ tcString: String) -> IABCommittedConsent {
        IABCommittedConsent(configuration: IABConfiguration(cmpId: 53, cmpVersion: 7, publisherCountryCode: "GB"),
            choices: IABChoices(), subjectId: "sub_test", externalId: nil, fingerprint: "f", vendorListVersion: 42,
            policyVersion: 5, consentVersion: 1, createdAt: 0, actionAt: 0, tcString: tcString,
            disclosureID: nil, addtlConsent: nil, adTechProvidersID: nil)
    }
}

/// GPP through a real core: the snapshot field, the `IABGPP_*` rows, and a cold start.
final class GPPCoreTests: XCTestCase {
    private let noChoice = "DBABLA~CVQqAAAAAACA.QA"
    private let optedOut = "DBABLA~CVQVAAAAAACA.QA"

    private func config(
        store: any ConsentStore, http: StubHTTP?, bus: UserDefaultsStorageBus, gpp: GPPOptions?
    ) -> CoreConfig {
        CoreConfig(
            store: store,
            transport: http.map(Fixture.transport),
            consentCategories: ConsentCategory.allCases,
            overrides: ConsentOverrides(country: "US", region: nil, language: "en"),
            now: TestClock().reading,
            initRetry: .disabled,
            storageBus: bus,
            gpp: gpp
        )
    }

    private func http() -> StubHTTP {
        let http = StubHTTP()
        http.initResponse = Fixture.initResponse(policyResolution: Fixture.matchedResolution(
            policy: Fixture.rule(model: "opt-out", rights: ["disclosure", "opt-out", "preferences"])))
        return http
    }

    func testUSOptOutVisitorGetsUSNationalAndARefusalOptsOut() async throws {
        let suite = "c15t-gpp-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let bus = UserDefaultsStorageBus(defaults: defaults)
        let store = InMemoryStore()
        let core = ConsentCore()
        await core.bootstrapAndSettle(config(store: store, http: http(), bus: bus, gpp: GPPOptions()))
        XCTAssertEqual(core.snapshot().gppString, noChoice)
        XCTAssertEqual(defaults.string(forKey: GPPStorageBusKeys.hdrGppString), noChoice)
        XCTAssertEqual(defaults.string(forKey: GPPStorageBusKeys.gppSID), "7")
        XCTAssertEqual(defaults.string(forKey: GPPStorageBusKeys.hdrSections), "7")
        XCTAssertEqual(defaults.string(forKey: GPPStorageBusKeys.hdrVersion), "1")
        XCTAssertEqual(defaults.string(forKey: GPPStorageBusKeys.sectionString(7)), "CVQqAAAAAACA.QA")

        XCTAssertEqual(core.save(.necessary).status, .committed)
        await core.waitUntilIdle()
        XCTAssertEqual(core.snapshot().gppString, optedOut)
        XCTAssertEqual(defaults.string(forKey: GPPStorageBusKeys.hdrGppString), optedOut)

        // The envelope keeps no copy; a cold start derives the same string again.
        let cold = ConsentCore()
        await cold.bootstrapAndSettle(config(store: store, http: nil, bus: bus, gpp: GPPOptions()))
        XCTAssertEqual(cold.snapshot().gppString, optedOut)
    }

    func testGPPStaysOffUntilTheAppTurnsItOn() async throws {
        let suite = "c15t-gpp-off-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let bus = UserDefaultsStorageBus(defaults: defaults)
        let core = ConsentCore()
        await core.bootstrapAndSettle(config(store: InMemoryStore(), http: http(), bus: bus, gpp: nil))
        XCTAssertNil(core.snapshot().gppString)
        for key in GPPStorageBusKeys.allNames { XCTAssertNil(defaults.object(forKey: key), key) }
    }

    func testAPolicyWithoutRightsFallsBackToTheOnesItsModelRequires() {
        let policy = EvaluationPolicy(
            model: .optOut, prompt: .choice, scope: [], scopeMode: .permissive,
            gpcDenyCategories: [], choiceMaxAgeMs: 1, noticeMaxAgeMs: 1)
        XCTAssertEqual(policy.rights, [.disclosure, .optOut, .preferences])
    }
}
