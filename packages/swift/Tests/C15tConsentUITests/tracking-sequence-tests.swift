@_spi(C15tInternal) @testable import C15tApple
@_spi(C15tInternal) import C15tCore
import Combine
import Foundation
import XCTest
@testable import C15tConsentUI

/// App Tracking Transparency in step with the consent prompt: after it by default and only
/// with marketing granted, before it on request, and never by itself in manual mode.
@MainActor
final class TrackingSequenceTests: XCTestCase {
    /// A stand-in for Apple: what it answers now, whether the app is active, and each ask.
    final class Apple: @unchecked Sendable {
        var status: C15tTrackingPlatformStatus? = .notDetermined
        var answer: C15tTrackingPlatformStatus = .authorized
        var promptString = true
        var active = true
        var additionalInformation = false
        var asks = 0
        /// Answers delivered so far.
        var answers = 0
        /// Called as Apple is asked, before it answers, to check what is on screen then.
        var onAsk: (() -> Void)?
        /// Keep Apple's answer until ``reply()``, to change settings while it is on screen.
        var hold = false
        private var held: (() -> Void)?
        let activations = PassthroughSubject<Void, Never>()
        /// The clock the answer log reads, moved by tests.
        var clock = Date(timeIntervalSince1970: 1_800_000_000)
        /// When the SDK last saw an answer. In memory, so tests start from nothing.
        let log = C15tTrackingAnswerLog.inMemory()
        /// How many more times the EU sheet pauses on Additional Information before it answers.
        var pausesLeft = Int.max
        /// Whether the last expanded request offered Apple's Additional Information button.
        var offeredButton: Bool?

        var controller: C15tTrackingController {
            C15tTrackingController(
                trackingPlatformStatus: { self.status },
                trackingPromptStringPresent: { self.promptString },
                trackingPrompt: { completion in
                    self.asks += 1
                    self.onAsk?()
                    self.answerLater {
                        self.status = self.answer
                        completion(self.answer)
                    }
                },
                trackingExpandedInterfaceAvailable: { self.additionalInformation },
                trackingExpandedPrompt: { _, info, completion in
                    self.asks += 1
                    self.offeredButton = info != nil
                    self.onAsk?()
                    self.answerLater {
                        if self.pausesLeft > 0, let info {
                            self.pausesLeft -= 1
                            info()
                            completion(.notDetermined)
                        } else {
                            self.status = self.answer
                            completion(self.answer)
                        }
                    }
                    return true
                },
                answerLog: log,
                now: { self.clock }
            )
        }

        private func answerLater(_ answer: @escaping () -> Void) {
            let counted = { self.answers += 1; answer() }
            if hold { held = counted } else { counted() }
        }

        func reply() {
            let answer = held
            held = nil
            answer?()
        }
    }

    func testRuleTable() {
        let cases: [(ConsentTrackingRequest, ConsentTrackingStage, C15tTrackingPlatformStatus?, Bool, ConsentDecision, Bool)] = [
            (.afterConsent, .afterPrompt, .notDetermined, true, .granted, true),
            (.afterConsent, .afterPrompt, .notDetermined, true, .denied, false),
            (.afterConsent, .afterPrompt, .notDetermined, true, .pending, false),
            (.afterConsent, .afterPrompt, .authorized, true, .granted, false),
            (.afterConsent, .afterPrompt, .denied, true, .granted, false),
            (.afterConsent, .afterPrompt, .restricted, true, .granted, false),
            (.afterConsent, .afterPrompt, nil, true, .granted, false),
            (.afterConsent, .afterPrompt, .notDetermined, false, .granted, false),
            (.afterConsent, .beforePrompt, .notDetermined, true, .granted, false),
            (.beforeConsent, .beforePrompt, .notDetermined, true, .pending, true),
            (.beforeConsent, .beforePrompt, .denied, true, .pending, false),
            (.beforeConsent, .afterPrompt, .notDetermined, true, .granted, false),
            (.manual, .afterPrompt, .notDetermined, true, .granted, false),
            (.manual, .beforePrompt, .notDetermined, true, .granted, false),
        ]
        for (order, stage, platform, string, marketing, expected) in cases {
            XCTAssertEqual(order.shouldAsk(at: stage, platform: platform, promptStringPresent: string, marketing: marketing,
                                           marketingRefused: false),
                           expected, "\(order) \(stage) \(String(describing: platform)) \(string) \(marketing)")
        }
    }

