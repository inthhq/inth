# InthReactNative (iOS)

The iOS half of `@inth/react-native`: a Codegen TurboModule in Swift over the pure
Swift consent core at [`packages/swift`](../swift). New Architecture
only. Shared native SwiftUI presentation remains future work; see the maintained
private support contract in `docs/internal/mobile-support.md`.

## Layout

| Path | Module | Contents |
| --- | --- | --- |
| `InthReactNative/Bridge/` | none of React | wire encoders, the change pump, `Info.plist` configuration, the module handler, the two lifecycle observers below, and the tracking gate. Compiles and tests with no Pods installed. |
| `InthReactNative/ReactNative/` | React + `ReactCodegen` | the TurboModule: the Swift implementation, and the ObjC++ category carrying the Codegen conformance, the JavaScript name, and the `getTurboModule:` provider. Also the constructor that starts the core before React Native initializes. |
| `InthReactNative/Resources/Privacy.xcprivacy` | resource | privacy manifest, shipped in the pod resource bundle and the SPM resource bundle. |
| `Tests/InthReactNativeTests/` | test | 78 tests over the wire layer, the module handler, the lifecycle legs, and the tracking gate. |
| `InthReactNative.xcodeproj` | generated | iOS-slice build of the wire layer against the core, for CI without an example app. |
| `support/gen-xcodeproj.rb` | tooling | regenerates that project. |

The bridge attaches to the already-bootstrapped core through `Inth.install(_:)`. It
never constructs a second one, so `getBootstrap()` and `getSnapshot()` stay synchronous
reads of the snapshot the core hydrated from storage.

## The Codegen seam

`codegenConfig.name` is `InthSpec`, so Codegen writes the protocol into one umbrella
header, `ReactCodegen/InthSpec/InthSpec.h`, whose first directive refuses to compile as
plain Objective-C. No Swift file can name `NativeInthSpec`, so two things a normal
TurboModule gets from a macro are written by hand in `InthReactNativeModule.mm`:

- the `<NativeInthSpec>` conformance, because `RCTTurboModuleManager` only builds and
  sets up a module whose class conforms to `RCTTurboModule`, and
- `getTurboModule:`, because the generated `RCTModuleProviders` requires it before it
  keeps the instance, and it returns a `std::shared_ptr`, which has no Swift spelling.

`RCT_EXTERN_REMAP_MODULE` supplies neither, and cannot be used here at all: it expands
to a fresh `@interface InthReactNativeModule : RCTEventEmitter`, and the Swift generated
header already defines that class. The category answers `+moduleName` instead, which is
all the macro was needed for.

The Swift class stays the implementation, and states every Objective-C name explicitly
rather than trusting inference. Nothing at build time links those names to the generated
protocol -- the JSI glue looks each one up on the instance at call time -- so
`src/specs/__tests__/ios-spec-surface.test.ts` runs Codegen over
`src/specs/NativeInth.ts` and fails on any selector or argument type that disagrees. The
module also compares itself against `@protocol(NativeInthSpec)` once per process and
logs the difference, so drift is named in the console rather than arriving as an
unrecognized selector on the JavaScript thread.

Generation is not an app-side privilege. Both sides of that check come from one Node
script, `../android/codegen/generate-spec.mjs`, which is the same file the Android Gradle
build runs and the drift check spawns, so nothing here is graded against a second
implementation of generation:

```sh
# from packages/react-native/ios
node ../android/codegen/generate-spec.mjs --platform ios --output /tmp/inth-spec
```

That writes the generated `InthSpec/InthSpec.h` protocol and the `RCTModuleProviders` glue
straight from `codegenConfig`, so the header the hand-written category is held to is
readable on any machine holding Node and this package's `react-native` devDependency, Linux
included. That is where CI runs it, in the `Mobile SDK (android-js)` job. The expectations
themselves live in `src/specs/__tests__/spec-contract.ts`, shared with the Android check, so
both platforms are graded against one reading of the TypeScript.

`ios/support/` holding only `gen-xcodeproj.rb` is deliberate. The generator belongs to the
package, not to one platform, and three consumers have to reach one file.

