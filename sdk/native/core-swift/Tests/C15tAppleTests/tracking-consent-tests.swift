import Foundation
import XCTest
@testable import C15tApple

/// The IAB half of the ATT gate, from the fixture the web derivation also runs, and the
/// controller's answer-log and Additional Information rules.
final class TrackingConsentTests: XCTestCase {
    private struct Fixture: Decodable {
        struct Case: Decodable {
            struct Expected: Decodable { let purposes: Bool; let marketing: Bool }
            let name: String
            let purposeConsents: [Int]
            let vendors: [String: [Int]]
            let vendorConsents: [Int]
            let adTechProvidersListed: Bool
            let adTechProviderConsents: [Int]
            let expected: Expected
        }
        let cases: [Case]
    }

    func testTheSharedFixture() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let data = try Data(contentsOf: root.appendingPathComponent("protocol/att/iab-marketing.json"))
        let fixture = try JSONDecoder().decode(Fixture.self, from: data)
        XCTAssertFalse(fixture.cases.isEmpty)
        for item in fixture.cases {
            let input = C15tTrackingConsent.IABInput(
                purposeConsents: Set(item.purposeConsents),
                vendorConsentPurposes: Dictionary(uniqueKeysWithValues: item.vendors.map { (Int($0.key)!, Set($0.value)) }),
                vendorConsents: Set(item.vendorConsents),
                adTechProvidersListed: item.adTechProvidersListed,
                adTechProviderConsents: Set(item.adTechProviderConsents))
            XCTAssertEqual(C15tTrackingConsent.iabMarketingPurposesConsented(input), item.expected.purposes, item.name)
            XCTAssertEqual(C15tTrackingConsent.iabMarketingConsented(input), item.expected.marketing, item.name)
        }
    }

    // MARK: - The controller

    /// A controller over a settable Apple status, answering `answer`, with an in-memory log.
    private final class Apple: @unchecked Sendable {
        var status: C15tTrackingPlatformStatus? = .notDetermined
        var answer: C15tTrackingPlatformStatus = .authorized
        var clock = Date(timeIntervalSince1970: 1_800_000_000)
        var expanded = false
        var offeredButton: Bool?
        let log = C15tTrackingAnswerLog.inMemory()

        var controller: C15tTrackingController {
            C15tTrackingController(
                trackingPlatformStatus: { self.status },
                trackingPromptStringPresent: { true },
                trackingPrompt: { completion in
                    self.status = self.answer
                    completion(self.answer)
                },
                trackingExpandedInterfaceAvailable: { self.expanded },
                trackingExpandedPrompt: { _, action, completion in
                    self.offeredButton = action != nil
                    self.status = self.answer
                    completion(self.answer)
                    return true
                },
                answerLog: log,
                now: { self.clock })
        }

        func ask() {
            let done = DispatchSemaphore(value: 0)
            controller.request { _ in done.signal() }
            done.wait()
        }
    }

    func testAFirstAnswerIsStamped() {
        let apple = Apple()
        apple.ask()
        XCTAssertEqual(apple.log.lastAnswerAt, apple.clock)
    }

    func testAReaskThatReturnsTheSameAnswerKeepsTheOldStamp() {
        let apple = Apple()
        apple.status = .authorized
        let old = apple.clock.addingTimeInterval(-366 * 24 * 60 * 60)
        apple.log.record(old)
        apple.ask()
        XCTAssertEqual(apple.log.lastAnswerAt, old, "a silent return must not restart the year")
    }

    func testAReaskThatChangesTheAnswerIsStamped() {
        let apple = Apple()
        apple.status = .authorized
        apple.answer = .denied
        apple.log.record(apple.clock.addingTimeInterval(-366 * 24 * 60 * 60))
        apple.ask()
        XCTAssertEqual(apple.log.lastAnswerAt, apple.clock)
    }

    func testNoHandlerMeansNoAdditionalInformationButton() {
        let apple = Apple()
        apple.expanded = true
        apple.ask()
        XCTAssertEqual(apple.offeredButton, false)

        let handled = Apple()
        handled.expanded = true
        let done = DispatchSemaphore(value: 0)
        handled.controller.request(onAdditionalInformation: {}) { _ in done.signal() }
        done.wait()
        XCTAssertEqual(handled.offeredButton, true)
    }
}
