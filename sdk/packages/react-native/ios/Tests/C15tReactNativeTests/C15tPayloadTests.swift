@testable import C15tReactNativeBridge
import C15tCore
import XCTest

/// The wire boundary is the part of the iOS bridge most likely to drift from the
/// TypeScript protocol, and it is the part that must not. These assert on field
/// names, null vs absent, and fail-closed reads rather than on internals.
final class C15tPayloadTests: XCTestCase {
    func testBootstrapPayloadCarriesHandshakeFields() {
        let snapshot = ConsentSnapshot(subject: SubjectSnapshot(id: "sub-1", externalId: nil))
        let payload = jsonObject(C15tPayload.bootstrap(snapshot: snapshot, hasStoredSnapshot: true))

        XCTAssertEqual(payload["protocolVersion"] as? Int, 1)
        XCTAssertEqual(payload["minSupportedProtocolVersion"] as? Int, 1)
        XCTAssertEqual(payload["maxSupportedProtocolVersion"] as? Int, 1)
        XCTAssertEqual(payload["subjectId"] as? String, "sub-1")
        XCTAssertEqual(payload["hasStoredSnapshot"] as? Bool, true)
        XCTAssertEqual(payload["nativeUI"] as? Bool, true, "a default build links the stock screens")
        XCTAssertNotNil(payload["nativeSdkVersion"] as? String, "the handshake must name the SDK version")
    }

    func testBootstrapPayloadReportsNullSubjectBeforeFirstWrite() {
        let payload = jsonObject(C15tPayload.bootstrap(snapshot: ConsentSnapshot(), hasStoredSnapshot: false))

        assertJSONNull(payload, "subjectId")
    }

    func testColdStartSnapshotServesDenyAllWithBothFlagsUnset() {
        let payload = jsonObject(C15tPayload.snapshot(.coldStart))

        XCTAssertEqual(payload["policyPending"] as? Bool, true)
        XCTAssertEqual(payload["ready"] as? Bool, false)
        guard let permissions = payload["effectivePermissions"] as? [String: Bool] else {
            return XCTFail("effectivePermissions missing from \(payload)")
        }
        XCTAssertEqual(permissions["necessary"], true, "necessary is never a choice")
        for category in ["functionality", "experience", "measurement", "marketing"] {
            XCTAssertEqual(permissions[category], false, "\(category) must be denied while policy is pending")
        }
    }

    func testSnapshotSendsEveryReservedKeyAsExplicitNull() {
        // The protocol declares these `T | null`, not optional. Omitting them would
        // hand JavaScript `undefined` where its types promise `null`.
        let payload = jsonObject(C15tPayload.snapshot(.coldStart))

        for key in [
            "explicitChoice", "consentCategories", "policySnapshotToken", "subject",
            "location", "translations", "nextDeadline", "error", "iab",
        ] {
            assertJSONNull(payload, key)
        }

        let overrides = payload["overrides"] as? [String: Any]
        XCTAssertNotNil(overrides)
        XCTAssertEqual(
            overrides?.keys.sorted(),
            ["country", "gpc", "language", "region"],
            "the override set is exactly what the protocol declares: a retired name on "
                + "the wire would read back as a real field, and a missing one hands "
                + "JavaScript undefined where its types promise null",
        )
        let resolution = payload["resolution"] as? [String: Any]
        XCTAssertNotNil(resolution)
        for key in ["policyId", "fingerprint"] {
            XCTAssertTrue(resolution?.keys.contains(key) == true, "resolution.\(key) must be present")
        }
    }

    func testSnapshotNeverEmitsAnEmptyLanguage() {
        // Translations resolve to exactly one bundle, so an empty language on the
        // wire is a bug the bridge covers for.
        let blank = ConsentSnapshot(overrides: ConsentOverrides(country: nil, region: nil, language: "", gpc: nil))

        let payload = jsonObject(C15tPayload.snapshot(blank, fallbackLanguage: "fr"))
        let overrides = payload["overrides"] as? [String: Any]

        XCTAssertEqual(overrides?["language"] as? String, "fr")
    }

