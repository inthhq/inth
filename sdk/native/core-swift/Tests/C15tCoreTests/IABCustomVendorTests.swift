import Foundation
import XCTest
@_spi(C15tInternal) @testable import C15tCore

/// Custom (non-IAB) vendors: read from `/init`, listed with their own choices, kept beside the TC
/// String and never in it, and counted where the web counts them.
final class IABCustomVendorTests: XCTestCase {
    struct Vector: Decodable {
        let now: Int64
        let configuration: IABConfiguration
        let gvl: GlobalVendorList
    }

    /// The Additional Consent fixture's list: purposes 1, 2, 3, 4 and 7; vendor 1 asks consent
    /// for 1 and 2, vendor 2 claims legitimate interest for 2 and 7; nobody declares special
    /// feature 1.
    func fixture() throws -> Vector {
        try C15tJSON.decode(Vector.self, from: Data(contentsOf: IABCommitTests.fixtureURL.deletingLastPathComponent()
            .appendingPathComponent("additional-consent-cases.json")))
    }

    static let served: JSONValue = .array([
        .object([
            "id": .string("internal-ads"), "name": .string("Internal ads"),
            "privacyPolicyUrl": .string("https://example.com/ads-privacy"),
            "purposes": .array([.integer(3), .integer(4)]), "legIntPurposes": .array([.integer(7)]),
            "specialFeatures": .array([.integer(1)]), "usesCookies": .bool(true),
            "cookieMaxAgeSeconds": .integer(86_400),
        ]),
        .object([
            "id": .integer(1_000_482), "name": .string("Fraud checks"),
            "privacyPolicyUrl": .string("https://example.com/fraud"),
            "purposes": .array([]), "legIntPurposes": .array([.integer(2)]),
        ]),
        .object([
            "id": .string("chat"), "name": .string("Live chat"),
            "privacyPolicyUrl": .string("https://example.com/chat"),
            "purposes": .array([.integer(10)]), "description": .string("Support chat"),
        ]),
    ])

    func response(_ v: Vector, customVendors: JSONValue?) throws -> HTTPResponse {
        var fields = C15tJSON.parse(Fixture.initBody(policyResolution: Fixture.matchedResolution(policy: Fixture.rule(model: "iab"))))!.objectValue!
        fields["gvl"] = C15tJSON.parse(try C15tJSON.encode(v.gvl))!
        if let customVendors { fields["customVendors"] = customVendors }
        return HTTPResponse(status: 200, body: try C15tJSON.encode(JSONValue.object(fields)))
    }