    func testAsksOnceAfterTheCoverHasGoneWithMarketingGranted() async throws {
        let apple = Apple()
        let prompt = try await attached(apple)
        XCTAssertNotNil(prompt.presenter.presentationID)
        prompt.presenter.coverAppeared()
        prompt.presenter.commit(.accept)
        await until { !prompt.presenter.pending }
        XCTAssertEqual(apple.asks, 0, "not while the cover is animating away")

        prompt.presenter.coverDismissed()
        await until { apple.asks == 1 }

        // Apple answered, so a later settings session asks nothing.
        prompt.presentPreferences()
        prompt.presenter.requestClose()
        await settle()
        XCTAssertEqual(apple.asks, 1)
    }

    func testMarketingDeniedAsksNothing() async throws {
        let apple = Apple()
        let prompt = try await attached(apple)
        prompt.presenter.commit(.reject)
        await until { !prompt.presenter.pending }
        await settle()
        XCTAssertEqual(apple.asks, 0)
    }

    func testMarketingGrantedLaterInSettingsAsksThen() async throws {
        let apple = Apple()
        let prompt = try await attached(apple)
        prompt.presenter.commit(.reject)
        await until { !prompt.presenter.pending }
        XCTAssertEqual(apple.asks, 0)

        prompt.presentPreferences()
        prompt.presenter.setCategory(.marketing, true)
        prompt.presenter.commit(.save)
        await until { apple.asks == 1 }
    }

    func testAnsweredAppleAsksNothingOnAnyPath() async throws {
        for status in [C15tTrackingPlatformStatus.authorized, .denied, .restricted] {
            for order in ConsentTrackingRequest.allCases {
                let apple = Apple()
                apple.status = status
                let prompt = try await attached(apple, order: order)
                await until { prompt.presenter.presentationID != nil }
                prompt.presenter.commit(.accept)
                await until { !prompt.presenter.pending }
                await settle()
                XCTAssertEqual(apple.asks, 0, "\(status) \(order)")
            }
        }
    }

    func testWithoutThePromptStringNothingIsAsked() async throws {
        let apple = Apple()
        apple.promptString = false
        let prompt = try await attached(apple)
        prompt.presenter.commit(.accept)
        await until { !prompt.presenter.pending }
        await settle()
        XCTAssertEqual(apple.asks, 0)
    }

    func testStoredChoiceGrantingMarketingAsksAtLaunch() async throws {
        let apple = Apple()
        let core = try await boot()
        XCTAssertEqual(core.save(.all).status, .committed)
        let prompt = attach(core, apple)
        XCTAssertNil(prompt.presenter.presentationID)
        await until { apple.asks == 1 }
    }

    func testStoredChoiceDenyingMarketingAsksNothingAtLaunch() async throws {
        let apple = Apple()
        let core = try await boot()
        XCTAssertEqual(core.save(.necessary).status, .committed)
        _ = attach(core, apple)
        await settle()
        XCTAssertEqual(apple.asks, 0)
    }

    func testBeforeConsentAsksThenPresents() async throws {
        let apple = Apple()
        let prompt = try await attached(apple, order: .beforeConsent)
        XCTAssertEqual(apple.asks, 1)
        XCTAssertNil(prompt.presenter.presentationID, "the prompt waits for Apple's answer")
        await until { prompt.presenter.presentationID != nil }

        prompt.presenter.commit(.accept)
        await until { !prompt.presenter.pending }
        await settle()
        XCTAssertEqual(apple.asks, 1)
    }

    func testManualAsksNothing() async throws {
        let apple = Apple()
        let prompt = try await attached(apple, order: .manual)
        prompt.presenter.commit(.accept)
        await until { !prompt.presenter.pending }
        await settle()
        XCTAssertEqual(apple.asks, 0)
    }

