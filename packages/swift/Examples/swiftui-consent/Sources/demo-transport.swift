@_spi(InthInternal) import InthCore
import Foundation

/// Local sample policy. Saves stay queued; this transport never claims remote delivery.
/// Transports are internal API, used here so the demo runs with no backend.
struct DemoTransport: InthTransport {
    let domain = "swiftui-consent-demo"
    var unavailable = false

    func performInit(_ context: InitContext) async -> Result<InitResponse, InthError> {
        if unavailable { return .failure(.offline) }
        do {
            let policy = try JSONDecoder().decode(JSONValue.self, from: Data(Self.policy.utf8))
            return .success(InitResponse(policyResolution: policy))
        } catch {
            return .failure(.invalidPayload("The sample policy could not be decoded."))
        }
    }

    func sendSave(_ body: Data) async -> Result<Void, InthError> { .failure(.offline) }
    func patchIdentity(subjectId: String, externalId: String, identityProvider: String?) async -> Result<Void, InthError> {
        .failure(.offline)
    }

    private static let policy = """
    {
      "version": 1, "status": "matched", "policyId": "swiftui-demo", "matchedBy": "country",
      "fingerprints": {
        "policy": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        "choice": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "notice": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      },
      "policy": {
        "id": "swiftui-demo", "model": "opt-in", "prompt": "choice",
        "scope": ["measurement"], "scopeMode": "strict", "preselectedCategories": [],
        "actions": {"allowed": ["accept", "customize", "reject"], "required": ["accept", "reject"], "equivalent": [["accept", "reject"]]},
        "rights": ["disclosure", "preferences"],
        "validity": {"choiceMs": 31536000000, "noticeMs": 31536000000},
        "privacySignals": {"gpc": {"denyCategories": []}},
        "proof": {"storeIp": false, "storeUserAgent": false, "storeLanguage": true},
        "copyRevision": null
      }
    }
    """
}
