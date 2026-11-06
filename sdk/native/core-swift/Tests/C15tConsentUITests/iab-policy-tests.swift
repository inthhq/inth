import C15tCore
import Foundation
import XCTest
@testable import C15tConsentUI

/// IAB Europe's non-web CMP policy checks, proved on the content the IAB screens render.
/// Each `TCF-CHECK` names the form question the test answers; `scripts/tcf-policy-checks.test.ts`
/// fails when a check has no test.
@MainActor
final class IABPolicyTests: XCTestCase {
    private let english = IABCopy.forLanguage("en")

    // MARK: - First layer

    // TCF-CHECK: P1
    func testFirstLayerCoversTheScreenAndCannotBeSwipedAway() async throws {
        let core = try await bootIAB()
        let presenter = ConsentPresenter(core: core)
        XCTAssertNotNil(presenter.presentationID, "a first-time IAB prompt opens by itself")
        XCTAssertFalse(presenter.preferences)
        XCTAssertEqual(presenter.presentationStyle, .fullScreen)
        XCTAssertFalse(presenter.allowsInteractiveDismiss)
        // Customize stays inside the same full-screen gate.
        presenter.customize()
        XCTAssertEqual(presenter.presentationStyle, .fullScreen)
        // Back from preferences returns to the first layer, not to the app.
        presenter.requestClose()
        XCTAssertNotNil(presenter.presentationID)
        XCTAssertFalse(presenter.preferences)
        XCTAssertNil(core.snapshot().explicitChoice)
        presenter.commit(.reject)
        await settle(presenter)
        // Only standing preferences, opened later by the person, are a dismissible sheet.
        presenter.presentPreferences()
        XCTAssertEqual(presenter.presentationStyle, .sheet)
        XCTAssertTrue(presenter.allowsInteractiveDismiss)
        presenter.edit(\.purposeConsents, id: 1, enabled: true)
        XCTAssertFalse(presenter.allowsInteractiveDismiss, "a dirty draft is not swiped away")
    }

    // TCF-CHECK: P2
    func testFirstLayerIsItsOwnScreenWithThePrivacyPolicyOnlyLinked() async throws {
        let core = try await bootIAB()
        let presenter = ConsentPresenter(core: core)
        XCTAssertEqual(presenter.presentationStyle, .fullScreen)
        let content = try XCTUnwrap(presenter.iabFirstLayer)
        // The screen carries the consent disclosure only: no policy or terms text is merged in.
        for line in content.lines {
            XCTAssertFalse(line.localizedCaseInsensitiveContains("privacy policy"), line)
            XCTAssertFalse(line.localizedCaseInsensitiveContains("terms"), line)
        }
        // The theme's host copy has no slot for policy text; the policy is a URL the root modifier opens.
        XCTAssertEqual(Mirror(reflecting: ConsentTheme.Copy.c15t).children.compactMap(\.label), ["headline", "introduction"])
    }

    // TCF-CHECK: P3, P4, P5, P12
    func testDescriptionDisclosesStorageAccessProcessingAnExampleAndThePartnerCount() async throws {
        let core = try await bootIAB()
        let presentation = try XCTUnwrap(core.iabPresentation())
        let content = IABFirstLayerContent(presentation)
        // Three registered vendors and two Google ad tech providers, as the web counts them.
        XCTAssertEqual(presentation.bannerSummary.vendorCount, 5)
        XCTAssertEqual(content.partnerCount, 5)
        XCTAssertEqual(content.description, english.format(english.appDescription, ["partnerCount": "5"]))
        XCTAssertEqual(content.description,
            "We and our 5 partners store and/or access information on your device and process personal data, such as unique identifiers and browsing data, for this app, to:")
        XCTAssertTrue(content.description.contains("store and/or access information on your device"))
        XCTAssertTrue(content.description.contains("process personal data"))
        XCTAssertTrue(content.description.contains("such as unique identifiers and browsing data"))
        XCTAssertTrue(content.lines.contains(content.description))
    }

    // TCF-CHECK: P6
    func testPartnerCountIsTheLinkThatOpensThePartnerList() async throws {
        let core = try await bootIAB()
        let presenter = ConsentPresenter(core: core)
        let content = try XCTUnwrap(presenter.iabFirstLayer)
        XCTAssertEqual(content.partnersLink, "5 partners")
        XCTAssertEqual(content.descriptionLead, "We and our ")
        XCTAssertTrue(content.descriptionTail.hasPrefix(" store and/or access"))
        // A language whose description doesn't contain the link text verbatim still links the count.
        let summary = IABBannerSummary(vendorCount: 9, displayItems: [], remainingCount: 0)
        for code in IABCopy.supportedLanguages {
            let localized = IABFirstLayerContent(summary: summary, copy: IABCopy.forLanguage(code))
            XCTAssertTrue(localized.partnersLink.contains("9"), "\(code): \(localized.partnersLink)")
            XCTAssertFalse(localized.description.contains("{partnerCount}"), code)
        }
        // The link opens the partner list inside the first layer's own flow.
        presenter.customize()
        XCTAssertTrue(presenter.preferences)
        XCTAssertTrue(presenter.returnsToFirstLayer)
        XCTAssertEqual(presenter.iabPreferences?.iabPartnerCount, 3)
    }