    func testAutoPresentOffAsksNothingAtLaunchButFollowsAPromptTheAppOpened() async throws {
        let apple = Apple()
        let core = try await boot()
        XCTAssertEqual(core.save(.all).status, .committed)
        let prompt = attach(core, apple, autoPresent: false)
        await settle()
        XCTAssertEqual(apple.asks, 0)

        prompt.presentPreferences()
        prompt.presenter.requestClose()
        await until { apple.asks == 1 }
    }

    func testWaitsUntilTheAppIsActive() async throws {
        let apple = Apple()
        let prompt = try await attached(apple)
        apple.active = false
        prompt.presenter.commit(.accept)
        await until { !prompt.presenter.pending }
        await settle()
        XCTAssertEqual(apple.asks, 0)

        apple.active = true
        apple.activations.send()
        await until { apple.asks == 1 }
    }

    func testAdditionalInformationOpensSettings() async throws {
        let apple = Apple()
        apple.additionalInformation = true
        let prompt = try await attached(apple)
        prompt.presenter.commit(.accept)
        await until { prompt.presenter.preferences && prompt.presenter.presentationID != nil }
        XCTAssertEqual(apple.asks, 1)
    }

    func testAppleDenialLeavesStoredConsentAlone() async throws {
        let apple = Apple()
        apple.answer = .denied
        let prompt = try await attached(apple)
        prompt.presenter.commit(.accept)
        await until { apple.asks == 1 }
        let revision = prompt.core.snapshot().revision
        await settle()
        XCTAssertEqual(prompt.core.snapshot().revision, revision)
        XCTAssertEqual(ConsentDecision(snapshot: prompt.core.snapshot(), category: .marketing), .granted)
    }

    func testSwitchingToManualWhileAppleAnswersOpensNoSettings() async throws {
        let apple = Apple()
        apple.additionalInformation = true
        apple.hold = true
        let core = try await boot()
        let prompt = attach(core, apple)
        let scene = try XCTUnwrap(prompt.host)
        prompt.presenter.commit(.accept)
        await until { apple.asks == 1 }

        prompt.attach(scene, active: true, autoPresent: true, trackingRequest: .manual)
        apple.reply()
        await settle()
        XCTAssertNil(prompt.presenter.presentationID)
    }

    func testLaunchAskIsDroppedWhenAutoPresentTurnsOffFirst() async throws {
        let apple = Apple()
        apple.active = false
        let core = try await boot()
        XCTAssertEqual(core.save(.all).status, .committed)
        let prompt = attach(core, apple)
        let scene = try XCTUnwrap(prompt.host)

        prompt.attach(scene, active: true, autoPresent: false)
        apple.active = true
        apple.activations.send()
        await settle()
        XCTAssertEqual(apple.asks, 0)
    }

    func testLaunchAskIsDecidedAgainUnderNewSettings() async throws {
        let apple = Apple()
        apple.active = false
        let core = try await boot()
        XCTAssertEqual(core.save(.all).status, .committed)
        let prompt = attach(core, apple, order: .beforeConsent)
        let scene = try XCTUnwrap(prompt.host)

        // Still waiting for the app to become active; the app switches to afterConsent.
        prompt.attach(scene, active: true, autoPresent: true, trackingRequest: .afterConsent)
        apple.active = true
        apple.activations.send()
        await until { apple.asks == 1 }
    }

    func testAStoredMarketingRefusalAsksNothingInAnyOrder() {
        for order in ConsentTrackingRequest.allCases {
            for stage in [ConsentTrackingStage.beforePrompt, .afterPrompt] {
                XCTAssertFalse(order.shouldAsk(at: stage, platform: .notDetermined, promptStringPresent: true,
                                               marketing: .denied, marketingRefused: true), "\(order) \(stage)")
            }
        }
    }

    func testBeforeConsentSkipsAPersonWhoAlreadyRefusedMarketing() async throws {
        let apple = Apple()
        let core = try await boot()
        XCTAssertEqual(core.save(.necessary).status, .committed)
        _ = attach(core, apple, order: .beforeConsent)
        await settle()
        XCTAssertEqual(apple.asks, 0)
    }

