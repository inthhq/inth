// swift-tools-version:5.9
import PackageDescription

// InthCore is the native consent kernel for mobile. It owns consent state and
// depends on nothing outside the OS: no UIKit, no AppKit, no React Native, no
// Expo. That keeps the same binary usable from an app extension, a Command Line
// Tools build, and a `swift test` run on macOS.
let package = Package(
    name: "InthCore",
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
        .executable(name: "InthCoreBench", targets: ["InthCoreBench"]),
    ],
    targets: [
        .target(name: "InthCore", resources: [.copy("Resources/PrivacyInfo.xcprivacy")]),
        .target(name: "InthApple", dependencies: ["InthCore"]),
        .target(name: "InthConsentUI", dependencies: ["InthCore", "InthApple"]),
        .testTarget(name: "InthConsentUITests", dependencies: ["InthConsentUI", "InthCore", "InthApple"]),
        .testTarget(name: "InthAppleTests", dependencies: ["InthApple", "InthCore"]),
        .executableTarget(name: "InthCoreBench", dependencies: ["InthCore"]),
        .testTarget(name: "InthCoreTests", dependencies: ["InthCore"]),
    ]
)