    // TCF-CHECK: P7
    func testSummaryListsDeclaredPurposesAndSpecialFeaturesAndCountsTheRest() async throws {
        let core = try await bootIAB()
        let presentation = try XCTUnwrap(core.iabPresentation())
        let content = IABFirstLayerContent(presentation)
        XCTAssertEqual(content.summaryItems, presentation.bannerSummary.displayItems)
        XCTAssertEqual(content.summaryItems, ["Store and access information on a device", "Create profiles for personalised advertising",
            "Use profiles to select personalised advertising", "Measure advertising performance", "Use precise geolocation data"])
        XCTAssertNil(content.moreItems)

        // A purpose no partner declares is not listed; a capped list says how many more.
        let list = GlobalVendorList(vendorListVersion: 1, tcfPolicyVersion: 5,
            purposes: [1: GVLDefinition(id: 1, name: "One"), 2: GVLDefinition(id: 2, name: "Two"), 3: GVLDefinition(id: 3, name: "Three")],
            vendors: [8: GVLVendor(id: 8, name: "Partner", purposes: [1, 3])])
        let narrowed = IABFirstLayerContent(summary: IABBannerSummary.resolve(list: list), copy: english)
        XCTAssertEqual(narrowed.summaryItems, ["One", "Three"])
        let capped = IABFirstLayerContent(summary: IABBannerSummary(vendorCount: 40, displayItems: ["A", "B", "C", "D", "E"], remainingCount: 3), copy: english)
        XCTAssertEqual(capped.moreItems, "And 3 more...")
        XCTAssertEqual(Array(capped.lines.dropFirst().prefix(6)), ["A", "B", "C", "D", "E", "And 3 more..."])
    }

    // TCF-CHECK: P8
    func testFirstLayerSaysTheChoiceAppliesToThisAppOnly() async throws {
        let core = try await bootIAB()
        let content = try XCTUnwrap(ConsentPresenter(core: core).iabFirstLayer)
        XCTAssertEqual(content.scope, english.appScopeServiceSpecific)
        XCTAssertEqual(content.scope, "Your consent applies only to this app and will not affect other services.")
        XCTAssertTrue(content.lines.contains(content.scope))
        // The saved string is service-specific, matching the sentence.
        XCTAssertEqual(core.save(.all).status, .committed)
        let tcString = try XCTUnwrap(core.iabConsent()?.tcString)
        XCTAssertTrue(try coreBit(138, of: tcString), "IsServiceSpecific")
    }

    // TCF-CHECK: P9
    func testFirstLayerSaysHowToWithdrawAtAnyTime() async throws {
        let core = try await bootIAB()
        let content = try XCTUnwrap(ConsentPresenter(core: core).iabFirstLayer)
        XCTAssertEqual(content.withdraw, english.appWithdraw)
        XCTAssertTrue(content.withdraw.contains("withdraw your consent at any time"))
        XCTAssertTrue(content.withdraw.contains("Privacy settings"))
        XCTAssertTrue(content.lines.contains(content.withdraw))
    }

    // TCF-CHECK: P10
    func testFirstLayerOffersAcceptRejectAndCustomize() async throws {
        let core = try await bootIAB()
        let presenter = ConsentPresenter(core: core)
        let labels = presenter.decisionLabels
        XCTAssertEqual(labels, DecisionLabels(copy: english))
        let plan = DecisionPlan.rows(first: true, labels: labels)
        XCTAssertEqual(plan.pair.map(\.kind), [.reject, .accept])
        XCTAssertEqual(plan.pair.map(\.label), ["Reject All", "Accept All"])
        XCTAssertEqual(plan.next.kind, .customize)
        XCTAssertEqual(plan.next.label, "Customize")
        // Outside IAB mode the category prompt keeps its own labels.
        XCTAssertEqual(DecisionLabels.standard.acceptAll, "Accept all")
    }