    func testBeforeConsentAsksFirstForAPromptTheAppOpens() async throws {
        let apple = Apple()
        let core = try await boot()
        let prompt = attach(core, apple, order: .beforeConsent, autoPresent: false)
        await settle()
        XCTAssertEqual(apple.asks, 0, "nothing by itself with autoPresent off")
        apple.onAsk = { XCTAssertNil(prompt.presenter.presentationID, "the prompt waits for Apple") }

        prompt.presentPrompt()
        XCTAssertEqual(apple.asks, 1)
        await until { prompt.presenter.presentationID != nil }
        XCTAssertFalse(prompt.presenter.preferences)
    }

    func testBeforeConsentDoesNotDelaySettingsThePersonOpens() async throws {
        let apple = Apple()
        let core = try await boot()
        let prompt = attach(core, apple, order: .beforeConsent, autoPresent: false)
        prompt.presentPreferences()
        XCTAssertNotNil(prompt.presenter.presentationID)
        XCTAssertEqual(apple.asks, 0)
    }

    func testDetachingTheLastSceneDropsAnOwedAsk() async throws {
        let apple = Apple()
        let prompt = try await attached(apple)
        let scene = try XCTUnwrap(prompt.host)
        apple.active = false
        prompt.presenter.commit(.accept)
        await until { !prompt.presenter.pending }

        prompt.detach(scene)
        apple.active = true
        apple.activations.send()
        await settle()
        XCTAssertEqual(apple.asks, 0, "no scene is left to own the ask")

        // A scene that attaches decides again: marketing is granted and Apple was never asked.
        prompt.attach(UUID(), active: true, autoPresent: true)
        await until { apple.asks == 1 }
    }

    func testNothingIsAskedWhileTheNoticeCardShows() async throws {
        let apple = Apple()
        let core = try await boot("notice-init.json")
        let prompt = attach(core, apple)
        await until { prompt.presenter.noticeVisible }
        apple.onAsk = { XCTAssertFalse(prompt.presenter.noticeVisible, "asked over the notice card") }

        // Settings saved with marketing granted close over a notice that is still owed.
        prompt.presentPreferences()
        prompt.presenter.setCategory(.marketing, true)
        prompt.presenter.commit(.save)
        await until { !prompt.presenter.pending }
        await settle()
        XCTAssertTrue(prompt.presenter.noticeVisible)
        XCTAssertEqual(apple.asks, 0)

        prompt.presenter.commit(.acknowledge)
        await until { apple.asks == 1 }
    }

    func testAPromptRequestedBeforeAnySceneAttachesFollowsThatScenesOrder() async throws {
        // A view's onAppear or task can run before the modifier's scene attaches.
        let apple = Apple()
        let core = try await boot()
        let prompt = ConsentPrompt(core: core, tracking: apple.controller, isActive: { apple.active },
                                   becameActive: apple.activations.eraseToAnyPublisher())
        apple.onAsk = { XCTAssertNil(prompt.presenter.presentationID, "the prompt waits for Apple") }
        prompt.presentPrompt()
        XCTAssertNil(prompt.presenter.presentationID, "nothing opens before a scene says which order it wants")

        prompt.attach(UUID(), active: true, autoPresent: false, trackingRequest: .beforeConsent)
        XCTAssertEqual(apple.asks, 1)
        await until { prompt.presenter.presentationID != nil }
    }

    func testAPromptRequestedBeforeAnySceneAttachesOpensWhenOneDoes() async throws {
        let apple = Apple()
        let core = try await boot()
        let prompt = ConsentPrompt(core: core, tracking: apple.controller, isActive: { apple.active },
                                   becameActive: apple.activations.eraseToAnyPublisher())
        prompt.presentPrompt()
        prompt.attach(UUID(), active: true, autoPresent: false, trackingRequest: .afterConsent)
        XCTAssertNotNil(prompt.presenter.presentationID)
        XCTAssertEqual(apple.asks, 0)
    }

