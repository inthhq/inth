import Foundation
import XCTest

@_spi(C15tInternal) @testable import C15tCore

final class ConsentPolicyTests: XCTestCase {
    private var fixture: JSONValue {
        get throws {
            let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
                .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("protocol/local-policy/parity.json")
            return try XCTUnwrap(C15tJSON.parse(Data(contentsOf: url)))
        }
    }

    private func policy() throws -> ConsentPolicy {
        let rules = try XCTUnwrap(fixture["rules"])
        return try ConsentPolicy(json: XCTUnwrap(C15tJSON.encode(.object(["rules": rules]))))
    }

    private func boot(
        _ policy: ConsentPolicy, store: InMemoryStore = InMemoryStore(),
        overrides: ConsentOverrides = .default()
    ) async -> ConsentCore {
        let core = ConsentCore()
        await core.bootstrapAndSettle(CoreConfig(
            store: store, policy: policy, transport: UnreachableTransport(),
            consentCategories: ConsentCategory.allCases, overrides: overrides, initRetry: .disabled))
        return core
    }

    func testRulesNormalizeExactlyAsTheBackendNormalizerDoes() throws {
        let resolved = try XCTUnwrap(fixture["resolved"]?.objectValue)
        let policy = try policy()
        XCTAssertEqual(Set(resolved.keys), Set(policy.rules.map(\.id)))
        for rule in policy.rules {
            XCTAssertEqual(ConsentPolicy.normalize(rule), resolved[rule.id], rule.id)
        }
    }

    func testFingerprintsHashExactlyTheInputsTheBackendHashes() throws {
        let inputs = try XCTUnwrap(fixture["fingerprintInputs"]?.objectValue)
        for rule in try policy().rules {
            let actual = ConsentPolicy.fingerprintInputs(rule)
            for domain in ["choice", "notice", "policy"] {
                XCTAssertEqual(actual[domain], inputs[rule.id]?[domain], "\(rule.id) \(domain)")
            }
        }
    }

    func testEveryPolicyTheBackendOrNoBackendModeRefusesIsRefused() throws {
        var accepted: [String] = []
        for row in try XCTUnwrap(fixture["invalid"]?.arrayValue) {
            let data = try XCTUnwrap(C15tJSON.encode(.object(["rules": row["rules"] ?? .null])))
            if (try? ConsentPolicy(json: data)) != nil { accepted.append(row["name"]?.stringValue ?? "?") }
        }
        XCTAssertEqual(accepted, [], "accepted policies the backend refuses")
    }

    func testEveryPolicyTheBackendAcceptsIsAcceptedAndNormalizedTheSameWay() throws {
        var problems: [String] = []
        for row in try XCTUnwrap(fixture["accepted"]?.arrayValue) {
            let name = row["name"]?.stringValue ?? "?"
            let data = try XCTUnwrap(C15tJSON.encode(.object(["rules": row["rules"] ?? .null])))
            do {
                let policy = try ConsentPolicy(json: data)
                if ConsentPolicy.normalize(policy.rules[1]) != row["resolved"] {
                    problems.append("\(name): normalized differently")
                }
            } catch {
                problems.append("\(name): \(error)")
            }
        }
        XCTAssertEqual(problems, [])
    }

    func testChangingOneValidityKeepsTheOtherPromptsReceipt() async throws {
        let store = InMemoryStore()
        let policy = try policy()
        let first = await boot(policy, store: store)
        XCTAssertEqual(first.save(.all).status, .committed)
        await first.waitUntilIdle()
        func revised(_ validity: PolicyValidity) throws -> ConsentPolicy {
            try ConsentPolicy(rules: policy.rules.map { rule in
                var rule = rule
                if rule.id == "everywhere_else" { rule.validity = validity }
                return rule
            })
        }
        let noticeOnly = await boot(try revised(PolicyValidity(noticeDays: 30)), store: store)
        XCTAssertTrue(noticeOnly.isAllowed(.measurement))
        XCTAssertEqual(noticeOnly.snapshot().promptRequirement.kind, PromptRequirement.Kind.none)
        let choiceChanged = await boot(try revised(PolicyValidity(choiceDays: 30, noticeDays: 30)), store: store)
        XCTAssertFalse(choiceChanged.isAllowed(.measurement))
    }

