# Native consent demo

Start with the [mobile demo index](../../../packages/sdk/docs/frameworks/react-native/examples.mdx).
It lists setup and run commands for UIKit, the Swift native harness, Android,
bare React Native and Expo, and separates local fixture coverage from hosted
acceptance.

The iOS XcodeGen project has `C15tUIKitDemo` and `C15tConsentDemo` schemes.
UIKit owns its window and hosts the same stock SwiftUI consent screens. Android
is the existing `:consent-demo` Gradle app. Debug builds offer Category, Notice,
and IAB TCF and Additional Consent modes on the setup screen. Release builds
require hosted setup and exclude the fixture picker.

Keep simulator code signing enabled. The project uses ad-hoc simulator signing
without a developer account. Hosted setup checks Keychain access during
installation; the local file-backed fixtures do not exercise that check.

The JSON fixtures under `fixtures/` are local protocol inputs with a test CMP
identity. They are not production policy or live hosted acceptance.

For IAB mobile validation, use the hosted IAB review mode with the identity
authorized for the review and a real IAB policy. Its diagnostics read the actual
platform `IABTCF_*` values separately from core authority. See the
[mobile TCF validation guide](../../../packages/sdk/docs/internal/mobile-tcf-validation.md)
for setup, evidence journeys and submission questions. Neither the fixtures nor
the review app establish certification.

For Google publisher App certification, the same hosts export diagnostic JSON
with actual platform storage, loaded Google vendor 755 and Additional Consent
disclosures. Follow the [Google mobile certification guide](../../../packages/sdk/docs/internal/mobile-google-certification.md)
for exports, local checks and submission preparation. The shared web-demo
project currently serves category policies and needs an IAB policy before it
can supply hosted certification evidence.

## Real vendor SDKs

The iOS demo links PostHog, Mixpanel, Sentry and Firebase Analytics, pinned in
`ios/project.yml`. They start only in a Debug fixture launch that sets
`C15T_VENDOR_BASE`, so the demo behaves as before for everyone else.
`ios/VendorSDKs/vendor-sdk-harness.swift` configures each SDK with collection
off, binds it to the measurement category through the c15t Swift helpers, and
adds Probe vendors and Flush buttons above the consent screens.

```sh
bash examples/native/consent-demo/ios/run-vendor-e2e.sh
```

The runner starts `scripts/vendor_capture.py`, points PostHog, Mixpanel and
Sentry at it, and runs `VendorSDKTests` in both schemes on its own
`c15t-ios-vendors` simulator, which it erases first. The test probes before any
decision, after Reject all, after granting measurement, after withdrawing it
in Privacy settings, and after a relaunch. It expects capture traffic only
after the grant. Firebase cannot be redirected, so it runs against the fake
project in `ios/VendorSDKs/GoogleService-Info.plist`, and
`scripts/vendor-firebase-log.py` checks collection, `analytics_storage` and
the probe event in its debug log. Network errors to Google are expected.

After a withdrawal, PostHog still sends events it queued while consent was
granted, such as the `$screen` event from opening Privacy settings. The test
flushes those and records them as in-flight evidence before it probes.
Evidence lands in `ios/.artifacts/vendor-e2e/`: `vendor-requests.json`,
`firebase-evidence.json`, the device log and an `.xcresult` per scheme.

## Live PostHog check (Android)

The other vendor journeys stop at a local capture server. One manual check
sends the Android demo's PostHog events to a real project, "events-sdk e2e"
(project 305107 in the Inth organization, EU Cloud), and checks the project
afterwards.

`RealVendorSdkTest#posthogLiveFollowsConsent` runs only when it gets a host
and project key. It starts PostHog alone, with its debug log off, and registers
a `run_id` super property so every event the SDK sends carries it. It then
drives the usual journey and sends one `c15t_probe` event per step, tagged
`step=fresh|rejected|granted|withdrawn|relaunched`, and flushes after each
probe. The test checks PostHog's own opt-out state at each step, but it cannot
see the traffic. It logs the run id, the expected outcome per step and the
anonymous `distinct_id` under the `c15t-vendor-evidence` logcat tag.

Run it by dispatching the Depot CI workflow on `canary`:

```sh
depot ci dispatch --org YOUR_DEPOT_ORG_ID --repo inthhq/c15t-private \
  --workflow android-posthog-live.yml --ref canary
```

The key is the Depot CI secret `POSTHOG_E2E_PROJECT_KEY`. Its variant applies
only to this repository, the `canary` branch and this workflow file, so pull
request branches never receive it, and Depot CI does not run pull requests
from forks. The workflow has only a manual trigger, and its job refuses every
`pull_request` event. The same name is a GitHub Actions secret, which GitHub
withholds from fork pull requests.

`depot ci run` from a working tree resolves only organization-wide and
repository-wide variants, so it cannot read this key. To try changes before
they reach `canary`, an organization owner can add a repository-wide variant,
run the job, and remove the variant afterwards:

```sh
git add -A   # depot ci run uploads tracked files only
depot ci run --workflow .depot/workflows/android-posthog-live.yml \
  --job posthog-live --org YOUR_DEPOT_ORG_ID --follow
```

The run id appears in the job log, the step summary and the
`android-posthog-live-<run_id>` artifact. Its `evidence.json` lists each step,
the expected outcome, PostHog's own opt-out state and the anonymous
`distinct_id`.

CI cannot query PostHog, so check the run by hand once ingestion catches up,
usually within a few minutes. Open the
[SQL editor for project 305107](https://eu.posthog.com/project/305107/sql) and
run:

```sql
SELECT event, properties.step AS step, count() AS n, min(timestamp) AS first
FROM events
WHERE properties.run_id = '<run_id>'
  AND timestamp > now() - INTERVAL 7 DAY
GROUP BY event, step
ORDER BY first
```

Through Executor's PostHog tools, `execute-sql` reads the account's current
project, and `switch-project` does not carry over to the next call. Make
305107 the current project first, either in the PostHog project switcher or
with `user-settings-update` (`set_current_team`), and switch back afterwards.

A passing run has one `c15t_probe` row with `step=granted`, and no rows with
`fresh`, `rejected`, `withdrawn` or `relaunched`. Treat any other event as a
failure until you have explained it.