    func testBeforeConsentAsksBeforeTheNextPromptOnceARefusalIsGone() async throws {
        let apple = Apple()
        let core = try await boot()
        XCTAssertEqual(core.save(.necessary).status, .committed)
        let prompt = attach(core, apple, order: .beforeConsent)
        await settle()
        XCTAssertEqual(apple.asks, 0, "a stored refusal skips the ask")

        apple.onAsk = { XCTAssertNil(prompt.presenter.presentationID, "the prompt waits for Apple") }
        core.reset()
        await core.waitUntilIdle()
        await until { apple.asks == 1 }
        await until { prompt.presenter.presentationID != nil }
    }

    // MARK: - beforeConsent at launch

    func testBeforeConsentAsksAtALaunchThatOwesNoPrompt() async throws {
        let apple = Apple()
        let core = try await boot()
        XCTAssertEqual(core.save(.all).status, .committed)
        let prompt = attach(core, apple, order: .beforeConsent)
        await until { apple.asks == 1 }
        // Settings changing re-checks the launch; Apple has answered, so nothing more.
        prompt.attach(try XCTUnwrap(prompt.host), active: true, autoPresent: false, trackingRequest: .beforeConsent)
        prompt.attach(try XCTUnwrap(prompt.host), active: true, autoPresent: true, trackingRequest: .beforeConsent)
        await settle()
        XCTAssertEqual(apple.asks, 1)
    }

    func testBeforeConsentAtLaunchSkipsAnAnsweredApple() async throws {
        let apple = Apple()
        apple.status = .denied
        let core = try await boot()
        XCTAssertEqual(core.save(.all).status, .committed)
        _ = attach(core, apple, order: .beforeConsent)
        await settle()
        XCTAssertEqual(apple.asks, 0)
    }

    // MARK: - Yearly re-ask

    /// A stored grant, Apple answered `authorized`, and the SDK saw that answer `ago` seconds ago.
    private func answered(_ apple: Apple, ago: TimeInterval?) async throws -> ConsentCore {
        apple.status = .authorized
        if let ago { apple.log.record(apple.clock.addingTimeInterval(-ago)) }
        let core = try await boot()
        XCTAssertEqual(core.save(.all).status, .committed)
        return core
    }

    private let day: TimeInterval = 24 * 60 * 60

    func testYearlyAsksAgainOncePerLaunchAfterAYear() async throws {
        for order in [ConsentTrackingRequest.afterConsent, .beforeConsent] {
            let apple = Apple()
            let core = try await answered(apple, ago: 366 * day)
            let prompt = attach(core, apple, order: order, reprompt: .yearly)
            await until { apple.asks == 1 }
            // Apple returned the same answer: shown and answered alike, or not shown. The stamp
            // stays, so a launch after Apple's own year can try again.
            XCTAssertEqual(apple.log.lastAnswerAt, apple.clock.addingTimeInterval(-366 * day), "\(order)")

            // Even if Apple returned the stored answer without asking, this launch is done.
            apple.log.record(apple.clock.addingTimeInterval(-400 * day))
            prompt.presentPreferences()
            prompt.presenter.requestClose()
            await settle()
            XCTAssertEqual(apple.asks, 1, "\(order)")
        }
    }

    func testYearlyWaitsForTheYear() async throws {
        let apple = Apple()
        let core = try await answered(apple, ago: 364 * day)
        _ = attach(core, apple, reprompt: .yearly)
        await settle()
        XCTAssertEqual(apple.asks, 0)
    }

    func testYearlyStampsAnAnswerFromBeforeThisVersionAndWaits() async throws {
        let apple = Apple()
        let core = try await answered(apple, ago: nil)
        _ = attach(core, apple, reprompt: .yearly)
        await settle()
        XCTAssertEqual(apple.asks, 0)
        XCTAssertEqual(apple.log.lastAnswerAt, apple.clock, "stored now, so the year starts today")
    }

    func testNeverIsTheDefaultAndAsksNothingAfterAnAnswer() async throws {
        let apple = Apple()
        let core = try await answered(apple, ago: 800 * day)
        _ = attach(core, apple)
        await settle()
        XCTAssertEqual(apple.asks, 0)
    }

