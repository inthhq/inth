import Foundation

/// When this SDK last saw Apple's tracking answer.
///
/// Apple keeps its own date and decides whether an answered request may be shown again
/// (in the European Union, a year after the previous answer) and exposes no query for it.
/// This log is only the SDK's lower bound for that date: the time it last delivered an
/// `authorized` or `denied` answer, which is never earlier than when the person answered.
/// The yearly re-ask waits a year from here before it calls the request, and Apple then
/// either prompts or returns the stored answer at once.
public final class InthTrackingAnswerLog: @unchecked Sendable {
    private let lock = NSLock()
    private let read: () -> Date?
    private let write: (Date) -> Void

    /// - Parameters:
    ///   - read: The stored time, or `nil` when none is stored.
    ///   - write: Store a time.
    public init(read: @escaping () -> Date?, write: @escaping (Date) -> Void) {
        self.read = read
        self.write = write
    }

    /// The log in `UserDefaults`, under one Inth key.
    public static func userDefaults(_ defaults: UserDefaults = .standard,
                                    key: String = "com.inth.tracking.lastAnswerAt") -> InthTrackingAnswerLog {
        InthTrackingAnswerLog(
            read: { defaults.object(forKey: key) as? Date },
            write: { defaults.set($0, forKey: key) }
        )
    }

    /// A log that lives only as long as the process, for tests and previews.
    public static func inMemory(_ initial: Date? = nil) -> InthTrackingAnswerLog {
        let box = Box(initial)
        return InthTrackingAnswerLog(read: { box.value }, write: { box.value = $0 })
    }

    /// The stored time, or `nil`.
    public var lastAnswerAt: Date? { lock.withLock { read() } }

    /// Store `date` as the time of the last answer.
    public func record(_ date: Date) { lock.withLock { write(date) } }

    private final class Box: @unchecked Sendable {
        var value: Date?
        init(_ value: Date?) { self.value = value }
    }
}
