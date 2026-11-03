---
title: Google mobile CMP certification
description: Prepare c15t test apps, diagnostics and the Google publisher CMP App certification request.
---

# Google mobile CMP certification

Prepare Google's publisher CMP certification for the **App** platform using
c15t's existing IAB CMP ID, **490**. This is separate from the advertiser
[CMP Partner Program](https://cmppartnerprogram.withgoogle.com/) and from
[IAB mobile validation](mobile-tcf-validation.md). c15t is not currently a
Google-certified CMP. The official IAB list checked on 2 November 2026 lists
490 as `Consent Management Inc`, with `Web` as its only environment.

This guide records preparation against public sources checked on that date.
The apps and checker do not submit an application or establish certification.

## Use the existing demo project

The web starters and native demos use `https://example-inth.inth.app/`.
Reuse that URL for the review setup. Its current configuration needs work
before it can supply IAB evidence:

- A native-contract `/init?country=GB&language=en` request returned an
  `opt-in` category policy on 2 November 2026.
- Its complete `/manifest` contained `opt-in`, `opt-out` and `none` rules,
  with no IAB rule.
- The response supplied no IAB GVL or Additional Consent disclosure list.

Configure the intended review policy in Inth before recording hosted IAB
journeys. It must resolve to IAB for the review location, disclose Google
vendor **755**, and serve the intended current non-GVL Additional Consent
providers. Coordinate a policy change with the web-demo owners because this
project is shared. Do not substitute local sample disclosures or a test CMP
identity when the hosted response lacks IAB.

The web playground's local IAB configuration already lists Additional Consent
providers `89`, `486` and `2572`. The provider endpoint resolved those to Meta,
Tradedoubler AB and Snap Inc. during this check. They are candidate providers
for the same demo flow, not proof that the hosted project serves them. Keep
the current supplied privacy links, including HTTP links, when inspecting the
official provider data.

Do not copy the playground's first-250-vendors scope into the Google review.
It excludes Google 755. Its placeholder CMP identity and the standalone IAB
showcase's sample GVL are also unsuitable for submission evidence.

Supply CMP ID `490` and an explicit internal CMP version in the review app.
The project URL does not establish that version. The current web library
defaults its CMP version to the package major, currently `3`, but that default
does not confirm the intended mobile submission version. Record the selected
integer with the candidate build. Keep it separate from SDK semver, GVL
version and TCF policy version.

## Prepare the Google intake

Google's [publisher certification guide](https://support.google.com/admob/answer/13554020?hl=en)
links the [certification intake](https://support.google.com/admanager/contact/cmp_certification_interest).
For a first application, prepare the certification request with App selected.
The public form explicitly asks for screenshots of the CMP deployed in a test
app for mobile certification.

Prepare these fields without guessing company or contact details:

| Field | Candidate information |
| --- | --- |
| Request | First CMP certification |
| Platform | App |
| IAB CMP ID | 490 |
| Legal company | Verify the legal entity against the existing registration |
| Website and country | Supply the company's verified values |
| Primary and backup contacts | Supply authorized contacts; Google encourages backup contacts |
| Commercial or private CMP | Confirm the actual service model |
| Additional Consent | Claim version 2 only after testing the submitted candidate |
| Implementation documentation | Supply reviewer-accessible instructions for the delivered build |
| Mobile screenshots | Genuine captures from the test apps |
| Agreement | Authorized representative reviews and accepts the terms |

The linked [mobile screenshot form](https://docs.google.com/forms/d/e/1FAIpQLSdmgKHWPO7h2mUsd1bO7-D5JjK-LXfK4MvCk1tYGP7-ClWZpQ/viewform)
returned HTTP 401 during research. Its exact screenshot checklist, upload
limits and delivery instructions remain unverified. Check the authenticated
form before submitting the preparation set below.

The public material does not establish a mandatory APK upload, TestFlight
invitation, production ads, public app-store listing, separate wrapper
submission or certification fee. Confirm the distribution and audit-access
requirements with the reviewers. The
[publisher agreement](https://business.safety.google/consentmanagementrequirements/)
requires audit resources, including access to a CMP test account.

## Capture native signals

Build the [native review apps](../../native/examples/consent-demo/README.md)
using the [IAB guide's commands](mobile-tcf-validation.md#build-locally).
SwiftUI and UIKit share the iOS presenter. The Android host uses the stock
Compose presenter. These apps add no Google Ads dependency to the SDK.

Select hosted IAB review, enter the project and privacy-policy URLs, CMP
identity/version and publisher country, then connect. For the first capture,
select **Inspect before showing consent**. It delays presenting the UI without
making a choice. Exercise the ordinary launch path separately.

Open diagnostics and explicitly refresh after each operation completes:

- iOS: **Review diagnostics**, then **Refresh diagnostics** and
  **Share diagnostic JSON**.
- Android: **TCF review diagnostics**, then **Refresh report** and **Copy JSON**.

Save the JSON as a UTF-8 file. Text and JSON use the same captured observation.
Core authority and platform storage are separate reads, so wait and refresh
again if a state transition produces a mismatch.

The report includes the actual loaded GVL row for Google 755, its deletion
status and declared legal bases. A disclosure is not a consent grant. Android
preserves missing versus empty declarations. Swift exports the public native
model's normalized values, which cannot reconstruct missing fields in the
original GVL JSON.

The report also separates Additional Consent list availability from retained
provider disclosures. A stale retained list is useful diagnostic information;
it does not prove a currently usable list. Actual typed `IABTCF_*` values come
from standard UserDefaults or application-default SharedPreferences, apart
from the protected consent record. No subject IDs, external IDs or receipts
are included. The TC and AC strings still contain consent information, so
inspect exports before sharing them.

### Check each observation

Run from the checkout with Bun and its installed dependencies:

```sh
bun scripts/check-mobile-google-evidence.ts /absolute/fresh.json \
  --scenario fresh --cmp-id 490 --require-google --require-ac
bun scripts/check-mobile-google-evidence.ts /absolute/rejected.json \
  --scenario reject --cmp-id 490 --require-google --require-ac
bun scripts/check-mobile-google-evidence.ts /absolute/accepted.json \
  --scenario decision --cmp-id 490 --require-google --require-ac
bun scripts/check-mobile-google-evidence.ts /absolute/withdrawn.json \
  --scenario withdrawn --cmp-id 490 --require-google --require-ac
```

Use `decision` for both accept and granular saves. Compare the decoded result
with the visible choices separately. The scenario is explicit; the checker
cannot infer the visitor action from a report. Use `withdrawn` for a completed
all-deny withdrawal, not a still-granted granular choice.

The checker compares core TC/AC with actual platform values and checks native
types, CMP identity/version, GVL/policy versions, encoded vectors and the
required DisclosedVendors segment. Fresh observations must have no committed
TC or AC. Reject and all-deny withdrawal must contain no positive consent,
legitimate-interest or special-feature grants.

`--require-google` requires a usable loaded Google 755 disclosure and its
disclosure in decision strings. It never requires a grant. `--require-ac`
requires usable provider disclosures and matching ACv2 signals, including
purposes 1, 3 and 4 before positive ATP consent. AC is optional in Google's
intake; c15t's intended first release includes it. Existing AC is checked even
without the flag.

A passing observation proves only the checks reported for that file. It does
not prove Google ad eligibility, live ads interoperability, UI compliance,
accessibility, process-restart persistence or certification. Missing policy
or disclosures are incomplete evidence, not a successful review.
The CLI exits `0` for a passing observation, `1` for a failure and `2` for
incomplete evidence.

## Prepare genuine screenshots and journeys

This is a suggested preparation set, not the unread Google screenshot form's
checklist. Capture both native platforms from the exact candidate build:

| Capture or journey | Evidence |
| --- | --- |
| Fresh first layer | Actual copy, choices, partner count and no pre-choice grants |
| Preferences | Purposes, LI objections, special features and equal decision controls |
| Google 755 details | Actual current vendor disclosure and legal bases |
| Additional Consent providers | Provider identities, privacy links and consent prerequisites |
| Reject, accept and granular save | Visible choices, JSON and independently decoded signals |
| Reopen and all-deny withdrawal | Reachable settings and updated TC/AC values |
| Process restart | Saved refusal and withdrawal remain authoritative |
| Offline startup | Explicitly verified network isolation and safe retained authority |
| Small/wide screens and largest text | Reachable controls and readable disclosures |
| VoiceOver and TalkBack | Live traversal, labels, focus and error recovery |

Record source revision and dirty changes, app ID/version/build, binary hash,
signing identity, OS/device, SDK version, CMP version, project policy, GVL and
ATP list provenance with every evidence set. Retain failed runs when replacing
a candidate. Fixture captures and helper-generated test JSON are not hosted
review evidence.

Google's [in-app TCF guide](https://support.google.com/admob/answer/9760862?hl=en)
says its Mobile Ads SDK reads TC signals from platform storage. A later
dedicated consumer app using a supported current Google SDK would test that
integration directly. This preparation does not add ads to the SDK or claim
that test has run. A category-level marketing flag, ATT permission or a
decodable TC String alone does not establish eligibility to request ads.

## Finish with the reviewers

Arrange IAB's mobile-environment extension under 490 and confirm whether its
review must precede Google's App submission. The public Google intake does
not settle that sequencing. Confirm native and wrapper scope, build delivery,
audit access and any requested Google SDK evidence.

An authorized representative must accept the agreement and submit the forms.
Track approval for the App platform explicitly in Google's
[certified list](https://support.google.com/admob/answer/13554116?hl=en).
The help guide requires recertification at least every twelve months, while
the agreement permits six-month reaudits and earlier reviews after changes.
Keep public publishing behind the existing
[mobile release gates](mobile-support.md#first-release-gates).

Google's [Additional Consent specification](https://support.google.com/admob/answer/9681920?hl=en)
and [current provider CSV](https://storage.googleapis.com/tcfac/additional-consent-providers.csv)
remain the sources for ACv2 and valid non-GVL provider identities.
