---
title: Mobile TCF validation
description: Prepare c15t native review apps, evidence and access for IAB Europe mobile validation.
---

# Mobile TCF validation

c15t needs mobile validation as well as web validation. IAB Europe checks the
CMP's UI and technical operation for each environment before listing that
environment. Native review apps are the practical way to demonstrate both.
They do not establish approval by themselves.

This guide was checked against official sources on 2 November 2026. It covers
preparation. No registration, submission, distribution or certification is
performed by these apps or their build commands.

## Confirm the submission route

[IAB Europe's compliance programme](https://iabeurope.eu/tcf-compliance-programmes/)
covers web, mobile and CTV separately. Its
[supporting resources](https://iabeurope.eu/tcf-supporting-resources/) link a
[non-web compliance form](https://docs.google.com/forms/d/e/1FAIpQLSe6LNJQuiN--htyzjIBUZ6C7CMufqZ6rVvbzu0ookm-I6nGSQ/viewform).
The linked [validator guide](https://iabeurope.eu/wp-content/uploads/TCF-v2.2-CMP-Validator-User-Guide_15052023.pdf)
directs in-app CMPs to that form because the desktop Chrome validator cannot
validate them.

The form returned HTTP 401 during this research. Its current questions and
delivery instructions could not be read. Prepare Android and iOS apps, then
confirm whether IAB wants a signed APK, TestFlight invitation or another route.
A public app-store listing, public source repository and separate app for each
wrapper are not established requirements in the public sources checked here.

c15t's existing CMP ID is **490**. The
[official CMP list](https://cmplist.consensu.org/v2/cmp-list.json), checked on
2 November 2026, lists it as `Consent Management Inc` with `Web` as its only
environment. Use 490 when configuring c15t's private mobile review builds.
The internal CMP version remains a separate value and must be supplied.

Prepare mobile validation under this existing registration. The
[CMP-list specification](https://github.com/InteractiveAdvertisingBureau/GDPR-Transparency-and-Consent-Framework/blob/master/TCFv2/IAB%20Tech%20Lab%20-%20Consent%20string%20and%20vendor%20list%20formats%20v2.md#global-cmp-list-specification)
allows one CMP ID to have multiple environments. Confirm the mobile extension
procedure through the [CMP portal](https://register.consensu.org/cmp). Web
approval does not establish mobile approval, and the demo fixture's test ID must
not replace 490 in submission builds.

Before submission, confirm:

- Which current policy and technical revisions the non-web form expects.
- Whether one submission covers both iOS and Android, and how wrappers using
  the same native presenter should be evidenced.
- The reviewer access method, recipient, expiry and required build format.
- Whether storage exports, recordings or network evidence must accompany the
  apps.

## Keep the versions separate

The live [Tech Lab string and GVL specification](https://github.com/InteractiveAdvertisingBureau/GDPR-Transparency-and-Consent-Framework/blob/master/TCFv2/IAB%20Tech%20Lab%20-%20Consent%20string%20and%20vendor%20list%20formats%20v2.md)
has a May 2026 v2.4 history entry, including GVL standard texts. The current
[policy download](https://iabeurope.eu/wp-content/uploads/TCF-Policies-TransparencyConsentFramework_Policies_Version-2026-05-29.5.0.b.docx.pdf)
is 5.0.b. Some public resource labels and the non-web form still say v2.2 or
v2.3. Record the actual revisions used for review rather than copying the
form's label into a conformance claim.

IAB's [v2.3 transition notice](https://iabeurope.eu/all-you-need-to-know-about-the-transition-to-tcf-v2-3/)
requires the disclosed-vendors segment in newly created TC Strings from
1 March 2026. No separate official v2.4 mobile transition deadline was verified
in this research. The c15t [first-release contract](mobile-support.md) targets
TCF 2.4 and Google Additional Consent v2.

The SDK's semantic version, internal CMP version, GVL version, policy version
and TC String format version are different values. A version number does not
establish registration or approval.

## Use the maintained native apps

The review mode extends [the native consent demo](../../../../examples/native/consent-demo/README.md).
It uses the stock consent screens, protected platform storage and production
platform installers. The new review modes still need hosted and device
acceptance with the intended submission configuration.

| App | What it demonstrates | Scope limit |
| --- | --- | --- |
| iOS `C15tConsentDemo` | SwiftUI host, protected consent storage and standard UserDefaults signals | Simulator builds do not prove physical-device behavior |
| iOS `C15tUIKitDemo` | UIKit lifecycle hosting the same SwiftUI consent presenter | The consent UI is shared with the SwiftUI host |
| Android `:consent-demo` | Kotlin/Compose host, protected consent storage and application-default SharedPreferences signals | Build success does not prove device behavior |
| Bare RN and Expo | Existing native adapters can host the same presenter | The review mode does not complete typed RN/Expo IAB bootstrap or establish wrapper approval |

Debug local fixtures remain separate. They use sample disclosures and a test
CMP identity. They do not fetch the current production GVL, and their core-only
storage wiring does not demonstrate vendor-readable platform signals. Never
submit a fixture run as hosted review evidence.

### Configure a hosted review

On the native demo setup screen, select the IAB review option and supply:

- A public HTTPS Inth project URL whose resolved policy actually uses IAB and
  returns the intended current vendor disclosures.
- The app's HTTPS privacy policy URL.
- CMP ID `490` for c15t's review under its existing registration.
- The internal CMP version, in the 12-bit range, independently of SDK semver.
- The publisher's two-letter country code.
- An optional comma-separated vendor scope. An empty scope keeps the served
  vendor list. It does not mean zero vendors.

These review hosts use consent language `EN`. Use the matching English GVL
disclosures and record other supported languages as separate acceptance work.

Review URLs must not contain credentials, a query or a fragment. Configure the
review project and trusted origins so no private login or API key is needed.
The apps validate input shape and ranges. They cannot verify IAB registration.

The app saves the successful, non-secret review configuration so process
restarts reconnect to the same project. It does not save a fixture identity as
a review profile. Keep that project and its policy stable during review, and
record any configuration change with the evidence.

For a pre-choice storage capture, select "Inspect before showing consent" at
setup. The app installs the same native core and makes diagnostics available
before mounting the consent presenter view. On iOS, open "Review diagnostics"
from the host screen first. "Show consent screen" then opens the stock flow.
Inspecting creates no consent decision. Use the normal launch path as
well when recording the delivered UI behavior.

### Inspect the actual platform storage

The diagnostics report separates core authority from values independently read
from standard UserDefaults or application-default SharedPreferences. The
[Tech Lab in-app API contract](https://github.com/InteractiveAdvertisingBureau/GDPR-Transparency-and-Consent-Framework/blob/master/TCFv2/IAB%20Tech%20Lab%20-%20CMP%20API%20v2.md#how-is-a-cmp-used-in-app)
specifies these stores and the types of their `IABTCF_*` values. A core snapshot
alone does not prove other SDKs can read the signals.

Refresh diagnostics after each action. Compare the stored TC String with the
committed core TC String, decode it, and check the decisions and associated
keys. Absent authority must remain visible as absent. The diagnostics never
write consent keys or turn missing values into consent.

Core and platform reads are separate, not an atomic transaction. If a report
straddles a state transition, wait for the operation to finish and refresh.

Copy reports only from a dedicated review installation. TC Strings contain
consent information. Reports omit subject IDs, external IDs, protected records
and backend receipts. Inspect any report before sharing it externally.

The reset control resets consent through the native engine. It retains the
subject and review configuration. It is not a new-person test. On iOS, deleting
an app may leave Keychain data behind, so uninstalling is not a reliable
consent-reset procedure.

### Build locally

Generate the iOS project outside the checkout. Both schemes share the review
implementation:

```sh
swift test --package-path examples/native/consent-demo/ios \
  --scratch-path /tmp/c15t-tcf-review-tests
bun examples/native/consent-demo/ios/generate-project.ts /tmp/c15t-tcf-review
xcodebuild build \
  -project /tmp/c15t-tcf-review/C15tConsentDemo.xcodeproj \
  -scheme C15tConsentDemo -configuration Release \
  -sdk iphonesimulator \
  -derivedDataPath /tmp/c15t-tcf-review/derived
xcodebuild build \
  -project /tmp/c15t-tcf-review/C15tConsentDemo.xcodeproj \
  -scheme C15tUIKitDemo -configuration Release \
  -sdk iphonesimulator \
  -derivedDataPath /tmp/c15t-tcf-review/derived
```

Keep ad-hoc simulator signing enabled for the Keychain probe. These are
simulator builds. A physical-device archive or TestFlight build needs the
team's Apple signing and distribution setup. Choose that route after IAB
confirms reviewer access.

With JDK 17 and the Android SDK configured:

```sh
sh packages/android/gradlew -p packages/android \
  :consent-demo:testDebugUnitTest \
  :consent-demo:assembleDebug :consent-demo:assembleRelease
```

The default Debug APK is signed for development. The default Release APK is
unsigned. Neither command uploads an app. Arrange controlled signing and
delivery for the submission build. Never commit a keystore or signing password.

## Run and record the review journeys

Use the current [Controls Catalogue](https://iabeurope.eu/wp-content/uploads/260227-Controls-Catalogue-TCF.pdf)
as a checklist alongside the current policies. The catalogue's cover says
5.0.a, so newer policy text takes precedence. Its web API checks are not a
requirement to add `__tcfapi` to a native app.

For each native platform, record screenshots, actual typed storage values and
decoded TC Strings for these journeys:

| Journey | Evidence to capture |
| --- | --- |
| Fresh consent | No positive consent or special-feature opt-in before an affirmative action |
| Reject, accept and granular save | Visible choices agree with encoded purpose, vendor and special-feature signals |
| Legitimate interests | Objections remain distinct from consent; prohibited purposes have no LI grants |
| Disclosures | Scope, withdrawal instructions, official text and illustrations, vendor count, legal bases, data categories, retention and policy/LI links are reachable |
| First-layer actions | Primary actions have the required matching text treatment and at least 5:1 text contrast |
| Publisher restrictions | Restricted choices and encoded signals agree |
| Reopen and withdraw | Privacy settings stays reachable and withdrawal survives a process restart |
| Consent reset | The old decision is invalidated without inventing a new choice |
| GVL and policy changes | Stale or unavailable authority does not create a positive decision |

Also check the current standard texts and mandatory disclosed-vendors segment
against the live technical specification. Distinguish TCF and non-TCF vendors,
and disclose device-storage duration. Record how and for how long the TC String
is stored. Exercise minimum and current OS versions, small and wide
screens, largest text, and live VoiceOver/TalkBack. Our product acceptance also
requires genuine offline startup, storage failure and recovery tests. A build
or codec unit test cannot replace these runs.

For every evidence set, record:

- Source commit and any uncommitted changes, native SDK versions, app version
  and build number.
- The delivered binary's SHA-256, bundle or application ID, signing identity,
  OS and device.
- CMP ID/version, publisher country, vendor scope, hosted policy and GVL
  revisions, and capture time.
- Which steps passed, failed or were not run. Keep earlier failures when a
  replacement build fixes them.

The review apps help collect evidence. They do not automatically audit every
policy check or certify the SDK.

## Plan Google App certification separately

Follow the [Google mobile certification guide](mobile-google-certification.md)
for the separate publisher App intake, required test-app screenshots, native
JSON exports and local signal checks. IAB mobile validation does not establish
Google App approval. c15t is not currently Google-certified.

Keep public SDK publishing disabled until the applicable approval and
[mobile release gates](mobile-support.md#first-release-gates) are complete.