    // TCF-CHECK: P11
    func testPrimaryActionsShareOneTextTreatment() {
        for first in [true, false] {
            let plan = DecisionPlan.rows(first: first, labels: DecisionLabels(copy: english))
            XCTAssertEqual(Set(plan.pair.map(\.style)).count, 1, "Accept all and Reject all share a style")
        }
        XCTAssertEqual(DecisionPlan.rows(first: true, labels: .standard).pair.first?.style, .decision)
        XCTAssertGreaterThanOrEqual(ConsentTheme.c15t.decisionContrast, ConsentTheme.minimumDecisionContrast)
    }

    // TCF-CHECK: P13, P29
    func testHostsCannotReplaceStandardTextsOrIllustrations() async throws {
        // A host may change the headline and introduction, nothing else that the first layer says.
        XCTAssertEqual(Mirror(reflecting: ConsentTheme.Copy.c15t).children.compactMap(\.label), ["headline", "introduction"])
        let themeFields = Mirror(reflecting: ConsentTheme.c15t).children.compactMap(\.label)
        for field in themeFields {
            for forbidden in ["stack", "purpose", "illustration", "feature"] {
                XCTAssertFalse(field.localizedCaseInsensitiveContains(forbidden), field)
            }
        }
        let core = try await bootIAB()
        let presentation = try XCTUnwrap(core.iabPresentation())
        let list = presentation.list
        // Standard names and illustrations reach the screens unchanged.
        XCTAssertEqual(IABFirstLayerContent(presentation).summaryItems, presentation.bannerSummary.displayItems)
        let content = IABPreferencesContent(presentation)
        for purpose in content.purposes {
            XCTAssertEqual(purpose.definition.name, list.purposes[purpose.id]?.name)
            XCTAssertEqual(purpose.definition.description, list.purposes[purpose.id]?.description)
            XCTAssertEqual(purpose.definition.illustrations, list.purposes[purpose.id]?.illustrations)
        }
        for item in content.specialPurposes { XCTAssertEqual(item.illustrations, list.specialPurposes[item.id]?.illustrations) }
        // So the saved string never claims non-standard texts.
        XCTAssertEqual(core.save(.all).status, .committed)
        let tcString = try XCTUnwrap(core.iabConsent()?.tcString)
        XCTAssertFalse(try coreBit(139, of: tcString), "UseNonStandardTexts")
    }

    // TCF-CHECK: P17, P18
    func testFirstLayerDisclosesLegitimateInterestAndTheRightToObject() async throws {
        let core = try await bootIAB()
        let content = try XCTUnwrap(ConsentPresenter(core: core).iabFirstLayer)
        XCTAssertEqual(content.legitimateInterestNotice, english.bannerLegitimateInterestNotice)
        XCTAssertTrue(content.legitimateInterestNotice.contains("legitimate interest"))
        XCTAssertTrue(content.legitimateInterestNotice.contains("right to object"))
        XCTAssertTrue(content.lines.contains(content.legitimateInterestNotice))
        // The second layer names the partners' LI purposes and offers the objection itself.
        let vendor = try XCTUnwrap(ConsentPresenter(core: core).iabVendor(1))
        XCTAssertEqual(vendor.legitimateInterestPurposes, ["Measure advertising performance"])
        let preferences = try XCTUnwrap(ConsentPresenter(core: core).iabPreferences)
        XCTAssertTrue(preferences.rightToObject.contains("right to object"))
    }

    // MARK: - Second layer

    // TCF-CHECK: P14, P20
    func testPreferencesListOnlyDeclaredPurposesAndSpecialFeaturesByStandardName() async throws {
        let core = try await bootIAB { gvl in
            var purposes = gvl["purposes"] as! [String: Any]
            purposes["2"] = ["id": 2, "name": "Use limited data to select advertising", "description": "Undeclared.", "illustrations": []]
            gvl["purposes"] = purposes
            var features = gvl["specialFeatures"] as! [String: Any]
            features["2"] = ["id": 2, "name": "Actively scan device characteristics for identification", "description": "Undeclared.", "illustrations": []]
            gvl["specialFeatures"] = features
        }
        let presenter = ConsentPresenter(core: core)
        presenter.customize()
        let presentation = try XCTUnwrap(presenter.disclosure)
        XCTAssertNotNil(presentation.list.purposes[2])
        let content = try XCTUnwrap(presenter.iabPreferences)
        XCTAssertEqual(content.purposes.map(\.id), presentation.declaredPurposeIds)
        XCTAssertEqual(content.purposes.map(\.id), [1, 3, 4, 7])
        XCTAssertEqual(content.purposes.map(\.definition.name), [1, 3, 4, 7].compactMap { presentation.list.purposes[$0]?.name })
        XCTAssertEqual(content.specialFeatures.map(\.id), [1])
        XCTAssertEqual(content.specialFeatures.first?.name, "Use precise geolocation data")
        // Each special feature is its own opt-in.
        presenter.edit(\.specialFeatureOptIns, id: 1, enabled: true)
        XCTAssertEqual(presenter.choices.specialFeatureOptIns, [1])
        presenter.commit(.save)
        await settle(presenter)
        XCTAssertNil(presenter.errorCode)
        XCTAssertEqual(core.iabConsent()?.choices.specialFeatureOptIns, [1])
        XCTAssertEqual(core.iabConsent()?.choices.purposeConsents, [])
    }

