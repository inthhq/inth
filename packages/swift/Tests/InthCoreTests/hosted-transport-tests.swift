@_spi(InthInternal) @testable import InthCore
import Foundation
import XCTest

/// The `property` the hosted transport puts on each consent record.
final class HostedTransportTests: XCTestCase {
    func testPropertyIsLowercaseAndFallsBackToTheProjectHost() {
        let endpoint = URL(string: "https://consent.example.com")!
        XCTAssertEqual(HostedTransport(baseURL: URL(string: "https://Consent.Example.com")!).property, "consent.example.com")
        XCTAssertEqual(HostedTransport(baseURL: endpoint, property: "Com.Example.App").property, "com.example.app")
    }
}