    func testARefusedInCodePolicyIsReportedNotStartedAsAQuietDenyAll() async throws {
        let core = ConsentCore()
        let stream = core.eventStream
        core.bootstrap(CoreConfig(
            policyError: "Policy 'x': a partial category scope needs a scopeMode",
            transport: UnreachableTransport(), initRetry: .disabled))
        var reported: String?
        for await event in stream {
            if case let .error(info) = event { reported = info.code }
            if case .initialized = event { break }
        }
        XCTAssertEqual(reported, "policy-invalid")
        XCTAssertEqual(core.snapshot().error?.code, "policy-invalid")
        XCTAssertTrue(core.snapshot().policyPending)
        XCTAssertFalse(core.isAllowed(.measurement))
    }

    func testARefusedPolicyOverACachedOneFailsClosedAndKeepsTheStoredChoice() async throws {
        let store = InMemoryStore()
        let policy = try policy()
        let first = await boot(policy, store: store)
        XCTAssertEqual(first.save(.all).status, .committed)
        await first.waitUntilIdle()
        XCTAssertTrue(first.isAllowed(.measurement))
        let refused = ConsentCore()
        await refused.bootstrapAndSettle(CoreConfig(
            store: store, policyError: "Policy 'x': a partial category scope needs a scopeMode",
            transport: UnreachableTransport(), consentCategories: ConsentCategory.allCases,
            initRetry: .disabled))
        XCTAssertTrue(refused.snapshot().policyPending)
        XCTAssertEqual(refused.snapshot().error?.code, "policy-invalid")
        for category in OptionalConsentCategory.ordered {
            XCTAssertFalse(refused.isAllowed(category.category))
        }
        let repaired = await boot(policy, store: store)
        XCTAssertTrue(repaired.isAllowed(.measurement))
    }

    func testARefusedInCodePolicyIsReportedAgainAfterReset() async throws {
        let core = ConsentCore()
        await core.bootstrapAndSettle(CoreConfig(
            policyError: "Policy 'x': a partial category scope needs a scopeMode",
            transport: UnreachableTransport(), initRetry: .disabled))
        XCTAssertEqual(core.snapshot().error?.code, "policy-invalid")
        core.reset()
        await core.waitUntilIdle()
        XCTAssertTrue(core.snapshot().policyPending)
        XCTAssertEqual(core.snapshot().error?.code, "policy-invalid")
        XCTAssertFalse(core.isAllowed(.measurement))
    }

    func testBootstrapAppliesTheInCodePolicyOnce() async throws {
        let core = ConsentCore()
        core.bootstrap(CoreConfig(
            policy: try policy(), transport: UnreachableTransport(),
            consentCategories: ConsentCategory.allCases, initRetry: .disabled))
        let revision = core.snapshot().revision
        await core.waitUntilIdle()
        XCTAssertEqual(core.snapshot().revision, revision)
    }

    func testEveryLocationGetsTheOutcomeTheBackendMatcherGivesUnmatchedOnesIncluded() throws {
        var problems: [String] = []
        for row in try XCTUnwrap(fixture["outcomes"]?.arrayValue) {
            let data = try XCTUnwrap(C15tJSON.encode(.object(["rules": row["rules"] ?? .null])))
            let policy = try ConsentPolicy(json: data)
            let country = row["inputs"]?["country"]?.stringValue
            let region = row["inputs"]?["region"]?.stringValue
            let actual: JSONValue
            switch policy.outcome(country: country, region: region) {
            case let .matched(index, matchedBy):
                actual = .object([
                    "matchedBy": .string(matchedBy), "policyId": .string(policy.rules[index].id),
                    "status": .string("matched"),
                ])
            case let outcome:
                actual = .object([
                    "status": .string(outcome == .noMatch ? "no-match" : "failed"),
                    "wire": BundledPolicyResource.unmatchedWire(outcome),
                ])
            }
            if actual != row["expected"] {
                problems.append("\(row["pack"]?.stringValue ?? "?") \(country ?? "-") \(region ?? "-")")
            }
        }
        XCTAssertEqual(problems, [])
    }

