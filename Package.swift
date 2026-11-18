// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "inth",
    platforms: [
        .macOS(.v13),
        .iOS("16.4"),
        .tvOS("16.4"),
        .watchOS("9.3"),
    ],
    products: [
        .library(name: "InthCore", targets: ["InthCore"]),
        .library(name: "InthApple", targets: ["InthApple"]),
        .library(name: "InthConsentUI", targets: ["InthConsentUI"]),
    ],
    targets: [
        .target(
            name: "InthCore",
            path: "packages/swift/Sources/InthCore",
            resources: [.copy("Resources/PrivacyInfo.xcprivacy")]
        ),
        .target(
            name: "InthApple",
            dependencies: ["InthCore"],
            path: "packages/swift/Sources/InthApple"
        ),
        .target(
            name: "InthConsentUI",
            dependencies: ["InthCore", "InthApple"],
            path: "packages/swift/Sources/InthConsentUI"
        ),
        .testTarget(
            name: "InthCoreTests",
            dependencies: ["InthCore"],
            path: "packages/swift/Tests/InthCoreTests"
        ),
        .testTarget(
            name: "InthAppleTests",
            dependencies: ["InthApple", "InthCore"],
            path: "packages/swift/Tests/InthAppleTests"
        ),
        .testTarget(
            name: "InthConsentUITests",
            dependencies: ["InthConsentUI", "InthCore", "InthApple"],
            path: "packages/swift/Tests/InthConsentUITests"
        ),
    ]
)
