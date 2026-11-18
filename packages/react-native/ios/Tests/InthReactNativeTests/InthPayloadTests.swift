@_spi(InthInternal) @testable import InthReactNativeBridge
@_spi(InthInternal) import InthCore
import XCTest

/// The wire boundary is the part of the iOS bridge most likely to drift from the
/// TypeScript protocol, and it is the part that must not. These assert on field
/// names, null vs absent, and fail-closed reads rather than on internals.
final class InthPayloadTests: XCTestCase {
    func testBootstrapPayloadCarriesHandshakeFields() {
        let snapshot = ConsentSnapshot(subject: SubjectSnapshot(id: "sub-1", externalId: nil))
        let payload = jsonObject(InthPayload.bootstrap(snapshot: snapshot, hasStoredSnapshot: true))

        XCTAssertEqual(payload["protocolVersion"] as? Int, 1)
        XCTAssertEqual(payload["minSupportedProtocolVersion"] as? Int, 1)
        XCTAssertEqual(payload["maxSupportedProtocolVersion"] as? Int, 1)
        XCTAssertEqual(payload["subjectId"] as? String, "sub-1")
        XCTAssertEqual(payload["hasStoredSnapshot"] as? Bool, true)
        XCTAssertEqual(payload["nativeUI"] as? Bool, true, "a default build links the stock screens")
        XCTAssertNotNil(payload["nativeSdkVersion"] as? String, "the handshake must name the SDK version")
    }

    func testBootstrapPayloadReportsNullSubjectBeforeFirstWrite() {
        let payload = jsonObject(InthPayload.bootstrap(snapshot: ConsentSnapshot(), hasStoredSnapshot: false))

        assertJSONNull(payload, "subjectId")
    }