## Startup order

`InthReactNativeRuntimeInitializer.mm` defines a class whose `+load` starts the core at
image load, which is before React Native initializes, so stored consent resolves from the
first JavaScript frame. It is a `+load` on a class rather than a bare
`__attribute__((constructor))` because the pod is a static archive: the linker drops an
archive member that neither is referenced nor defines an Objective-C class, and a file
holding only a constructor is neither. An app that owns its own setup sets
`com.inth.reactnative.AutoBootstrap` to `false` and calls
`InthReactNativeRuntime.install(core:)` with the core that
`InthApple.install(InthAppleConfiguration(backendURL:))` returned, or
`startCore()` (the `Info.plist` values, later) itself.

## Platform lifecycle

`packages/native-protocol/CONTRACT.md` names three moments when a stored answer can have gone stale with
nothing asking about it. The core sees only the first, inside `bootstrap`. The other two
need a hook on the process, which a consent kernel is not allowed to hold, so
`InthReactNativeBootstrap` arms them as soon as a core is in place, whichever call put it
there.

| Leg | Trigger | What runs |
| --- | --- | --- |
| Launch | `bootstrap` | hydrate, then replay the pending queue |
| Foreground | `UIApplication.didBecomeActiveNotification` | replay, then `refresh()` |
| Reachability | a network this process did not already have | replay, then `refresh()` |

Both callbacks hand their work to the core's own scheduler rather than running it inline,
so coming back to the app costs no frame on the main thread.

`InthReachabilityGate` decides which `NWPathMonitor` updates are gains: the path the
process started with seeds the gate and replays nothing, because that races the launch
replay, and a path that changes interface without dropping counts once. The gate holds no
`Network` types, which is what lets the rule be tested without a device and a link to
drop. Android's reachability leg can be refused by a missing host permission;
`NWPathMonitor` needs no entitlement or manifest key, so iOS has no declined branch.

Neither leg polls a clock. `InthReactNativeBootstrap.shutdown()` takes both back down for
a host that would rather drive `replayThenRefresh()` on its own schedule; the
core keeps its snapshot, queue, and event pump, and `start()` or `install(_:)` puts the
legs back.

## `Info.plist` keys

Read by `InthBridgeConfiguration.from(infoPlist:)`. Expo apps set these through
`app.json`'s `ios.infoPlist`.

| Key | Meaning |
| --- | --- |
| `com.inth.reactnative.AutoBootstrap` | `false` opts out of the pre-RN start. |
| `com.inth.backend.url` | The project URL from your Inth dashboard, such as `https://your-project.inth.app`. Required. Any other host is refused. |
| `com.inth.dryRun` | `true` drops consent records instead of queueing and sending them. Development and CI only: a release build refuses to start with it. In a debug build it also accepts any `https` URL, or `http` on `localhost`. |
| `com.inth.backend.property` | The `property` each consent record names. Defaults to the bundle identifier. Sent lowercase. |
| `com.inth.storage` | `keychain` (default) or `file`. |
| `com.inth.keychain.service` | Keychain service name, default `com.inth.core`. |
| `com.inth.country`, `com.inth.region`, `com.inth.language` | Override geo/locale detection. |
| `com.inth.categories` | Category ids the app declares. |
| `com.inth.forceGPC` | Report the Global Privacy Control signal. Detection only: it never becomes an override. |

A missing or refused `com.inth.backend.url`, or `com.inth.dryRun` in a release build,
leaves the core uninstalled. The console line starting with `Inth:` says why, and every
read answers deny-all.

Four keys are retired. The launch hook refuses to start a core from a plist that still
declares one, and the console names the key and what to do instead:

| Retired key | Instead |
| --- | --- |
| `com.inth.backend.mode` | Remove it. Hosted is the only mode. Mobile works only with Inth, so there is no self-hosted mode. Use `com.inth.dryRun` for development and CI in place of `offline` or `none`. To install Inth yourself, set `com.inth.reactnative.AutoBootstrap` to `false`. |
| `com.inth.backend.initUrl` | Remove it. Policy is fetched from `com.inth.backend.url`. |
| `com.inth.backend.domain` | Rename it to `com.inth.backend.property`. |
| `com.inth.test` | Remove it. There is no test-mode override. `com.inth.forceGPC` reports a Global Privacy Control signal. |