    func testSnapshotKeepsAResolvedLanguageAsIs() {
        let snapshot = ConsentSnapshot(overrides: ConsentOverrides(country: nil, region: nil, language: "de", gpc: nil))

        let payload = jsonObject(C15tPayload.snapshot(snapshot, fallbackLanguage: "fr"))

        XCTAssertEqual((payload["overrides"] as? [String: Any])?["language"] as? String, "de")
    }

    func testCommitIntentReadsTheThreeActions() {
        XCTAssertEqual(C15tPayload.parseCommitIntent(#"{"action":"all"}"#), .all)
        XCTAssertEqual(C15tPayload.parseCommitIntent(#"{"action":"necessary"}"#), .necessary)
        XCTAssertEqual(
            C15tPayload.parseCommitIntent(#"{"action":"explicit","consents":{"marketing":true,"measurement":false}}"#),
            .custom([.marketing: true, .measurement: false])
        )
    }

    func testAnIABIntentReadsACompleteDraftWithItsCategoriesAndRevision() {
        let raw = #"{"action":"iab","choices":{"purposeConsents":[1,2],"purposeLegitimateInterests":[],"purposeObjections":[],"vendorConsents":[755],"vendorLegitimateInterests":[],"vendorObjections":[],"specialFeatureOptIns":[],"publisherConsents":[],"publisherLegitimateInterests":[],"publisherCustomConsents":[],"publisherCustomLegitimateInterests":[]},"consents":{"marketing":true},"revision":12}"#
        var choices = IABChoices()
        choices.purposeConsents = [1, 2]
        choices.vendorConsents = [755]
        XCTAssertEqual(C15tPayload.parseCommitIntent(raw), .iab(choices, categories: [.marketing: true]))
        for bad in [
            #"{"action":"iab","consents":{}}"#,
            raw.replacingOccurrences(of: "[1,2]", with: #"["1",2]"#),
            raw.replacingOccurrences(of: #""purposeObjections":[],"#, with: ""),
            raw.replacingOccurrences(of: #""consents":{"marketing":true}"#, with: #""consents":{"necessary":true}"#),
        ] {
            XCTAssertNil(C15tPayload.parseCommitIntent(bad), "\(bad) must not become a commit")
        }
    }

    func testACommittedIABDecisionCrossesInsideTheIABSlot() throws {
        // The memberwise initializer is internal to C15tCore; the Codable form is public.
        let choices = String(decoding: try JSONEncoder().encode(IABChoices()), as: UTF8.self)
        let configuration = String(decoding: try JSONEncoder().encode(
            IABConfiguration(cmpId: 9, cmpVersion: 1, publisherCountryCode: "DE")), as: UTF8.self)
        let consent = try JSONDecoder().decode(IABCommittedConsent.self, from: Data("""
            {"configuration":\(configuration),"choices":\(choices),"subjectId":"sub","fingerprint":"fp",
            "vendorListVersion":177,"policyVersion":5,"consentVersion":1,"createdAt":1,"actionAt":1,"tcString":"CQ-test"}
            """.utf8))
        let committed = C15tPayload.committedIAB(consent).objectValue
        XCTAssertEqual(committed?["tcString"], .string("CQ-test"))
        XCTAssertEqual(committed?["addtlConsent"], .null)
        XCTAssertEqual(committed?["choices"]?.objectValue?["vendorConsents"], .array([]))
    }

    func testTheIABSlotSaysWhetherADraftCanOpenAndWhatAcceptAllSaves() throws {
        // `iab` is immutable on the public type, so the snapshot comes through its Codable form.
        var wire = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(ConsentSnapshot.coldStart)) as? [String: Any])
        wire["iab"] = ["gvl": NSNull()]
        let snapshot = try JSONDecoder().decode(ConsentSnapshot.self, from: JSONSerialization.data(withJSONObject: wire))
        func slot(_ acceptAll: IABChoices?) -> [String: Any] {
            (jsonObject(C15tPayload.snapshot(snapshot, iabAcceptAll: acceptAll))["iab"] as? [String: Any]) ?? [:]
        }
        XCTAssertEqual(slot(nil)["editable"] as? Bool, false)
        XCTAssertTrue(slot(nil)["acceptAll"] is NSNull)
        var choices = IABChoices()
        choices.vendorConsents = [7]
        XCTAssertEqual(slot(choices)["editable"] as? Bool, true)
        XCTAssertEqual((slot(choices)["acceptAll"] as? [String: Any])?["vendorConsents"] as? [Int], [7])
        XCTAssertEqual(slot(choices)["headlessUnsupported"] as? [String], [])
    }

    func testHeadlessIABEditingClosesWhileACustomScreenCouldNotDiscloseEverything() throws {
        var wire = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(ConsentSnapshot.coldStart)) as? [String: Any])
        wire["iab"] = ["gvl": NSNull()]
        let snapshot = try JSONDecoder().decode(ConsentSnapshot.self, from: JSONSerialization.data(withJSONObject: wire))
        let restriction = IABPublisherRestriction(purposeId: 2, type: 1, vendorIds: [7])
        let provider = AdTechProvider(id: 89, name: "Provider", policyUrl: "https://provider.invalid/privacy")
        XCTAssertEqual(C15tPayload.headlessIABGaps(publisherRestrictions: [], adTechProviders: nil), [])
        let gaps = C15tPayload.headlessIABGaps(publisherRestrictions: [restriction], adTechProviders: [provider])
        XCTAssertEqual(gaps, ["publisher-restrictions", "additional-consent-providers"])

        var choices = IABChoices()
        choices.vendorConsents = [7]
        let slot = (jsonObject(C15tPayload.snapshot(snapshot, iabAcceptAll: choices, iabHeadlessGaps: gaps))["iab"]
            as? [String: Any]) ?? [:]
        XCTAssertEqual(slot["editable"] as? Bool, false, "a draft that could open still is not offered to a custom screen")
        XCTAssertTrue(slot["acceptAll"] is NSNull)
        XCTAssertEqual(slot["headlessUnsupported"] as? [String], gaps)
    }

    func testCommitIntentFailsClosedOnAnythingElse() {
        // A commit is audit evidence, so a half-readable one is refused outright.
        for raw in [
            "", "not json", "[]", "null",
            #"{"action":"accept-everything"}"#,
            #"{"action":"explicit"}"#,
            #"{"action":"explicit","consents":{"telepathy":true}}"#,
            #"{"action":"explicit","consents":{"necessary":true}}"#,
            #"{"action":"explicit","consents":{"marketing":"yes"}}"#,
        ] {
            XCTAssertNil(C15tPayload.parseCommitIntent(raw), "\(raw) must not become a commit")
        }
    }

    func testTheGpcSignalCrossesAsTheDetectedOverrideActiveTriple() {
        // A caller that sees marketing denied has to be able to say why. `active` is
        // what the evaluator honored, and `override` says whether the app or the device
        // caused it, so the payload answers the question on its own.
        let snapshot = ConsentSnapshot(
            overrides: ConsentOverrides(country: nil, region: nil, language: "de", gpc: true),
            privacySignals: PrivacySignals(detected: false, override: true)
        )

        let gpc = gpcSignal(in: jsonObject(C15tPayload.snapshot(snapshot)))

        XCTAssertEqual(gpc["detected"] as? Bool, false, "the device reported nothing")
        XCTAssertEqual(gpc["override"] as? Bool, true, "the app overrode the signal")
        XCTAssertEqual(gpc["active"] as? Bool, true, "the override is what was honored")

        let signals = jsonObject(C15tPayload.snapshot(snapshot))["privacySignals"] as? [String: Any]
        XCTAssertNil(signals?["msa"], "msa is not a v3 signal")
    }

    func testAnUnOverriddenSignalReportsANullOverrideRatherThanAFalseOne() {
        let payload = jsonObject(C15tPayload.snapshot(.coldStart))

        XCTAssertEqual(gpcSignal(in: payload)["detected"] as? Bool, false)
        XCTAssertEqual(gpcSignal(in: payload)["active"] as? Bool, false)
        assertJSONNull(gpcSignal(in: payload), "override")
    }

    func testOverridesTreatOmittedAsKeptAndNullAsCleared() {
        let current = ConsentOverrides(country: "DE", region: "BE", language: "de", gpc: true)

        // Omitted keys keep their value.
        XCTAssertEqual(
            tryApply(#"{"language":"en"}"#, current: current),
            ConsentOverrides(country: "DE", region: "BE", language: "en", gpc: true)
        )
        // An explicit null clears, except language, which has no empty state.
        XCTAssertEqual(
            tryApply(#"{"country":null,"region":null,"language":null,"gpc":null}"#, current: current),
            ConsentOverrides(country: nil, region: nil, language: "de", gpc: nil)
        )
        XCTAssertEqual(
            tryApply(#"{"region":"US-HI","gpc":false}"#, current: current),
            ConsentOverrides(country: "DE", region: "US-HI", language: "de", gpc: false)
        )
        // An unrelated document is refused rather than applied, so a bad call cannot
        // wipe the language the app is relying on.
        assertBridgeFailure(
            C15tPayload.parseOverrides(#"{"policyId":"p-1"}"#, current: current),
            C15tBridgeError.unreadableOverrides
        )
        assertBridgeFailure(
            C15tPayload.parseOverrides("garbage", current: current),
            C15tBridgeError.unreadableOverrides
        )
    }

    func testAGpcThatIsNeitherABooleanNorNullIsRefused() {
        // The override decides whether the GPC restriction applies, so a value this
        // build cannot read must not become either answer.
        let result = C15tPayload.parseOverrides(
            #"{"gpc":"yes"}"#,
            current: ConsentOverrides(country: nil, region: nil, language: "de", gpc: nil)
        )

        assertBridgeFailure(result, C15tBridgeError.unreadableGpcOverride)
    }

    func testARetiredOverrideArrivingOverTheBridgeIsRefusedByName() {
        // `test` was never a GPC override, and there is no msa signal in v3. Reading
        // past either would leave the app believing a mode was on that nothing turned
        // on, which is the silence this refusal exists to break.
        let current = ConsentOverrides(country: nil, region: nil, language: "de", gpc: nil)

        for raw in [
            #"{"test":true}"#,
            #"{"test":"gpc","language":"de"}"#,
            #"{"msa":false}"#,
        ] {
            guard case let .failure(error) = C15tPayload.parseOverrides(raw, current: current) else {
                XCTFail("\(raw) must be refused outright")
                continue
            }
            XCTAssertEqual(error.code, "C15T_OVERRIDES_RETIRED", raw)
            XCTAssertTrue(
                error.message.contains("test") || error.message.contains("msa"),
                "the message must name the retired field so the host knows what to delete: \(error.message)"
            )
            XCTAssertTrue(error.message.contains("gpc"), "and the field that replaces it: \(error.message)")
        }
    }

    /// The `gpc` member of a payload's `privacySignals`, so an assertion names a field.
    private func gpcSignal(in payload: [String: Any]) -> [String: Any] {
        guard let gpc = (payload["privacySignals"] as? [String: Any])?["gpc"] as? [String: Any] else {
            XCTFail("privacySignals.gpc missing from \(payload)")
            return [:]
        }
        return gpc
    }

    /// Apply a `setOverrides` document or fail the test, so the happy-path assertions
    /// read as documents rather than as `Result` case unwrapping.
    private func tryApply(
        _ raw: String,
        current: ConsentOverrides
    ) -> ConsentOverrides {
        switch C15tPayload.parseOverrides(raw, current: current) {
        case let .success(overrides): return overrides
        case let .failure(error):
            XCTFail("\(raw) should apply, got \(error.code): \(error.message)")
            return current
        }
    }

    func testACommitBuiltOnAnOlderRevisionIsRefusedAndChangesNothing() throws {
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: InMemoryStore()))
        let current = core.snapshot().revision
        let before = try JSONEncoder().encode(core.snapshot())

        XCTAssertEqual(
            jsonObject(C15tPayload.bootstrap(snapshot: core.snapshot(), hasStoredSnapshot: false))["commitRevision"] as? Bool,
            true, "the binary says it checks a commit's revision")
        let stale = jsonObject(C15tPayload.commit(
            #"{"action":"explicit","consents":{"marketing":true},"revision":\#(current - 1)}"#, core: core))
        XCTAssertEqual(stale["ok"] as? Bool, false)
        XCTAssertEqual(stale["reason"] as? String, "concurrent-change")
        XCTAssertEqual(try JSONEncoder().encode(core.snapshot()), before, "a refused draft must not touch the record")

        for raw in [
            #"{"action":"explicit","consents":{"marketing":true},"revision":"\#(current)"}"#,
            #"{"action":"explicit","consents":{"marketing":true},"revision":null}"#,
            #"{"action":"explicit","consents":{"marketing":true},"revision":1.5}"#,
        ] {
            XCTAssertEqual(jsonObject(C15tPayload.commit(raw, core: core))["reason"] as? String, "invalid-intent",
                "a revision that is not a whole number is not ignored: \(raw)")
        }
        XCTAssertEqual(try JSONEncoder().encode(core.snapshot()), before)

        let pinned = jsonObject(C15tPayload.commit(
            #"{"action":"explicit","consents":{"marketing":true},"revision":\#(current)}"#, core: core))
        XCTAssertNotEqual(pinned["reason"] as? String, "concurrent-change", "the current revision passes the check")
    }

    func testCommitResultDistinguishesRejectedFromCommitted() {
        let snapshot = ConsentSnapshot(subject: SubjectSnapshot(id: "sub-1", externalId: nil))
        let committed = CommitResult(
            status: .committed,
            revision: 7,
            permissions: .necessaryOnly,
            consentAction: .all,
            confirmed: [.marketing: true]
        )

        let accepted = jsonObject(C15tPayload.commitResult(committed, snapshot: snapshot))
        XCTAssertEqual(accepted["ok"] as? Bool, true)
        XCTAssertEqual(accepted["revision"] as? Int, 7)
        XCTAssertEqual(accepted["confirmed"] as? [String], ["marketing"])
        XCTAssertEqual(accepted["subjectId"] as? String, "sub-1")
        XCTAssertEqual(accepted["queued"] as? Bool, true, "the payload is durable before the call returns")

        let rejected = CommitResult(
            status: .rejected,
            revision: 7,
            permissions: .necessaryOnly,
            consentAction: .all,
            error: CoreErrorInfo(code: "policy-pending", message: "no policy yet")
        )
        let refused = jsonObject(C15tPayload.commitResult(rejected, snapshot: snapshot))
        XCTAssertEqual(refused["ok"] as? Bool, false)
        XCTAssertEqual(refused["reason"] as? String, "policy-pending")
        XCTAssertEqual(refused["queued"] as? Bool, false)
        // A refused commit changed nothing, so it reports no revision rather than the
        // unchanged one, which JavaScript would read as a new state to pull.
        assertJSONNull(refused, "revision")
    }

    func testEventPayloadsAreSmallOnPurpose() {
        // A snapshot event is a hint to go and read, never a copy of the snapshot.
        let snapshotEvent = jsonObject(C15tPayload.snapshotEvent(revision: 12))
        XCTAssertEqual(snapshotEvent["revision"] as? Int, 12)
        XCTAssertEqual(snapshotEvent["dirty"] as? Bool, true)
        XCTAssertEqual(snapshotEvent.count, 2)

        let initialized = jsonObject(C15tPayload.initializedEvent(revision: 12))
        XCTAssertEqual(initialized["ready"] as? Bool, true)
        XCTAssertEqual(initialized["policyPending"] as? Bool, false)

        let error = jsonObject(C15tPayload.errorEvent(code: "unsupported-contract", message: "nope"))
        XCTAssertEqual(error["code"] as? String, "unsupported-contract")
        XCTAssertEqual(error["message"] as? String, "nope")
    }

    func testInvalidIntentEchoesOnlyATruncatedSample() {
        let payload = jsonObject(C15tPayload.invalidIntent(raw: String(repeating: "x", count: 900)))

        XCTAssertEqual(payload["reason"] as? String, "invalid-intent")
        XCTAssertEqual((payload["detail"] as? String)?.count, 200, "echo a sample, not the whole payload")
    }
}
