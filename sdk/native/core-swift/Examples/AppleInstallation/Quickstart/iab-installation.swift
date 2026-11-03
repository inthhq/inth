// #region docs:swift-iab-config title="InstallIABConsent.swift"
import C15tApple
import C15tCore
import Foundation

func installIABConsent(
    backendURL: URL,
    cmpID: Int,
    cmpVersion: Int,
    publisherCountryCode: String
) throws -> ConsentCore {
    let platform = C15tAppleConfiguration(transport: .hosted(backendURL))
    return try C15tApple.install(CoreConfig(
        store: try platform.storage.makeStore(),
        transport: try platform.makeTransport(),
        iab: IABConfiguration(
            cmpId: cmpID,
            cmpVersion: cmpVersion,
            publisherCountryCode: publisherCountryCode
        ),
        storageBus: UserDefaultsStorageBus()
    ))
}
// #endregion docs:swift-iab-config
