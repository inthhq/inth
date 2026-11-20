# Inth benchmarks

This directory contains the internal benchmark platform for `inth`, `@inth/react`, and `@inth/nextjs`.

## Performance suites

- `core-benchmarks`
  Measures framework-agnostic runtime work such as store creation, `has()`, cookie round-trips, init, repeat-visitor init, and script updates.
- `micro`
  Runs diagnostic mitata microbenchmarks with `bun run bench:micro`. These are excluded from routine CI because the public-operation runtime suite already covers the release gates.
- `bundle-test-app`
  Builds a dedicated Next app and records route-level client script size plus publish tarball sizes for `inth`, `@inth/react`, and `@inth/nextjs`.
- `react-browser-bench`
  Runs Playwright against a React-flavoured benchmark app with local deterministic API routes, plus `saved-consent-accept` and `saved-consent-reject` visits.
- `nextjs-browser-bench`
  Runs Playwright against a Next integration benchmark app covering client, manifest, SSR, and saved-consent paths.
- `nextjs-browser-bench` (`bench:production-consumer`)
  Packs Inth (or installs a published version) into a Next.js consumer outside the workspace, with the aggregate stylesheet, a custom theme, server consent under a Suspense boundary, and the deferred dialog. Measures arms interleaved and reports stylesheet count, bytes, and cross-stylesheet class overlap per route. Not wired into CI. See [the visit-definitions report](./reports/visit-definitions-2026-09-25/README.md).
- `tanstack-start-browser-bench`
  Runs Playwright against a TanStack Start integration benchmark app with the same fixture, scenarios, and metrics as the Next arm, plus a proxied-save arm. See its README for the head-to-head numbers.
- `nuxt-browser-bench`
  Runs Playwright against a Nuxt app on `@inth/nuxt`, covering SSR, client SPA, manifest and repeat-visitor paths plus a zero-consent baseline build.
- `sveltekit-browser-bench`
  Runs Playwright against a SvelteKit app on `@inth/svelte/kit` (`inthHandle`, `loadConsent`, `createConsentRoute`), with the same scenario names as the Nuxt suite and zero-consent baseline routes.
- `astro-browser-bench`
  Runs Playwright against an Astro app on `@inth/astro`, covering the server-rendered banner in manifest and hosted modes, the `server:defer` banner island, a repeat visitor, and a zero-consent baseline built without the integration.
- `script-lifecycle-bench`
  Runs deterministic local script lifecycle flows for load, unload, reload, callback-only, `alwaysLoad`, and `persistAfterConsentRevoked` behavior.
- `core-benchmarks` (`policy-runtime` suite)
  Measures what the installed schema package emits for fixed preset deployments: manifest and init JSON, gzip, and brotli bytes, synchronous policy resolution, init resolution from a manifest, and kernel init with the resolved payload. Fixtures live in `shared/src/policy-fixtures.ts`.
- `react-browser-bench` (`policy-*` scenarios)
  Loads `/policy/<fixture>` against an init route that resolves the fixture through the installed schema package, then records prompt readiness, probe render count, request and console-error invariants, the cookie and localStorage bytes the browser holds after an explicit choice or notice dismissal, and, for the persisted repeat visitor, the synchronous persistence hydration cost against the real stored record.
- `nextjs-browser-bench` (`typical-install` scenario)
  The Next.js quickstart as documented (`ConsentRoot` with `config`, a streamed `resolveConsent` over the cached manifest, stock banner and dialog) plus gtag, Meta Pixel and TikTok Pixel from `@inth/integrations`, pointed at local stand-in scripts in `public/bench-vendor/`. Each iteration records a first visit (banner, gtag start, first-party JS by idle, then accept-all to the marketing vendors starting and running) and two returning visits that wait for all three vendors: `typical-install-repeat` reloads in the accepting context (warm cache), `typical-install-returning` opens a new context with its cookies and localStorage (cold cache).
- `nextjs-browser-bench` (`ssr-repeat` scenario and SSR consistency metrics)
  Adds a persisted repeat visitor over the SSR route plus `consoleErrorCount`, `hydrationWarningCount`, `promptTransitionCount`, and `promptShownCount` for every scenario, so matching server and client inputs must settle on the same prompt without a flash or a hydration warning.
- `bundle-test-app/client-payload`
  Builds one Next.js consumer with no consent library, v2, and several v3 setups, installed from npm or packed tarballs, and attributes initial, dialog-open and first-accept JS/CSS to packages and modules through production source maps. Run by hand; see `benchmarks/reports/client-payload-2026-09-25/`.
