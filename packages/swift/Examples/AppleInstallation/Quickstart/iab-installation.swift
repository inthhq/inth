// #region docs:swift-iab-config title="InstallIABConsent.swift"
import C15tApple
import C15tCore
import Foundation

func installIABConsent(
    backendURL: String,
    cmpID: Int,
    cmpVersion: Int,
    publisherCountryCode: String
) throws -> ConsentCore {
    try C15tApple.install(C15tAppleConfiguration(
        backendURL: backendURL,
        iab: IABConfiguration(
            cmpId: cmpID,
            cmpVersion: cmpVersion,
            publisherCountryCode: publisherCountryCode
        )
    ))
}
// #endregion docs:swift-iab-config
