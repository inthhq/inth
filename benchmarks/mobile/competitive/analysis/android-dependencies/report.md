# Android dependency cost

c15t's stock Compose presenter is the main cause of its larger Android contribution in this host. The React Native bridge pulls in `c15t-consent-ui` unconditionally. Its native preferences methods call `ConsentHost`, and the manifest retains `ConsentHostActivity`. The resulting APK contains 4,650 Compose DEX classes. The no-SDK Expo host contains none.

This analysis uses the frozen signed APKs and their actual R8 outputs. It does not sum downloaded archives. No SDK source, dependency pin, measured consumer or producer checkout changed. No counterfactual APK or runtime sample was built in this lane.

## Direct APK bytes

The baseline is 20,779,838 bytes. c15t is 22,757,384 bytes, SHA256 `ebf67241f9c97d5520d542d41063296b2bff259bf84393566bc52ebd8348327f`.

| Part | Added compressed ZIP payload bytes |
| --- | ---: |
| DEX | 1,655,577 |
| Hermes bundle | 125,492 |
| Android resources | 109,389 |
| Native libraries | 35,672 |
| Other payload | 34,039 |
| Bundled policy | 3,711 |
| Manifest | 280 |
| ZIP structure, alignment and signing overhead | 13,386 |
| **Signed APK total** | **1,977,546** |

DEX accounts for 83.72% of the APK increase. Its uncompressed increase is 3,968,080 bytes. The native-library increase consists of 25,576 bytes in the generated `libappmodules.so` and a 10,096-byte `libandroidx.graphics.path.so`. Every other native library matches the baseline hash. Native libraries are stored uncompressed in this profile.

`resources.arsc` grows by 108,100 bytes. The final resource table adds 119 names and 1,818 configuration rows. Twenty added strings come from Compose UI, foundation and Material 3, each with 85 or 86 configurations. The table also retains additional styles from libraries already in the baseline. These name/configuration counts do not assign compressed bytes to individual resources. Other payload growth includes baseline-profile data and license files. Removing licenses or supported locales is not a proposed fix.

## Retained DEX

APK Analyzer's defined-only, deobfuscated estimate grows from 5,275,213 to 8,503,513 bytes. This estimate excludes some shared DEX structures and is smaller than the actual uncompressed DEX file lengths. The following categories are disjoint.

| Original code | Baseline estimate | c15t estimate | Estimated increase |
| --- | ---: | ---: | ---: |
| Compose | 0 | 2,425,795 | 2,425,795 |
| c15t core | 0 | 270,780 | 270,780 |
| c15t presenter | 0 | 169,909 | 169,909 |
| Kotlin serialization | 0 | 134,335 | 134,335 |
| Coroutines | 90,108 | 160,861 | 70,753 |
| AndroidX Collection | 26,928 | 86,905 | 59,977 |
| Kotlin | 1,290,702 | 1,328,233 | 37,531 |
| c15t Android wiring | 0 | 14,381 | 14,381 |
| c15t RN bridge | 0 | 12,732 | 12,732 |
| Other original packages | 3,867,475 | 3,899,582 | 32,107 |
| **Total estimate** | **5,275,213** | **8,503,513** | **3,228,300** |

Compose accounts for 75.14% of that estimated increase. An independent parser reads `code_item.insns_size` directly from each final APK DEX. Compose contains 1,260,260 instruction bytes, compared with a total instruction-byte increase of 1,714,682. That is 73.50%. The parser checks that classes do not share code-item offsets, so those instruction counts are disjoint. Instructions exclude shared pools, metadata, headers and compression.

The largest retained Compose artifact estimates, after joining original classes to verified frozen AAR inventories, are UI 661,845, foundation 618,630, runtime 287,555, text 222,767, Material 3 218,953 and graphics 153,152 bytes. These artifact estimates include separately recorded heuristic ownership of compiler-generated classes. Material icons account for only 4,248 estimated bytes and Activity Compose for 2,924. Removing either direct dependency is not a measured APK saving, and both have real uses.

The actual c15t code maps to 393 core, 272 presenter, 37 Android and 24 RN-bridge DEX destinations, 726 total. That count excludes Compose and other dependencies. It is therefore a poor proxy for c15t's complete app contribution. The core includes IAB and consent models, their serializers, transport, persistence and policy logic. Their retention follows reachable native APIs and serialization rules.

R8 is shrinking: `usage.txt` lists 4,154 fully removed Compose original classes and 140 removed serialization classes. c15t contributes a narrow initializer rule and serialization attributes, with no SDK keep-all rule. React Native keeps its module methods; the manifest retains the presenter Activity. R8 cannot infer unused native methods solely from the JavaScript screen's limited calls.

Every measured host uses `proguard-android.txt`, which contributes `-dontoptimize`. The APKs are shrunk and obfuscated, with resource shrinking, but R8 code optimization is disabled. This applies equally to all six apps. It is a host-profile limitation, not a c15t consumer-rule requirement.