- `examples-payload`
  Builds and starts every starter in `examples/` against a fixture backend (`/v1/consent/manifest`, `/v1/consent/init`, `/v1/consent/records`, `/inth.js`), with all four `*_INTH_PROJECT_URL` variables pointed at it and `*.inth.app` routed to it. Records first-load JS, CSS and HTML bytes, the extra JS that opening the dialog and accepting load, emitted client JS, banner time, init/manifest/cross-origin requests, and the gzip bytes of first-load assets that carry a boundary marker (snapshot, manifest resolver, offline policy, non-English copy, IAB, devtools). `--root <checkout>` measures another worktree's own examples, so base and head never share example code: `bunx tsx benchmarks/examples-payload/run.ts --root ../inth-base --out .benchmarks/base/examples-payload`. The `examples` profile runs it for both revisions.
- `bundle-test-app` (`bench:entries`, `ordinary-react` entry)
  Builds a synthetic esbuild entry for the ordinary non-IAB React path and reports `iabInputBytes`, `devtoolsInputBytes`, and `allLocalesInputBytes` from the metafile so the import boundary is measured, not assumed.
- `shared`
  Shared schema, fixtures, budgets, expected-result registry, comparison logic, and report formatting.
- `manifest-cache-bench`
  Benchmarks `fetchCachedManifest` (`@inth/sdk/transports/manifest-cache`) against an in-process simulated Vercel CDN fronting an Inth `/manifest` origin: cold bursts, steady-state `s-maxage` expiry, stale-while-revalidate serving with the origin down, and edge-unreachable timeouts. Not wired into CI or `turbo.json`; run by hand with `bun run --cwd benchmarks/manifest-cache-bench bench`. See its README.

### Consent tax

`sveltekit-browser-bench`, `astro-browser-bench` and `nuxt-browser-bench` all
ship a zero-consent `baseline` arm: the same app shell with no Inth in the
route's module graph. Subtracting it from a measured arm's `bannerVisibleMs`
gives the consent tax — the part of the number that is the library rather than
the host framework — the way the July gate report's "desktop-real" addendum
did it.

## Compatibility suites

- `css-layer-preview`
  Manual review shell for the shared CSS matrix.
- `tw3-test`
  Tailwind 3 compatibility harness.
- `tw4-test`
  Tailwind 4 compatibility harness.
- `no-tw-test`
  Plain CSS compatibility harness.

## CI comparisons

```sh
BENCHMARK_BASE_REF=origin/canary bun scripts/benchmark-run.ts bundle
BENCHMARK_BASE_REF=origin/canary bun scripts/benchmark-run.ts quick
BENCHMARK_BASE_REF=origin/canary bun scripts/benchmark-run.ts full
BENCHMARK_BASE_REF=origin/canary bun scripts/benchmark-run.ts examples
```

The runner creates an isolated checkout at the exact base revision and installs
its frozen lockfile. It overlays the current benchmark fixtures onto that base,
then measures base and head in alternating rounds. Product source and dependency
versions stay specific to each revision. Fixture scripts and exports can change,
but dependency declarations stay at the base revision. A fixture requiring a
dependency absent from the base manifest fails before measurement. `.ci-reports/<mode>/provenance.json`
records both SHAs and the fixture overlay; base, head and comparison evidence
sit alongside it. A failed measurement cannot reuse a previous report.

CI runs one benchmark package per runner, except `@inth/core-benchmarks`:
each policy fixture takes about 30 seconds a pass, so `scripts/benchmark-plan.ts`
splits the package across three runners. That makes four parallel jobs for
`quick` and ten for `full`. A planning job resolves both revisions to commit IDs before
starting the matrix. Each runner measures base and head with `--concurrency=1`,
so timing loops do not compete for CPU. Runtime modes split the iterations into
four rounds that alternate base-head, head-base, base-head, head-base, then pool
each scenario's samples across rounds before comparing. A runner that slows down or
speeds up mid-job then shifts both arms instead of whichever arm ran second;
measuring all of base and then all of head failed the gate on docs-only pushes.
`bundle` sizes do not drift and run once. Local commands still
run the whole profile sequentially unless `BENCHMARK_PACKAGE` selects one
package, for example:

```sh
BENCHMARK_PACKAGE=@inth/react-browser-bench bun scripts/benchmark-run.ts full
```