    func testYearlyNeverAsksRestrictedRefusedOrManual() async throws {
        let restricted = Apple()
        let core = try await answered(restricted, ago: 800 * day)
        restricted.status = .restricted
        _ = attach(core, restricted, reprompt: .yearly)

        let refusedApple = Apple()
        refusedApple.status = .denied
        refusedApple.log.record(refusedApple.clock.addingTimeInterval(-800 * day))
        let refusedCore = try await boot()
        XCTAssertEqual(refusedCore.save(.necessary).status, .committed)
        _ = attach(refusedCore, refusedApple, reprompt: .yearly)

        let manual = Apple()
        _ = attach(try await answered(manual, ago: 800 * day), manual, order: .manual, reprompt: .yearly)
        await settle()
        XCTAssertEqual(restricted.asks, 0, "restricted")
        XCTAssertEqual(refusedApple.asks, 0, "marketing refused")
        XCTAssertEqual(manual.asks, 0, "manual")
    }

    func testTheYearlyRuleTable() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        XCTAssertFalse(ConsentTrackingReprompt.never.isDue(lastAnswer: now.addingTimeInterval(-800 * day), now: now))
        XCTAssertFalse(ConsentTrackingReprompt.yearly.isDue(lastAnswer: nil, now: now))
        XCTAssertFalse(ConsentTrackingReprompt.yearly.isDue(lastAnswer: now.addingTimeInterval(-364 * day), now: now))
        XCTAssertTrue(ConsentTrackingReprompt.yearly.isDue(lastAnswer: now.addingTimeInterval(-365 * day), now: now))
        let due = ConsentTrackingInputs(platform: .denied, promptStringPresent: true, marketing: .granted,
                                        marketingRefused: false, repromptDue: true)
        XCTAssertTrue(ConsentTrackingRequest.afterConsent.shouldAsk(at: .afterPrompt, due))
        XCTAssertTrue(ConsentTrackingRequest.beforeConsent.shouldAsk(at: .beforePrompt, due))
        XCTAssertFalse(ConsentTrackingRequest.manual.shouldAsk(at: .afterPrompt, due))
        var restricted = due; restricted.platform = .restricted
        XCTAssertFalse(ConsentTrackingRequest.afterConsent.shouldAsk(at: .afterPrompt, restricted))
        var refused = due; refused.marketingRefused = true
        XCTAssertFalse(ConsentTrackingRequest.afterConsent.shouldAsk(at: .afterPrompt, refused))
        var denied = due; denied.marketing = .denied
        XCTAssertFalse(ConsentTrackingRequest.afterConsent.shouldAsk(at: .afterPrompt, denied))
    }

    func testTheControllerRecordsTheTimeOfAFinalAnswer() async {
        let apple = Apple()
        XCTAssertNil(apple.log.lastAnswerAt)
        let answered = expectation(description: "answered")
        apple.controller.request { _ in answered.fulfill() }
        await fulfillment(of: [answered], timeout: 2)
        XCTAssertEqual(apple.log.lastAnswerAt, apple.clock)
    }

    // MARK: - IAB TCF

    func testTCFAcceptAllAsksAfterThePrompt() async throws {
        let apple = Apple()
        let prompt = attach(try await bootIAB(), apple)
        await until { prompt.presenter.presentationID != nil }
        XCTAssertTrue(prompt.presenter.iab)
        prompt.presenter.commit(.accept)
        await until { apple.asks == 1 }
    }

    func testTCFRejectAllNeverAsks() async throws {
        let apple = Apple()
        let prompt = attach(try await bootIAB(), apple)
        await until { prompt.presenter.presentationID != nil }
        prompt.presenter.commit(.reject)
        await until { !prompt.presenter.pending }
        await settle()
        XCTAssertEqual(apple.asks, 0)
    }

    func testTCFMarketingCategoryWithoutTheAdPurposesDoesNotAsk() async throws {
        let apple = Apple()
        let core = try await bootIAB()
        let prompt = attach(core, apple)
        await until { prompt.presenter.presentationID != nil }
        prompt.presenter.customize()
        prompt.presenter.setCategory(.marketing, true)
        // This list's vendors ask consent for 3 and 4 but not 2, so 3 and 4 decide marketing.
        prompt.presenter.edit(\.purposeConsents, id: 1, enabled: true)
        prompt.presenter.edit(\.purposeConsents, id: 3, enabled: true)
        prompt.presenter.commit(.save)
        await until { !prompt.presenter.pending }
        await settle()
        XCTAssertEqual(ConsentDecision(snapshot: core.snapshot(), category: .marketing), .granted)
        XCTAssertEqual(core.iabConsent()?.choices.purposeConsents, [1, 3])
        XCTAssertEqual(apple.asks, 0, "purpose 4 is refused")
        XCTAssertTrue(prompt.trackingInputs().marketingRefused)
    }

    func testTCFAdPurposesWithMarketingAsk() async throws {
        let apple = Apple()
        let core = try await bootIAB()
        let prompt = attach(core, apple)
        await until { prompt.presenter.presentationID != nil }
        prompt.presenter.customize()
        prompt.presenter.setCategory(.marketing, true)
        for purpose in [1, 3, 4] { prompt.presenter.edit(\.purposeConsents, id: purpose, enabled: true) }
        // Vendor 2 asks consent for 3 and 4, so someone could track.
        prompt.presenter.edit(\.vendorConsents, id: 2, enabled: true)
        prompt.presenter.commit(.save)
        await until { apple.asks == 1 }
    }

    func testTCFAdditionalInformationOpensTCFSettingsAndAsksAgainOnlyWithThePurposes() async throws {
        for keep in [true, false] {
            let apple = Apple()
            apple.additionalInformation = true
            apple.pausesLeft = 1
            let prompt = attach(try await bootIAB(), apple)
            await until { prompt.presenter.presentationID != nil }
            prompt.presenter.commit(.accept)
            await until { prompt.presenter.presentationID != nil && prompt.presenter.preferences }
            XCTAssertTrue(prompt.presenter.iab, "the TCF preferences open")
            XCTAssertEqual(apple.asks, 1)

            if !keep { prompt.presenter.edit(\.purposeConsents, id: 3, enabled: false) }
            prompt.presenter.commit(.save)
            await until { !prompt.presenter.pending }
            await settle()
            XCTAssertEqual(apple.asks, keep ? 2 : 1, keep ? "purposes kept: asked again" : "purpose 3 refused: not asked again")
        }
    }

    // MARK: - Final review round

    func testBeforeConsentTreatsAGPCRestrictionAsARefusalAtLaunch() async throws {
        let apple = Apple()
        let core = try await boot("notice-init.json")
        core.setOverrides(ConsentOverrides(country: nil, region: nil, language: "en", gpc: true))
        await core.waitUntilIdle()
        _ = core.dismissNotice()
        await core.waitUntilIdle()
        XCTAssertEqual(core.snapshot().promptRequirement.kind, .none, "no prompt owed")
        XCTAssertTrue(core.snapshot().restrictions[.marketing]?.contains(.gpc) == true)
        XCTAssertNil(core.snapshot().explicitChoice?.categories[.marketing], "no stored refusal")
        _ = attach(core, apple, order: .beforeConsent)
        await settle()
        XCTAssertEqual(apple.asks, 0, "opted out through GPC")
    }

    func testBeforeConsentAPauseBeforeThePromptAsksAgainAfterItOnlyWithMarketing() async throws {
        for granted in [true, false] {
            let apple = Apple()
            apple.additionalInformation = true
            apple.pausesLeft = 1
            let prompt = try await attached(apple, order: .beforeConsent)
            await until { prompt.presenter.presentationID != nil }
            XCTAssertEqual(apple.asks, 1, "asked before the prompt, and the person tapped Additional Information")
            prompt.presenter.commit(granted ? .accept : .reject)
            await until { !prompt.presenter.pending }
            await settle()
            XCTAssertEqual(apple.asks, granted ? 2 : 1, granted ? "asked again after the prompt" : "marketing refused")
        }
    }

    func testTCFPurposesWithEveryVendorRefusedDoesNotAsk() async throws {
        let apple = Apple()
        let core = try await bootIAB()
        let prompt = attach(core, apple)
        await until { prompt.presenter.presentationID != nil }
        prompt.presenter.customize()
        prompt.presenter.setCategory(.marketing, true)
        for purpose in [1, 3, 4] { prompt.presenter.edit(\.purposeConsents, id: purpose, enabled: true) }
        prompt.presenter.commit(.save)
        await until { !prompt.presenter.pending }
        await settle()
        XCTAssertEqual(core.iabConsent()?.choices.purposeConsents, [1, 3, 4])
        XCTAssertEqual(core.iabConsent()?.choices.vendorConsents, [])
        XCTAssertEqual(apple.asks, 0, "nobody could track")
        XCTAssertTrue(prompt.trackingInputs().marketingRefused)
    }

    func testTheIABAnswerIsComputedOncePerRevision() async throws {
        let core = try await bootIAB()
        XCTAssertEqual(core.save(.all).status, .committed)
        let before = C15tTrackingConsent.computations
        for _ in 0..<5 { _ = C15tTrackingConsent.iabMarketingConsented(core) }
        XCTAssertEqual(C15tTrackingConsent.computations - before, 1)
        XCTAssertEqual(C15tTrackingConsent.iabMarketingConsented(core), true)
    }

    func testTheStockUIOffersTheAdditionalInformationButtonAndADirectRequestDoesNot() async throws {
        let apple = Apple()
        apple.additionalInformation = true
        apple.pausesLeft = 0
        let prompt = try await attached(apple)
        prompt.presenter.commit(.accept)
        await until { apple.asks == 1 }
        XCTAssertEqual(apple.offeredButton, true, "the stock UI handles the tap")

        let direct = Apple()
        direct.additionalInformation = true
        direct.pausesLeft = 0
        let answered = expectation(description: "answered")
        direct.controller.request { _ in answered.fulfill() }
        await fulfillment(of: [answered], timeout: 2)
        XCTAssertEqual(direct.offeredButton, false, "nothing handles the tap, so no button")
    }

    // MARK: - Helpers

    private func attached(_ apple: Apple, order: ConsentTrackingRequest = .afterConsent) async throws -> ConsentPrompt {
        attach(try await boot(), apple, order: order)
    }

    private func attach(_ core: ConsentCore, _ apple: Apple, order: ConsentTrackingRequest = .afterConsent,
                        autoPresent: Bool = true, reprompt: ConsentTrackingReprompt = .never) -> ConsentPrompt {
        let prompt = ConsentPrompt(core: core, tracking: apple.controller, isActive: { apple.active },
                                   becameActive: apple.activations.eraseToAnyPublisher())
        prompt.attach(UUID(), active: true, autoPresent: autoPresent, trackingRequest: order, trackingReprompt: reprompt)
        return prompt
    }

    private func bootIAB() async throws -> ConsentCore {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let body = try String(contentsOf: root.appendingPathComponent("../examples/native/consent-demo/fixtures/iab-init.json"), encoding: .utf8)
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: InMemoryStore(),
            transport: HostedTransport(baseURL: URL(string: "https://fixture.invalid")!, client: AutoPresentTests.Peer(body)),
            iab: IABConfiguration(cmpId: 53, cmpVersion: 7, publisherCountryCode: "GB"), initRetry: .disabled))
        await core.waitUntilIdle()
        XCTAssertNotNil(core.iabPresentation(), "fixture should load an IAB list")
        return core
    }

    private func settle() async {
        for _ in 0..<5 { await Task.yield() }
        try? await Task.sleep(for: .milliseconds(20))
    }

    private func until(_ condition: @MainActor () -> Bool) async {
        for _ in 0..<500 {
            if condition() { return }
            try? await Task.sleep(for: .milliseconds(10))
        }
        XCTFail("Condition was not met")
    }

    private func boot(_ fixture: String = "category-init.json") async throws -> ConsentCore {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let body = try String(contentsOf: root.appendingPathComponent("../examples/native/consent-demo/fixtures/\(fixture)"), encoding: .utf8)
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: InMemoryStore(), transport: HostedTransport(baseURL: URL(string: "https://fixture.invalid")!,
                                                                                     client: AutoPresentTests.Peer(body)), initRetry: .disabled))
        await core.waitUntilIdle()
        return core
    }
}