## Dependencies already paid for

Of the baseline's 114 unique resolved coordinates, 101 remain shared with identical artifact hashes. c15t adds 48 coordinates and replaces or removes 13 old coordinates, leaving 149 unique coordinates across 152 artifact rows.

The baseline already resolves Kotlin stdlib 2.2.20, Kotlin reflect 2.1.20, coroutines 1.10.2, OkHttp 4.9.2, Okio 3.16.0, Gson 2.8.6, AppCompat 1.7.0, Android Material Views 1.13.0 and Fragment 1.5.4. c15t does not introduce another network stack. Gson resolves in the baseline but no `com.google.gson` class estimate survives in either APK. Kotlin reflection is already about 1.12 MB in the package estimate; its c15t increase is only 972 estimated bytes, included within Kotlin above.

The new costs are Compose and serialization plus extra reachable code in shared dependencies. Relevant normal selections are Activity 1.8.0 to 1.11.0, Collection 1.4.2 to 1.5.0, Lifecycle 2.6.2 to 2.10.0, SavedState 1.2.1 to 1.4.0, Emoji 1.3.0 to 1.4.0 and ProfileInstaller 1.3.1 to 1.4.0. Some Lifecycle and SavedState coordinates also move to JVM/Android-specific modules. Collection grows by 59,977 estimated bytes. Activity, Lifecycle and SavedState together grow by 19,558. Emoji and ProfileInstaller add 1,451. These are secondary to Compose. Resolution changes and new callers occur together, so these differences are not isolated version-upgrade costs.

The resolved graph paths and exact frozen-artifact equality checks are in `graph-paths.json`. `dependency-resolution.json` retains every addition and replacement. Neither archive byte sizes nor graph node counts are presented as shipped size.

## Competitive interpretation

c15t adds 953,492 more signed APK bytes than OneTrust, 926,576 more than Usercentrics and 979,122 more than Sourcepoint. Those three final APKs contain no Compose package. They reuse the host's existing Android Views stack to varying degrees. Sourcepoint's stock messages use WebView. This is a host-dependent size comparison, without a feature-equivalence claim.

Didomi adds 4,648,376 bytes. It retains Compose too, with a 1,401,111-byte package estimate, and adds more resources, other payload and native code. Its Compose version and reachable UI differ from c15t's. This does not prove that downgrading c15t would reproduce Didomi's smaller Compose estimate. No pins were changed.

## Practical next work

1. Measure a separately named, matched optimizing-R8 profile for all six hosts. The concrete host change is `getDefaultProguardFile("proguard-android-optimize.txt")` in place of `proguard-android.txt`. Preserve the existing profile and rerun native UI, RN bridge, serializer and startup acceptance. No byte improvement has been measured for this change. It is the cheapest next experiment before rewriting a presenter.
2. For SDK size work, target the stock presenter and its Compose UI/foundation/text retention. Keep consent actions, accessibility, IAB flows, localization and default UI behavior intact. A smaller Material 3 wrapper or fewer imports alone does not remove transitive UI/runtime costs. No safe production packaging fix was proved here.
3. A separate RN headless integration plus an optional native-presenter module could avoid forcing Compose on applications that supply their own UI. The present bridge references the presenter directly, so merely deleting a JavaScript `presentPreferences` call or excluding an AAR is not a valid implementation. This is an API/packaging project with compatibility risk. A headless size would be a different product profile and cannot replace the full-stock benchmark. Its byte impact is unmeasured.

Do not prioritize serializer, HTTP-client, icon or license stripping to close the roughly 0.95 MB competitive gap. The retained-code evidence points elsewhere. No sum or proportional allocation of the 2,425,795-byte Compose estimate is claimed as a compressed APK saving.

## Reproduction and limits

Run the commands in `reproduce.md`. The scripts read actual ZIP entries, DEX, R8 maps/usage/seeds/configuration and frozen dependency binaries. They verify every APK total against the immutable benchmark and reconcile group arithmetic. Input hashes and portable JSON reports accompany this file. Raw logs, TSV files and copied consumers remain local.

The producer is clean commit `256e903bfa542c15126e017c10fdfea70f421521`. RN/Pod archive version 3.0.0-alpha.2 and Android Maven version 3.0.0-alpha.1 are distinct. The RN archive SHA256 is `4d92e2c3377cf2059a905335c62c037de9a0cc9a46df42d474a3c5b2dc7a65bd`. The core JAR SHA256 is `f9fbf86009959e3c9c4dfdf8d7c2432f494dc96b5ccda768e42ae3fbde0e5efb`.

No compressed per-class contribution, isolated dependency-removal saving, optimized-R8 saving, headless equivalence, phone result or runtime ranking follows from this analysis. Frozen evidence and producer files remain unchanged. This lane made no repository edit, commit, push, PR, publication, release, merge, deployment or Linear change.