## Integrating

The pod carries the consent kernel. `InthReactNative.podspec` compiles it from
`vendor/InthCore`, a generated copy of `packages/swift/Sources/InthCore`, so an app
that installs `@inth/react-native` from npm resolves everything it needs from the package
and names no second pod. It used to declare `s.dependency "InthCore"`, which only resolved
inside this repository, because the example Podfiles point that pod at a directory next to
the app; a pod cannot point `s.dependency` at a path, and no `InthCore` pod is published,
so an installed app had no kernel to build.

```ruby
# Podfile, for an app installed from npm. Nothing else to add.
# Autolinking finds the podspec through react-native.config.js.
platform :ios, '16.4' # above RN 0.87's own floor
```

Host Swift code in a CocoaPods RN app imports `InthReactNative` and installs through
the `InthApple` types compiled into that module. Do not add a separate `InthCore`
pod or SwiftPM product: it creates another installation singleton and Keychain
owner. See `docs/internal/apple-installation.md` and its CocoaPods host example.

The workspace SPM manifest keeps core and Apple services as separate products from
the same local source package. Only the CocoaPods path compiles the generated
copies into the binding's module. The npm tarball does not ship this workspace
SPM manifest. Remote version/URL resolution is explicitly refused until a native
package containing both products is published.

```sh
# SPM: private source checkout when the default repo-relative path differs
INTH_CORE_PATH=/absolute/path/to/packages/swift swift build --package-path packages/react-native
# Also build the React-linked target (needs a host app vending React's headers)
INTH_SPM_INCLUDE_RN=1 swift build --package-path packages/react-native
```

## Verifying locally

Xcode 27 is installed but `xcode-select` may still point at Command Line Tools, whose
SwiftPM cannot build an iOS slice. Export the developer directory instead of switching
it with `sudo`:

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
swift build --package-path packages/react-native
swift test  --package-path packages/react-native
cd packages/react-native/ios \
  && xcodebuild -project InthReactNative.xcodeproj -scheme InthReactNative \
       -destination 'generic/platform=iOS Simulator' build
```

The xcodeproj builds the wire layer and the core only. `ReactNative/` needs the
`NativeInthSpec` protocol Codegen generates into the host app's `ReactCodegen` pod, so
it compiles inside an app build and nowhere else. Regenerate the project with
`cd ios && GEM_HOME=/opt/homebrew/Cellar/cocoapods/1.17.0/libexec ruby support/gen-xcodeproj.rb`.

The protocol does not need an app to read, though. From this directory, `node
../android/codegen/generate-spec.mjs --platform ios --output /tmp/inth-spec` writes what the
generator emits for `src/specs`, and
`src/specs/__tests__/ios-spec-surface.test.ts` fails when the hand-written selectors under
`ReactNative/` stop matching it. That check is the acceptance path for this half on a Linux
runner; the app build below is the one that proves the protocol compiles.

Those three cover the wire layer. The React-linked half compiles only inside an app, so
its acceptance path runs in `internals/fixtures/react-native-bare/ios`:

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
cd internals/fixtures/react-native-bare/ios
/opt/homebrew/bin/pod install
xcodebuild -workspace InthBare.xcworkspace -scheme InthBare -configuration Debug \
  -destination 'platform=iOS Simulator,id=<device-udid>' -derivedDataPath ./DerivedData build
xcrun simctl install booted ./DerivedData/Build/Products/Debug-iphonesimulator/InthBare.app
xcrun simctl launch booted org.reactjs.native.example.InthBare
```

The fixture draws the handshake it read through the module: which core is answering, the
protocol pair, the native SDK version, the snapshot revision. A TurboModule that failed
to register shows up on that screen rather than passing unnoticed, which is the point of
building the example app at all.
