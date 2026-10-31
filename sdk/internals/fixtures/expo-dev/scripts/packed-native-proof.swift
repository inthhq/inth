import C15tReactNative
import Foundation

private enum PackedNativeProof {
  static var timer: DispatchSourceTimer?
  static func start() {
    let source = DispatchSource.makeTimerSource(queue: DispatchQueue(label: "packed.fixture.native-proof"))
    source.schedule(deadline: .now(), repeating: .milliseconds(250))
    source.setEventHandler {
      guard let snapshot = try? JSONSerialization.jsonObject(with: Data(C15tPayload.snapshot(C15t.snapshot()).utf8)) else { return }
      let gates = ["necessary": C15t.isAllowed(.necessary), "functionality": C15t.isAllowed(.functionality), "experience": C15t.isAllowed(.experience), "measurement": C15t.isAllowed(.measurement), "marketing": C15t.isAllowed(.marketing)]
      let body: [String: Any] = ["snapshot": snapshot, "gates": gates, "process": ProcessInfo.processInfo.processIdentifier, "source": "installed-native-core"]
      let data = try! JSONSerialization.data(withJSONObject: body, options: .sortedKeys)
      let url = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("packed-native-proof.jsonl")
      if !FileManager.default.fileExists(atPath: url.path) { FileManager.default.createFile(atPath: url.path, contents: nil) }
      let file = try! FileHandle(forWritingTo: url)
      try! file.seekToEnd(); try! file.write(contentsOf: data); try! file.write(contentsOf: Data([10])); try! file.close()
    }
    source.resume(); timer = source
  }
}