`BENCHMARK_SHARD` selects one shard by its matrix `id` instead, for example
`BENCHMARK_SHARD=core-benchmarks-california`. A shard sets `INTH_BENCH_ONLY`
and `INTH_BENCH_SKIP` to comma lists of `suite` or `suite:scenario`; the bench
scripts measure only the selected scenarios, and the comparison expects only
them. The last core-benchmarks shard skips the fixtures listed before it, so a
new policy fixture runs there by default.

Unknown packages, shards and packages outside the selected profile fail before
any measurement. Each job enforces every expected result and budget in its
share and uploads `runtime-benchmarks-<id>` with pooled base and head results,
each round's raw results under `rounds/`, the comparison and provenance files.
The matrix `id` is the shard id, or the package name with `@inth/` removed,
for example `runtime-benchmarks-react-browser-bench` for
`@inth/react-browser-bench`. A failed job does not cancel the remaining matrix jobs.
Rounds split browser and script-lifecycle iterations, so pooled sample counts
meet or exceed a single pass because each round rounds its count up. Core
microbenchmarks run their full 5,000 iterations every round, and warmups repeat every round. Budget thresholds are unchanged. Browser benches
run against the 200 ms backend described under the environment knobs below.

`bundle` measures real Next route assets, publish tarballs and consumer import
entries. Entry reports separate initial and deferred JavaScript with gzip and
Brotli sizes. Route reports also measure CSS. The ordinary React entry checks
that IAB, devtools and all locales have not entered its module graph. Missing
or empty assets fail the run.

Consumer entry budgets count every emitted JavaScript chunk. esbuild can emit
chunks for dynamic imports that tree shaking removes from the entry's code.
Those chunks still occupy build output and count in `lazyGzip` and `gzipSize`.
The `reachableLazy*` metrics count only deferred chunks the entry can request.
Use those metrics and browser resource measurements when reporting network
payload.

The automatic stylesheet move has a one-time allowance of 9 KiB gzip for
ordinary first-paint styles and 5.5 KiB for ordinary dialog styles. The root
provider entry emits both sets as unreachable deferred chunks, so it receives
their combined allowance only in deferred and total budgets. Its initial cap
stays unchanged. The lazy IAB entry receives another 7 KiB in deferred and total
budgets for its IAB banner and dialog sheets. The ordinary entry keeps its
existing caps, and entries that emit no stock styles receive no allowance.

The browser manifest resolver loads each non-English language through its
own `import()`. Entries that import `@inth/sdk` emit those chunks even
when they never call `manifest()`, so `browser-full` and `browser-headless`
get a one-time deferred allowance of 85 KiB gzip. Their initial and total
budgets do not change. The core tarball gets a one-time allowance of 55 KiB
and 18 percentage points for the self-contained bundles that `clientMode()`
loads (`dist/runtime/lazy-*.js`). Both allowances come off once the change
is on the base branch.

The Next.js tarball normally allows at most 15 KiB and 10% growth. Restoring
dialog rules in the app-imported stylesheet in #1378 added 4,487 packed bytes.
The percentage check allows those bytes only when the measured baseline's
`dist/styles.tw3.css` lacks the dialog visibility rules and the head includes them.
Both arms record `metadata.nextjsIncludesDialogRules` from the packed file.
A missing stylesheet or metadata grants no allowance. The 15 KiB limit stays
in force, and baselines that already include the rules use the normal 10% cap.
Comparison reports retain the measured sizes and name any applied allowance.

`quick` covers core operations, policy resolution and script lifecycle with
16 pooled browser samples across four rounds. Each round measures four samples
after three warmups. Engine operations use 5,000 samples after 1,000 warmups per
round in both profiles. `full` uses 32 pooled browser samples, eight per round,
and adds React, Next, Nuxt, SvelteKit, Astro and TanStack Start browser scenarios.
PRs run the quick
comparison when runtime benchmark consumers are affected. Full comparisons run
separately on `canary` pushes, nightly, and manually through
`benchmark-regression.yml`. They also remain part of full validation and manual
CI runs. Release checks skip runtime comparisons so publishing does not wait
for them. Nightly scheduling requires the workflow on the default branch.
Results and failures appear in Actions summaries and artifacts, without PR comments. Script-lifecycle
durations use the browser clock from action start through confirmed completion;
Playwright click transport and polling time are excluded. The three tiny
empty-kernel percentage budgets also require more than 1µs of growth before
failing, so sub-microsecond hosted-runner jitter stays visible in the report
without blocking a PR.

