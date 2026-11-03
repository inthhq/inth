# The consent kernel as a pod, so a CocoaPods app can depend on the same Swift sources
# the SwiftPM package vends:
#
#   pod "C15tCore", :path => "../native/core-swift"
#
# This spec vends only C15tCore. Package.swift also vends the Apple platform library
# and a benchmark executable; neither belongs in this core-only pod.
#
# This spec exists for an app inside this repository, whose Podfile points at the
# directory. It is not what ships: `@c15t/react-native` compiles the kernel from its own
# generated copy under `packages/react-native/vendor/C15tCore`, because a pod cannot point
# `s.dependency` at a path and nothing is published here for it to name. Nothing publishes
# this spec. Read the native source version so the local pod cannot report a different
# version from its request metadata.
core_source = File.read(File.join(__dir__, "Sources/C15tCore/Transports.swift"))
core_version = core_source.match(/public static let version = "([^"]+)"/)&.captures&.first
raise "c15t.version is missing from Transports.swift" unless core_version

Pod::Spec.new do |s|
  s.name         = "C15tCore"
  s.version      = core_version
  s.summary      = "Native consent kernel for c15t: state, policy evaluation, persistence, transports."
  s.description  = <<-DESC
    C15tCore owns consent state on device: the snapshot model, policy resolution,
    Keychain or file persistence, the pending-save queue, and subject identity. It
    depends on nothing outside the OS, so the same sources serve SwiftPM, CocoaPods, a
    Command Line Tools build, and an app extension.
  DESC
  s.homepage     = "https://c15t.com"
  s.license      = { :type => "Apache-2.0", :file => "../../LICENSE.md" }
  s.authors      = { "c15t" => "https://c15t.com" }
  s.source       = { :git => "https://github.com/c15t/c15t.git", :tag => "core-swift@#{s.version}" }

  # The library target only: Sources/C15tCoreBench is an executable and Tests is not a
  # product, so neither may enter the pod.
  s.source_files = "Sources/C15tCore/**/*.swift"

  # Same shape as the binding's podspec. A static-library consumer reads the manifest
  # from this bundle, and an app that links the kernel still has to merge it into its
  # own PrivacyInfo.xcprivacy.
  s.resource_bundles = { "C15tCore" => ["Sources/C15tCore/Resources/PrivacyInfo.xcprivacy"] }
  s.preserve_paths   = "Package.swift", "Sources", "Resources"

  # The iOS floor the package declares, so a pod build cannot compile against a lower
  # deployment target than `swift build` accepts.
  s.platforms      = { :ios => "16.4" }
  s.swift_versions = ["5.9"]
  s.frameworks     = "Foundation", "Security"

  s.pod_target_xcconfig = {
    "DEFINES_MODULE" => "YES",
    "SWIFT_VERSION"  => "5.9",
    # The kernel uses Swift's `package` access level. SwiftPM supplies -package-name on
    # its own; CocoaPods does not, and without it every `package` declaration fails to
    # compile ("requires a package name"). Only visible inside this pod module, so the
    # pod's public surface is unchanged.
    "OTHER_SWIFT_FLAGS" => '$(inherited) -package-name "C15tCore"',
  }
end
