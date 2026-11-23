# Vendored native sources

Generated. Do not edit anything in this directory.

`InthCore/` is a byte-for-byte copy of `../../swift/Sources/InthCore`, written
by `bun scripts/sync-vendored-core.ts`. The binding's pod compiles that copy into its own
module, which is what lets an app installed from npm resolve a consent kernel: CocoaPods cannot
point `s.dependency` at a path, so a `InthCore` dependency is a pod the consumer does not have.

`InthApple/` and `InthConsentUI/` are byte-for-byte copies of `../../swift/Sources/InthApple`
and `../../swift/Sources/InthConsentUI`, written by `bun scripts/sync-vendored-apple.ts`.

`packages/swift` stays the source of truth. `packages/react-native/Package.swift` stays
two-module and keeps the core as its own SwiftPM target, so a later Swift Package Manager
release of the core is unaffected by this directory. The bridge's `import InthCore` sites are
wrapped in `#if canImport(InthCore)`, so one set of core sources serves both build paths.

After changing anything under `packages/swift/Sources/InthCore`, `InthApple` or
`InthConsentUI`, run:

```sh
bun scripts/sync-vendored-core.ts
bun scripts/sync-vendored-apple.ts
```

`--check` on either script reports every missing, differing, and orphaned file instead of
writing. The `Swift` job in `.github/workflows/ci.yml` compares all three copies with
`diff -r`, so a stale copy fails the pull request, and the package's `prepack` script runs
both sync scripts before packing.
