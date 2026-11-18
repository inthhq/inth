#if canImport(ObjectiveC)
import Foundation
import ObjectiveC.runtime
import XCTest
@_spi(InthInternal) @testable import InthApple

/// The expanded request reaches a class method by the released selector, with its arguments in
/// Apple's order. Each test registers a class under its own name, so no fake `ATTrackingManager`
/// exists and `testTheExpandedRequestIsNotClaimedOnASystemThatDoesNotHaveIt` stays true.
final class ExpandedRequestDispatchTests: XCTestCase {
    /// What the stand-in saw, and what reached the caller.
    final class Recorder: @unchecked Sendable {
        var preferExpandedInterface: Bool?
        var events: [String] = []
    }

    private typealias Completion = @convention(block) (Int) -> Void
    private typealias Action = @convention(block) () -> Void
    private typealias Request = @convention(block) (AnyObject, ObjCBool, Action, Completion) -> Void

    /// A class answering the released class-method selector, as `ATTrackingManager` does on 27.2.
    private func makeManager(_ recorder: Recorder) throws -> AnyClass {
        let name = "InthTestTrackingManager\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))"
        let manager: AnyClass = try XCTUnwrap(objc_allocateClassPair(NSObject.self, name, 0)) as AnyClass
        let request: Request = { _, prefer, additionalInformation, completion in
            recorder.preferExpandedInterface = prefer.boolValue
            additionalInformation()
            completion(InthTrackingPlatformStatus.notDetermined.rawValue)
        }
        let added = class_addMethod(try XCTUnwrap(object_getClass(manager)), InthTracking.expandedRequestSelector,
                                    imp_implementationWithBlock(request), "v@:B@?@?")
        XCTAssertTrue(added)
        objc_registerClassPair(manager)
        return manager
    }

    /// A class answering the selector with the wrong number of arguments.
    private func makeWrongArityManager(_ recorder: Recorder) throws -> AnyClass {
        let name = "InthTestWrongArityManager\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))"
        let manager: AnyClass = try XCTUnwrap(objc_allocateClassPair(NSObject.self, name, 0))
        let request: @convention(block) (AnyObject, ObjCBool) -> Void = { _, _ in recorder.events.append("called") }
        let added = class_addMethod(try XCTUnwrap(object_getClass(manager)), InthTracking.expandedRequestSelector,
                                    imp_implementationWithBlock(request), "v@:B")
        XCTAssertTrue(added)
        objc_registerClassPair(manager)
        return manager
    }

    /// With no handler, the action reaches Apple as a nil block, so its sheet shows no button.
    func testNoHandlerPassesANilAction() throws {
        let name = "InthTestNilActionManager\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))"
        let manager: AnyClass = try XCTUnwrap(objc_allocateClassPair(NSObject.self, name, 0)) as AnyClass
        let recorder = Recorder()
        let request: @convention(block) (AnyObject, ObjCBool, Action?, Completion) -> Void = { _, _, action, completion in
            recorder.events.append(action == nil ? "no-action" : "action")
            completion(InthTrackingPlatformStatus.denied.rawValue)
        }
        XCTAssertTrue(class_addMethod(try XCTUnwrap(object_getClass(manager)), InthTracking.expandedRequestSelector,
                                      imp_implementationWithBlock(request), "v@:B@?@?"))
        objc_registerClassPair(manager)
        let done = expectation(description: "completion")
        XCTAssertTrue(InthTracking.requestExpandedPrompt(
            on: manager, preferExpandedInterface: true, additionalInformationSelected: nil,
            completion: { _ in done.fulfill() }))
        wait(for: [done], timeout: 2)
        XCTAssertEqual(recorder.events, ["no-action"])
    }

    func testAMethodWithTheWrongShapeIsNotCalled() throws {
        let recorder = Recorder()
        let manager = try makeWrongArityManager(recorder)
        let made = InthTracking.requestExpandedPrompt(
            on: manager, preferExpandedInterface: true,
            additionalInformationSelected: { recorder.events.append("additional-information") },
            completion: { _ in recorder.events.append("completion") })
        XCTAssertFalse(made, "the caller falls back to the plain request")
        let drained = expectation(description: "main queue")
        DispatchQueue.main.async { drained.fulfill() }
        wait(for: [drained], timeout: 2)
        XCTAssertEqual(recorder.events, [], "nothing was called through the wrong cast")
    }

    func testTheReleasedClassMethodIsCalledWithItsArgumentsInOrder() throws {
        for prefer in [true, false] {
            let recorder = Recorder()
            let manager = try makeManager(recorder)
            XCTAssertTrue(InthTracking.expandedInterfaceAvailable(on: manager))

            let done = expectation(description: "completion")
            let made = InthTracking.requestExpandedPrompt(
                on: manager,
                preferExpandedInterface: prefer,
                additionalInformationSelected: { recorder.events.append("additional-information") },
                completion: { status in
                    recorder.events.append("completion:\(status.map { String($0.rawValue) } ?? "nil")")
                    done.fulfill()
                }
            )
            XCTAssertTrue(made, "the call is made on a runtime that has the method")
            wait(for: [done], timeout: 2)
            XCTAssertEqual(recorder.preferExpandedInterface, prefer, "preferExpandedInterface arrives first")
            XCTAssertEqual(recorder.events, ["additional-information", "completion:0"],
                           "the action block, then the completion block, in Apple's order")
        }
    }
}
#endif