    func testColdStartSnapshotServesDenyAllWithBothFlagsUnset() {
        let payload = jsonObject(InthPayload.snapshot(.coldStart))

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

    func testSnapshotCarriesTheTCFMarketingAnswerForTheTrackingSequence() {
        assertJSONNull(jsonObject(InthPayload.snapshot(.coldStart)), "iabMarketingPurposes")
        XCTAssertEqual(jsonObject(InthPayload.snapshot(.coldStart, iabMarketingPurposes: true))["iabMarketingPurposes"] as? Bool, true)
        XCTAssertEqual(jsonObject(InthPayload.snapshot(.coldStart, iabMarketingPurposes: false))["iabMarketingPurposes"] as? Bool, false)
    }

    func testTrackingAuthorizationCarriesWhenTheLastAnswerWasSeen() {
        let payload = jsonObject(InthPayload.trackingAuthorization(.authorized, answeredAt: Date(timeIntervalSince1970: 1_800_000_000.5)))
        XCTAssertEqual(payload["status"] as? String, "authorized")
        XCTAssertEqual((payload["answeredAt"] as? NSNumber)?.int64Value, 1_800_000_000_500)
        XCTAssertNil(jsonObject(InthPayload.trackingAuthorization(.notDetermined))["answeredAt"])
    }

    func testSnapshotSendsEveryReservedKeyAsExplicitNull() {
        // The protocol declares these `T | null`, not optional. Omitting them would
        // hand JavaScript `undefined` where its types promise `null`.
        let payload = jsonObject(InthPayload.snapshot(.coldStart))

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

        let payload = jsonObject(InthPayload.snapshot(blank, fallbackLanguage: "fr"))
        let overrides = payload["overrides"] as? [String: Any]

        XCTAssertEqual(overrides?["language"] as? String, "fr")
    }

    func testSnapshotKeepsAResolvedLanguageAsIs() {
        let snapshot = ConsentSnapshot(overrides: ConsentOverrides(country: nil, region: nil, language: "de", gpc: nil))

        let payload = jsonObject(InthPayload.snapshot(snapshot, fallbackLanguage: "fr"))

        XCTAssertEqual((payload["overrides"] as? [String: Any])?["language"] as? String, "de")
    }

    func testCommitIntentReadsTheThreeActions() {
        XCTAssertEqual(InthPayload.parseCommitIntent(#"{"action":"all"}"#), .all)
        XCTAssertEqual(InthPayload.parseCommitIntent(#"{"action":"necessary"}"#), .necessary)
        XCTAssertEqual(
            InthPayload.parseCommitIntent(#"{"action":"explicit","consents":{"marketing":true,"measurement":false}}"#),
            .custom([.marketing: true, .measurement: false])
        )
    }

    func testAnIABIntentReadsACompleteDraftWithItsCategoriesAndRevision() {
        let raw = #"{"action":"iab","choices":{"purposeConsents":[1,2],"purposeLegitimateInterests":[],"purposeObjections":[],"vendorConsents":[755],"vendorLegitimateInterests":[],"vendorObjections":[],"specialFeatureOptIns":[],"publisherConsents":[],"publisherLegitimateInterests":[],"publisherCustomConsents":[],"publisherCustomLegitimateInterests":[]},"consents":{"marketing":true},"revision":12}"#
        var choices = IABChoices()
        choices.purposeConsents = [1, 2]
        choices.vendorConsents = [755]
        XCTAssertEqual(InthPayload.parseCommitIntent(raw), .iab(choices, categories: [.marketing: true]))
        for bad in [
            #"{"action":"iab","consents":{}}"#,
            raw.replacingOccurrences(of: "[1,2]", with: #"["1",2]"#),
            raw.replacingOccurrences(of: #""purposeObjections":[],"#, with: ""),
            raw.replacingOccurrences(of: #""consents":{"marketing":true}"#, with: #""consents":{"necessary":true}"#),
        ] {
            XCTAssertNil(InthPayload.parseCommitIntent(bad), "\(bad) must not become a commit")
        }
    }

    func testACommittedIABDecisionCrossesInsideTheIABSlot() throws {
        // The memberwise initializer is internal to InthCore; the Codable form is public.
        let choices = String(decoding: try JSONEncoder().encode(IABChoices()), as: UTF8.self)
        let configuration = String(decoding: try JSONEncoder().encode(
            IABConfiguration(cmpId: 9, cmpVersion: 1, publisherCountryCode: "DE")), as: UTF8.self)
        let consent = try JSONDecoder().decode(IABCommittedConsent.self, from: Data("""
            {"configuration":\(configuration),"choices":\(choices),"subjectId":"sub","fingerprint":"fp",
            "vendorListVersion":177,"policyVersion":5,"consentVersion":1,"createdAt":1,"actionAt":1,"tcString":"CQ-test"}
            """.utf8))
        let committed = InthPayload.committedIAB(consent).objectValue
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
            (jsonObject(InthPayload.snapshot(snapshot, iabAcceptAll: acceptAll))["iab"] as? [String: Any]) ?? [:]
        }
        XCTAssertEqual(slot(nil)["editable"] as? Bool, false)
        XCTAssertTrue(slot(nil)["acceptAll"] is NSNull)
        XCTAssertTrue(slot(nil)["disclosure"] is NSNull)
        XCTAssertEqual(slot(nil)["headlessUnsupported"] as? [String], [])
        // With the disclosure, `InthHeadlessIABTests` covers the editable slot on a real core.
        var choices = IABChoices()
        choices.vendorConsents = [7]
        XCTAssertEqual(slot(choices)["editable"] as? Bool, false, "no draft is offered without the disclosure")
    }

    func testCustomVendorsCrossInsideTheIABSlotAndTheirChoicesAsStrings() throws {
        var wire = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(ConsentSnapshot.coldStart)) as? [String: Any])
        wire["iab"] = ["gvl": NSNull()]
        let snapshot = try JSONDecoder().decode(ConsentSnapshot.self, from: JSONSerialization.data(withJSONObject: wire))
        let vendor = IABCustomVendor(id: "internal-ads", name: "Internal ads",
            privacyPolicyUrl: "https://example.test/ads", purposes: [1, 3])
        let slot = try XCTUnwrap(jsonObject(InthPayload.snapshot(snapshot, iabCustomVendors: [vendor]))["iab"] as? [String: Any])
        let listed = try XCTUnwrap(slot["customVendors"] as? [[String: Any]])
        XCTAssertEqual(listed.first?["id"] as? String, "internal-ads")
        XCTAssertEqual(listed.first?["purposes"] as? [Int], [1, 3])
        XCTAssertNil(listed.first?["description"], "absent optionals stay out, as Kotlin writes them")
        XCTAssertEqual(((jsonObject(InthPayload.snapshot(snapshot))["iab"] as? [String: Any])?["customVendors"] as? [Any])?.count, 0)
        // The same state crosses as the same bytes, every time.
        var accepted = IABChoices()
        accepted.customVendorConsents = ["chat", "internal-ads"]
        accepted.customVendorLegitimateInterests = ["internal-ads"]
        let first = InthPayload.snapshot(snapshot, iabAcceptAll: accepted, iabCustomVendors: [vendor, vendor])
        for _ in 0..<20 {
            XCTAssertEqual(InthPayload.snapshot(snapshot, iabAcceptAll: accepted, iabCustomVendors: [vendor, vendor]), first)
        }

        let lists = #""purposeConsents":[],"purposeLegitimateInterests":[],"purposeObjections":[],"vendorConsents":[],"vendorLegitimateInterests":[],"vendorObjections":[],"specialFeatureOptIns":[],"publisherConsents":[],"publisherLegitimateInterests":[],"publisherCustomConsents":[],"publisherCustomLegitimateInterests":[]"#
        let raw = #"{"action":"iab","choices":{"# + lists + #","customVendorConsents":["internal-ads"],"customVendorLegitimateInterests":[]},"consents":{}}"#
        var choices = IABChoices()
        choices.customVendorConsents = ["internal-ads"]
        XCTAssertEqual(InthPayload.parseCommitIntent(raw), .iab(choices, categories: [:]))
        XCTAssertNil(InthPayload.parseCommitIntent(raw.replacingOccurrences(of: #"["internal-ads"]"#, with: "[1]")),
            "custom vendor ids are strings")
    }

    func testTheSnapshotAndItsAdditionsAreReadAsOneRevision() throws {
        func snapshot(revision: Int) throws -> ConsentSnapshot {
            var wire = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(ConsentSnapshot.coldStart)) as? [String: Any])
            wire["revision"] = revision
            return try JSONDecoder().decode(ConsentSnapshot.self, from: JSONSerialization.data(withJSONObject: wire))
        }
        // A commit lands between the first snapshot read and the additions.
        var revisions = [try snapshot(revision: 4), try snapshot(revision: 5), try snapshot(revision: 5)]
        var reads = 0
        let (read, additions) = InthPayload.consistently(snapshot: { revisions.removeFirst() }) { () -> String in
            reads += 1
            return "decision \(reads)"
        }
        XCTAssertEqual(read.revision, 5)
        XCTAssertEqual(additions, "decision 2", "the additions are the ones read with revision 5")

        let steadySnapshot = try snapshot(revision: 7)
        var steady = 0
        let (_, once) = InthPayload.consistently(snapshot: { steadySnapshot }) { () -> Int in
            steady += 1
            return steady
        }
        XCTAssertEqual(once, 1, "a quiet core is read once")
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
            XCTAssertNil(InthPayload.parseCommitIntent(raw), "\(raw) must not become a commit")
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

        let gpc = gpcSignal(in: jsonObject(InthPayload.snapshot(snapshot)))

        XCTAssertEqual(gpc["detected"] as? Bool, false, "the device reported nothing")
        XCTAssertEqual(gpc["override"] as? Bool, true, "the app overrode the signal")
        XCTAssertEqual(gpc["active"] as? Bool, true, "the override is what was honored")

        let signals = jsonObject(InthPayload.snapshot(snapshot))["privacySignals"] as? [String: Any]
        XCTAssertNil(signals?["msa"], "msa is not a v3 signal")
    }

    func testAnUnOverriddenSignalReportsANullOverrideRatherThanAFalseOne() {
        let payload = jsonObject(InthPayload.snapshot(.coldStart))

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
            InthPayload.parseOverrides(#"{"policyId":"p-1"}"#, current: current),
            InthBridgeError.unreadableOverrides
        )
        assertBridgeFailure(
            InthPayload.parseOverrides("garbage", current: current),
            InthBridgeError.unreadableOverrides
        )
    }

    func testAGpcThatIsNeitherABooleanNorNullIsRefused() {
        // The override decides whether the GPC restriction applies, so a value this
        // build cannot read must not become either answer.
        let result = InthPayload.parseOverrides(
            #"{"gpc":"yes"}"#,
            current: ConsentOverrides(country: nil, region: nil, language: "de", gpc: nil)
        )

        assertBridgeFailure(result, InthBridgeError.unreadableGpcOverride)
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
            guard case let .failure(error) = InthPayload.parseOverrides(raw, current: current) else {
                XCTFail("\(raw) must be refused outright")
                continue
            }
            XCTAssertEqual(error.code, "INTH_OVERRIDES_RETIRED", raw)
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
        switch InthPayload.parseOverrides(raw, current: current) {
        case let .success(overrides): return overrides
        case let .failure(error):
            XCTFail("\(raw) should apply, got \(error.code): \(error.message)")
            return current
        }
    }

    func testACommitBuiltOnAnOlderRevisionIsRefusedAndChangesNothing() throws {
        let store = InMemoryStore()
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: store))
        let current = core.snapshot().revision
        // Sorted keys, as the store writes: a plain `JSONEncoder` builds each object from a fresh
        // dictionary, so its key order can differ between two encodes of one unchanged value.
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let before = try encoder.encode(core.snapshot())
        let stored = store.data(for: StorageKey.snapshot)

        XCTAssertEqual(
            jsonObject(InthPayload.bootstrap(snapshot: core.snapshot(), hasStoredSnapshot: false))["commitRevision"] as? Bool,
            true, "the binary says it checks a commit's revision")
        let stale = jsonObject(InthPayload.commit(
            #"{"action":"explicit","consents":{"marketing":true},"revision":\#(current - 1)}"#, core: core))
        XCTAssertEqual(stale["ok"] as? Bool, false)
        XCTAssertEqual(stale["reason"] as? String, "concurrent-change")
        XCTAssertEqual(try encoder.encode(core.snapshot()), before, "a refused draft must not touch the record")
        XCTAssertEqual(store.data(for: StorageKey.snapshot), stored, "a refused draft writes nothing")

        for raw in [
            #"{"action":"explicit","consents":{"marketing":true},"revision":"\#(current)"}"#,
            #"{"action":"explicit","consents":{"marketing":true},"revision":null}"#,
            #"{"action":"explicit","consents":{"marketing":true},"revision":1.5}"#,
        ] {
            XCTAssertEqual(jsonObject(InthPayload.commit(raw, core: core))["reason"] as? String, "invalid-intent",
                "a revision that is not a whole number is not ignored: \(raw)")
        }
        XCTAssertEqual(try encoder.encode(core.snapshot()), before)
        XCTAssertEqual(store.data(for: StorageKey.snapshot), stored)

        let pinned = jsonObject(InthPayload.commit(
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

        let accepted = jsonObject(InthPayload.commitResult(committed, snapshot: snapshot))
        XCTAssertEqual(accepted["ok"] as? Bool, true)
        XCTAssertEqual(accepted["revision"] as? Int, 7)
        XCTAssertEqual(accepted["confirmed"] as? [String], ["marketing"])
        XCTAssertEqual(accepted["subjectId"] as? String, "sub-1")
        XCTAssertEqual(accepted["queued"] as? Bool, true, "the payload is durable before the call returns")

        // dryRun stores the decision and drops the record: success, and nothing queued.
        let dropped = CommitResult(
            status: .committed, revision: 7, permissions: .necessaryOnly, consentAction: .all, queued: false)
        let dryRun = jsonObject(InthPayload.commitResult(dropped, snapshot: snapshot))
        XCTAssertEqual(dryRun["ok"] as? Bool, true)
        XCTAssertEqual(dryRun["queued"] as? Bool, false)

        let rejected = CommitResult(
            status: .rejected,
            revision: 7,
            permissions: .necessaryOnly,
            consentAction: .all,
            error: CoreErrorInfo(code: "policy-pending", message: "no policy yet")
        )
        let refused = jsonObject(InthPayload.commitResult(rejected, snapshot: snapshot))
        XCTAssertEqual(refused["ok"] as? Bool, false)
        XCTAssertEqual(refused["reason"] as? String, "policy-pending")
        XCTAssertEqual(refused["queued"] as? Bool, false)
        // A refused commit changed nothing, so it reports no revision rather than the
        // unchanged one, which JavaScript would read as a new state to pull.
        assertJSONNull(refused, "revision")
    }

    func testEventPayloadsAreSmallOnPurpose() {
        // A snapshot event is a hint to go and read, never a copy of the snapshot.
        let snapshotEvent = jsonObject(InthPayload.snapshotEvent(revision: 12))
        XCTAssertEqual(snapshotEvent["revision"] as? Int, 12)
        XCTAssertEqual(snapshotEvent["dirty"] as? Bool, true)
        XCTAssertEqual(snapshotEvent.count, 2)

        let initialized = jsonObject(InthPayload.initializedEvent(revision: 12))
        XCTAssertEqual(initialized["ready"] as? Bool, true)
        XCTAssertEqual(initialized["policyPending"] as? Bool, false)

        let error = jsonObject(InthPayload.errorEvent(code: "unsupported-contract", message: "nope"))
        XCTAssertEqual(error["code"] as? String, "unsupported-contract")
        XCTAssertEqual(error["message"] as? String, "nope")
    }

    func testConsentHostSessionsEncodeAsThePresenterSessionReadsThem() {
        XCTAssertEqual(
            InthPayload.consentHostSession(.presented(sessionID: "one", presentation: .prompt)),
            #"{"presentation":"prompt","sessionId":"one","status":"presented"}"#
        )
        XCTAssertEqual(
            InthPayload.consentHostSession(.alreadyPresented(sessionID: "one", presentation: .preferences)),
            #"{"presentation":"preferences","sessionId":"one","status":"already-presented"}"#
        )
        XCTAssertEqual(
            InthPayload.consentHostSession(.notRequired),
            #"{"sessionId":null,"status":"not-required"}"#
        )
    }

    func testConsentHostOutcomesEncodeEveryKind() {
        let outcomes: [(String, ConsentHostOutcome)] = [
            ("committed", .committed(sessionID: "one", revision: 4)),
            ("acknowledged", .acknowledged(sessionID: "one", revision: 4)),
            ("dismissed", .dismissed(sessionID: "one", revision: 4)),
            ("unavailable", .unavailable(sessionID: "one", revision: 4)),
        ]
        for (kind, outcome) in outcomes {
            let payload = jsonObject(InthPayload.consentHostOutcome(outcome))
            XCTAssertEqual(payload["sessionId"] as? String, "one")
            XCTAssertEqual(payload["kind"] as? String, kind)
            XCTAssertEqual(payload["revision"] as? Int, 4)
            XCTAssertEqual(payload.count, 3)
        }
    }

    func testInvalidIntentEchoesOnlyATruncatedSample() {
        let payload = jsonObject(InthPayload.invalidIntent(raw: String(repeating: "x", count: 900)))

        XCTAssertEqual(payload["reason"] as? String, "invalid-intent")
        XCTAssertEqual((payload["detail"] as? String)?.count, 200, "echo a sample, not the whole payload")
    }
}
