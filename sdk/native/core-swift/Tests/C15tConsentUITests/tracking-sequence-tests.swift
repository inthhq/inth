import C15tApple
import C15tCore
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
        let activations = PassthroughSubject<Void, Never>()

        var controller: C15tTrackingController {
            C15tTrackingController(
                trackingPlatformStatus: { self.status },
                trackingPromptStringPresent: { self.promptString },
                trackingPrompt: { completion in
                    self.asks += 1
                    self.status = self.answer
                    completion(self.answer)
                },
                trackingExpandedInterfaceAvailable: { self.additionalInformation },
                trackingExpandedPrompt: { _, info, completion in
                    self.asks += 1
                    info()
                    completion(.notDetermined)
                    return true
                }
            )
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
            XCTAssertEqual(order.shouldAsk(at: stage, platform: platform, promptStringPresent: string, marketing: marketing),
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

    // MARK: - Helpers

    private func attached(_ apple: Apple, order: ConsentTrackingRequest = .afterConsent) async throws -> ConsentPrompt {
        attach(try await boot(), apple, order: order)
    }

    private func attach(_ core: ConsentCore, _ apple: Apple, order: ConsentTrackingRequest = .afterConsent,
                        autoPresent: Bool = true) -> ConsentPrompt {
        let prompt = ConsentPrompt(core: core, tracking: apple.controller, isActive: { apple.active },
                                   becameActive: apple.activations.eraseToAnyPublisher())
        prompt.attach(UUID(), active: true, autoPresent: autoPresent, trackingRequest: order)
        return prompt
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

    private func boot() async throws -> ConsentCore {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let body = try String(contentsOf: root.appendingPathComponent("examples/consent-demo/fixtures/category-init.json"), encoding: .utf8)
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: InMemoryStore(), transport: HostedTransport(baseURL: URL(string: "https://fixture.invalid")!,
                                                                                     client: AutoPresentTests.Peer(body)), initRetry: .disabled))
        await core.waitUntilIdle()
        return core
    }
}