    // TCF-CHECK: P15
    func testEveryKindOfDefinitionShowsItsStandardIllustrations() async throws {
        let core = try await bootIAB()
        let presentation = try XCTUnwrap(core.iabPresentation())
        let content = IABPreferencesContent(presentation)
        let groups: [(IABDefinitionContent.Kind, [IABDefinitionContent], [Int: GVLDefinition])] = [
            (.purpose, content.purposes.map(\.definition), presentation.list.purposes),
            (.specialPurpose, content.specialPurposes, presentation.list.specialPurposes),
            (.feature, content.features, presentation.list.features),
            (.specialFeature, content.specialFeatures, presentation.list.specialFeatures),
        ]
        for (kind, items, table) in groups {
            XCTAssertFalse(items.isEmpty, "\(kind)")
            for item in items {
                XCTAssertEqual(item.kind, kind)
                XCTAssertFalse(item.illustrations.isEmpty, "\(kind) \(item.id)")
                XCTAssertEqual(item.illustrations, table[item.id]?.illustrations)
                XCTAssertTrue(item.hasDetails, "\(kind) \(item.id) offers Details")
            }
        }
    }

    // TCF-CHECK: P14, P15
    func testFeaturesCarryTheStandardExplanationWhereverTheyAreListed() async throws {
        let core = try await bootIAB()
        let presentation = try XCTUnwrap(core.iabPresentation())
        let standard = try XCTUnwrap(presentation.list.standardTexts?.features)
        XCTAssertEqual(IABPreferencesContent(presentation).featuresStandardText, standard)
        let vendor = try XCTUnwrap(IABVendorContent(presentation, id: 1, language: "en"))
        XCTAssertEqual(vendor.featuresStandardText, standard)
        // The partner page lists each feature read-only, with its standard texts and illustrations.
        let declared = try XCTUnwrap(presentation.list.vendors[1]?.features)
        XCTAssertFalse(declared.isEmpty)
        XCTAssertEqual(vendor.features.map(\.id), declared)
        for item in vendor.features {
            let gvl = try XCTUnwrap(presentation.list.features[item.id])
            XCTAssertEqual(item.kind, .feature)
            XCTAssertEqual(item.description, gvl.description)
            XCTAssertEqual(item.illustrations, gvl.illustrations)
            XCTAssertTrue(item.hasDetails)
        }

        // A list without standard texts falls back to the translated standard text, never a blank.
        let bareCore = try await bootIAB { $0["standardTexts"] = nil }
        let bare = try XCTUnwrap(bareCore.iabPresentation())
        XCTAssertNil(bare.list.standardTexts)
        let fallback = IABCopy.forLanguage(bare.language).preferenceCenterFeaturesDescription
        XCTAssertFalse(fallback.isEmpty)
        XCTAssertEqual(IABPreferencesContent(bare).featuresStandardText, fallback)
        XCTAssertEqual(IABVendorContent(bare, id: 1, language: "en")?.featuresStandardText, fallback)
        // The copy follows the served list's language, not the device's.
        XCTAssertEqual(IABVendorContent(bare, id: 1, language: "fr")?.featuresStandardText, fallback)
        XCTAssertNotEqual(IABCopy.forLanguage("fr").preferenceCenterFeaturesDescription, fallback)
    }

