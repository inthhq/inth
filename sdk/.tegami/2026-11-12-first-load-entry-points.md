---
packages:
  '@c15t/core': minor
  '@c15t/schema': minor
  '@c15t/iab': patch
  'c15t': minor
---

### Add narrow entry points for first-load code

`@c15t/core/surface-state` exports what a consent surface reads before the
consent engine loads: `has()`, `allConsentNames`, `consentTypes`,
`deniedVendorIds()`, `vendorsListedUnder()`, `policyNeedsIAB()`,
`IABUnavailableError`, `resolveConsentPresentation()`, the copy helpers
`resolveActionLabels()`, `resolvePreferenceControlLabels()` and
`resolvePromptCopy()`, `applyExperimentAssignment()`,
`applyExperimentTheme()`, `hasGlobalPrivacyControlSignal()`,
`createLazyIABFactory()` and `pendingBootSnapshot()`.
`@c15t/core/iab-support` exports `resolveIABBannerSummary()`, the IAB
controls registry and `c15tProtocolParams()`. `@c15t/core/runtime/provider`
also exports `defaultTranslationConfig` and `watchRevocationReload()`.
`@c15t/schema/canonical-order` exports `compareCanonical()`. The `c15t`
package mirrors the new core entry points.

They are the same functions the root entries export. A bundler that splits
code by file, such as esbuild in the Angular CLI, puts every module a
first-load import reaches into the first load once a lazy chunk uses it.
Importing from these entries keeps the kernel, the transports and the
policy schema out of a page that loads its consent engine later. The
preference draft and `@c15t/iab` now import through them too.