    private func outcomePolicy(_ pack: String) throws -> ConsentPolicy {
        let row = try XCTUnwrap(fixture["outcomes"]?.arrayValue?.first { $0["pack"]?.stringValue == pack })
        return try ConsentPolicy(json: XCTUnwrap(C15tJSON.encode(.object(["rules": row["rules"] ?? .null]))))
    }

    func testAnUnmatchedKnownCountryRunsTheSafeFallbackAndDropsEarlierGrants() async throws {
        let policy = try outcomePolicy("fallback without a default")
        let core = await boot(policy, overrides: ConsentOverrides(country: "DE", region: nil, language: "en"))
        XCTAssertEqual(core.snapshot().resolution.policyId, "germany")
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        XCTAssertTrue(core.isAllowed(.measurement))
        core.setOverrides(ConsentOverrides(country: "FR", region: nil, language: "en"))
        await core.waitUntilIdle()
        XCTAssertEqual(core.snapshot().resolution.status, .noMatch)
        XCTAssertFalse(core.snapshot().policyPending)
        for category in OptionalConsentCategory.ordered {
            XCTAssertFalse(core.isAllowed(category.category))
        }
        XCTAssertEqual(core.snapshot().promptRequirement.kind, .choice)
    }

    func testALocationThePolicyCannotAnswerFailsClosedAndTheSavedChoiceReturns() async throws {
        for row in try XCTUnwrap(fixture["transitions"]?.arrayValue) {
            let name = row["name"]?.stringValue ?? ""
            let policy = try ConsentPolicy(json: XCTUnwrap(C15tJSON.encode(.object(["rules": row["rules"] ?? .null]))))
            let steps = try XCTUnwrap(row["steps"]?.arrayValue)
            func location(_ step: JSONValue) -> ConsentOverrides {
                ConsentOverrides(
                    country: step["inputs"]?["country"]?.stringValue,
                    region: step["inputs"]?["region"]?.stringValue, language: "en")
            }
            let core = await boot(policy, overrides: location(steps[0]))
            for (index, step) in steps.enumerated() {
                let label = "\(name), step \(index + 1)"
                if index > 0 {
                    core.setOverrides(location(step))
                    await core.waitUntilIdle()
                }
                if step["saveAll"]?.boolValue == true {
                    XCTAssertEqual(core.save(.all).status, .committed, label)
                    await core.waitUntilIdle()
                }
                let expected = step["expected"]
                let snapshot = core.snapshot()
                XCTAssertEqual(snapshot.resolution.status.rawValue, expected?["status"]?.stringValue, label)
                XCTAssertEqual(snapshot.resolution.reason, expected?["reason"]?.stringValue, label)
                XCTAssertEqual(snapshot.resolution.policyId, expected?["policyId"]?.stringValue, label)
                XCTAssertEqual(snapshot.policyPending, expected?["policyPending"]?.boolValue, label)
                for category in OptionalConsentCategory.ordered {
                    XCTAssertEqual(core.isAllowed(category.category), expected?["optionalAllowed"]?.boolValue, "\(label): \(category)")
                }
                XCTAssertNotNil(snapshot.explicitChoice, "\(label): the saved choice stays on the device")
            }
        }
    }

    func testACountryThatNeedsARegionNeverTakesThePermissiveDefault() async throws {
        let policy = try outcomePolicy("region rules and a default without a fallback")
        let core = await boot(policy, overrides: ConsentOverrides(country: "US", region: nil, language: "en"))
        XCTAssertEqual(core.snapshot().resolution.status, .failed)
        XCTAssertEqual(core.snapshot().resolution.reason, "insufficient-inputs")
        for category in OptionalConsentCategory.ordered {
            XCTAssertFalse(core.isAllowed(category.category))
        }
    }

    func testLocationsMatchTheRuleTheBackendMatcherPicks() throws {
        let policy = try policy()
        for row in try XCTUnwrap(fixture["cases"]?.arrayValue) {
            let country = row["inputs"]?["country"]?.stringValue
            let region = row["inputs"]?["region"]?.stringValue
            let matched = policy.match(country: country, region: region)
            XCTAssertEqual(matched?.0, row["expected"]?["policyId"]?.stringValue, "\(country ?? "-") \(region ?? "-")")
            XCTAssertEqual(matched?.1, row["expected"]?["matchedBy"]?.stringValue, "\(country ?? "-") \(region ?? "-")")
        }
    }