    func testPluralTemplatesPickTheLanguagesForm() {
        func partners(_ copy: IABCopy, _ n: Int) -> String { copy.format(copy.preferenceCenterPurposeItemPartners, ["count": String(n)]) }
        let cs = IABCopy.forLanguage("cs")
        XCTAssertEqual(partners(cs, 1), "1 partner")
        XCTAssertEqual(partners(cs, 3), "3 partneři")
        XCTAssertEqual(partners(cs, 5), "5 partnerů")
        let bg = IABCopy.forLanguage("bg")
        XCTAssertEqual(partners(bg, 1), "1 партньор")
        XCTAssertEqual(partners(bg, 2), "2 партньора")
        XCTAssertEqual(bg.format(bg.bannerAndMore, ["count": "3"]), "И още 3 партньора...")
        // The first layer's description agrees with its partner link, so the link still splits out.
        XCTAssertTrue(cs.format(cs.appDescription, ["partnerCount": "3"]).hasPrefix("My a naši 3 partneři "))
        XCTAssertTrue(cs.format(cs.appDescription, ["partnerCount": "1"]).hasPrefix("My a náš 1 partner "))
        XCTAssertTrue(bg.format(bg.appDescription, ["partnerCount": "5"]).hasPrefix("Ние и нашите 5 партньора "))
        for code in IABCopy.supportedLanguages {
            let copy = IABCopy.forLanguage(code)
            let description = copy.format(copy.appDescription, ["partnerCount": "3"])
            XCTAssertFalse(description.contains("plural"), code)
            XCTAssertTrue(description.contains(copy.format(copy.bannerPartnersLink, ["count": "3"])) || description.contains("3"), code)
        }
        // No language leaves an ICU token unrendered.
        for code in IABCopy.supportedLanguages {
            let copy = IABCopy.forLanguage(code)
            for n in [0, 1, 2, 5, 11, 22] { XCTAssertFalse(partners(copy, n).contains("plural"), "\(code) \(n)") }
        }
    }

    func testLastChangedDateUsesTheCopyLanguage() async throws {
        let german = ConsentPresenter(core: try await bootIAB(language: "DE"))
        let english = ConsentPresenter(core: try await bootIAB())
        let march5 = Int64(1_772_668_800_000) // 2026-03-05
        // The sentence and its date share one language, whatever the device locale.
        XCTAssertTrue(german.lastChanged(at: march5).contains("März"), german.lastChanged(at: march5))
        XCTAssertTrue(english.lastChanged(at: march5).contains("Mar"), english.lastChanged(at: march5))
    }

    func testScreenCopyFollowsTheConfiguredConsentLanguage() async throws {
        let core = try await bootIAB(language: "DE")
        let presentation = try XCTUnwrap(core.iabPresentation())
        // The TC String declares DE, so the screens use the German copy too.
        XCTAssertEqual(presentation.language, "DE")
        let german = IABCopy.forLanguage("de")
        XCTAssertNotEqual(german.appWithdraw, english.appWithdraw)
        XCTAssertEqual(ConsentPresenter(core: core).iabCopy.appWithdraw, german.appWithdraw)
        XCTAssertEqual(IABFirstLayerContent(presentation).withdraw, german.appWithdraw)
    }

    // TCF-CHECK: P16
    func testNonIABPartnersArePresentedApart() async throws {
        let core = try await bootIAB()
        let presenter = ConsentPresenter(core: core)
        let content = try XCTUnwrap(presenter.iabPreferences)
        XCTAssertEqual(content.iabPartnerCount, 3)
        XCTAssertEqual(content.otherPartnerCount, 2)
        let providers = try XCTUnwrap(presenter.disclosure?.adTechProviders).map(\.id)
        XCTAssertEqual(providers.sorted(), [10, 20])
        // Google ad tech providers have their own page; none appears as an IAB partner.
        XCTAssertTrue(Set(presenter.disclosure?.vendors.keys.map { $0 } ?? []).isDisjoint(with: providers))
        for id in providers { XCTAssertNil(presenter.iabVendor(id)) }
    }

    // TCF-CHECK: P19
    func testPartnerPageListsEverythingTheVendorDeclaresAndChoicesAreGranular() async throws {
        let core = try await bootIAB()
        let presenter = ConsentPresenter(core: core)
        let vendor = try XCTUnwrap(presenter.iabVendor(1))
        XCTAssertEqual(vendor.name, "Élan Analytics")
        XCTAssertEqual(vendor.privacyPolicy, URL(string: "https://example.test/privacy"))
        XCTAssertEqual(vendor.consentPurposes, ["Store and access information on a device", "Create profiles for personalised advertising",
            "Use profiles to select personalised advertising", "Measure advertising performance"])
        XCTAssertEqual(vendor.legitimateInterestPurposes, ["Measure advertising performance"])
        XCTAssertEqual(vendor.specialPurposes, ["Ensure security and prevent fraud"])
        XCTAssertEqual(vendor.features.map(\.name), ["Match and combine data from other sources"])
        XCTAssertEqual(vendor.specialFeatures, ["Use precise geolocation data"])
        // One purpose and one partner, nothing else.
        presenter.customize()
        presenter.edit(\.purposeConsents, id: 7, enabled: true)
        presenter.edit(\.vendorConsents, id: 2, enabled: true)
        presenter.commit(.save)
        await settle(presenter)
        let saved = try XCTUnwrap(core.iabConsent()?.choices)
        XCTAssertEqual(saved.purposeConsents, [7])
        XCTAssertEqual(saved.vendorConsents, [2])
        XCTAssertTrue(core.isIABAllowed(vendorId: 2, purposeId: 7, basis: .consent))
        XCTAssertFalse(core.isIABAllowed(vendorId: 1, purposeId: 7, basis: .consent))
        XCTAssertFalse(core.isIABAllowed(vendorId: 2, purposeId: 1, basis: .consent))
    }

