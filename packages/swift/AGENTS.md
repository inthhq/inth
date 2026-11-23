# Inth for Swift: notes for coding agents

This file ships with the `inth` Swift package. It tells an agent working in an
app that depends on the package where the guides are and which rules the
integration must keep.

## Where the docs are

The Swift SDK is a private prerelease. Read its guides from either place:

- The Inth source your maintainer supplied: `packages/sdk/docs/frameworks/swift/`
  (`quickstart.mdx`, `uikit.mdx`, `headless.mdx`, `customize.mdx`,
  and the IAB, offline startup, identity and verification pages), built from
  `packages/sdk/docs/shared/mobile/`.
- The `@inth/react-native` package, which bundles the same pages as Markdown
  under `docs/frameworks/swift/`.

`packages/swift/README.md` beside this file lists the products. Once the
mobile SDKs are public, the pages are at `https://inth.com/docs/frameworks/swift`.

## Rules the integration keeps

- Install one engine, once, at launch, with
  `InthApple.install(InthAppleConfiguration(...))`, and keep the returned core.
  `Inth.current` returns it later. Never install a second engine.
- `backendURL` is the project URL from the Inth dashboard, such as
  `https://your-project.inth.app`. Mobile works only with Inth: no self-hosted
  backend, no offline mode, no custom transport, no `initURL`.
- `dryRun: true` drops consent records and is for development and CI. A release
  build refuses it, so pass it only inside `#if DEBUG`.
- `snapshot()`, `isAllowed(_:)`, `decision(for:)` and `isReady()` read cached
  state and never block, so SDK start-up code may call them on the main thread.
- Start an optional SDK only on `.granted`, and keep a `gate` subscription so a
  withdrawal stops it. `.pending` is not a refusal: keep listening. Disable the
  vendor's own automatic start first.
- Keep a Privacy settings action reachable after the first prompt closes.
- A successful save means the choice is stored on the device and queued for
  delivery. It does not mean the backend has it. Under `dryRun` nothing is queued.
- App Tracking Transparency and consent are separate. Neither grants the other.