Browser-runtime timing comparisons use the raw visit samples as well as their
medians. A median above its existing limit fails the gate only when a 99%
lower confidence bound on the change also exceeds that limit. The bound uses
binomial order statistics for each median, with a 0.5% one-sided error allowance
per arm. This needs no normal-distribution assumption. Four balanced rounds
reduce order bias; the confidence calculation treats the individual visit
samples as independent and does not correct persistent differences between
runners or revisions.

Reports retain the observed median change and show its supported lower bound,
including changes that cannot be confirmed as budget breaches. Thresholds are
unchanged. Missing metrics, fewer than eight samples per arm, invalid samples,
absolute behavior allowances and count invariants retain strict evaluation.
A failed percentage comparison stays strict when the base median is zero and
the head median is nonzero. New long tasks cannot pass just because the lower
confidence bound on the head median is zero.
Core, script-lifecycle, bundle and release-arm comparisons retain their existing
budget evaluation.

`BENCHMARK_PROFILE=regression` enforces same-revision-key regression budgets
and invariants. `BENCHMARK_PROFILE=release`, the default for `bench:compare`,
also requires historical v2 improvement targets and their real v2 artifacts.
An ordinary v3 PR does not claim to revalidate the v2 targets.

## Consent gate

The consent gate keeps a change from slowing what CookieBench judges a
release on: LCP cost, banner visibility, consent taking effect, gated scripts
running, and the Customize dialog. Every framework bench and the script tag
serve the same two routes:

- a gate page: CookieBench's article (`article-workload-v1` markup and CSS)
  with a 477 KB hero (`fetchpriority="high"`), the stock Inth banner and
  dialog set up the way CookieBench's fixture for that framework sets them up,
  and two gated scripts (one `measurement`, one `marketing`);
- a control page: the same article with no consent library in its module
  graph.

`benchmarks/shared/src/consent-gate.ts` runs them behind a proxy
(`consent-gate-proxy.ts`) that serves the hero and the gated scripts and
gzips anything the framework server left uncompressed, so every framework
loads the same bytes besides its own. The hero is generated at run time
(`consent-gate-assets.ts`), so the repository carries no binary.

Each iteration is five visits, each in a fresh browser context at
CookieBench's `mobile-article-v1` profile through CDP: 390x844 at DPR 3,
4x CPU slowdown, 200 KB/s down, 93.75 KB/s up, 150 ms latency. The visits
are the control to its LCP, the gate page to its LCP, the gate page through
an Accept tap, the gate page through a Customize tap, and the gate page as a
returning visitor who accepted, to its LCP and both gated scripts. The
returning visit starts from the storage of a visitor who accepted and came
back once, so it is a third visit: what Inth records on a second visit,
such as the engine's chunk list, is in place.

Once per run, the gate also replays a visitor who changes their mind. They
accept on the banner and come back once. On a third visit they open Privacy
settings, a `ConsentDialogLink` every gate page renders, and tap Reject in
the dialog. The gate then counts requests for a gated script on the next
visit, for about 3 s after the page is ready. It replays this three times
per run and reports the total, since a leak can depend on timing. These
setup visits run at the same profile: unthrottled, a dynamic import can
finish before the scripts it would have overlapped start, and what Inth
records changes. Taps happen once
`html[data-consent-ready="true"]` matches, as in CookieBench. The order
alternates between iterations. The page observer (`consent-gate-observer.ts`)
is adapted from CookieBench's `browser-observer.ts`, so each metric means
what CookieBench's does:

| Metric | CookieBench name | Measured from, to |
| --- | --- | --- |
| `lcpDeltaMs` | page.lcp delta | gate page LCP minus control LCP, paired per iteration |
| `bannerVisibleMs` | banner.visible | navigation, first frame with a rendered banner footprint |
| `consentEffectiveMs` | action.consent-effective | Accept `pointerdown`, first frame the public snapshot grants both categories |
| `dismissedMs` | action.dismissed | Accept `pointerdown`, first frame with no banner footprint or blocking overlay |
| `inputToNextPaintMs` | action.input-to-next-paint | longest Event Timing entry of the Accept interaction; 16 ms floor (shorter entries are not reported) |
| `scriptsCompleteMs` | action.scripts-complete | Accept `pointerdown`, the last gated script executing |
| `preferencesVisibleMs` | action.preferences-visible | Customize `pointerdown`, first frame the dialog has a footprint |
| `slowestTapMs` | the 1,000 ms rule | largest of the five tap metrics in one iteration |
| `returningLcpDeltaMs` | page.lcp delta | returning visitor's LCP minus control LCP, paired per iteration |
| `returningScriptsMs` | none | navigation, the last gated script executing for a returning visitor |
| `rejectedScriptRequests` | none | requests for a gated script after accept, return, reject |

