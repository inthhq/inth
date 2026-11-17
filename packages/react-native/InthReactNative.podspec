require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

# The native core and Apple services compile from generated source copies under
# vendor/InthCore and vendor/InthApple. Their sync scripts keep packages/swift authoritative.
#
# This spec used to declare `s.dependency "InthCore"`. That resolved here only because the
# example Podfiles write `pod "InthCore", :path => "../packages/swift"`; CocoaPods cannot
# attach a path to a `s.dependency`, and nothing publishes the pod, so an app installed from
# npm had no source for the kernel and `pod install` failed there. `C15T_CORE_POD_VERSION`
# left with it: there is no published version to pin.
#
# One target rather than two, because a second podspec in this package would still ask the host
# Podfile to name `InthCore`, which is the same request made of the consumer. The kernel's
# sources come along inside the package and compile into this module, and the bridge's
# `import InthCore` sites sit behind `#if canImport(InthCore)` so the SwiftPM path, where the
# kernel is its own module, keeps working. See vendor/README.md.

Pod::Spec.new do |s|
  s.name         = "InthReactNative"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["repository"]["url"]
  # The package's own copy, shipped in the tarball. It used to name the repository's
  # `../../LICENSE.md`, which only resolves through a symlinked workspace install: an app
  # that installs from npm gets `node_modules/@c15t/LICENSE.md`, a path that exists in
  # nobody's tree, and Apache-2.0 asks that the text travel with the software.
  s.license      = { :type => "Apache-2.0", :file => "LICENSE.md" }
  s.authors      = { "c15t" => "https://c15t.com" }
  s.source       = { :git => "https://github.com/c15t/c15t.git", :tag => "react-native@#{s.version}" }

  # The TurboModule, the ObjC export shim, the startup constructor, the React-free wire layer
  # underneath them, and the consent kernel they are built on. One line on purpose:
  # `scripts/react-native-autolink.ts` reads these declarations line by line when it checks
  # that every pattern resolves inside the packed package.
  #
  # The kernel brings no privacy manifest of its own. Its own spec ships one, and it declares the
  # same four keys with the same values as the bundle below, so the copy compiled into this
  # target is described by it.
  # `inth.nativeUI` false in Podfile.properties.json (the Expo plugin's `nativeUI: false`
  # writes it), or C15T_NATIVE_UI=0 for `pod install`, builds without the stock SwiftUI
  # consent screens. The presenter methods then reject with INTH_NATIVE_UI_EXCLUDED.
  #
  # A bare app has no Podfile.properties.json, so the file is read only when it exists. The
  # podspec is evaluated inside `Pod::Specification`, where a bare `StandardError` names
  # CocoaPods' own `Pod::StandardError`, so the rescue spells the Ruby class out.
  podfile_properties_path = File.join(Pod::Config.instance.installation_root.to_s, "Podfile.properties.json")
  podfile_properties = begin
    File.exist?(podfile_properties_path) ? JSON.parse(File.read(podfile_properties_path)) : {}
  rescue ::StandardError
    {}
  end
  native_ui_setting = ENV["C15T_NATIVE_UI"] || podfile_properties["inth.nativeUI"]
  native_ui = !%w[0 false no].include?(native_ui_setting.to_s.strip.downcase)

  # Every glob stays literal on these lines: `scripts/react-native-autolink.ts` reads them
  # textually to check each one against the packed tarball.
  s.source_files = "ios/InthReactNative/**/*.{h,swift,m,mm}", "vendor/InthCore/**/*.swift", "vendor/InthApple/**/*.swift", "vendor/InthConsentUI/**/*.swift"
  s.exclude_files = "vendor/InthConsentUI/**/*.swift", "ios/InthReactNative/ReactNative/InthConsentHost.swift" unless native_ui
  s.public_header_files = "ios/InthReactNative/InthReactNative.h"
  s.resource_bundle = { "InthReactNative" => "ios/InthReactNative/Resources/Privacy.xcprivacy" }
  # `Package.swift` is not in here because it is not in the package: the SPM manifest
  # resolves the core at `../swift`, a path no installed tarball has.
  s.preserve_paths = "ios", "package.json", "react-native.config.js"

  s.platforms = { :ios => "16.4" }
  s.swift_versions = ["5.9"]
  s.requires_arc = true
  s.static_framework = true

  s.frameworks = native_ui ? ["Foundation", "Security", "SwiftUI", "UIKit"] : ["Foundation", "Security", "UIKit"]

  # RCTEventEmitter, RCTBridgeModule, and the promise blocks.
  s.dependency "React-Core"

  # Codegen generates the `NativeInthSpec` protocol and the `NativeInthSpecJSI` glue that
  # the module provider returns, and it writes both into the `ReactCodegen` pod of the app
  # being built. That pod is created by the same `pod install` that resolves this podspec,
  # which is why a published library survives naming it: `install_modules_dependencies`,
  # the helper in `react-native/scripts/cocoapods/new_architecture.rb` that every
  # third-party library podspec is pointed at, adds this exact dependency. Declaring it
  # rather than hand-writing a search path also gives the build ordering, since
  # `ReactCodegen` has to be compiled before this pod can include its headers.
  #
  # The rest of the block is the include tree that umbrella header pulls in.
  s.dependency "ReactCodegen"
  s.dependency "ReactCommon/turbomodule/core"
  s.dependency "RCTRequired"
  s.dependency "RCTTypeSafety"

  # The bridging headers (`react/bridging/*.h`) that the generated JSI glue includes moved
  # in React Native 0.87: they were the `ReactCommon/turbomodule/bridging` subspec through
  # 0.86 and are the standalone `React-bridging` pod from 0.87. The candidate range is
  # 0.86.x and 0.87.x, so name whichever one the host app's React Native ships.
  #
  # The host's copy, not this package's: CocoaPods evaluates a podspec from the podspec's
  # own directory, where `require.resolve` finds the development dependency (0.87) rather
  # than the app's (an Expo 57 app is on 0.86). `use_react_native!` exports the app's
  # path as `REACT_NATIVE_PATH`, relative to the Podfile, which is what Expo's own
  # podspecs read first, with the same `node` fallback for a Podfile that does not set it.
  react_native_dir = if ENV["REACT_NATIVE_PATH"].nil?
    File.dirname(`node --print "require.resolve('react-native/package.json')"`.strip)
  else
    File.expand_path(ENV["REACT_NATIVE_PATH"], Pod::Config.instance.project_root)
  end
  react_native_version = begin
    JSON.parse(File.read(File.join(react_native_dir, "package.json")))["version"]
  rescue ::StandardError
    nil
  end
  react_native_minor = react_native_version ? react_native_version.split(".")[1].to_i : 0
  if react_native_version.nil? || react_native_minor >= 87
    s.dependency "React-bridging"
  else
    s.dependency "ReactCommon/turbomodule/bridging"
  end

  # No `HEADER_SEARCH_PATHS` here on purpose. CocoaPods puts the headers of every declared
  # dependency under `${PODS_ROOT}/Headers/Public`, which is already on the include path
  # for this pod, and `ReactCodegen.podspec` keeps `header_mappings_dir` at `./`, so the
  # `InthSpec` subdirectory the import names is the layout on disk. The four entries that
  # used to sit here were dead: two pointed at `Pods/Build/Products`, a directory nothing
  # writes, one pointed three levels above the app at a `build/generated/ios` that does
  # not exist there, and one pointed at the build products directory of
  # `ReactCodegen`, which holds only `libReactCodegen.a`.
  s.pod_target_xcconfig = {
    "DEFINES_MODULE" => "YES",
    "SWIFT_OBJC_INTERFACE_HEADER_NAME" => "InthReactNative-Swift.h",
    # The generated spec includes `std::optional` and jsi, so the pod compiles as the
    # same C++ standard React Native itself uses.
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++20",
    # The vendored kernel marks a few types `package`, and the compiler accepts that access
    # level only once it is told which package it is building. SwiftPM passes the flag itself;
    # CocoaPods does not, which is why ../packages/swift/InthCore.podspec passes it too. The
    # copy is part of this module now, so it names this pod and not the kernel.
    "OTHER_SWIFT_FLAGS" => '$(inherited) -package-name "InthReactNative"',
    "SWIFT_ACTIVE_COMPILATION_CONDITIONS" => native_ui ? "$(inherited)" : "$(inherited) INTH_NO_NATIVE_UI",
  }

end
