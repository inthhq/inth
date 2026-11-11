# c15t for Android: notes for coding agents

This file ships in the sources jar of `com.c15t:c15t-core`, `com.c15t:c15t-android`
and `com.c15t:c15t-consent-ui`, and is the overview page of their API docs. It
tells an agent working in an app that uses these artifacts where the guides are
and which rules the integration must keep.

## Where the docs are

The Android SDK is a private prerelease, and its guides are not published on
c15t.com yet. Read them from either place:

- The c15t source your maintainer supplied: `docs/frameworks/android/`
  (`quickstart.mdx`, `configuration.mdx`, `headless.mdx`, `customize.mdx`) and
  `docs/guides/mobile-*.mdx` (IAB, offline startup, identity, verification).
- The `@c15t/react-native` package, which bundles the same pages as Markdown
  under `docs/frameworks/android/` and `docs/guides/`.

Once the mobile SDKs are public, the pages move to
`https://c15t.com/docs/frameworks/android`.

## Rules the integration keeps

- Install one engine, once, in `Application.onCreate`, with
  `C15tAndroid.install(context, NativeConfig(backendUrl = ...))`. Read it later
  through `C15t.current`. Never install a second engine.
- `snapshot`, `isAllowed`, `decision` and `isReady` read cached state and never
  block, so SDK initializers may call them on the main thread.
- Start an optional SDK only on `ConsentDecision.GRANTED`, and keep a `gate` or
  `gateDecision` subscription so a withdrawal stops it. `PENDING` is not a
  refusal: keep listening. Disable the vendor's own auto-initialization first.
- Keep a Privacy settings action reachable after the first prompt closes.
- `CommitResult.ok` means the choice is stored on the device and queued for
  delivery. It does not mean the backend has it.
- Consent and Android platform permissions are separate. Neither grants the
  other.
