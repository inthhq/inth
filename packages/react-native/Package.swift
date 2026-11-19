// swift-tools-version:5.9
import Foundation
import PackageDescription

// InthReactNative is the React Native binding for the Inth consent core: the iOS
// TurboModule, the event pump, and the launch hook that starts the core before React
// Native initializes.
//
// This manifest serves React Native's CocoaPods-disabled path (`RCTUseSPM`, Expo's
// SPM mode). It is not the only way to integrate: the CocoaPods path uses
// ../InthReactNative.podspec, which builds the kernel from a generated copy in
// vendor/InthCore instead of this path dependency, because a pod cannot name a path in a
// `s.dependency` and nothing publishes the core. SwiftPM separates the core, Apple
// services and RN bridge; CocoaPods compiles generated native copies into one pod.
// Both sync scripts run at pack time and artifact checks reject source drift.
//
// Two facts shape the layout:
//
// 1. The consent core is a pure Swift package with no React Native in it, per
//    packages/native-protocol/CONTRACT.md. It is a path dependency at ../swift, and this
//    package adds nothing to it beyond the `Inth` install point the bridge needs.
// 2. The TurboModule cannot compile without React Native's headers and the Codegen
//    artifacts that `pod install` (or SPM sync) generates for the host app. Those
//    exist only inside an app build, so `swift build` on this manifest alone compiles
//    the React-free half, which is where every wire-format decision lives.
//
// Environment switches, all optional:
//
//   INTH_SPM_INCLUDE_RN=1   Also build the React-linked target. Needs a host app that
//                           vends React's headers and the generated `NativeInthSpec`
//                           protocol. Without it the product is the bridge layer only.
//   INTH_CORE_PATH=<path>   Where packages/swift lives, when the checkout layout
//                           differs. Defaults to ../swift.
// Remote version/URL resolution is not supported until the native source package
// publishes both InthCore and InthApple. Use INTH_CORE_PATH for private source builds.
let env = ProcessInfo.processInfo.environment

let corePath = env["INTH_CORE_PATH"] ?? "../swift"
let includeReact = env["INTH_SPM_INCLUDE_RN"] == "1"

if env["INTH_CORE_VERSION"] != nil || env["INTH_CORE_URL"] != nil {
    fatalError("INTH_CORE_VERSION and INTH_CORE_URL are unsupported: no remote InthCore/InthApple source package is published. Unset them and use INTH_CORE_PATH for private source builds.")
}

let coreDependency: [Package.Dependency] = [.package(name: "InthCore", path: corePath)]
let coreProduct = Target.Dependency.product(name: "InthCore", package: "InthCore")
let appleProduct = Target.Dependency.product(name: "InthApple", package: "InthCore")

var targets: [Target] = [
    // The wire boundary: encoders, decoders, the event pump, and the launch
    // configuration. No `React` import anywhere in here, which is what lets it be
    // compiled and tested outside an app build.
    .target(
        name: "InthReactNativeBridge",
        dependencies: [coreProduct, appleProduct],
        path: "ios/InthReactNative",
        exclude: ["ReactNative"],
        sources: ["Bridge"],
        resources: [.copy("Resources/Privacy.xcprivacy")]
    ),
]

var products: [Product] = [
    .library(name: "InthReactNativeBridge", targets: ["InthReactNativeBridge"])
]

if includeReact {
    targets.append(
        // The TurboModule itself: the Codegen spec conformance, the ObjC export shim,
        // and the hook that starts the core before React Native initializes.
        .target(
            name: "InthReactNative",
            dependencies: ["InthReactNativeBridge", coreProduct, appleProduct, .product(name: "InthConsentUI", package: "InthCore")],
            path: "ios/InthReactNative",
            exclude: ["Bridge", "Resources"],
            sources: ["ReactNative"]
        )
    )
    products.append(
        .library(name: "InthReactNative", targets: ["InthReactNative"])
    )
}

targets.append(
    .testTarget(
        name: "InthReactNativeTests",
        dependencies: ["InthReactNativeBridge", coreProduct],
        path: "ios/Tests/InthReactNativeTests"
    )
)

let package = Package(
    name: "InthReactNative",
    platforms: [
        .iOS("16.4"),
        .macOS(.v13),
    ],
    products: products,
    dependencies: coreDependency,
    targets: targets,
    cxxLanguageStandard: .cxx20
)