`lcpMs`, `controlLcpMs`, `fcpMs` and `controlFcpMs` are reported too, without budgets.

Results use suite `consent-gate` and scenario `consent-gate:latency-200ms`.
The script tag reports under `@inth/script-lifecycle-bench`, and Nuxt
reports under `@inth/vue`. Angular's gate page and control page are two
Angular apps in `angular-browser-bench`: `provideInthServer()` needs
`provideInth()` in the root injector, so an app set up as the rendering
guide says loads Inth on every route. Its `run-gate.ts` puts a small router
in front of the two servers. `consentGateBudgets()` in `shared/src/budgets.ts`
holds the budgets and their rationale. All of them fail the gate:

- relative budgets on every metric, `absolute-or-percent-lte`, evaluated
  with the 99% confidence bound described under the CI comparisons. A
  metric fails only when its median grows past both the absolute band and
  the percentage, and the lower bound on that growth confirms it;
- `returningLcpDeltaMs` within the first-visit LCP band, and
  `returningScriptsMs` within the scripts-complete band. The base reports
  them as soon as the head adds them, since the runner applies the head's
  `benchmarks/` to the base checkout;
- `rejectedScriptRequests` at most 0, for every target. A request reaches
  the vendor after a no even when the script never runs;
- `slowestTapMs` at most 1,000 ms (median iteration), for every target.
  Astro's former 1,300 ms exception is gone: its Customize dialog now opens
  before the consent engine loads;
- `bannerVisibleMs` at most 600 ms for the server-rendered frameworks
  (Next.js, Nuxt, Astro, SvelteKit, TanStack Start, Angular). Round 8
  CookieBench medians were 222 to 275 ms. CookieBench has no Angular
  fixture, so Angular takes the same ceiling.

### Accepted shifts

`gateAcceptedShifts` in `shared/src/budgets.ts` lists relative budgets the
base cannot meet yet for a known reason. Each entry names a target, a
metric, the commit that made the shift (`untilBaseIncludes`) and the head
median it was measured at (`expectedMs`). The compare step
(`shared/run-compare.ts`) checks the base revision with
`git merge-base --is-ancestor`:

- while the base does not contain the commit, the relative budget passes
  when the head median is at most `expectedMs` plus the band (the larger of
  the absolute band and the percentage of `expectedMs`);
- once the base contains it, the entry is ignored and the normal band
  applies;
- when git cannot tell (a shallow clone, an unknown base), the entry does
  not apply.

The absolute budgets, such as the 1,000 ms tap rule, apply either way.

Today's entries cover `preferencesVisibleMs` for perf-release. Deferring the
consent engine means a Customize tap downloads dialog code that canary's
eager page had already loaded:

| Target | Canary | perf-release | `expectedMs` |
| --- | ---: | ---: | ---: |
| Next.js | 416 ms | 530 ms | 560 ms |
| Nuxt | 453 ms | 658 ms (846 ms on the Rolldown 1.1 bench) | 870 ms |
| TanStack Start | 430 ms | 757 ms | 790 ms |
| Astro | 1,161 ms | 930 ms | 960 ms |
| Script tag | 69 ms | 403 ms | 430 ms |

React (386 ms against 424 ms) and SvelteKit (about 460 ms against 447 ms)
need no entry. Remove these entries once `perf-release` is on canary. The
check relies on the perf-release merge commit reaching canary as an
ancestor, so merge it rather than squash it.

The bands come from three base-vs-base runs of the whole gate (perf-release
`cc9745eb2` on both arms, 12 iterations per arm, on an M1 Pro shared with
other builds; 1-minute load medians 4.5, 10 and 6). The largest median move
of any target in any run:

| Metric | Largest base-vs-base move | Band (absolute, and percent) |
| --- | ---: | ---: |
| `lcpDeltaMs` | 20 ms | 50 ms |
| `bannerVisibleMs` | 14 ms (0.5%) | 50 ms and 3% |
| `consentEffectiveMs`, `dismissedMs` | 8 ms (13%) | 25 ms and 20% |
| `inputToNextPaintMs` | 8 ms (one Event Timing quantum) | 25 ms and 20% |
| `scriptsCompleteMs` | 11 ms (3%) | 25 ms and 5% |
| `preferencesVisibleMs` | 14 ms (3%) | 60 ms and 5% |