    func testNoBackendCorePromptsFromTheInCodePolicyAtBootstrap() async throws {
        let store = InMemoryStore()
        let policy = try policy()
        let core = ConsentCore()
        core.bootstrap(CoreConfig(
            store: store, policy: policy, transport: UnreachableTransport(),
            consentCategories: ConsentCategory.allCases, initRetry: .disabled))
        XCTAssertFalse(core.snapshot().policyPending)
        XCTAssertEqual(core.snapshot().resolution.policyId, "everywhere_else")
        XCTAssertEqual(core.snapshot().promptRequirement.kind, .choice)
        for category in OptionalConsentCategory.ordered {
            XCTAssertFalse(core.isAllowed(category.category))
        }
        XCTAssertEqual(core.save(.custom([.measurement: true])).status, .committed)
        await core.waitUntilIdle()
        XCTAssertTrue(core.isAllowed(.measurement))
        XCTAssertFalse(core.isAllowed(.marketing))
        let relaunched = await boot(policy, store: store)
        XCTAssertTrue(relaunched.isAllowed(.measurement))
        XCTAssertFalse(relaunched.isAllowed(.marketing))
    }

    func testAnAppSuppliedLocationPicksTheRegionalRule() async throws {
        let core = await boot(try policy(), overrides: ConsentOverrides(country: "US", region: "CA", language: "en"))
        XCTAssertEqual(core.snapshot().resolution.policyId, "california")
        XCTAssertEqual(core.snapshot().promptRequirement.kind, .notice)
        core.setOverrides(ConsentOverrides(country: "DE", region: nil, language: "en"))
        await core.waitUntilIdle()
        XCTAssertEqual(core.snapshot().resolution.policyId, "germany")
    }

    func testChangingTheCopyRevisionAsksAgainAfterAnUpdate() async throws {
        let store = InMemoryStore()
        let policy = try policy()
        let first = await boot(policy, store: store)
        XCTAssertEqual(first.save(.all).status, .committed)
        await first.waitUntilIdle()
        let same = await boot(policy, store: store)
        XCTAssertTrue(same.isAllowed(.measurement))
        let revised = try ConsentPolicy(rules: policy.rules.map { rule in
            var rule = rule
            if rule.id == "everywhere_else" { rule.copyRevision = "2027-01" }
            return rule
        })
        let updated = await boot(revised, store: store)
        XCTAssertEqual(updated.snapshot().promptRequirement.kind, .choice)
        XCTAssertFalse(updated.isAllowed(.measurement))
    }

    func testInvalidPoliciesAreRefused() throws {
        let fallback = PolicyRule(
            id: "default", match: PolicyMatch(fallback: true, isDefault: true), model: .optIn, prompt: .choice)
        func refused(_ rules: [PolicyRule], file: StaticString = #filePath, line: UInt = #line) {
            XCTAssertThrowsError(try ConsentPolicy(rules: rules), file: file, line: line)
        }
        refused([])
        refused([fallback, fallback])
        var iab = fallback
        iab.model = .iab
        refused([iab])
        var countryOnly = fallback
        countryOnly.match = PolicyMatch(countries: ["DE"])
        refused([countryOnly])
        var notice = fallback
        notice.prompt = .notice
        refused([notice])
        var partial = fallback
        partial.categories = [.measurement]
        refused([partial])
        var outside = partial
        outside.scopeMode = .strict
        outside.preselectedCategories = [.marketing]
        refused([outside])
        var zero = fallback
        zero.validity = PolicyValidity(choiceDays: 0)
        refused([zero])
        XCTAssertThrowsError(try ConsentPolicy(json: Data(
            #"{"rules":[{"id":"x","match":{"fallback":true},"model":"opt-in","prompt":"choice","rights":["opt-out"]}]}"#.utf8)))
        XCTAssertThrowsError(try ConsentPolicy(json: Data(
            #"{"rules":[{"id":"x","match":{"fallback":true},"model":"opt-in","prompt":"choice","categories":["ads"]}]}"#.utf8)))
    }
}