    func boot(_ v: Vector, store: any ConsentStore = InMemoryStore(), http: StubHTTP = StubHTTP(),
              customVendors: JSONValue? = served) async throws -> ConsentCore {
        http.initResponse = try response(v, customVendors: customVendors)
        http.setSavesFail(true)
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: store, transport: Fixture.transport(http), iab: v.configuration,
            now: { v.now }, initRetry: .disabled, flushPendingOnBootstrap: false))
        await core.waitUntilIdle()
        return core
    }

    func testReadsTheServedListWithTheSchemaRules() throws {
        let vendors = try XCTUnwrap(IABCustomVendor.list(Self.served))
        XCTAssertEqual(vendors.map(\.id), ["internal-ads", "1000482", "chat"])
        XCTAssertEqual(vendors[0].specialFeatures, [1])
        XCTAssertEqual(vendors[0].cookieMaxAgeSeconds, 86_400)
        XCTAssertEqual(vendors[2].description, "Support chat")
        func one(_ change: (inout [String: JSONValue]) -> Void) -> [IABCustomVendor]? {
            var entry = Self.served.arrayValue![0].objectValue!
            change(&entry)
            return IABCustomVendor.list(.array([.object(entry)]))
        }
        XCTAssertNotNil(one { _ in })
        XCTAssertNil(one { $0["purposes"] = nil }, "purposes is required")
        XCTAssertNil(one { $0["purposes"] = .array([.integer(12)]) }, "purposes are 1 to 11")
        XCTAssertNil(one { $0["specialFeatures"] = .array([.integer(3)]) })
        XCTAssertNil(one { $0["privacyPolicyUrl"] = .string("not a url") })
        XCTAssertNil(one { $0["id"] = .number(1.5) })
        XCTAssertNil(one { $0["cookieMaxAgeSeconds"] = .integer(0) })
        XCTAssertNil(IABCustomVendor.list(.array([Self.served.arrayValue![0], Self.served.arrayValue![0]])), "duplicate ids")
        XCTAssertNil(IABCustomVendor.list(.string("invalid")))
        XCTAssertEqual(IABCustomVendor.list(.array([])), [])
    }

    func testAcceptAllCoversThemOutsideTheTCString() async throws {
        let v = try fixture()
        let plain = try await boot(v, customVendors: nil)
        XCTAssertEqual(plain.save(.all).status, .committed)
        let plainConsent = try XCTUnwrap(plain.iabConsent())
        XCTAssertEqual(plainConsent.choices.purposeConsents, [1, 2])
        XCTAssertEqual(plainConsent.choices.customVendorConsents, [])

        let store = InMemoryStore()
        let core = try await boot(v, store: store)
        XCTAssertEqual(core.iabCustomVendors().map(\.id), ["internal-ads", "1000482", "chat"])
        let accepting = try XCTUnwrap(core.iabAcceptAllChoices())
        XCTAssertEqual(accepting.purposeConsents, [1, 2, 3, 4], "purpose 10 is not on the list")
        XCTAssertEqual(accepting.purposeLegitimateInterests, [2, 7])
        XCTAssertEqual(accepting.specialFeatureOptIns, [1])
        XCTAssertEqual(accepting.customVendorConsents, ["chat", "internal-ads"])
        XCTAssertEqual(accepting.customVendorLegitimateInterests, ["1000482", "internal-ads"])
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        let consent = try XCTUnwrap(core.iabConsent())
        XCTAssertEqual(consent.choices, accepting)
        XCTAssertTrue(core.isCustomVendorAllowed("internal-ads"))
        XCTAssertFalse(core.isCustomVendorAllowed("1000482"), "legitimate interest only")

        // The TC String carries IAB vendor ids only; custom grants change none of its vendor bits.
        guard case let .decoded(decoded) = TcStringWireReader.read(consent.tcString),
              case let .decoded(plainDecoded) = TcStringWireReader.read(plainConsent.tcString)
        else { return XCTFail("TC Strings did not decode") }
        XCTAssertEqual(decoded.vendorConsents, plainDecoded.vendorConsents)
        XCTAssertEqual(decoded.vendorLegitimateInterests, plainDecoded.vendorLegitimateInterests)

        // The web sends no custom vendor map in a save, so native does not either.
        let body = try XCTUnwrap(store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode)?.pendingSaves?.first?.body)
        let text = String(decoding: body, as: UTF8.self)
        XCTAssertFalse(text.contains("internal-ads"))
        XCTAssertFalse(text.contains("customVendor"))

        // Restored on the next launch with no network.
        let cold = ConsentCore()
        cold.bootstrap(CoreConfig(store: store, iab: v.configuration, now: { v.now }, flushPendingOnBootstrap: false))
        XCTAssertEqual(cold.iabCustomVendors().map(\.id), ["internal-ads", "1000482", "chat"])
        XCTAssertEqual(cold.iabConsent()?.choices.customVendorConsents, ["chat", "internal-ads"])

        // Reject all withdraws them.
        XCTAssertEqual(cold.save(.necessary).status, .committed)
        XCTAssertEqual(cold.iabConsent()?.choices.customVendorConsents, [])
        XCTAssertEqual(cold.iabConsent()?.choices.customVendorLegitimateInterests, [])
    }

    /// What reaches the store and the backend is a pure function of the state: the same state
    /// encodes to the same bytes however many times it is written, with custom vendors in it.
    func testTheStoredEnvelopeAndSaveBodyAreTheSameBytesForTheSameState() async throws {
        let v = try fixture()
        let store = InMemoryStore()
        let core = try await boot(v, store: store)
        var draft = try XCTUnwrap(core.openIABDraft())
        // Out of order on purpose: the stored decision sorts them.
        draft.choices.customVendorConsents = ["internal-ads", "chat"]
        draft.choices.customVendorLegitimateInterests = ["internal-ads", "1000482"]
        XCTAssertEqual(core.saveIAB(draft, categories: [:]).status, .committed)
        await core.waitUntilIdle()
        let bytes = try XCTUnwrap(store.data(for: StorageKey.snapshot))
        let envelope = try XCTUnwrap(StoredEnvelope.decode(bytes))
        XCTAssertEqual(envelope.iabConsent?.choices.customVendorConsents, ["chat", "internal-ads"])
        XCTAssertEqual(envelope.iabConsent?.choices.customVendorLegitimateInterests, ["1000482", "internal-ads"])
        XCTAssertEqual(envelope.customVendors?.map(\.id), ["internal-ads", "1000482", "chat"])
        let body = try XCTUnwrap(envelope.pendingSaves?.first?.body)
        for _ in 0..<20 {
            XCTAssertEqual(try C15tJSON.encode(envelope), bytes, "the envelope re-encodes to the bytes stored")
            let again = try XCTUnwrap(StoredEnvelope.decode(try C15tJSON.encode(envelope)))
            XCTAssertEqual(again.pendingSaves?.first?.body, body)
        }
        // What a relaunch writes is stable too, and keeps the lists as they were.
        let cold = ConsentCore()
        cold.bootstrap(CoreConfig(store: store, iab: v.configuration, now: { v.now }, flushPendingOnBootstrap: false))
        let relaunched = try XCTUnwrap(store.data(for: StorageKey.snapshot))
        let restored = try XCTUnwrap(StoredEnvelope.decode(relaunched))
        XCTAssertEqual(try C15tJSON.encode(restored), relaunched)
        XCTAssertEqual(restored.customVendors, envelope.customVendors)
        XCTAssertEqual(restored.iabConsent?.choices, envelope.iabConsent?.choices)
    }

    func testADraftGrantsOnlyWhatAVendorDeclares() async throws {
        let v = try fixture()
        let core = try await boot(v)
        var draft = try XCTUnwrap(core.openIABDraft())
        draft.choices.customVendorConsents = ["1000482"]
        XCTAssertEqual(core.saveIAB(draft, categories: [:]).error?.code, "invalid-iab-choices", "no consent purposes")
        draft.choices.customVendorConsents = ["unknown"]
        XCTAssertEqual(core.saveIAB(draft, categories: [:]).error?.code, "invalid-iab-choices")
        draft.choices.customVendorConsents = ["chat", "chat"]
        XCTAssertEqual(core.saveIAB(draft, categories: [:]).error?.code, "invalid-iab-choices")
        draft.choices.customVendorConsents = ["chat"]
        draft.choices.customVendorLegitimateInterests = ["chat"]
        XCTAssertEqual(core.saveIAB(draft, categories: [:]).error?.code, "invalid-iab-choices", "no legitimate interest claim")
        draft.choices.customVendorLegitimateInterests = ["1000482"]
        XCTAssertEqual(core.saveIAB(draft, categories: [:]).status, .committed)
        XCTAssertEqual(core.iabConsent()?.choices.customVendorConsents, ["chat"])
        XCTAssertEqual(core.iabConsent()?.choices.customVendorLegitimateInterests, ["1000482"])
    }

    func testAListChangeDropsGrantsForVendorsNoLongerListedAndKeepsTheDecision() async throws {
        let v = try fixture()
        let http = StubHTTP()
        let core = try await boot(v, http: http)
        XCTAssertEqual(core.save(.all).status, .committed)
        let before = try XCTUnwrap(core.iabConsent())
        // A list without `chat` withdraws its grant; the TC String stands.
        http.initResponse = try response(v, customVendors: .array(Array(Self.served.arrayValue!.prefix(2))))
        core.refresh()
        await core.waitUntilIdle()
        let after = try XCTUnwrap(core.iabConsent())
        XCTAssertEqual(after.tcString, before.tcString)
        XCTAssertEqual(after.choices.customVendorConsents, ["internal-ads"])
        // An unreadable list is none.
        http.initResponse = try response(v, customVendors: .string("invalid"))
        core.refresh()
        await core.waitUntilIdle()
        XCTAssertEqual(core.iabCustomVendors(), [])
        XCTAssertEqual(core.iabConsent()?.choices.customVendorConsents, [])
        XCTAssertEqual(core.iabConsent()?.tcString, before.tcString)
    }

    /// The backend leaves `customVendors` out of a matched IAB answer when it declares none, so
    /// there the absent key withdraws the list. Any other answer leaves the key out because it
    /// carries no IAB payload, and keeps the list held.
    func testAMatchedIABAnswerWithoutTheKeyWithdrawsThem() async throws {
        let v = try fixture()
        let http = StubHTTP()
        let core = try await boot(v, http: http)
        XCTAssertEqual(core.save(.all).status, .committed)
        let before = try XCTUnwrap(core.iabConsent())
        http.initResponse = try response(v, customVendors: nil)
        core.refresh()
        await core.waitUntilIdle()
        XCTAssertEqual(core.iabCustomVendors(), [])
        XCTAssertEqual(core.iabConsent()?.choices.customVendorConsents, [])
        XCTAssertEqual(core.iabConsent()?.tcString, before.tcString)
        http.initResponse = try response(v, customVendors: Self.served)
        core.refresh()
        await core.waitUntilIdle()
        http.initResponse = HTTPResponse(
            status: 200,
            body: Fixture.initBody(
                policyResolution: Fixture.matchedResolution(policy: Fixture.rule(model: "opt-in"))))
        core.refresh()
        await core.waitUntilIdle()
        XCTAssertEqual(core.iabCustomVendors().count, 3, "not an IAB answer")
    }

    func testPresentationAndDerivationCountThem() async throws {
        let v = try fixture()
        let core = try await boot(v)
        let presentation = try XCTUnwrap(core.iabPresentation())
        XCTAssertEqual(presentation.customVendors.count, 3)
        XCTAssertEqual(presentation.bannerSummary.vendorCount, 2 + 3)
        XCTAssertEqual(presentation.declaredPurposeIds, [1, 2, 3, 4, 7])
        XCTAssertEqual(presentation.declaredSpecialFeatureIds, [1])
        XCTAssertNil(core.iabPurposeCategories())
        var draft = try XCTUnwrap(core.openIABDraft())
        // Purposes 3 and 4 decide marketing only because `internal-ads` asks consent for them.
        draft.choices.purposeConsents = [1, 2]
        XCTAssertEqual(core.saveIAB(draft, categories: [:]).status, .committed)
        XCTAssertEqual(core.iabPurposeCategories()?[.marketing], false)
        draft = try XCTUnwrap(core.openIABDraft())
        draft.choices.purposeConsents = [1, 2, 3, 4]
        XCTAssertEqual(core.saveIAB(draft, categories: [:]).status, .committed)
        XCTAssertEqual(core.iabPurposeCategories()?[.marketing], true)
    }

    func testTheSharedDerivationFixture() throws {
        struct Fixture: Decodable {
            struct Case: Decodable {
                let name: String
                let purposeConsents: [Int]
                let vendors: [String: [Int]]
                let customVendors: [String: [Int]]
                let adTechProvidersListed: Bool
                let expected: [String: Bool]
            }
            let cases: [Case]
        }
        let data = try Data(contentsOf: IABCommitTests.fixtureURL.deletingLastPathComponent()
            .appendingPathComponent("purpose-categories.json"))
        let fixture = try JSONDecoder().decode(Fixture.self, from: data)
        XCTAssertFalse(fixture.cases.isEmpty)
        for item in fixture.cases {
            let basis = IABPurposeCategories.consentBasis(
                vendorConsentPurposes: Array(item.vendors.values),
                customVendors: item.customVendors.map {
                    IABCustomVendor(id: $0.key, name: $0.key, privacyPolicyUrl: "https://example.com", purposes: $0.value)
                },
                adTechProvidersListed: item.adTechProvidersListed)
            let categories = IABPurposeCategories.categories(purposeConsents: Set(item.purposeConsents), basis: basis)
            XCTAssertEqual(Dictionary(uniqueKeysWithValues: categories.map { ($0.key.rawValue, $0.value) }), item.expected, item.name)
        }
    }

    func testChoicesStoredBeforeCustomVendorsStillDecode() throws {
        let json = """
        {"purposeConsents":[1],"purposeLegitimateInterests":[],"purposeObjections":[],"vendorConsents":[],
        "vendorLegitimateInterests":[],"vendorObjections":[],"specialFeatureOptIns":[],"publisherConsents":[],
        "publisherLegitimateInterests":[],"publisherCustomConsents":[],"publisherCustomLegitimateInterests":[]}
        """
        let choices = try JSONDecoder().decode(IABChoices.self, from: Data(json.utf8))
        XCTAssertEqual(choices.customVendorConsents, [])
        XCTAssertEqual(choices.purposeConsents, [1])
        let numeric = json.replacingOccurrences(of: "{\"purposeConsents\"", with: "{\"customVendorConsents\":[1],\"purposeConsents\"")
        XCTAssertThrowsError(try JSONDecoder().decode(IABChoices.self, from: Data(numeric.utf8)), "ids are strings")
    }
}