Measuring one target takes 280 to 380 s on that machine (React, whose
banner renders after hydration, is the slowest). A CI job adds the base
checkout's install and builds on top of that.

Run it locally before pushing. The command measures base and head in two
alternating rounds, 12 iterations per arm, and prints the table CI writes
to its step summary:

```sh
bun run bench:gate                          # head vs origin/canary, every target
bun run bench:gate --base origin/canary --package @inth/nuxt-browser-bench
```

`--base` defaults to `origin/canary` for the gate (`BENCHMARK_BASE_REF`
also works). `--package` takes the hosting bench's name. One target takes
about 4 to 7 minutes on an idle machine. Throttled timings are only as
quiet as the machine, so close other heavy work before you trust a local
failure.

To measure one bench's gate without a comparison, run
`bun run --cwd benchmarks/<bench> bench:gate`, with `INTH_BENCH_ITERATIONS`
setting the number of iterations. To add a target, give its bench gate and
control routes built from `@inth/benchmarking/consent-gate-page`, plus a
`scripts/run-gate.ts` that calls `runConsentGate`. Then add the target to
`consentGateTargets` (budgets), `consentGatePackages` (expected results),
`gateTargetPackages` (`scripts/benchmark-plan.ts`) and the selection in
`scripts/ci-plan.ts`.

Until the base branch has the new target's bench, the base revision cannot
measure it: the fixture overlay leaves a bench the base lacks out of the base
tree. `scripts/benchmark-run.ts` then measures that bench on the head only
and passes it to the compare step as `BENCHMARK_NEW_ON_HEAD`. Its missing
base result is not a failure. The relative budgets are skipped with status
`new-on-head`, the absolute budgets (the 1,000 ms tap rule, the banner
ceiling, no rejected script requests) still fail the gate, and the summary
names the target as new on the head. Once the bench is on the base branch,
the full comparison applies.

## Outputs

Benchmark tasks write machine-readable JSON to:

- `.benchmarks/current/**`
- `.benchmarks/head/**`
- `.benchmarks/nightly/**`
- `.benchmarks/compare/**`

`bun run bench:compare` compares base vs head artifacts and emits:

- `.benchmarks/compare/comparison.json`
- `.benchmarks/compare/comparison.md`
- `.benchmarks/compare/summary.json` with exact coverage counts

`bun run bench:frameworks` pairs the browser-runtime results of every framework directory under `.benchmarks/current/browser-runtime/` by scenario name and emits:

- `.benchmarks/compare/frameworks.json`
- `.benchmarks/compare/frameworks.md`

`.benchmarks/` is gitignored so local and CI benchmark artifacts do not dirty the worktree.

Every result records `commitSha` (from CI variables or `git rev-parse HEAD`) and `metadata.gitDirty`, so an artifact cannot silently claim a commit its working tree did not match.

## Comparison gate

The gate fails, with `BENCHMARK_ENFORCE=true`, on anything that would otherwise let it pass without measuring:

- an expected result key (`shared/src/expected-results.ts`) has no head artifact or no base artifact;
- a head artifact defines fewer budgets than expected for its key;
- a relative budget (`delta-bytes-lte`, `percent-lte`, `absolute-and-percent-lte`) has no base metric, or its base median is `0` while the head median is not;
- a head artifact defines an expected budget with a different comparator, threshold, secondary threshold, or arm mapping (a weaker same-name budget is a mismatch);
- a budget that targets a named base arm has no arm artifacts. There is no waiver: supply the arm or the gate fails;
- any evaluated budget fails.

`summary.json` reports expected, compared, missing, evaluated, passed, failed, unevaluated, missing-definition, and definition-mismatch counts plus the provenance of each supplied base arm. A final report must quote those counts rather than "no failures".

Environment:

- `BENCHMARK_BASE_DIR`, `BENCHMARK_HEAD_DIR`, `BENCHMARK_COMPARE_DIR`
- `BENCHMARK_EXPECTED_PACKAGES=@inth/core-benchmarks` restricts the expected package set. Unknown or empty selections fail.
- `BENCHMARK_EXPECTED_SUITES=core-runtime,policy-runtime` restricts the expectation to the suites a partial local run produced. Omit it for a full gate.
- `BENCHMARK_ARM_BASE_DIRS=v2=/path/to/v2-artifacts` supplies artifacts for a named base arm. A required arm that is missing fails an enforced release-profile run.