    // TCF-CHECK: P21
    func testEveryConsentStartsOffForAFirstTimeUser() async throws {
        let core = try await bootIAB()
        let presenter = ConsentPresenter(core: core)
        XCTAssertNil(core.snapshot().explicitChoice)
        presenter.customize()
        XCTAssertTrue(presenter.choices.purposeConsents.isEmpty)
        XCTAssertTrue(presenter.choices.vendorConsents.isEmpty)
        XCTAssertTrue(presenter.choices.specialFeatureOptIns.isEmpty)
        XCTAssertTrue(presenter.choices.adTechProviderConsents?.isEmpty ?? true)
        // Legitimate interest is not consent: as on the web it starts not objected to, for the
        // purposes and partners that claim it, and the user objects with its switch.
        XCTAssertEqual(presenter.choices.purposeLegitimateInterests, [7])
        XCTAssertEqual(presenter.choices.vendorLegitimateInterests, [1, 2, 3])
        XCTAssertTrue(presenter.choices.purposeObjections.isEmpty)
        XCTAssertTrue(presenter.choices.vendorObjections.isEmpty)
        for vendor in [1, 2, 3] { XCTAssertEqual(presenter.partnerStatus(vendor), "Partly on") }

        // Saving untouched grants no consent and records no objection.
        presenter.commit(.save)
        await settle(presenter)
        XCTAssertNil(presenter.errorCode)
        XCTAssertFalse(core.isIABAllowed(vendorId: 1, purposeId: 7, basis: .consent))
        XCTAssertTrue(core.isIABAllowed(vendorId: 1, purposeId: 7, basis: .legitimateInterest))
    }

    func testAReturningUserKeepsTheirSavedObjections() async throws {
        let core = try await bootIAB()
        let presenter = ConsentPresenter(core: core)
        presenter.commit(.reject)
        await settle(presenter)
        XCTAssertNil(presenter.errorCode)
        presenter.presentPreferences()
        XCTAssertEqual(presenter.choices, IABChoices())
        XCTAssertFalse(core.isIABAllowed(vendorId: 1, purposeId: 7, basis: .legitimateInterest))
    }

    // TCF-CHECK: P22
    func testLegitimateInterestIsExplainedWhereItIsOffered() async throws {
        let core = try await bootIAB()
        let content = try XCTUnwrap(ConsentPresenter(core: core).iabPreferences)
        let explanation = try XCTUnwrap(content.legitimateInterestExplanation)
        XCTAssertEqual(explanation, english.appLegitimateInterestExplanation)
        XCTAssertTrue(explanation.contains("such as unique identifiers and browsing data"), "nature of the data")
        XCTAssertTrue(explanation.contains("This applies only to this app"), "scope")
        XCTAssertTrue(explanation.contains("object"), "the right to object")
        // No partner on legitimate interest, nothing to explain.
        let consentOnly = try await bootIAB { gvl in
            var vendors = gvl["vendors"] as! [String: Any]
            for (id, value) in vendors {
                var vendor = value as! [String: Any]
                vendor["legIntPurposes"] = []
                vendors[id] = vendor
            }
            gvl["vendors"] = vendors
        }
        let none = try XCTUnwrap(ConsentPresenter(core: consentOnly).iabPreferences)
        XCTAssertNil(none.legitimateInterestExplanation)
        XCTAssertTrue(none.purposes.allSatisfy { !$0.offersObjection })
    }

    // TCF-CHECK: P23
    func testObjectionIsOfferedPerPurposeAndPerPartner() async throws {
        let core = try await bootIAB()
        let presenter = ConsentPresenter(core: core)
        presenter.customize()
        let content = try XCTUnwrap(presenter.iabPreferences)
        XCTAssertEqual(content.purposes.filter(\.offersObjection).map(\.id), [7])
        XCTAssertFalse(try XCTUnwrap(presenter.iabVendor(1)).legitimateInterestPurposes.isEmpty)
        // Allow legitimate interest everywhere, then object to one purpose and one partner.
        presenter.editLI(purpose: true, id: 7, enabled: true)
        for vendor in [1, 2, 3] { presenter.editLI(purpose: false, id: vendor, enabled: true) }
        presenter.editLI(purpose: false, id: 1, enabled: false)
        XCTAssertEqual(presenter.choices.vendorObjections, [1])
        presenter.commit(.save)
        await settle(presenter)
        XCTAssertFalse(core.isIABAllowed(vendorId: 1, purposeId: 7, basis: .legitimateInterest))
        XCTAssertTrue(core.isIABAllowed(vendorId: 2, purposeId: 7, basis: .legitimateInterest))
        presenter.presentPreferences()
        presenter.editLI(purpose: true, id: 7, enabled: false)
        XCTAssertEqual(presenter.choices.purposeObjections, [7])
        presenter.commit(.save)
        await settle(presenter)
        XCTAssertEqual(core.iabConsent()?.choices.purposeObjections, [7])
        XCTAssertFalse(core.isIABAllowed(vendorId: 2, purposeId: 7, basis: .legitimateInterest))
    }

