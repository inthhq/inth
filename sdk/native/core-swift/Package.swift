// swift-tools-version:5.9
import PackageDescription

// C15tCore is the native consent kernel for mobile. It owns consent state and
// depends on nothing outside the OS: no UIKit, no AppKit, no React Native, no
// Expo. That keeps the same binary usable from an app extension, a Command Line
// Tools build, and a `swift test` run on macOS.
let package = Package(
    name: "C15tCore",
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
        .executable(name: "C15tCoreBench", targets: ["C15tCoreBench"]),
    ],
    targets: [
        .target(name: "C15tCore", resources: [.copy("Resources/PrivacyInfo.xcprivacy")]),
        .target(name: "C15tApple", dependencies: ["C15tCore"]),
        .target(name: "C15tConsentUI", dependencies: ["C15tCore", "C15tApple"]),
        .testTarget(name: "C15tConsentUITests", dependencies: ["C15tConsentUI", "C15tCore", "C15tApple"]),
        .testTarget(name: "C15tAppleTests", dependencies: ["C15tApple", "C15tCore"]),
        .executableTarget(name: "C15tCoreBench", dependencies: ["C15tCore"]),
        .testTarget(name: "C15tCoreTests", dependencies: ["C15tCore"]),
    ]
)