### Base arms

`coreRuntimeV3Budgets` are v3-over-v2 improvement thresholds (0% / -50% / -50%) documented in `BASELINE.md`. They carry `baseArm: 'v2'` and are evaluated only against artifacts supplied through `BENCHMARK_ARM_BASE_DIRS`; the v2 runner named kernel construction `createConsentManagerStore`, which the budget records as `baseArmMetric`. Comparing these budgets against a v3 base as if it were v2 would either fail spuriously or pass against an implicit zero, so without v2 artifacts an enforced run fails with `unevaluated-arm` for each of them. Same-key regression ceilings (`coreRuntimeBudgets`, `coreRuntimeCoverageBudgets`) always run against the real base. Genuine v2 artifacts are produced by running the v2-era `core-benchmarks` runner on a pre-promotion checkout (for example `de8dbdf868`).

### Budget kinds

- Relative ceilings compare head to the same-key base artifact.
- `absolute-lte` budgets are explicit allowances for behavior that has no pre-change counterpart (for example notice-dismissal storage bytes). Each one states its justification in its description; none is tuned to a head measurement.
- `count-eq` budgets are invariants (request counts, console errors, prompt shown or not, import boundary bytes).

The `#1025` budgets in `shared/src/budgets.ts` say whether each threshold was measured from the pre-change base capture or declared as an allowance.

## Important React v2/v3 Benchmarks

See [`V3.md`](./V3.md) for the current React v3 benchmark notes, reference results, and interpretation.

Use the combined React benchmark runner when comparing the important v2 and v3 browser paths during the React v3 migration:

```bash
bun run bench:important-react -- --iterations 10
```

This runs the following benchmark suites in parallel:

- `react-browser-bench` via `bench:banner-visibility`
  Measures how long it takes for the consent banner to become ready and visible after navigation.
- `script-lifecycle-bench` via `bench:script-count`
  Measures script loading after accepting consent for the configured script counts.

Useful flags:

```bash
bun run bench:important-react -- -i 10 --warmup 1 --script-counts 5,10,25,50
```

- `-i, --iterations <n>` sets measured samples per metric.
- `--warmup <n>` sets warmup samples before measurement.
- `--script-counts <list>` sets the script-count cases for the script loading benchmark.

The combined runner prefixes child process output with `[banner]` and `[scripts]`, exits nonzero if either benchmark fails, and writes the same JSON artifacts as the individual package scripts:

- `.benchmarks/current/banner-visibility/react-v2-v3-banner-visibility.json`
- `.benchmarks/current/script-count/react-v2-v3-script-count.json`

Run the individual suites directly when iterating on one benchmark:

```bash
cd benchmarks/react-browser-bench
BENCH_ITERATIONS=10 bun run bench:banner-visibility

cd ../script-lifecycle-bench
BENCH_ITERATIONS=10 SCRIPT_COUNTS=5,10,25,50 bun run bench:script-count
```

Browser benchmark runners also accept deterministic environment knobs:

```bash
INTH_BENCH_ITERATIONS=1 bun run bench -- --profile none --backend-latency-ms 0
INTH_BENCH_ITERATIONS=10 bun run bench -- --profile mobile
```

- `--profile none|mobile` selects the Playwright CDP throttle profile. `mobile`
  applies 4x CPU throttling and Fast-4G-like network conditions (170 ms RTT on
  every request, assets included).
- `--backend-latency-ms <n>` (or `INTH_BENCH_BACKEND_LATENCY_MS`) makes the
  local consent backend answer after `n` milliseconds. **The default is 200 ms**,
  so every bench measures against a backend a network hop away. Use `0` for a
  quick local run. The old `--init-latency-ms`, `--init-latency` and
  `INTH_BENCH_INIT_LATENCY_MS` names still work as aliases.
- The delay applies to every consent-backend endpoint a bench calls:
  `/v1/consent/init`, `/v1/consent/manifest` (including `304` revalidations),
  `/v1/consent/records` saves, and the production consumer's
  `/v1/consent/sessions`. Requests that reach the backend through
  the app's own `/api/inth/*` routes or proxies, and server-side SSR fetches,
  pay it too, as they would in production. Static assets, the app's HTML and
  the bench's own `stats` control endpoints are not delayed.
- `script-lifecycle-bench` keeps an instant backend. Its timed window awaits
  `kernel.commands.save()`, so a fixed 200 ms save would become most of every
  sample and hide the script loader work the bench exists to measure.
