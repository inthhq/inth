// swift-tools-version:5.9
import PackageDescription

// The reviewer configuration and report can be tested without a simulator or SDK singleton.
let package = Package(
    name: "InthDemoReviewSupport",
    platforms: [.macOS(.v13), .iOS("16.4")],
    targets: [
        .target(name: "InthDemoReviewSupport", path: "Sources", exclude: ["consent-demo-app.swift", "consent-demo-entry.swift"], sources: ["iab-review-support.swift"]),
        .testTarget(name: "InthDemoReviewSupportTests", dependencies: ["InthDemoReviewSupport"], path: "Tests"),
    ]
)
