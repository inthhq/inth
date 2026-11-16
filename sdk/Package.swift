// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "c15t",
    platforms: [
        .macOS(.v13),
        .iOS("16.4"),
        .tvOS("16.4"),
        .watchOS("9.3"),
    ],
    products: [
        .library(name: "C15tCore", targets: ["C15tCore"]),
        .library(name: "C15tApple", targets: ["C15tApple"]),
        .library(name: "C15tConsentUI", targets: ["C15tConsentUI"]),
    ],
    targets: [
        .target(
            name: "C15tCore",
            path: "native/core-swift/Sources/C15tCore",
            resources: [.copy("Resources/PrivacyInfo.xcprivacy")]
        ),
        .target(
            name: "C15tApple",
            dependencies: ["C15tCore"],
            path: "native/core-swift/Sources/C15tApple"
        ),
        .target(
            name: "C15tConsentUI",
            dependencies: ["C15tCore", "C15tApple"],
            path: "native/core-swift/Sources/C15tConsentUI"
        ),
        .testTarget(
            name: "C15tCoreTests",
            dependencies: ["C15tCore"],
            path: "native/core-swift/Tests/C15tCoreTests"
        ),
        .testTarget(
            name: "C15tAppleTests",
            dependencies: ["C15tApple", "C15tCore"],
            path: "native/core-swift/Tests/C15tAppleTests"
        ),
        .testTarget(
            name: "C15tConsentUITests",
            dependencies: ["C15tConsentUI", "C15tCore", "C15tApple"],
            path: "native/core-swift/Tests/C15tConsentUITests"
        ),
    ]
)