- `--cold-manifest true` records manifest scenarios as separate `*-cold` and
  `*-steady` outputs. The server starts with a distinct manifest cache key for
  that run; request 1 is the cold manifest fill and requests 2..N are the
  steady cached path.
- Results record `metadata.profile` and `metadata.backendLatencyMs` alongside
  CLS, banner element timing, first-HTML banner presence, and long-task
  metrics. Every browser-runtime scenario key carries the condition, for
  example `ssr:profile-none:latency-200ms`, and so does the output file name.

`scripts/benchmark-run.ts` applies the same latency to the base and head
measurements (`--backend-latency-ms` or `INTH_BENCH_BACKEND_LATENCY_MS`,
default 200) and records it in `provenance.json`. The comparison gate expects
browser-runtime keys under that condition, read from the same variables and
`INTH_BENCH_PROFILE`.

With 200 ms on the backend, any arm that waits on it shows the round trip in
its absolute timings: client arms in `bannerReadyMs`, SSR arms in TTFB. Budgets
compare head against a base measured at the same latency. The percentage half
of an `absolute-and-percent-lte` budget now divides by a larger base median,
so on those arms the absolute half usually decides the result.

Direct-init browser benchmark arms intentionally fetch `/init` with
`cache: "no-store"` so every measured request pays the backend latency.
Manifest arms intentionally keep their framework/server manifest caching: SSR
manifest arms resolve init from the cached server manifest, Next's manifest
client arm fetches the same-origin cached manifest route in the browser, and
Nuxt's client-manifest arm fetches the fixture manifest and resolves it in the
browser. That arm supplies the same German visitor inputs as the fixture's
`/init` response, so it measures browser resolution without an unknown-location
fallback request. A cached manifest pays the latency once per cache fill.

Bundle size is measured separately by `bundle-test-app` because it is build analysis rather than an iteration-based browser runtime benchmark.

## Fixture Model

Shared fixtures live in `shared/src/fixtures.ts`.

- `tiny`, `small`, `medium`, `large`, `xlarge` scale translation payload, script volume, and UI complexity.
- Inth currently exposes five built-in consent categories, so larger fixtures scale primarily via translation/script complexity rather than additional category names.
- `core-benchmarks` measures script-manager reconciliation speed only. It does not measure remote third-party script latency.
- Policy fixtures (`shared/src/policy-fixtures.ts`) are built from the schema package's own preset builders and resolve the same semantic deployment on either side of the policy-rule contract: `optin-choice-eu` (Europe opt-in + world default, German visitor), `optout-california` (California opt-out + world default, Californian visitor), and `optout-default-world` (three packs resolving to the world default, Brazilian visitor). The runner asserts the intended preset matched so a fixture cannot degrade into the empty fallback.
- Browser startup benches expose app-startup script waterfall metrics, not CDN speed for third-party scripts.
- `script-lifecycle-bench` is the source of truth for actual load/unload/reload consent flow timings.

## Still Unbenchmarked

The current platform still leaves a few areas intentionally out of scope:

- IAB-gated script lifecycle scenarios
- Remote CDN latency and real third-party network variance
- Memory and retained-heap behavior after repeated mount/unmount cycles
- Artifact file-count reporting
- Per-framework script lifecycle hosts for Vue, Svelte, and Solid

## Framework Adapter Contract

Future framework benchmark apps should follow the same shape as the React and Next apps.

Each framework benchmark app should provide:

- routes or pages for `headless`, `full-ui`, and `vanilla-core`
- saved-consent visits that carry a real stored choice (the storage of an
  accepting or rejecting visit, or a cookie from `createRepeatVisitorCookie()`)
  and assert the banner stays hidden; a new browser context without that
  storage is a first-time visitor, whatever the scenario is called
- `client`, `ssr`, and `prefetch` routes where the framework supports them
- a browser-exposed benchmark object with normalized timing and lifecycle fields
- local deterministic init/subject endpoints or equivalent local fixtures
- mount/render/update probes suitable for that framework runtime

Normalized benchmark state should include:

- `scenario`
- `bannerReadyMs` (hydrated readiness; the shared observer records DOM
  insertion, first frame, Element Timing paint, FCP, and LCP separately)
- `bannerVisibleMs`
- `promptSettledMs` and whether a stored choice was restored, for visits
  without a banner
- `mountCount`
- `renderCount` or equivalent reactive update count
- interaction timings
- request counts
- error count if the framework-specific harness exposes it