    // TCF-CHECK: P25
    func testEachPurposeShowsItsPartnerCountsOnTheCollapsedRow() async throws {
        let core = try await bootIAB { gvl in
            var vendors = gvl["vendors"] as! [String: Any]
            var third = vendors["3"] as! [String: Any]
            third["legIntPurposes"] = []
            vendors["3"] = third
            gvl["vendors"] = vendors
        }
        let presenter = ConsentPresenter(core: core)
        let content = try XCTUnwrap(presenter.iabPreferences)
        let measure = try XCTUnwrap(content.purposes.first { $0.id == 7 })
        XCTAssertEqual(measure.consentPartnerCount, 3)
        XCTAssertEqual(measure.legitimateInterestPartnerCount, 2)
        XCTAssertEqual(measure.partnerCounts, "With Your Permission: 3 partners · Legitimate Interest: 2 partners")
        let storage = try XCTUnwrap(content.purposes.first { $0.id == 1 })
        // Purposes 1, 3 and 4 also count the 2 Google ad tech providers, as the web does.
        XCTAssertEqual(presenter.disclosure?.adTechProviders?.count, 2)
        XCTAssertEqual(storage.partnerCounts, "With Your Permission: 5 partners · Legitimate Interest: 0 partners")
        // Other languages take every word from the shared copy.
        let german = IABCopy.forLanguage("de")
        let translated = IABPurposeContent(definition: measure.definition, consentPartnerCount: 3, legitimateInterestPartnerCount: 2, copy: german)
        XCTAssertEqual(translated.partnerCounts, "\(german.preferenceCenterPurposeItemWithYourPermission): \(german.format(german.preferenceCenterPurposeItemPartners, ["count": "3"]))"
            + " · \(german.preferenceCenterPurposeItemLegitimateInterest): \(german.format(german.preferenceCenterPurposeItemPartners, ["count": "2"]))")
        XCTAssertFalse(translated.partnerCounts.contains("partners"))
        XCTAssertEqual(content.purposes.filter { [1, 3, 4].contains($0.id) }.map(\.consentPartnerCount), [5, 5, 5])
    }

    // TCF-CHECK: P26, P28
    func testPartnerPageLinksTheLegitimateInterestStatementAndListsDataCategories() async throws {
        let core = try await bootIAB()
        let vendor = try XCTUnwrap(ConsentPresenter(core: core).iabVendor(1))
        XCTAssertEqual(vendor.legitimateInterestClaim, URL(string: "https://example.test/interest"))
        XCTAssertEqual(vendor.dataCategories, ["Device information"])
    }

    // TCF-CHECK: P27
    func testPartnerPageShowsRetentionIncludingSpecialPurposes() async throws {
        let core = try await bootIAB()
        let vendor = try XCTUnwrap(ConsentPresenter(core: core).iabVendor(1))
        XCTAssertEqual(vendor.retention, [
            IABVendorContent.Row(label: "Measure advertising performance", value: "90 days"),
            IABVendorContent.Row(label: "Ensure security and prevent fraud", value: "30 days"),
            IABVendorContent.Row(label: "Standard retention", value: "365 days"),
        ])
    }

