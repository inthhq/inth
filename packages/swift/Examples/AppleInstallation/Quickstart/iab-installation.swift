// #region docs:swift-iab-config title="InstallIABConsent.swift"
import InthApple
import InthCore
import Foundation

func installIABConsent(
    backendURL: String,
    cmpID: Int,
    cmpVersion: Int,
    publisherCountryCode: String
) throws -> ConsentCore {
    try InthApple.install(InthAppleConfiguration(
        backendURL: backendURL,
        iab: IABConfiguration(
            cmpId: cmpID,
            cmpVersion: cmpVersion,
            publisherCountryCode: publisherCountryCode
        )
    ))
}
// #endregion docs:swift-iab-config
