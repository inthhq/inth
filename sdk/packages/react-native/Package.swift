// swift-tools-version:5.9
import Foundation
import PackageDescription

// C15tReactNative is the React Native binding for the c15t consent core: the iOS
// TurboModule, the event pump, and the launch hook that starts the core before React
// Native initializes.
//
// This manifest serves React Native's CocoaPods-disabled path (`RCTUseSPM`, Expo's
// SPM mode). It is not the only way to integrate: the CocoaPods path uses
// ../C15tReactNative.podspec, which builds the kernel from a generated copy in
// vendor/C15tCore instead of this path dependency, because a pod cannot name a path in a
// `s.dependency` and nothing publishes the core. SwiftPM separates the core, Apple
// services and RN bridge; CocoaPods compiles generated native copies into one pod.
// Both sync scripts run at pack time and artifact checks reject source drift.
//
// Two facts shape the layout:
//
// 1. The consent core is a pure Swift package with no React Native in it, per
//    native/CONTRACT.md. It is a path dependency at ../../native/core-swift, and this
//    package adds nothing to it beyond the `C15t` install point the bridge needs.
// 2. The TurboModule cannot compile without React Native's headers and the Codegen
//    artifacts that `pod install` (or SPM sync) generates for the host app. Those
//    exist only inside an app build, so `swift build` on this manifest alone compiles
//    the React-free half, which is where every wire-format decision lives.
//
// Environment switches, all optional:
//
//   C15T_SPM_INCLUDE_RN=1   Also build the React-linked target. Needs a host app that
//                           vends React's headers and the generated `NativeC15tSpec`
//                           protocol. Without it the product is the bridge layer only.
//   C15T_CORE_PATH=<path>   Where native/core-swift lives, when the checkout layout
//                           differs. Defaults to ../../native/core-swift.
// Remote version/URL resolution is not supported until the native source package
// publishes both C15tCore and C15tApple. Use C15T_CORE_PATH for private source builds.
let env = ProcessInfo.processInfo.environment

let corePath = env["C15T_CORE_PATH"] ?? "../../native/core-swift"
let includeReact = env["C15T_SPM_INCLUDE_RN"] == "1"

if env["C15T_CORE_VERSION"] != nil || env["C15T_CORE_URL"] != nil {
    fatalError("C15T_CORE_VERSION and C15T_CORE_URL are unsupported: no remote C15tCore/C15tApple source package is published. Unset them and use C15T_CORE_PATH for private source builds.")
}

let coreDependency: [Package.Dependency] = [.package(name: "C15tCore", path: corePath)]
let coreProduct = Target.Dependency.product(name: "C15tCore", package: "C15tCore")
let appleProduct = Target.Dependency.product(name: "C15tApple", package: "C15tCore")

var targets: [Target] = [
    // The wire boundary: encoders, decoders, the event pump, and the launch
    // configuration. No `React` import anywhere in here, which is what lets it be
    // compiled and tested outside an app build.
    .target(
        name: "C15tReactNativeBridge",
        dependencies: [coreProduct, appleProduct],
        path: "ios/C15tReactNative",
        exclude: ["ReactNative"],
        sources: ["Bridge"],
        resources: [.copy("Resources/Privacy.xcprivacy")]
    ),
]

var products: [Product] = [
    .library(name: "C15tReactNativeBridge", targets: ["C15tReactNativeBridge"])
]

if includeReact {
    targets.append(
        // The TurboModule itself: the Codegen spec conformance, the ObjC export shim,
        // and the hook that starts the core before React Native initializes.
        .target(
            name: "C15tReactNative",
            dependencies: ["C15tReactNativeBridge", coreProduct, appleProduct],
            path: "ios/C15tReactNative",
            exclude: ["Bridge", "Resources"],
            sources: ["ReactNative"]
        )
    )
    products.append(
        .library(name: "C15tReactNative", targets: ["C15tReactNative"])
    )
}

targets.append(
    .testTarget(
        name: "C15tReactNativeTests",
        dependencies: ["C15tReactNativeBridge", coreProduct],
        path: "ios/Tests/C15tReactNativeTests"
    )
)

let package = Package(
    name: "C15tReactNative",
    platforms: [
        .iOS("16.4"),
        .macOS(.v13),
    ],
    products: products,
    dependencies: coreDependency,
    targets: targets,
    cxxLanguageStandard: .cxx20
)
