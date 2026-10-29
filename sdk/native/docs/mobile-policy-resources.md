# Mobile policy resources

A native policy resource lets the consent core show the first prompt before
JavaScript or a network response. Configure an Inth project first, including its
policy rules, prompt copy and an explicit conservative rule for unknown geography.
Use your project's `https://your-project.inth.app` URL in a production app.
The reference apps use the public demo at `https://example-inth.inth.app/`.

This implementation remains private. The exporter is a repository build tool;
it is not an npm CLI or an automatic hosted deployment step.

## Export at build time

Build the shared schema, then run the exporter from the repository root. Choose
an expiry that your policy owner approves and rebuild before it expires.

```sh
bun turbo run build --filter=@c15t/schema
bunx tsx scripts/export-mobile-policy.ts \
  --endpoint https://your-project.inth.app \
  --expires-at 2026-11-05T00:00:00Z \
  --languages en,fr \
  --out c15t-policy.json
```

The exporter fetches `/manifest` over TLS and validates it with
`parseConsentManifest`. It copies canonical policy IDs and fingerprints, manifest
revision and tenant ID when present. It compiles localized copy with the shared
translation resolver. It preserves the policy matchers and their region, country,
missing-region fallback, unknown-geography fallback and default precedence.
Device language selects copy only. It never supplies a country.

Unknown geography requires an authored `fallback` or `isDefault` rule with an
`opt-in` or `iab` model, a choice prompt and no preselected categories. Export
fails if that rule is absent. The exporter does not turn a country-specific rule
into global legal authority. While a bundled policy is in force, optional
permissions require an explicit grant, including categories a permissive rule
would otherwise allow by default.

The output has resource schema version 1, an endpoint binding, build issuance and
expiry timestamps, and a checksum of its exact JSON payload. The checksum detects
corruption. The app binary and TLS fetch establish trust. The file contains no
subject, receipt, effective permissions, TC string, delivery queue or
`policySnapshotToken`. It is not a stored `/init` response.

## Embed before JavaScript

| Host | Configuration |
| --- | --- |
| Bare iOS | Add the JSON to Copy Bundle Resources. Set `com.c15t.policy.resource` to its filename in Info.plist. Keep the hosted backend URL and mode configured. |
| Bare Android | Put the JSON in `app/src/main/assets`. Set `com.c15t.POLICY_RESOURCE` to its asset path in application metadata. Keep `com.c15t.PORTAL_URL` configured. |
| Expo development or release build | Set the config plugin's `policyResource` to the JSON path relative to the Expo project, alongside `backendURL`. Prebuild copies the exact bytes into both native projects and registers the iOS resource. Rebuild the binary after changing it. |
| Swift host | Load `BundledPolicyResource` from resource URL or Data with the configured endpoint, then pass it as `CoreConfig.bundledPolicy` before bootstrapping. |
| Kotlin host | Read the resource into `NativeConfig.bundledPolicy` before bootstrapping. `C15tAndroid.configFrom` can load the declared asset for you. |

A usable stored policy wins over the bundle, including a newer policy downloaded
by an earlier launch. An expired stored bundle can use a newer valid resource.
Stored bundled authority stays usable without loading seed bytes again when the
configured backend URL is unchanged. Swift's `HostedTransport` supplies that URL.
A custom Swift transport can expose `policyEndpoint`; otherwise it needs the
matching seed endpoint. Changing or omitting the configured endpoint denies
retained bundled authority.

Removing Expo's `policyResource` option disables the plugin-owned resource on the
next prebuild by removing its activation metadata. Prebuild preserves custom
resource names and unrelated resources. Previously stored policy still follows
the cache and endpoint rules above.

Wrong-project, corrupt, future-dated, expired or unsupported resources supply no
authority. Optional gates stay denied and the core keeps trying hosted refresh.
The expiry also applies after process relaunch and to synchronous native reads.
Expiry denies optional processing and prevents new grants. A person can still
Reject all against a retained expired policy. This writes false receipts for every
optional category, including older grants outside the app's current declaration.
Ordinary saves under current policy still use the declared choice scope.
That denial and its frozen delivery
body are stored atomically, replace an older queued grant for the same owner, and
survive relaunch. Accept, custom saves and IAB drafts require current policy.

A successful hosted refresh replaces bundle authority and uses normal fingerprint
and reconsent behavior.

Keep the hosted transport installed. Local decisions become successful only after
the native durable commit. Failed delivery stays queued under the original subject
with the original confirmation timestamps and assertions. Reconnect replays the
queue through the existing delivery code. Advanced self-hosted and custom transports
remain supported by the same native APIs.

## Offline IAB and Additional Consent

An IAB project must serve the actual GVL. Use `--vendors 1,2` to narrow the embedded
GVL to the app's declared partners. The framework disclosures and list versions
remain intact. Configured Additional Consent providers are fetched and narrowed
to the manifest's ATP IDs. URLs alone cannot supply an offline disclosure.

GVL authority starts at its original `lastUpdated`. ATP authority starts at the
source response's `Last-Modified` or `lastUpdated`. Export fails without a usable
source timestamp or a configured provider. Loading or copying the resource never
renews either clock. Future timestamps cannot authorize grants.

The default native list maximum age is seven days. A binary built with a list
already six days old has at most one day of new offline IAB grant authority.
Missing or expired GVL or ATP disclosures cannot authorize a new undisclosed grant.
Rebuild or refresh the lists before offering consent again. Do not promise
unlimited offline IAB acceptance from an old binary.

`globalVendorList` in Swift and `vendorList` in Kotlin retain readable vendor copy.
`adTechProviderDisclosures` retains readable ATP copy, including stale copy.
Use `iabStatus`, `additionalConsentStatus` and `openIABDraft` in Swift or
`openIabDraft` in Kotlin to determine whether new grants are available.
`bundledPolicyInfo` reports the source revision and authority expiry. Reading
metadata is not a consent action. Approved CMP configuration and mobile release
approval remain separate requirements.

The public demo has an authored conservative fallback but no IAB configuration.
It cannot prove hosted IAB or Additional Consent saves. App acceptance uses a
separate deterministic backend embedded only into the E2E build artifact.