    // TCF-CHECK: P30
    func testPreferencesDiscloseHowAndHowLongTheChoiceIsStored() async throws {
        let core = try await bootIAB { gvl in
            var vendors = gvl["vendors"] as! [String: Any]
            var third = vendors["3"] as! [String: Any]
            third["cookieMaxAgeSeconds"] = 3600
            vendors["3"] = third
            gvl["vendors"] = vendors
        }
        let presenter = ConsentPresenter(core: core)
        let presentation = try XCTUnwrap(presenter.disclosure)
        XCTAssertEqual(presentation.consentStorageMaxDays, 365)
        let storage = try XCTUnwrap(presenter.iabPreferences?.consentStorage)
        XCTAssertEqual(storage, english.format(english.appConsentStorage, ["days": "365"]))
        XCTAssertTrue(storage.contains("stored on this device"))
        XCTAssertTrue(storage.contains("IABTCF"))
        XCTAssertTrue(storage.contains("365 days"))
        // A partner's device storage under a day rounds up instead of reading as 0 days.
        let third = try XCTUnwrap(presenter.iabVendor(3))
        XCTAssertEqual(third.storage.first, IABVendorContent.Row(label: "Stored for up to", value: "1 day"))
        XCTAssertEqual(try XCTUnwrap(presenter.iabVendor(1)).storage.first?.value, "365 days")
        XCTAssertEqual(IABVendorContent.storageDuration(seconds: 1, english), "1 day")
        XCTAssertEqual(IABVendorContent.storageDuration(seconds: 86_400, english), "1 day")
        XCTAssertEqual(IABVendorContent.storageDuration(seconds: 86_401, english), "2 days")
        XCTAssertEqual(IABVendorContent.storageDuration(seconds: 0, english), english.appSessionOnly)
    }

    // MARK: - Resurfacing

    // TCF-CHECK: P32
    func testReopenedPreferencesWithdrawAsEasilyAsTheyGrant() async throws {
        let core = try await bootIAB()
        let presenter = ConsentPresenter(core: core)
        presenter.commit(.accept)
        await settle(presenter)
        XCTAssertTrue(core.isIABAllowed(vendorId: 1, purposeId: 1, basis: .consent))
        presenter.presentPreferences()
        XCTAssertTrue(presenter.preferences)
        // Reject All sits beside Accept All, drawn the same, in the reopened preferences.
        let plan = DecisionPlan.rows(first: false, labels: presenter.decisionLabels)
        XCTAssertEqual(plan.pair.map(\.kind), [.reject, .accept])
        XCTAssertEqual(plan.pair.map(\.label), [english.commonRejectAll, english.commonAcceptAll])
        XCTAssertEqual(plan.pair[0].style, plan.pair[1].style)
        presenter.commit(.reject)
        await settle(presenter)
        let saved = try XCTUnwrap(core.iabConsent()?.choices)
        XCTAssertEqual(saved.purposeConsents, [])
        XCTAssertEqual(saved.vendorConsents, [])
        XCTAssertEqual(saved.purposeLegitimateInterests, [])
        XCTAssertEqual(saved.vendorLegitimateInterests, [])
        XCTAssertEqual(saved.specialFeatureOptIns, [])
        XCTAssertFalse(core.isIABAllowed(vendorId: 1, purposeId: 1, basis: .consent))
    }

    // MARK: - Helpers

    /// Boots a core on the demo's IAB `/init` fixture, optionally edited first.
    private func bootIAB(language: String = "EN", _ edit: ((inout [String: Any]) -> Void)? = nil) async throws -> ConsentCore {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        var body = try Data(contentsOf: root.appendingPathComponent("examples/consent-demo/fixtures/iab-init.json"))
        if let edit {
            var json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            var gvl = try XCTUnwrap(json["gvl"] as? [String: Any])
            edit(&gvl)
            json["gvl"] = gvl
            body = try JSONSerialization.data(withJSONObject: json)
        }
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: InMemoryStore(),
            transport: HostedTransport(baseURL: URL(string: "https://fixture.invalid")!, client: Peer(body)),
            iab: IABConfiguration(cmpId: 53, cmpVersion: 7, publisherCountryCode: "GB", consentLanguage: language), initRetry: .disabled))
        await core.waitUntilIdle()
        XCTAssertNotNil(core.iabPresentation(), "fixture should load an IAB list")
        return core
    }

    private func settle(_ presenter: ConsentPresenter) async {
        for _ in 0..<500 {
            if !presenter.pending { return }
            try? await Task.sleep(for: .milliseconds(10))
        }
        XCTFail("Native commit did not settle")
    }

    /// One bit of the TC String's core segment, counted from its first bit.
    private func coreBit(_ index: Int, of tcString: String) throws -> Bool {
        var segment = String(tcString.split(separator: ".")[0])
            .replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while segment.count % 4 != 0 { segment += "=" }
        let bytes = try XCTUnwrap(Data(base64Encoded: segment))
        let byte = bytes[bytes.startIndex + index / 8]
        return (byte >> UInt8(7 - index % 8)) & 1 == 1
    }

    private struct Peer: HTTPTransport {
        let body: Data
        init(_ body: Data) { self.body = body }
        func send(_ request: HTTPRequest) async throws -> HTTPResponse {
            request.method == .get
                ? HTTPResponse(status: 200, headers: ["x-c15t-policy-contract": "1"], body: body)
                : HTTPResponse(status: 503)
        }
    }
}
