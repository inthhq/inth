// swift-tools-version:5.9
import PackageDescription

// The reviewer configuration and report can be tested without a simulator or SDK singleton.
let package = Package(
    name: "C15tDemoReviewSupport",
    platforms: [.macOS(.v13), .iOS("16.4")],
    targets: [
        .target(name: "C15tDemoReviewSupport", path: "Sources", exclude: ["consent-demo-app.swift", "consent-demo-entry.swift"], sources: ["iab-review-support.swift"]),
        .testTarget(name: "C15tDemoReviewSupportTests", dependencies: ["C15tDemoReviewSupport"], path: "Tests"),
    ]
)
