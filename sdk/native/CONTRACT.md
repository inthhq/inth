c15t mobile contract
====================

Authoritative reference for `@c15t/react-native`, the Swift core, and the Kotlin
core. Issue: https://github.com/c15t/c15t/issues/1010

IAB TCF is partially in scope, at exactly the width of the state the cores
own:

    GVL state       the `/init`-served vendor list is held by the cores and
                    published on the snapshot the bridge reads, in the `iab`
                    slot on both platforms, and neither core fetches a list on
                    a device. Kotlin keeps the document under the envelope's own
                    `gvl` key in storage and rehydrates the slot from it.
    IABTCF_* bus    an egress projection of the stored envelope, written in
                    the same step as the snapshot write. iOS: standard
                    NSUserDefaults. Android: the application-default
                    SharedPreferences via PreferenceManager's
                    getDefaultSharedPreferences -- never a derived file
                    name. Both are wired by the platform's own install path --
                    C15tStores.create on Android, the bridge's
                    makeCoreConfiguration on iOS -- with no flag and no host
                    step, because the readers are somebody else's SDK inside the
                    host process and never ask first; a host that wants no bus
                    installs a configured core itself. Rows written: the full
                    CMP API v2 in-app table (TcStorageBusKeys in
                    TcStorageBus.swift / TcStorageBus.kt), every consent row
                    decoded from the committed TC bytes, plus
                    IABTCF_AddtlConsent. IABTCF_CmpSdkID and CmpSdkVersion need
                    IAB configuration; IABTCF_gdprApplies is 1 under an IAB
                    rule and 0 under every other model, mirroring
                    packages/iab. The bus is never read back; the Keychain and
                    the encrypted noBackupFilesDir store stay authoritative.
                    reset() and every envelope discard clear the table, and
                    the projection rebuilds from stored bytes alone.
    IAB policy      a wire model of `iab` is read and evaluated by both cores,
                    so a device under an IAB rule presents the disclosure and
                    asks for a choice instead of coming up deny-all. What that
                    evaluation answers, and where it still differs from the web
                    kernel, is the three paragraphs below plus
                    `docs/internal/evaluator-parity.md`.
    TC string       explicit native CMP/publisher configuration and complete IAB
                    choices feed the existing native codecs. Choices, TC bytes,
                    consent version and exact pending HTTP body commit together
                    in the protected envelope before publication. Configuration
                    is required to commit under an IAB policy; fixture CMP IDs
                    are never production defaults. Created and LastUpdated are
                    always the same day. GVL lifecycle, TCF 2.4 disclosures and
                    AC v2 remain separate required release work.
    TCF checks      native/protocol/iab/tcf-policy-checks.json lists IAB
                    Europe's non-web CMP checks. Every check needs a Swift and a
                    Kotlin test marked `// TCF-CHECK: <id>`;
                    scripts/tcf-policy-checks.test.ts fails otherwise. IAB UI
                    copy comes from `iab.app` and `iab.banner` in
                    @c15t/translations through the generated IABCopy /
                    IabCopy tables, and category-mode copy through the
                    generated ConsentCopy table, in the policy's language
                    (`bun run generate:native-iab-copy`).
    Consent Mode    Google Consent Mode v2 maps categories to signals
                    exactly as the web does. The mapping lives in
                    packages/integrations/src/vendors/_shared/google-consent.ts;
                    `bun scripts/generate-google-consent-mode-fixture.ts`
                    writes native/protocol/google-consent-mode/, and
                    scripts/generate-google-consent-mode-fixture.test.ts fails
                    when the file is stale. GoogleConsentType in Swift and
                    Kotlin and resolveGoogleConsentMode in React Native are
                    tested against that file. Firebase helpers send its four
                    Firebase types; later vendor helpers read the same mapping.

    IAB GPP         off until the host passes `gpp` (Kotlin NativeConfig.gpp,
                    Swift CoreConfig.gpp, the Expo plugin's `gpp` option). Then
                    both cores derive one GPP string per state, publish it as
                    `snapshot.gppString`, and write the IABGPP_* rows in the
                    same publication as the IABTCF_* rows. Sections: US National
                    (usnat, MSPA version 2) and TCF EU (the committed TC String,
                    unchanged). See "IAB GPP" at the end of this document.

`docs/internal/native-iab-commits.mdx` defines the native commit, migration,
withdrawal and delivery contract, including the storage adapter requirements.

`docs/internal/tcf-mobile.md` records the sources behind all of that, including
the Keychain-versus-shared-defaults trade-off the bus forces.

An IAB rule is evaluated by copying the web kernel rather than by inventing a
device rule, and the rules below are worth naming because each one is a place a
core could quietly grant more than the web does. An in-scope category is denied
until a current explicit choice grants it: `defaultPermission` in
`packages/core/src/consent-record/evaluate.ts` permits an in-scope category only
for `model === 'opt-out' || model === 'none'`, so `iab` and `opt-in` answer the
same way, and `docs/internal/evaluator-parity.md` measured that identity cell by
cell. `necessary` is granted and is not the rule's to take: the web evaluator
seeds `permissions` with `necessary: true` and never revisits it, and its GPC
check refuses a mapping that names `necessary`. The prompt is `choice` and
nothing else -- `POLICY_MODEL_PROMPTS` in `@c15t/schema` allows `iab` exactly
that one, and `assertPromptForModel` in `@c15t/core` agrees -- so a notice is
never what an IAB rule settles on: the rule owes a disclosure it can name from
the served list and a choice that has to be made, and dismissing a banner grants
nothing. A rule that carries `preselectedCategories` beside `iab` is refused
outright, because `resolvePreselected` in `@c15t/schema` answers an empty set for
that model and a preselection would display a permission with no receipt behind
it, and the rights a rule must declare come from `requiredPolicyRights` in the
same file, which asks `iab` for disclosure and preferences and for no standing
opt-out right.
Those last two tables are enforced by the Swift reader only. The Kotlin reader
takes `prompt` at face value and never reads `preselectedCategories`, a gap that
predates IAB and holds for every model it reads. What that costs is strictness
about a rule the producer should not have served, not a permission: an IAB rule
Kotlin lets through on those terms still grants nothing, because the model behind
it denies by default.

What an IAB rule does to a category the policy does not govern is an open
divergence, not an IAB rule of its own. The measured web answer mentions no model
there: permissive allows, strict refuses. Both kernels instead answer the model
default, so today an IAB rule with a permissive scope withholds the categories it
never named. This lane changed neither that branch's answer nor `opt-in`'s, and
an `iab` case added to it inherits exactly what `opt-in` already did; divergence 1
in `docs/internal/evaluator-parity.md` owns the fix, and it flips both models in
both kernels on one measured fixture rather than carving an exception for IAB.

With native IAB configuration, an IAB policy reports `model: "iab"` and saves
native-generated `tcString` bytes. Without that configuration, the legacy
category-only snapshot reports `opt-in`; IAB saves reject rather than claiming
an IAB commit. The matched resolution retains the policy's `iab` model in both
cases. The existing bus still projects only policy version and applicability;
ENG-510 must publish the complete committed authority.

Swift still merges server category and notice receipts when an app configures
IAB but the incoming policy resolves to a non-IAB model. The newest confirmation
wins per category. When leaving native IAB, the old category projection is cleared
before this merge. Under a native IAB policy, server category receipts cannot
create or replace native authority. An unreadable policy imports no server
receipts while native IAB is configured.

Layout
------

    native/
      CONTRACT.md              this file
      protocol/                protocol fixtures, generated and consumed by all three impls
      core-swift/              SwiftPM package: C15tCore (no React Native, no UIKit), C15tApple
                               (platform services), C15tConsentUI (optional SwiftUI screens)
      core-android/            Gradle project: c15t-core (pure JVM), c15t-android (platform
                               services), c15t-consent-ui (optional Compose screens)
      react-native/            (lives at packages/react-native, listed here for orientation)

Rules that hold everywhere
--------------------------

1. Native owns consent state. There is no second consent kernel in JavaScript.
   The React Native layer renders native state and forwards user actions. It may
   import `@c15t/core` for types and pure selectors, never for state ownership.
2. The consent cores (`C15tCore`, `C15tApple`, `c15t-core`, `c15t-android`) must not
   import React Native, Expo, UIKit, SwiftUI, or Android UI classes. Native screens
   live in the optional `C15tConsentUI` and `c15t-consent-ui` modules, and React
   Native bindings in the `C15tReactNative` and `com.c15t.reactnative` targets only.
3. The Kotlin core logic must run on a plain JVM with no Android dependency.
   Storage, clock, and HTTP go through interfaces the Android layer implements.
   Same rule for Swift: no UIKit, and no Keychain outside the store conformances.
4. Both native cores must produce the same request bodies as `@c15t/core` for
   the same inputs. The fixtures in `native/protocol/` decide this. If a fixture
   disagrees, the TypeScript kernel is right until the contract says otherwise.
5. Unknown wire values fail closed. A native core that cannot parse a policy
   resolution serves `policyPending: true` with every optional category denied,
   and never invents a permission.
6. Never read or write IDFV, ADID, or any persistent device identifier for
   identity. The subject id is a c15t-generated `sub_` identifier, described under
   Subject identity.

State model
-----------

Native holds one immutable `ConsentSnapshot`, versioned by `revision`. It mirrors
the fields of `ConsentSnapshot` in `packages/core/src/types.ts` that matter on
mobile:

    revision: number                  // monotonic, bumps on every mutation
    policyPending: boolean            // true until the first init resolves
    ready: boolean                    // false until hydrate() completed or the first init resolved
    model: 'opt-in' | 'opt-out' | 'none' | 'iab' // configured native IAB reports `iab`
    activeUI: 'none' | 'banner' | 'dialog' | null
    effectivePermissions: { necessary, functionality, experience, measurement, marketing }  // all boolean
    consentCategories: string[] | null
    restrictions: { [category]: string[] }
    resolution: { status, policyId, fingerprint }
    policySnapshotToken: string | null
    overrides: { country | null, region | null, language, gpc | null }
    privacySignals: { gpc: { detected, override | null, active } }
    translations: KernelTranslations | null
    nextDeadline: number | null
    evaluatedAt: number
    error: { code, message } | null
    iab: { gvl } | null               // the `/init`-served vendor list, see the top of this file

`iab` is `null` until a vendor list has been served, and the key is always present.

`consentCategories` is the subject-facing list a consent surface draws: `necessary`
first, then the choice scope, all optional names in canonical sorted order. The choice
scope is `projectChoiceScope` in `packages/core/src/policy.ts`: the resolved policy
scope narrowed by the host's declared categories, or, when the host declares nothing,
none of a `permissive` rule's scope and all of a `strict` one's. That is the same set
the web dialog derives, so the same backend and the same declaration list the same rows
on both platforms, and a name the policy does not govern is never rendered. With no
policy resolved the list falls back to the safe fallback rule, which is strict and
covers every optional category the vocabulary knows, narrowed by the declaration.
`null` answers only for a core with no configuration installed at all.

The choice scope is also what the choice prompt asks about and what a bulk action
covers: `save(all)` and `save(necessary)` confirm the categories in it and nothing
else, and report `consentAction` `custom` when it is narrower than the policy scope.
When it is empty, because a permissive rule meets a host that declared nothing, the
subject is offered `necessary` alone and the prompt asks once for an acknowledgement
that only strictly necessary processing runs:

- The acknowledgement is a `noticeDismissal` record, `{ version: 1, dismissedAt,
  fingerprint }`, whose fingerprint is the policy's choice fingerprint rather than the
  notice one. Any `save()` records it at the action time (keeping a stored one at
  least as new), confirms no category, leaves `explicitChoice` as it was, and sends a
  receipt: `preferences` `{ necessary: true }`, `choice` `{ categories: {}, version:
  3 }`, and `consentAction` `all` or `necessary` for the bulk actions.
- The prompt is answered while the acknowledgement is younger than the choice lifetime,
  or while any category decision is still valid under the current choice fingerprint.
  Otherwise the reason is `expired` when the acknowledgement or a decision made under
  the current fingerprint aged out, `policy-changed` when the only records were made
  under another fingerprint or are some other dismissal, and `missing` when there is
  nothing at all. `nextDeadline` includes the moment the last record answering it runs
  out.

A strict rule never gets here with nothing declared: nothing outside its scope may run,
so the subject is asked about the whole of it. Neither does an IAB rule: TCF consent is
given per purpose and recorded in the TC string, so it is asked about its whole scope
whatever the app declares.

`ready` and `policyPending` are the two flags a native SDK gate must consult.
While either is unset, every optional category reads `false`.

Both flags latch. Once a device has been told, a later refresh that fails, times out, or
comes back rejected does not take that back: the core keeps serving the last answer it
could represent, and a host that already heard `GRANTED` is not told the subject
refused. A core that un-readies on a bad refresh turns a grant into a retraction, and a
consent UI that was telling the truth starts flashing a prompt nobody asked for.

Rule 5 is the one exception, and only there, because the core genuinely cannot represent
the answer any more: a policy resolution it cannot parse serves `policyPending: true`
with every optional category denied, including one it had granted. That lands on
`PENDING` rather than `DENIED` deliberately. `DENIED` reads as the subject's own answer
and invites a host to stop listening, which would make the category unrecoverable when
the next resolution parses; `PENDING` keeps the host listening so the answer returns by
itself.

Four fields are deliberately missing from the list above: `promptRequirement`,
`explicitChoice`, `subject`, and `location`. They are the kernel's own objects and
they keep the kernel's own key names. `promptRequirement` is `{ kind, reason }`, not
a notice/acknowledge/purpose triple. `subject` is keyed `subjectId`, not `id`.
`location` is `{ countryCode, regionCode }`, not `country` and `region`.
`explicitChoice` is the kernel's `ExplicitChoice`.

The declaration is `ConsentSnapshot` in `packages/react-native/src/protocol/snapshot.ts`,
which says plainly that it is the shape on the wire and that the JavaScript layer never
derives it. It takes all four types from `src/protocol/vocabulary.ts`, a copy that keeps
`@c15t/core` out of a phone app; `vocabulary.type-test.ts` fails the type check when the
copy and `@c15t/core` disagree. The fixtures are
generated from the TypeScript kernel, so where a native model and a fixture disagree
about a key name, the fixture is right.

A wire key name is not negotiable, and a fixture runner may not carry an
accepted-differences entry for one. A renamed key is invisible to TypeScript, because
the bridge hands JavaScript a JSON string: the declared type can say
`subject.subjectId` while the device sends `subject.id`, and every app on that
platform reads `undefined` with nothing failing anywhere. That is how this rule got
written. A Kotlin build carried four renamed keys behind fixture tolerations, and on a
device the subject printed as absent and the location printed as empty while all 21
fixtures stayed green. Names inside the core and inside a stored envelope are the
core's own business; the JSON a bridge emits is not.

So no compiler sees a bridge key, and a test does instead. `BRIDGE_PAYLOADS` in
`packages/react-native/src/protocol/bridge-schema.ts` names every key of every
payload the TurboModule carries, and `native/protocol/bridge/payloads.json` is
generated from it (`generate:bridge-schema`). `bridge-schema.type-test.ts` holds the
TypeScript types to the table, and `BridgeSchemaTest.kt` and
`C15tBridgeSchemaTests.swift` hold every encoder and decoder to the JSON. A key
renamed on one side fails one of the three. Codegen object types would not do this
job: a returned object reaches Kotlin as `WritableMap` and Swift as `NSDictionary`,
and an object argument cannot tell an omitted key from `null`.

Revisions and error writes
--------------------------

One committed mutation is one revision bump and one publication. The two are not
independent knobs, and a core that splits them breaks the boundary in a way no
single core can see from its own tests.

A committed mutation is one `/init` response folded, one consent commit accepted,
one notice dismissal recorded, and one identity change. Each of them bumps
`revision` by exactly one, and is published exactly once through the core's whole
publication path: the snapshot event, every registered snapshot observer, and the
envelope write. Not a subset of those three. A core may report several mutations
from one operation (hydrate and then re-evaluate), and it may do nothing at all
when nothing arrives, but it may not bump without publishing or publish without
bumping.

**An error is snapshot state, so it travels on a revision.** `error` is a field
of the snapshot the way `model` and `location` are, and that settles the question
the first draft of this file left open: there is no revision-free write. A core
that records `unsupported-contract` has committed a change, and that change
reaches JavaScript on the `snapshot` event, from the observers, in the persisted
envelope. The paired `error` event is a convenience for a host that wants the
code without pulling a snapshot. For errors recorded in the snapshot, it is never
the only route and cannot rescue a snapshot event that was dropped.

A transient failed init against unchanged, usable cached IAB authority is not
folded into snapshot state. Both cores keep the snapshot and envelope unchanged,
report the attempt through the error stream and update compact offline status.
The preserved revision lets an open draft finish against the same authority.

That reliance is what makes the pair load-bearing rather than tidy. The pump
dedups by revision: it drops a `snapshot` event whose revision it has already
announced, and `client.ts` returns early when a snapshot event carries the
revision it already holds. A mutation that bumps without publishing is therefore
invisible to JavaScript twice over, and a snapshot event with an unchanged
revision is discarded twice over. The rule is what lets the pump dedup by
revision and stay correct.

The rejected alternative was to declare error writes revision-free and forbid the
bridge from carrying an error on a `snapshot` event at all. It fails on the
observers: an error write that is not a mutation would still be a publication, so
every repeated error would wake every subscriber for nothing, and "exactly one
event per committed change" would need an exception per error path. It also is
not what the kernel does -- `@c15t/core` folds a refused `/init` into a committed
patch like any other.

Two things this rule deliberately does not decide. Whether a re-served response
whose every field already matches is a value change: the kernel counts an
`/init` as a mutation each time it is folded, `revision-trace-*.json` carries the
numbers the kernel produced, and both cores match them. And the revision a core
*starts* from: hydration and bootstrap are mutations in some cores and not in
others, and `reset()` moves the revision the process is on rather than restarting
the numbering a cold install begins with, so absolute revisions are still not
comparable across the three implementations. What each step costs is comparable,
and the fixture pins that.

Native API (Swift and Kotlin, same shape)
-----------------------------------------

    bootstrap(config) -> Void         // idempotent, safe from any launch hook
    snapshot() -> ConsentSnapshot     // synchronous, never blocks on I/O
    isAllowed(_ category) -> Bool     // synchronous read of effectivePermissions
    decision(_ category)              // granted | denied | pending
    isReady() -> Bool                 // hydrated, and the first init has resolved
    gate(_ category, onChange)        // fires now and on every change
    onChange(_ observer)              // snapshot callback, owned by its handle
    save(_ intent) -> CommitResult    // 'all' | 'necessary' | explicit map
    dismissNotice()
    refresh()
    identify(user) / logout()
    setOverrides({ country, region, language, gpc })
    flushPending()                    // retry the offline queue
    reset()                           // wipe consent, keep the subject id

`snapshot()` and `isAllowed()` must not touch the network, the disk, or a lock
that can be held across either. They are called from ad SDKs on the main thread.

Every observer method (`onChange`, `gate`, Kotlin's `gateDecision` and
`onError`) takes a callback and returns a subscription handle that owns it. The
core holds the callback strongly and never drops it on its own, so a closure
written inline keeps firing with nothing else referencing it. The registration
ends when the caller ends the handle: `close()` in Kotlin, `cancel()` or
releasing the `ConsentSubscription` in Swift. Swift's ARC releases a dropped
handle at once, and the methods are not `@discardableResult`, so a discarded
handle draws a warning. The JVM has no prompt release, so a Kotlin handle that
is dropped without `close()` keeps its callback for the life of the core. A
callback that captures its owner captures it weakly, or the owner keeps its own
registration alive. Swift reports errors through `eventStream`, whose consumer
task owns its lifetime.

Observable state for UI code
----------------------------

The callbacks above deliver on whatever thread published the change. UI code gets
a second surface on each platform that delivers on the main thread and needs no
observer code of its own. It is built on the callbacks and adds no state: every
value is the core's own snapshot, and every decision is the `decision` rule below
applied to it.

    Kotlin (c15t-android, package com.c15t.android)
    core.snapshotFlow: StateFlow<ConsentSnapshot>          // one instance per core
    core.decisionFlow(category): StateFlow<ConsentDecision> // emits on change only
    suspend core.awaitSave(intent, expectedRevision?)      // save on Dispatchers.IO
    suspend core.awaitRefresh()                            // returns once the init landed
    suspend core.awaitFlushPending()                       // flushPending on Dispatchers.IO

    Swift (C15tCore)
    PublishedConsent(core:)    // ObservableObject, iOS 16.4+, @MainActor
    ObservableConsent(core:)   // @Observable, iOS 17+, @MainActor
      .snapshot                // the core's snapshot
      .decisions               // [ConsentCategory: ConsentDecision], reassigned on change only
      .decision(for:) / .isReady
    PublishedConsent.decisionPublisher(for:) // Combine, current value then each change

Both platforms keep three rules:

- The model never steps back. A snapshot whose revision is older than the one
  it holds is dropped, because two publishing threads can deliver out of order.
- It conflates. A busy main thread sees the latest snapshot, not every revision.
  Code that must act on each revision uses `onChange`.
- It follows the core for the core's lifetime. Kotlin keeps one set of flows per
  core and never closes their `onChange` subscription, so a screen that keeps only
  the `StateFlow` still sees later changes. Swift ties the subscription to the
  model: releasing the model ends it.

The Kotlin flows live in `c15t-android` rather than `c15t-core`, which stays pure
JVM with only kotlinx-serialization. `c15t-android` already reaches every host
with kotlinx-coroutines through `androidx.lifecycle`, so the flows add no runtime
dependency. `ConsentCore.refresh(onComplete)` is the core-side hook `awaitRefresh`
suspends on.

Presenting the consent prompt
-----------------------------

The stock UI presents an owed prompt by itself. It is on by default on every
platform, and each one offers the same opt-out:

    React Native   <ConsentProvider privacyPolicyURL="https://...">     autoPresent={false}
    SwiftUI        view.c15tConsent(configuration, privacyPolicyURL:)  autoPresent: false
                   view.c15tConsent(privacyPolicyURL:)                 (core already installed)
    UIKit          ConsentRootViewController(root:configuration:privacyPolicyURL:)
    Compose        C15tConsent(privacyPolicyUrl = "https://...")       autoPresent = false
    Activity       activity.attachConsent("https://...")               autoPresent = false

The rules, identical on all three:

- **Wait for an answer.** Nothing presents until `ready` is true and
  `policyPending` is false, whatever supplied the policy: hosted init, a bundled
  resource or a policy in code.
- **One owed prompt, one presentation.** An owed prompt is named by the matched
  policy fingerprint, the requirement's kind and its reason. A prompt the subject
  answered or dismissed is not presented again under the same name. A new policy
  (`policy-changed`), an expired choice (`expired`) or a requirement that went to
  `none` and came back presents again. A change that arrives while a native
  present call or a commit is still in flight is evaluated once it settles; it
  is never dropped, and a commit closes only the prompt the subject acted on.
- **The core names each owed prompt.** Both cores set `promptOwedSince` where they
  install a state, under the mutation lock, so it sees every state in order: the
  revision at which the prompt owed now became owed, kept while the same
  requirement stays owed under the same policy, moved whenever a prompt becomes
  owed again, and `null` while nothing is owed. Observers and the React Native
  bridge may deliver only the latest snapshot, so a reader cannot rely on seeing
  the moment with nothing owed; the presenters and the JavaScript ledger key their
  suppression on it instead. It is not kernel state: it stays out of the kernel
  wire encoding, the protocol fixtures and the stored envelope, and the bridges add
  it to the `getSnapshot()` payload.
- **Never two at once.** Swift and Kotlin keep one `ConsentPrompt` per core with a
  single `ConsentPresenter`; every scene, Activity or composable that attaches
  shares its session and draft, and only one attached host draws it: the first,
  or a foreground host when the one drawing it is in the background. Auto-present
  is the drawing host's setting and is off while no host is attached, so nothing
  opens unseen. A host with auto-present off draws only a session the app asked
  for, or one that opened by itself while that host drew it with auto-present
  on: when it takes over a session that opened by itself for another host, the
  session is withdrawn, with no outcome, and the owed prompt stays owed. The
  installed core keeps its `ConsentPrompt` until it is uninstalled
  (`C15t.uninstall()` on Kotlin, `C15t.resetForTests()` on Swift, both reported
  through `C15t.onUninstall`); the registry holds prompts weakly and never keeps
  a core alive. React Native keeps one ledger per client, so strict mode,
  remounts and nested providers call native once, and the native host answers
  any racing call with `already-presented`.
- **Opting out changes nothing else.** With auto-present off, an owed notice is
  held back too. A manual request covers the notice owed at that moment only;
  once nothing is owed, a later notice needs its own request.
  `presentPrompt`/`presentConsentPrompt` and `presentPreferences` work as they
  did before.

**The invariant.** On all three platforms: if a prompt is owed, auto-present is
on, and nothing of ours is on screen, then a presentation is in flight or the next
trigger makes one, unless the subject already saw this owed prompt and closed it,
or native refused the privacy-policy URL. A ledger never records a prompt as shown
on its own say-so; it records what native says is on screen. Property tests drive
random sequences of the inputs below and check this after every input:
`auto-present-machine.test.ts` (React Native), `AutoPresentTest` (Kotlin) and
`AutoPresentTests` (Swift). A second property holds for the React Native hosts: a
manual `presentConsentPrompt` or `presentPreferences` shows something or reports
why not, and is never answered `already-presented` over a session that shows
nothing (`ConsentHostTest.aRequestIsNeverAnsweredWithASessionThatShowsNothing`).

**Few stored facts, one recomputed decision.** No platform remembers a decision.
Each stores a handful of facts, each keyed by what it was decided for, so a change
to any of those inputs invalidates it without an event having to reset it. After
every input, "present now" is recomputed from the facts and the current inputs.

The React Native ledger is the pure `stepAutoPresent` in
`packages/react-native/src/provider/auto-present-machine.ts`. Its current inputs
are the owed key (carrying `promptOwedSince`), the URL, whether a provider
presents, a trigger count, and the build: whether the binary links the stock
native screens. Only a bootstrap reporting `nativeUI: false` (a
`c15t.nativeUI=false` build) means it does not; an absent flag means it does. It
stores:

    fact        keyed by              meaning
    inFlight    owed key, URL         a present call is in flight
    onScreen    session id            native reported this session open, and what it shows
    dismissed   owed key              the subject saw this owed prompt and closed it
    refused     URL                   native refused this URL for good
    declined    owed key, URL, trigger  native said not now; the next trigger asks again
    closed      session id            sessions whose outcome arrived, so a late answer cannot revive one
    excluded    the binary            native rejected with C15T_NATIVE_UI_EXCLUDED
    withdrawn   session id            a prompt the ledger's call opened after every presenting
                                      provider left; closed again, its outcome is not the subject's

    present now = provider presents and the binary links the stock screens
                  and not excluded and a key is owed and nothing is in flight
                  and nothing is on screen and dismissed != key and refused != URL
                  and declined != (key, URL, this trigger)

A native answer of `presented`, or `already-presented` for a prompt session,
puts that session on screen; `already-presented` for settings, or from a binary
that does not name its sessions, puts it on screen as settings, which the owed
prompt waits behind. An unnamed answer keeps what is already known of that
session. The app's own `presentConsentPrompt` and `presentPreferences` calls
report the session they find open to the ledger too. A session's outcome takes
it off screen; a dismissal of a prompt session records the owed key then
current, because the open session reloads its draft. Nothing owed ends a
dismissal. The outermost provider creates the ledger as it renders, whether or
not it presents, and the ledger hears outcomes for the client's lifetime, so a
prompt the subject dismissed while auto-present was off stays dismissed when it
is turned on.

The native presenters store the open session (`presentationID`, whether it is
standing settings or the prompt, which is derived from `preferences` and whether
settings were opened from the first layer), the suppressed key, the requested
notice key and a running commit. Both keys carry `promptOwedSince`, so nothing
has to clear them:

    input                                     next
    snapshot, owed, auto on, nothing open     open the prompt (unless suppressed)
    presentPrompt / presentPreferences        open that session if none is open
    close a prompt session                    suppress its key, outcome, re-evaluate
    close a settings session                  outcome, re-evaluate (the owed prompt stays owed)
    commit from a prompt or notice            suppress the key acted on
    commit from settings                      no suppression; re-evaluate
    autoPresent turned on                     re-evaluate
    a host attaches or takes over             autoPresent = its setting; if off, withdraw a
                                              session that opened by itself for another host
    the drawing host detaches                 autoPresent off until a host attaches

**The React Native hosts** report what an open session shows: every
`presentConsentPrompt`/`presentPreferences` answer carries `presentation`,
`prompt` or `preferences`, beside `sessionId`, and an older binary omits it. A
host's open session is derived from what is on screen: one that shows nothing
(its notice was cleared outside the host by `dismissNotice()` or a reset) is
ended with a `dismissed` outcome by every entry point that reads it, and as soon
as the host notices, so no request is answered with a session that is not
visible. A
repeated prompt request re-asks the open session, so a notice owed again shows.
The host rejects a refused privacy-policy URL with `C15T_PRESENTER_INVALID_URL`,
which is permanent: `ConsentProvider` reports it with `console.error` and stops
offering that URL. A binary built without the stock screens rejects every
presenter call with `C15T_NATIVE_UI_EXCLUDED`, also permanent: the provider
reports it once and never asks again. When the bootstrap already says
`nativeUI: false`, the provider asks nothing and does not check
`privacyPolicyURL`, because the app draws its own consent UI. Every other refusal is `C15T_PRESENTER_UNAVAILABLE`, which is
transient and is retried on the next consent change or foreground.

**The notice card's touch area.** A UIKit root hit-tests against the card's
bounds only while that scene draws the prompt and the notice is showing
(`NoticeTouchRegion`), so an acknowledged or cleared card leaves no area that
swallows the app's touches. The Android notice view wraps its content and takes
no space once the card is gone.

`ConsentPrompt.onFinished` (Swift and Kotlin) and `onConsentPresenterOutcome`
(React Native) report each closed session with its outcome. A step that must
follow the prompt, such as Apple's tracking request, attaches there.

Native SDK gating
-----------------

The reason the core is native at all is that an analytics or advertising SDK can
initialize before the React Native bundle exists, so the core has to answer it. That
answer is the surface a host app's own Swift or Kotlin code uses, and it is a public
API in its own right, not a detail living behind the React Native bridge.

A boolean cannot carry it. `isAllowed` answers `false` both for a user who refused and
for a device whose policy has not resolved, and those need opposite handling: a
refused category stays off, an unresolved one stays off *and keeps listening*. A gate
that cannot tell them apart either initializes on an unknown, which is the violation
this whole package exists to prevent, or switches off forever a category that was
going to be granted. So the gate reports why, not just whether:

    enum ConsentDecision { GRANTED | DENIED | PENDING }   // Swift: .granted/.denied/.pending

    decision(category) -> ConsentDecision
    gate(category) { (ConsentDecision) -> Void }

Derive both from the snapshot and from nothing else, so the gate can never disagree
with the state the UI is showing:

- `necessary` is `GRANTED`. It is not something anyone gets to take away.
- Otherwise, while `ready` is false or `policyPending` is true, `PENDING`. The device
  has not been told yet, so nothing may read the current `false` as a refusal.
- Otherwise `GRANTED` where `isAllowed` is true, `DENIED` where it is false.

The decision-carrying `gate` keeps the boolean one's rules: the callback fires at
registration with the current decision, again whenever the decision for that category
changes, and the returned handle cancels it. Add one rule that matters to a late
starter: a listener registered after the decision has been reached still receives that
decision rather than silence, so an SDK that initializes two seconds into the launch
does not have to know what it missed.

One launch hook per app, owned by the layer that documents the opt-out. Android's core
library registers an `androidx.startup` initializer of its own and the React Native
binding registers one too, so two entries merge unless the binding says otherwise. The
core's takes no flag: it installs a core whenever `com.c15t.BACKEND_URL` or
`com.c15t.MODE=offline` is declared, and
installation is first-wins, so a host that set the binding's `AUTO_BOOTSTRAP` to install
its own configured core would get the manifest core instead and have its own refused with
no warning. The binding therefore removes the core's entry from a React Native app's
merged manifest, and a pure Android app keeps its own. iOS has one image-load hook and one
`Info.plist` key, so it needs no equivalent. The promise both platforms owe a host is the
same: set the flag and nothing installs a core you did not ask for.

"Whenever the decision changes" is a dedupe, and it is the whole reason this gate
carries a decision instead of a boolean. A device that publishes five snapshots while
the answer stays `PENDING` delivers one `PENDING`, not five: a host acts on the
transition, so each repeat makes it wonder whether its `init` is idempotent, and the
core cannot know that it is. A decision that moves away and back fires again, which is
correct, and a host that must act exactly once still guards its own action. The boolean
`gate` predates this one and keeps its per-snapshot fan-out; narrowing that is a
separate decision from adding this API.

`decision` and `isReady` hold the same line as `snapshot` and `isAllowed`: one read of
in-memory state, no disk, no network, no lock held across either. Ad SDKs call these
from the main thread inside `Application.onCreate` and
`applicationDidFinishLaunching`, and a block there is an ANR or a watchdog kill that
the store files against the host app.

`PENDING` is not a promise that an answer is coming. A first launch with no network
stays `PENDING` for the life of the process, which is the safe answer and the one that
keeps the SDK switched off. A host that cannot wait that long bounds the wait itself.
The core grows no timeout, because whatever number it picked would become a legally
loadable answer the policy never gave.

The bundled vendor helpers (`C15tApple`, `com.c15t.android.integrations`,
`@c15t/react-native/integrations`) hold one withdrawal rule on all three platforms: on
withdrawal, every stop call for the helper runs, in order, whether or not earlier calls
or in-flight grants fail or hang, and failures are reported through `onError` (Swift's
vendor closures cannot throw, so Swift has no `onError`). A
withdrawal never waits behind a grant still inside a vendor call, on another thread
in Kotlin and Swift, or as an unsettled promise in React Native. A later regrant waits
for that withdrawal and applies after it. When the overtaken grant returns, the helper
reapplies current consent, so a late grant cannot leave the vendor enabled. Each
enabling call reads current consent immediately before it is made. The shared
bindings own this rule and their withdrawal tests pin it per helper.

Platform privacy
----------------

ATT on iOS and the `AD_ID` runtime permission on Android are platform gates, not
consent. A core may report their status so the host can act, and may request them
where the host opts in, but no platform authorization moves a category from `DENIED`
or `PENDING` to `GRANTED`: `decision` is a function of the resolved policy and the
user's c15t choice only. A device with ATT granted and consent denied is denied, and
its advertising identifier stays unavailable.

The two answers arrive on their own channel and a core answers them whether or not a
core was ever bootstrapped, because what the operating system permits is not consent
state. The status set is shared: `authorized`, `denied`, `not-determined`, `restricted`,
`unsupported`. `unsupported` and `not-determined` must stay distinguishable, because a
host reads the first as "this platform puts no bar here" and the second as "this subject
is still owed a question", and collapsing them either switches measurement off on every
Android device or reads a missing prompt as permission. Android reports `unsupported`
and refuses a request: the advertising identifier belongs to Play services rather than
to the framework, and the `AD_ID` grant that the manifest does carry is set by a Google
dialog this app does not own, so reporting it as `denied` would make a consent claim the
subject never made.

A request answers with the arm plus two additive fields. `stage` is `final` or
`additional-information`, and the second one exists because Apple's expanded
European Union sheet has an Additional Information button that closes the sheet
without recording an answer and still completes with `not-determined`: a core that
reports that as `final` tells the host the subject refused something they only paused
to read about. `presentation` is `expanded` or `standard`, and names the call the core
actually made, not the sheet Apple rendered. Apple keeps the expanded presentation to
its own regional rules and shows the plain alert to a core that asked for the expanded
call, and in France, Germany, Italy, Poland and Romania shows only the expanded interface
whatever a core asked for, so a core may not report a presentation it did not request, and
a host may not read either value as evidence about where the device is. A request that never reached
Apple reports no presentation at all, which is what a restricted device does.

Both fields are additive, and an older core omits them. JavaScript reads a missing
`stage` as `final` rather than as a pause, because failing the other way opens a
preference centre that nothing on the device asked for.

A status that already has an answer is not a reason for a core to skip the request.
Apple permits re-presentation a year after an answer in the regions it enables it for,
and eligibility is Apple's to decide, so a core that answered `authorized` or `denied`
from its own read would enforce a lifetime Apple does not hold, invisibly, and leave a
host no way to ask for the annual re-prompt. `restricted` is the one arm a core answers
without asking, because a device policy has already replied and a call would return the
same arm. Nothing in a core may start a request on its own.

The loop between a pause and the next request belongs to whoever asked, not to the core.
Three pieces stay separable on purpose so that a host showing its own UI rather than the
JavaScript one can drive that loop with no new method on the wire: the decision, which
takes the platform arm, whether a prompt string is present, and whether the runtime has
the expanded call, and answers which request to make; the request itself; and the
single-flight that gives each caller of one in-flight Apple call its own answer.
JavaScript runs that UI today. A native one may run it later, and a core that wired the
JavaScript centre into the request path is the thing that would stop it.

Vendor list scope
-----------------

The vendor list a core shows is scoped. No core fetches a list: the document on the
snapshot is the one `/init` served, and scoping is something both sides apply to it.

The filter belongs to one layer. The deployment narrows by its own publisher ids, and
it puts them in a query only while the id count is small enough to travel safely.
Above that cap the whole document is fetched and narrowed before it is served, so a
publisher who scoped wide pays more bytes and never a wider disclosure. The same rule
lives twice on web, in `packages/iab` when it fetches for itself and in
`packages/backend` when it serves `/init`. The mobile helpers must return exactly what
`narrowGVLToVendors` returns for the same document and the same ids. That equal answer
is owed by a fixture whose expected value came from the web function itself.

An entry is chosen by the key that holds it, never by an `id` inside its own body. A
body claim that cannot resolve to a GVL vendor is a claim about a vendor nobody knows,
so it surfaces as a custom vendor or not at all.

Persistence
-----------

iOS writes the snapshot envelope plus the consent records to the Keychain, using
a generic password item keyed by `com.c15t.subject` and `com.c15t.snapshot`.
Android writes them to encrypted storage backed by an AndroidKeyStore key, and
falls back to `SharedPreferences` when the keystore fails, logging once.

Hydration must complete before the React Native surface is useful, and the
cached snapshot must be readable without any network. Store the last known
snapshot so a cold start with no connectivity still answers `snapshot()` in the
first synchronous call. First launch with nothing stored returns
`ready: false, policyPending: true`, all optional categories `false`.

That is a launch that has not been told yet, not a permanent state. `ready` means the
core has been told: `hydrate()` completing with a stored envelope latches it, and so
does the first init that lands a definitive answer, whether or not anything was ever
stored. Only an init that failed or is still in flight leaves it low, which is what
keeps a core with no connectivity fail-closed. Reading `ready` as "a stored envelope
exists" strands a fresh install in `PENDING` for its whole first session, so `GRANTED`
is unreachable on the launch a CMP most needs it, and a listener waiting on readiness
never resumes.

The stored envelope
-------------------

The envelope is the one piece of state a device keeps for itself, and the kernel has
no equivalent to generate it from: the web SDK writes a v3 consent record to
`localStorage` or a cookie, and neither native core reads or writes that document.
So the envelope is pinned by `native-envelope-*` fixtures, which name the facts and
their values and deliberately do not name a byte layout -- Swift and Kotlin encode
independently, and a pinned layout would let exactly one of them pass while the other
could only fail. Each fixture carries `reference.core` naming the implementation
whose layout this file documents, which is Swift: a sorted-keys `JSONEncoder` makes
its layout a plain function of the value. Where the two cores disagree about how a
fact is spelled, that core is the reference and the other one moves.

Both cores keep the envelope under `com.c15t.snapshot` and the subject id in its own
slot, so refusing an envelope never costs a device its identity. What each writes:

- Swift stores plain JSON under `StoredEnvelope`: `version` (this build reads `1` and
  nothing else), `storedAt` in epoch milliseconds, `snapshot`, `noticeDismissal`, and
  `policyResolution`, plus the IAB authority and `pendingSaves` fields that
  `docs/internal/native-iab-commits.mdx` defines.
- Kotlin stores a `SnapshotEnvelope` in the encrypted blob: `snapshot`,
  `evaluationPolicy`, and `noticeDismissal`, plus `gvl` and the same IAB authority and
  `pendingSaves` fields. It carries no format version of its own
  and no write time. `AesGcmCodec` puts a version byte in the blob header, which
  gates the framing rather than the fields, so an envelope-level change has nowhere
  to be recorded. That is a gap in the Kotlin core, not a decision.

Three facts carry `loadBearing: true`, meaning the answer the device gives changes if
the field is lost or wrong. Two of them decide what is allowed and one decides what the
subject is asked, which is the half a snapshot on its own cannot carry:

- `snapshot` is the last derived answer, kept so a cold start returns `snapshot()` on
  the first synchronous call with no network and no re-derivation.
- The policy the receipts were judged against -- `policyResolution` in Swift,
  `evaluationPolicy` in Kotlin -- lets hydration re-run the evaluator against the
  rules the subject actually chose under, at the current clock. Without it a relaunch
  cannot trust its own snapshot until `/init` answers, and a cached grant turns back
  into a prompt.
- `noticeDismissal` is a record and not a permission: it decides whether the notice is
  still owed, or, bound to the choice fingerprint, whether a choice prompt with nothing
  to decide has been acknowledged, so it travels beside the snapshot instead of being
  folded into it. Losing it does not grant anything; it asks the question again.

`version` gates readability rather than the decision, and `storedAt` is diagnostics
and the newest-writer-wins check. Neither changes an answer by itself, so both are
`loadBearing: false`, and both are Swift-only carriers today.

**An envelope this build cannot read is indistinguishable from a fresh install.**
`ready: false`, `policyPending: true`, every optional category `false`, and nothing
from the bytes applied. That identity is the point: there is no partial read, because
half an envelope answers like a returning user, and a permission assembled out of
garbage is indistinguishable from one the subject actually gave. It covers:

- a key in the stored consent state that this build does not model. Swift refuses
  any key path its own encoder cannot reproduce from the decoded value, which
  needs no list of names to keep current.
  Kotlin's storage codec rejects unknown keys outright. Neither tolerates an unknown
  field and rewrites it away, because that rewrite is the launch where the field
  silently disappears while every number on the snapshot still looks healthy.
- a write that stopped partway through, which leaves a prefix of a real grant -- the
  one shape most likely to read as valid.
- a document from before the corrections below: `overrides.test`, or `privacySignals`
  as a boolean `gpc`/`msa` pair.

Pending-save entries tolerate unknown queue fields, both under the legacy key and
inside `pendingSaves`. Their frozen request bodies still replay unchanged. This
exception does not relax snapshot, policy or IAB authority decoding.

One retired field is dropped on read instead of refused: the standing privacy
directive an alpha build stored. Every alpha snapshot wrote `optOutDirectives`, even as
an empty list, and a category it denied carried an `opt-out-directive` restriction.
Both cores drop the key, and drop that reason from `restrictions`, before the
unknown-key check runs; any other unknown restriction reason still makes the envelope
unreadable. Dropping is safe because a directive only ever restricted, v3 no longer
stores one, and hydration re-runs the evaluator with the signal as it is now, so a GPC
signal that is still live puts its `gpc` restriction straight back. Refusing instead
would reset every alpha install to deny-all.
- a document from another codec entirely, including a genuine web v3 envelope.

Whether the bytes decoded is the only observation that separates a refusal from a
read. A core that refuses an envelope still persists the deny-all snapshot it settled
on, so "nothing stored" has to be read off the decoder and never off the store.

The one expectation in this kind that is not kernel output is the offline deny-all
decision the read cases assert. It is written out in the generator, because the
kernel has no stored-envelope path to derive it from. Everything else in a
`native-envelope-*` file, the snapshot inside the envelope included, comes from a real
kernel run.

The pending save queue
----------------------

`save()` is a local commit with a delivery obligation attached, and the two facts
must not be confused. `committed` asserts three things about this device: the
receipts are applied to the snapshot, the snapshot is written to protected
storage, and the queue holds the exact bytes that owe delivery. It never asserts
that the backend has them, which no synchronous call can know. Delivery is a
later fact, reported by the delivered event and by the error that replaced it,
and the depth stays readable.

Every consent save atomically stores the evaluated snapshot and pending body in
the snapshot envelope before publishing the decision. Category saves retain
existing delivery obligations under the queue's retention and capacity rules.
Older category queues under the separate protected key remain readable; the
next successful save carries their entries into the envelope. A refused envelope
write preserves the previous decision and queue, publishes no new grant and
creates no body that a later flush could deliver.

IAB decisions also store the complete IAB record in that envelope. Each new IAB
decision supersedes older queued grants. A full denial supersedes older queued
actions for the same subject ID, external ID and domain. Other owners' frozen
withdrawals remain owed. Identity changes and reset
persist an empty consent record while retaining frozen withdrawals and an action
time watermark. Their failure semantics and migration rules are defined in
`docs/internal/native-iab-commits.mdx`.

Order is what makes the assertion honest. The queue write lands before the
snapshot moves, and no branch answers committed without a durable entry behind
it. A save that cannot take on the obligation answers not-ok with the reason and
leaves the decision where it was, because a decision nothing remembers having to
deliver is worse than a refusal the caller can act on. Every snapshot mutation
uses a serialization gate covering preparation, revision validation, durable
write and in-memory publication. The short state lock is released during storage
I/O, so hot reads and storage callbacks can read the current committed authority.
Host loggers and error observers run after releasing the mutation gate and may
start another mutation.
No other mutation can intervene between the revision check and its write. A stale
draft is refused before writing, without adding a pending body. Network work runs
after releasing the gate.

Every failed send spends an attempt, including the first send of the save that
queued the body. Without that, an attempt ceiling is reachable only by replays,
and a body the transport refuses on the first try sits in the queue across every
launch, replaying bytes nobody will accept.

Age and attempt ceilings are enforced at the moment a delivery fails, never on
read, so a live read cannot drop something its caller is about to send. Both
ceilings release the entry, and a release has to be announced. A pass that
reports only what it delivered leaves the caller to assume the rest is waiting,
which is exactly the wrong assumption about a decision that has just stopped
being owed.

A flush asks for a delivery pass; it is not a pass of its own. Both cores expose
one retry entry point and reach it from several places at once: bootstrap, a
resolved init, a foreground transition, a reachability change. A pass reads the
queue once and then delivers entry by entry, which leaves every entry readable
until its own send lands. Two passes that overlap therefore resend whatever was
still in flight when the later one read. The bytes are frozen and carry the same
consent id, so the backend dedupes and no decision comes out wrong. That is what
lets the defect survive review: nothing in the stored state changes, and the only
signal is a second POST for entries the subject already saw delivered.

Only one pass may be in flight per core. A flush that arrives while a pass is
running is answered by that pass, and the core starts another only if an entry was
queued after the running pass read. Nothing about `committed` softens as a result:
an entry waiting on an in-flight pass is still owed, still counted by the pending
depth, and still announced by exactly one delivered event. The queue cannot tell a
resend from a first send, so serialising passes is the core's own obligation.
"Every delivery goes through one serial queue" is a claim about the entry
points, not about the executor: a single background thread does not satisfy this
by itself, because a retry entry point that is a public synchronous method gets
called from wherever the wiring lives. The Kotlin core had a one-thread pool and
still resent in-flight entries, because bootstrap handed it a flush while the
main thread, a lifecycle worker, and the React Native module thread called the
same method directly, and a save's own first send ran on that pool with all of
them in flight. Either satisfy the rule at every entry point or guard the pass
itself, and say which you did. Either way a test requests a second flush while a
first send is still open, and fails if any entry reaches the transport twice for
one queued decision.

Whether to retry is decided by whether the same bytes could ever be accepted.
The queue replays frozen bytes, so a `400 INPUT_VALIDATION_FAILED` or a contract
declaration this build cannot speak says the same thing on the eleventh try as on
the first. Grant entries are dropped with the backend's reason named. Full
withdrawals remain owed until delivered or superseded by a newer full denial for
the same subject ID, external ID and domain. A `503`, a
timeout, a dropped socket, a rate limit, and `408`/`425` say nothing about the
body, so the entry keeps its place. `401` and `403` are permanent for a body:
the queue holds bodies and nothing else, and a credential that comes back later
cannot rescue bytes the producer already refused on its own terms.

Commit refusal reasons are `invalid-intent`, `no-subject`, `not-bootstrapped`,
`policy-pending`, `encode-failed`, `queue-write-failed` and `concurrent-change`,
plus the IAB and bundled-policy refusals `bundled-policy-expired`,
`additional-consent-list-stale`, `additional-consent-unavailable`,
`iab-draft-required`, `iab-unavailable`, `iab-list-stale`, `iab-choices-required`,
`invalid-iab-choices` and `invalid-action-time`. `COMMIT_FAILURE_REASONS` in
`packages/react-native/src/protocol/commit.ts` is the list.
These are the values of `CommitResult.reason` when `ok` is false. Delivery
failures such as `transport-unavailable`, `save-rejected` and
`save-undeliverable` are error-event codes, not commit refusal reasons.

On success, `queued` records durable enqueueing. It can remain true after
delivery. `delivered` is optional; iOS currently reports false, and refusal
shapes can omit it. Neither an absent nor a false delivery field reverses a
successful local commit. Adding a refusal reason is a contract change, so the
union in `packages/react-native/src/protocol` and both bridges move with it.

Transports
----------

Same three modes as the web SDK, same backend endpoints, same headers.

    x-c15t-version:            <C15t.version> on Swift, <NativeConfig.sdkVersion> on Kotlin
    x-c15t-platform:           apple-><C15tApple.version> for a Swift app, android-><sdkVersion>
                               for a Kotlin app, rn-><version> for a core either React Native
                               binding configures
    x-c15t-policy-contract:    <POLICY_CONTRACT_VERSION from @c15t/schema>

Both cores send the unprefixed semantic version, matching the web header format.
Each reports its host separately in `x-c15t-platform`. Hosted gateways can reject
unknown platform prefixes in `x-c15t-version`, so platform attribution must not be
prepended to either version. Kotlin reads the tag from `NativeConfig.platform`,
which defaults to `android`; `null` sends no platform header. Swift reads it from
`C15tAppleConfiguration.platform`, which defaults to `apple`. Web clients send no
platform header. `@c15t/backend` passes `x-c15t-platform` to `sessions.onReport`.
The policy-contract header remains the capability declaration.

A backend that answers `unsupported-contract` is a hard configuration error. The
core emits `error` and stays deny-all rather than guessing the wire.

Writes go through a pending queue:

- Persist the `SavePayload` before the request, not after.
- Freeze each action's body before sending. A later init must not rewrite it.
  A full denial supersedes older queued actions for the same frozen owner and
  domain. A grant never cancels an owed withdrawal.
- Retry on the next launch, on foreground, and on reachability change.
- Keep at most 20 payloads, dropping the oldest grants when needed. Never evict a
  distinct owner's owed withdrawal to make room. If those withdrawals fill the
  queue, refuse actions that cannot fit with `queue-write-failed`. A repeated
  denial for an existing owner can still replace its slot.

IAB disclosure bindings use the `gvl-v2:` format. Older projected bindings require
a fresh decision because their stored lists may have discarded unknown fields.

Platform lifecycle
------------------

Platform ports own the three lifecycle events that retry delivery and refresh policy.
The core separately schedules a one-shot deadline for IAB list or consent expiry, so
existing gates receive denial even while the app remains open.

- **Launch.** Hydrate, then replay the pending queue. Both cores do this inside
  `bootstrap`, before the first read is served.
- **Foreground.** Replay the pending queue, then refresh policy. A device that spent
  the night offline has a decision waiting to be delivered and possibly a notice that
  has aged out, and an app has no reason to go and ask about either.
- **Reachability.** Replay the pending queue and refresh policy when the process gains
  a network it did not already have. A recovered connection may be the first opportunity
  to fetch a missing or stale GVL after an offline launch.

A connectivity callback counts the network already up at registration as the state it
started in, not as a gain. Replaying there races the launch replay, and a core that
replays only the first genuine gain leaves a decision queued for the rest of a session
spent online.

Android reachability requires the host to declare `ACCESS_NETWORK_STATE`. If the
platform refuses registration, the installer logs it and keeps launch and foreground
recovery. Apple's `NWPathMonitor` needs no entitlement or manifest key.

Neither core polls the clock or refreshes on a fixed cadence. An expiry deadline
reevaluates local authority and notifies gates without fetching policy or recording a
consent action. A replacement snapshot cancels and reschedules that deadline.

Subject identity
----------------

Generate the subject id at first launch, store it in the same protected storage as
the records, and send it as the subject id. Do not derive it from any hardware
identifier. If the app is reinstalled, the store is gone and the subject starts
fresh, which matches the web SDK when storage is cleared.

The format is the one the backend validates, so a core that invents its own gets
every save rejected: `packages/schema/src/api/subject/post.ts` requires
`^sub_[1-9A-HJ-NP-Za-km-z]+$`. Build it as
`packages/core/src/libs/generate-subject-id.ts` does, byte for byte, because the
web SDK and both native cores have to produce ids a server cannot tell apart:

- 20 bytes: the big-endian signed 64-bit count of milliseconds since
  `1_700_000_000_000`, then 12 cryptographically random bytes. The offset may be
  negative on a clock set before the epoch, and is encoded as two's complement
  like any other signed value.
- Base58 over all 20 bytes with the Bitcoin alphabet
  `123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz`, one `1` prepended
  per leading zero byte.
- The `sub_` prefix.

A queued payload carries the id that produced it, so a subject id never changes to
fit a payload or a policy. Frozen bytes stay frozen: a core that rewrites the id on
a queued body has two records for one decision.

The read side is the other half of the rule, and it does not say "adopt whatever
was written". An id the producer will not accept is an identity this build cannot
use, and the contract already says what bytes this build cannot use are worth:
nothing, and indistinguishable from a fresh install. So a core that reads back a
stored subject id failing `^sub_[1-9A-HJ-NP-Za-km-z]+$` adopts no identity. It
treats the envelope as absent, comes up as a first launch, and emits
`subject-id-unusable` so the host can see why a returning user is being asked
again.

Re-minting an id underneath a decision that survived is the rejected alternative.
It splits one subject across two ids, leaves the earlier records attributed to an id
no query returns, and re-prompts nobody, so nobody ever notices. Discarding the
envelope re-prompts once and leaves one complete record, and it orphans nothing:
every save made under a refused id was already rejected by the producer, so the
backend holds no consent for it. The cost falls on installs written by a build that
accepted the legacy UUID shape, which is a prerelease population and no more.

Both cores emit `subject-id-unusable` on this path, and one conformance fixture per
core holds the line: a stored envelope with a well-formed decision under a subject id
the producer refuses must read exactly like a first launch, records and all.

The encoding is pinned by a table of eight vectors -- twelve random bytes, a wall
clock reading, and the id -- asserted identically in three places:
`packages/core/src/libs/__tests__/generate-subject-id.vectors.test.ts`,
`native/core-android/.../SubjectIdGeneratorTest.kt`, and
`native/core-swift/Tests/C15tCoreTests/SubjectIdTests.swift`. The clock column is
the reading the generator is pinned to, not the offset it encodes; the epoch is
subtracted inside, as the web SDK subtracts it from `Date.now()`. Add a row to all
three at once.

Wiping consent (reset)
----------------------

`reset()` returns the device to the state a first launch is in. That is the whole
requirement, and it exists for two reasons: a subject is entitled to withdraw every
grant and decide again, and a reviewer holding a device has to be able to see what a
new install looks like. iOS keeps the Keychain through an uninstall, so a reinstall is
not a fresh install, and Android needs `pm clear`.

The first-launch state and a recorded denial are not close. A recorded denial is an
`explicitChoice` that says the subject answered: the evaluator finds a current receipt,
owes nothing, and no surface comes back. A cleared device holds no receipt at all, so
the choice prompt is owed again, the next init re-evaluates, and the banner or dialog
returns. A wipe that stops at "deny everything and never ask again" is worse than no
wipe at all, because the subject cannot undo it. So the rule, stated where a core can
check it: after `reset()` the device holds no `explicitChoice`, no notice dismissal, no
policy claim, and no queued grant. Frozen withdrawals already owed to the backend
retain their original owner and body until delivered.

What the core publishes, and what it keeps:

    revision                                  current + 1
    policyPending / ready                     true / false, the cold-start pair
    promptRequirement / activeUI              none / none until the next init
    effectivePermissions                      necessary only
    explicitChoice, noticeDismissal, resolution, policySnapshotToken, location,
    translations, restrictions, nextDeadline, error
                                              absent, as a cold start leaves them
    subject                                   kept, external id included
    overrides, privacySignals                 kept: configuration, not consent
    consentCategories                         recomputed from that configuration: the
                                              declared scope with no policy left to narrow it

The kept list is load bearing. A host that pinned a country for QA, switched GPC on, or
narrowed the category scope has configured the device rather than consented with it, and
a wipe that un-pinned those would resolve a different policy than the one the app is set
up to evaluate. The subject id stays for the reason "Subject identity" gives: the backend
holds an audit history keyed to it, and dropping it locally orphans that history without
erasing a byte of it. Erasure is a backend call and a separate API. `reset()` wipes the
device and says so.

Reset is a committed mutation, so the rule under "Revisions and error writes" covers it
whole: one bump, one publication, observers and the paired event included. A core that
installs the baseline without publishing it leaves every gate in the process pointing at
a decision the device no longer remembers, so an analytics SDK keeps running against a
consent that was just withdrawn, and the pump has no reason to announce anything.
Publishing the baseline at the cold-start revision is the same mistake with a number
attached: it hands a subscriber a snapshot older than the one it already holds, and in
the Swift core it stops persistence for the rest of the session, because a write whose
revision is not ahead of the last one is refused. Reset moves the current revision by
one, and the next init continues from there.

For category-only state without an owed frozen withdrawal, reset deletes the
snapshot and queue keys. Only the subject identity remains until the next init
writes a fresh policy envelope. `hasStoredSnapshot` is false at this deletion.

For native IAB authority or an owed frozen withdrawal, reset atomically writes
the cold-start snapshot with no consent authority or policy claim. This envelope
retains the action-time watermark and any owed frozen withdrawals. It prevents a
failed deletion from restoring an earlier grant. `hasStoredSnapshot` is true on
both platforms because the envelope exists; that flag does not assert a consent
decision, readiness or a grant.

Then it re-runs init, the way bootstrap does. A first launch does not sit at
`policyPending` once the network answers, and a wipe that stopped at the baseline would
leave the app sitting there until the next launch, with the subject withdrawn from
everything and nothing asking for the decision they are entitled to make again.
Re-resolving belongs to the wipe rather than to the caller: a bridge that calls
`refresh()` after `reset()` hides a core that does not finish its own work, and every
host would have to be told the order.

Reset creates no new consent decision or delivery obligation. Previously owed
withdrawals may still be delivered, and the backend keeps its audit history.
Reset also cannot recall a request already on its way. A save a delivery pass
had handed to the transport may still land after the wipe, and the pass finds its entry
gone when it settles. The bridge promise resolves once the local state is durable and
does not wait on that request, because its outcome is not something a caller can act on.
Undelivered entries go with the queue, which is the right answer: they carry a decision
the subject just withdrew.

React Native boundary
---------------------

New Architecture only. TurboModule plus Codegen, no legacy bridge, no
`NativeModules` string lookups.

    getBootstrap(): BootstrapPayload          // sync, once per provider mount
    getSnapshot(): ConsentSnapshot            // sync, JSON string
    commit(intent: CommitIntent): Promise<CommitResult>
    setOverrides(overrides): Promise<void>
    dismissNotice(): void
    refresh(): Promise<void>
    identify(externalId): Promise<void>
    logout(): Promise<void>
    reset(): Promise<void>                      // wipe consent, keep the subject id
    getTrackingAuthorization(): TrackingAuthorizationPayload   // sync, JSON string
    requestTrackingAuthorization(): Promise<TrackingRequestPayload>
    presentConsentPrompt(privacyPolicyURL): Promise<ConsentPresenterSession>
    presentPreferences(privacyPolicyURL): Promise<ConsentPresenterSession>
    closeConsentPresenter(sessionId): Promise<void>
    addListener(eventName): void              // RNEventEmitter spec
    removeListeners(count): void

`packages/react-native/src/specs/NativeC15t.ts` is the authoritative list.

A commit intent may carry `revision`, the snapshot revision a draft was built on.
The bridge passes it to `save` as `expectedRevision`, so the core refuses the commit
with `concurrent-change` if anything was recorded since; JavaScript reads a cached
snapshot, and only this check can see a decision made in between. A `revision` that
is not a whole number is `invalid-intent`. `getBootstrap()` reports
`commitRevision: true` from builds that do this; `ADDITIVE_BOOTSTRAP_DEFAULTS` reads
an older binary as `false`, and the draft then saves unpinned.

`commit` takes `all`, `necessary`, `explicit`, and `iab`. An `iab` intent is a
headless TCF draft: `choices` names every `IABChoices` list (IDs are JSON numbers),
`consents` the categories it confirms, and an optional `revision` the core passes as
`expectedRevision`, so a change since the draft was opened is refused as
`concurrent-change`. The core validates IDs and legal bases as for the stock
presenter. The bridge adds four keys inside the snapshot's `iab` object, beside the
core's `gvl`: `committed: { tcString, addtlConsent, choices } | null` from
`iabConsent()`; `headlessUnsupported`, which lists `publisher-restrictions` when
`iabPublisherRestrictions` is not empty and `additional-consent-providers` when
`adTechProviderDisclosures()` is not empty, the disclosures a screen built on the raw
list cannot make; `acceptAll: IABChoices | null` from `iabAcceptAllChoices()`, sent
only while `headlessUnsupported` is empty; and `editable`, which is
`acceptAll != null`. They are additive without a protocol bump:
`ADDITIVE_IAB_DEFAULTS` in `wire-shape.ts` reads an older bridge as
`committed: null, editable: false, acceptAll: null, headlessUnsupported: []`, so
JavaScript offers no edit it cannot commit.

`c15t.nativeUI` false (`Podfile.properties.json` or `C15T_NATIVE_UI=0` for the pod,
`gradle.properties` for Android) builds the bridge without the stock screens: the
pod drops `vendor/C15tConsentUI` and `C15tConsentHost.swift` and compiles with
`C15T_NO_NATIVE_UI`; Android compiles `src/withoutNativeUi` instead of
`src/nativeUi` and drops `c15t-consent-ui`. `getBootstrap()` reports `nativeUI`,
and the presenter methods reject with `C15T_NATIVE_UI_EXCLUDED`. `nativeUI` is
additive without a protocol bump: `ADDITIVE_BOOTSTRAP_DEFAULTS` in `wire-shape.ts`
reads an older binary, which sends no flag and always links the screens, as `true`.

Events: `snapshot`, `error`, `initialized`, and `onConsentPresenterOutcome` for the
native presenter. The payload is a JSON string. The
module never sends a snapshot the JavaScript side already holds: it emits the new
`revision` and JavaScript pulls with `getSnapshot()` only when a mounted
subscriber needs it. Selector subscriptions in `@c15t/react-native` compare the
selected value and rerender only on a change.

That dedup is only safe because of "Revisions and error writes" above. The pump is
fed by the core's snapshot observers, not by the core's own event hub, so a
mutation that never reached the observers is a mutation JavaScript cannot learn
about by any route except the paired `error` event -- which is the accident the
iOS core had instead of the rule.

What Codegen owns, and what does not
------------------------------------

Codegen generates one thing per platform: the abstract spec class on Android, the
`NativeC15tSpec` protocol on iOS. Everything else on the boundary is hand-written -- the
Kotlin module, the Swift module, and the Objective-C++ category carrying the conformance,
the JavaScript name, and `getTurboModule:`. The split is forced rather than chosen.
Codegen's iOS header opens with a directive that refuses to compile as plain
Objective-C, so no Swift file can name the protocol or conform to it, and the Android
class is generated per build into whichever module actually ran Codegen, so a linked
library that runs none has no copy to compile against.

A green build therefore proves nothing about the generated side on its own, and the
hand-written side compiles against a description of it. Three things make that claim
checkable:

- This repository runs React Native's generator against its own spec.
  `packages/react-native/android/codegen/generate-spec.mjs` calls `@react-native/codegen`
  with library semantics -- library name, `jsSrcsDir`, and `javaPackageName` all from
  `codegenConfig` -- and `-Pc15t.spec.source=codegen` swaps the spec module's source set
  to what it writes. `react-native/scripts/generate-codegen-artifacts.js` is not that
  path: it treats the folder as an app and emits under its own default package,
  `com.facebook.fbreact.specs`, which is neither what `codegenConfig` declares nor what
  the module is compiled in.
- `packages/react-native/src/specs/__tests__/{android,ios}-spec-surface.test.ts` spawn
  that same generator and compare its output to the hand-written side: module name,
  method names, argument types, return types, the synchronous flag, and the JSON-string
  payload convention. Their expectations come from `spec-contract.ts`, which reads the
  TypeScript, so two hand-written files agreeing with each other while both drift from
  the spec is still a failure. This is the check for what a build cannot see:
  `removeListeners(Double)` and `removeListeners(double)` are two different overrides to a
  Kotlin subclass and both compile, and a renamed selector surfaces as an unrecognized
  selector on a user's JavaScript thread rather than a compile error.
- CI runs both on a plain Linux runner, in `Mobile SDK (android-js)`: the Node check as
  part of the package suite, the Gradle command as a step that fails when generation
  wrote no file or when the spec class reached the AAR.

The generated class stays `compileOnly` in every mode, because two copies of it in one app
is a duplicate-class failure. Codegen mode changes what the spec module compiles, never
what any published artifact carries, and the CI assertion against `classes.jar` is what
keeps that from being a hope.

Safe-area insets
----------------

The bridge does not carry them, and it is the wrong place for them. Nothing in
`getBootstrap()`, the snapshot, or the three events names a screen band, and rule
2 keeps the consent cores free of UI: a home indicator is not consent state, and
neither core owns a window or a UI thread to read one from.

The bands reach the surfaces from the app instead, through `ConsentProvider`'s
`safeAreaInsets`, which the provider publishes on a context and
`useConsentSafeArea()` reads. The host measures rather than the bridge because
React Native itself has no inset API worth calling one: `SafeAreaView` is
deprecated and returns no numbers, and `StatusBar.currentHeight` is an Android
status bar height snapshotted at import, so it misses the navigation bar and does
not follow a rotation. `react-native-safe-area-context` is not a dependency
either, and not only to keep the install small. Metro resolves every static
`import` when it builds the bundle, so a conditional read of an optional peer
from inside this package is a hard resolution failure for the hosts that did not
install it, and the library needs its own provider at the app root regardless.
An app holding any inset source hands the four numbers over and nothing else
changes.

A host that measures nothing still does not render its controls under a home
indicator. `useConsentSafeArea()` then reports the 44-point interaction minimum
the theme already enforces as the bottom band, which is wider than the widest
home-indicator inset Apple ships, and takes `StatusBar.currentHeight` for the top
band on Android. `ConsentSafeArea.measured` records which of the two a surface
laid out against, so the gap between a reserved floor and a measurement is
something a host can log rather than discover on a device.

Rotation and the collapsing iOS home indicator are a re-render rather than a
remount: the bands arrive as a value, the surfaces read them during render, and
no inset is cached in a native subscriber that would need its own invalidation.

Version handshake
-----------------

`getBootstrap()` returns `protocolVersion`. The provider throws a readable error
when `protocolVersion` is outside the range the installed JavaScript package
supports. This catches the Expo Updates case where a JavaScript-only update ships
against an older embedded native build.

A snapshot key added without a protocol bump must be additive: its absence has to
mean "this build has no such state". The key goes in `ADDITIVE_SNAPSHOT_DEFAULTS`
(`packages/react-native/src/protocol/wire-shape.ts`) with that default, and the
client fills it before reading or grading the snapshot, so an older binary is
neither `undefined` behind a typed field nor reported as drift. `gppString` is
one: an older binary has no GPP, so it reads as `null`. `promptOwedSince` is
another, and a bridge-added one (`BRIDGE_SNAPSHOT_KEYS`): an older binary names
no owed prompt, so it reads as `null`, and auto-present falls back to the
transitions it observes. A key whose absence cannot be answered that way needs a
new protocol version.

Conformance fixtures
--------------------

`native/protocol/*.json`, generated by `packages/react-native/scripts/` from the
TypeScript kernel. Seven kinds:

- `evaluation-*.json`  transport response plus stored records in, snapshot out.
- `save-body-*.json`   transport response plus action in, exact request body out.
- `native-envelope-*.json` an action in, the stored field set and the offline
  decision out. This is the one kind the kernel does not produce; see "The stored
  envelope" above.
- `revision-trace-*.json` a mutation sequence in, the revision trace the kernel
  produced for it out: one `{ step, revisionDelta, publications }` per step. This
  is the cross-core parity fixture. It pins what each step costs rather than the
  absolute revision, because that is the half the three implementations can share.
- `reset-consent-*.json` a device with a recorded answer in, the wipe out: the
  snapshot `reset()` publishes, what is left on disk under it, and the snapshot the
  device answers with once the init it re-ran lands. The pair holds a device that had
  accepted everything and a device that had recorded a denial, and their expected
  answers are identical, which is the claim "Wiping consent (reset)" makes.
- `vendor-list-scope-*.json` a served vendor list plus the vendor scope a publisher
  declared in, the narrowed list the web filter produced out. The web
  `narrowGVLToVendors` is the oracle here rather than the kernel, because a mobile
  core holds a list a host or an init handed it and no device fetches the list. It
  pins the surviving vendor keys in served order, what each survivor states about
  itself, and every record beside `vendors` unchanged.
- `tc-string-*.json` a TC Model plus encoding options and a vendor list in, the
  encoded string out and every field a decoder must report back.

An `input` is what a client actually sees, never a convenience shape a generator
invented. Every fixture carries `now` (the fixed clock every side must use),
`hydrated`, the literal `transport` response (`status`, `headers`, and the `/init`
`body`, which holds the `policyResolution` wire value rather than raw
`policyRules`), the `storedRecords` protected storage holds at start, the device's
`overrides` and `privacySignals`, and `user`. A `save-body-*` input adds the
`intent`. A fixture about the host's declaration adds `consentCategories`, where `null`
is a host that declares nothing; a fixture without the key was generated with every
category declared, and a runner configures its core that way. Nothing is derived from a random value: the subject id is always
supplied, so no fixture depends on a CSPRNG. The fixtures carry ids in the base58
`sub_` shape under "Subject identity". A stored legacy UUID is refused as that section
describes, which `UnusableSubjectIdTest` (Kotlin) and `UnusableSubjectIdTests` (Swift)
cover rather than a shared fixture.

An `expected` is what the kernel produced for that input. It is not hand-written,
with the single exception named in "The stored envelope". `evaluation-*` pin
`snapshot`, the subset of the mobile snapshot named above. `save-body-*` pin
`snapshotBefore`, `snapshotAfter`, the `savePayload` the core must hold, and
`request`: the exact `method`, `path`, `headers`, and `body` the backend receives,
including the `x-c15t-policy-contract` value. `native-envelope-*` pin `write`,
`relaunch`, the field set in `fields`, and for a read case `read`.

`index.json` lists every fixture with `id`, `kind`, `protocolVersion`, `file`,
`bytes`, and `sha256`, plus the shared `clock`, `count`, `protocolVersion`, and
`policyContractHeader`. A runner enumerates the index rather than the directory, so
no platform hard-codes file names, silently skips a fixture, or reads a file that
was edited after generation. Every runner verifies each hash, and the generator
refuses to write a fixture whose `protocolVersion` differs from `PROTOCOL_VERSION`.

Each native core runs every fixture in its own test runner and prints how many it
ran. A fixture that only one platform passes is a bug on that platform, not a
permitted difference. Where a core is knowingly wrong, its runner keeps an explicit
row per field with the reason; a difference that is not listed fails the run, and so
does a listed row that no longer reproduces. Nothing may be skipped silently.

Benchmarks
----------

Budgets, measured on the reference device profile agreed in the issue:

- `bootstrap()` to first synchronous `snapshot()`: under 5 ms warm, under 15 ms cold.
- `snapshot()` and `isAllowed()`: no allocation of a new snapshot per call.
- Hydrate from stored envelope: under 3 ms for a realistic payload.
- Consent action to native commit acknowledged: under 50 ms without network.
- React rerenders per consent change: at most one per subscribed component.
- Cold-start overhead attributable to c15t: under 10 ms.

Report them as numbers from the bench tasks, not as claims.

Implemented layout
------------------

Recorded here as the pieces land, so the Swift, Kotlin, and JavaScript workers
build against the same reality.

- `packages/react-native/src/protocol/` is the TypeScript source of truth for the
  boundary types. `PROTOCOL_VERSION` and the supported range live in `version.ts`.
- The Codegen spec is `packages/react-native/src/specs/NativeC15t.ts`. The
  codegen config name is `C15tSpec` and the module name is `C15t`. Native targets
  must register exactly that module name.
- The package expects iOS at `packages/react-native/ios/` with
  `C15tReactNative.xcodeproj`, and Android at `packages/react-native/android/`.
- Fixtures live in `native/protocol/*.json`, one file per case plus `index.json`.
  Each fixture carries `id`, `kind`, `description`, `notes`, `protocolVersion`,
  `input`, and `expected`. A native test reads `input`, computes, and asserts
  against `expected` field by field. Regenerate with
  `bun run --cwd packages/react-native generate:fixtures`, which is byte-stable:
  two runs produce the same bytes, so a diff in `native/protocol/` is always a
  real change and never a timestamp.
- All seven kinds are generated, and both native cores claim and run all seven. Each
  runner keeps a set of the kinds it has a function for, derives its unclaimed count
  from that set, and fails when the count is not zero, so a kind goes unrun only by a
  branch nobody wrote. The web v3 record envelope that used to be reported unclaimed
  here is not a format either native core speaks; its codec stays covered in
  `packages/core`, where it lives.

Kotlin core, as built
---------------------

`native/core-android/` is a Gradle 9.4.1 project with the wrapper checked in.

- `c15t-core` is the pure-JVM consent engine. A test asserts that no source file
  imports `android.*`, so keep it that way. Run it with
  `./gradlew :c15t-core:test --console=plain`.
- `c15t-android` implements the storage and lifecycle ports: AndroidKeyStore
  encrypted storage with a `SharedPreferences` fallback, an `androidx.startup`
  `Initializer` that calls `bootstrap()`, a `ProcessLifecycleOwner` observer
  that calls `flushPending()` and `refresh()`, and a `ConnectivityManager`
  callback that calls `flushPending()` and `refresh()` on a gained network. The callback is the
  one port that can be declined: without `ACCESS_NETWORK_STATE` in the host's
  manifest the registration is refused, and `C15tReachability.register` logs it
  and returns `null` rather than failing the install.
- Measured on the development machine, release JVM: hydrate 25.4 us, policy
  evaluation 0.63 us, snapshot plus three `isAllowed` reads 0.04 us, save
  acknowledged without network 102 us. `./gradlew :c15t-core:bench` reproduces them.
- Losing the keystore key keeps the subject id. It lives in its own plain
  `c15t.subject` preference file, outside the encrypted records, because it is a
  random identifier the SDK owns and carries nothing sensitive. `SubjectPreservingStore` routes it
  there and migrates installs that had it encrypted, once and idempotently. When
  a key dies, `ResilientKeyValueStore` deletes the blobs it can no longer open,
  warns once, and serves deny-all with `policyPending: true`. The SPI exposes
  `KeyValueStore.keys()` for that purge only, and defaults to `emptySet()`.
- Every mutation in `ConsentCore` already ended in `persist()` and
  `notifySnapshot()` together, including the failed-init path that records
  `unsupported-contract`, so this core needed no change to satisfy "Revisions and
  error writes". `ProtocolFixtureTest` runs the revision trace to keep it that way:
  the same four steps, the same two numbers per step, the same expectations the
  Swift runner reads.

Swift core, as built
--------------------

`native/core-swift/` is a standalone SwiftPM package, `C15tCore`, plus a
`C15tCoreBench` executable. No UIKit, React Native, or Expo imports.

- Verified with the toolchain `xcode-select` already resolves: `xcode-select -p`
  reports `/Applications/Xcode.app/Contents/Developer`, so `swift test` and
  `swift build` need no `DEVELOPER_DIR` override. An earlier revision of this
  contract said Command Line Tools was selected and that every Swift command had
  to set the variable; that was a property of one machine's shell, not of the
  package, and CI does not need it.
- Layout: `ConsentCore`, `ConsentSnapshot`, `ConsentRecord`, `ConsentCategory`,
  `ConsentStore` with in-memory, file, and Keychain conformances, `PolicyEvaluator`,
  `PolicyWire`, `SavePayload`, `StoredEnvelope`, `PendingSaveQueue`,
  `SubjectIdentity`, `Transports`, `Events`, `Lock`, `JSONValue`.
- Measured: hydrate from store 212.67 us, policy evaluation 1.82 us mean, snapshot
  and isAllowed 0.09 us each over 500000 iterations, save acknowledged without
  network 205.74 us in memory and 1434.66 us on FileStore. `swift run -c release
  C15tCoreBench` reproduces them.
- The iOS simulator slice builds with
  `xcodebuild -destination 'generic/platform=iOS Simulator' build`.
- `Tests/C15tCoreTests/ProtocolFixtureTests.swift` runs the shared fixtures: it
  enumerates `index.json`, verifies every hash and `protocolVersion`, dispatches on
  `kind`, and diffs the produced snapshot against `expected` recursively, so a
  mismatch names the field and both values. It claims every entry in `index.json`;
  an unclaimed entry fails the run.
- Fixed while wiring the revision trace: the unsupported-contract branch of
  `reportInitFailure` wrote `error` and announced the new revision on the core's own
  event hub, but never called `publish()`. The React Native pump is fed by
  `onChange`, not by that hub, so iOS bumped the revision with no observer
  notification and no envelope write: the error write was committed and unpublished,
  exactly what "Revisions and error writes" forbids. It goes through `publish` now.
  The `revision-trace-*` fixture is what catches it, and only on the `publications`
  column: the revision deltas agree either way, which is why the fixture observes
  both.
- Fixed while wiring the fixtures: `save()` reported `uiSource` from the snapshot
  published after the commit, so a save made from the dialog after the banner had
  already cleared said `banner`. The surface the subject acted on is now captured
  before the state changes. The fixtures pin the save body, so this was visible.
- Fixed while wiring the fixtures: `restrictions` encoded as one flat array of
  alternating keys and values (`["marketing",["gpc"]]`), because a Swift
  dictionary keyed by an enum has no coding key of its own. The protocol says an
  object keyed by category, which is what the kernel and Kotlin send, so the field
  was unreadable to JavaScript even though the reasons inside it were right.
  `OptionalConsentCategory` now supplies the coding key and the categories are
  written in name order, so a stored snapshot does not depend on dictionary order.
  Snapshots stored by an earlier build no longer decode, and the store treats an
  unreadable envelope as nothing stored, which fails closed.

iOS packaging, as built
-----------------------

A CocoaPods RN host integrates the binding pod, which carries generated core and
Apple sources in the same compiled module:

    platform :ios, '16.4'

    pod 'C15tReactNative',  :path => '../packages/react-native'

- Do not also link `C15tCore` or `C15tApple` separately in that RN process. Host
  installation imports `C15tReactNative` and uses the types compiled into that
  module, so RN attaches to the same core and Keychain owner. See
  `docs/internal/apple-installation.md` for the source-consumer distinction.
  `C15tCore.podspec` remains a local core-only spec, not a published dependency.
  The app must declare iOS 16.4, which is above RN 0.87's own 15.1 floor.
- `packages/react-native/package.json` needs
  `codegenConfig.ios.modules.C15t.className = "C15tReactNativeModule"`, because RN
  0.87 resolves TurboModules through generated `RCTModuleProviders`. Verified by
  running RN's own generator against this package: it emits
  `@"C15t": @"C15tReactNativeModule", // @c15t/react-native`.
- `com.c15t.reactnative.AutoBootstrap = false` in `Info.plist` skips the launch hook
  that starts the core before React Native initializes. An app that does that must
  call `C15tReactNativeRuntime.install(core:)` or `startCore()` itself, before the
  React host starts, or the module reads an empty deny-all store.
- iOS starts the core from a `+load` on a class defined in the same translation unit as
  the launch hook, and that is a link-time requirement the host build can verify.
  CocoaPods builds the binding as a static archive, and the linker keeps an archive
  member only if something references it or the host links `-ObjC` and the member
  defines an Objective-C class or category. A member whose entire content is an
  `__attribute__((constructor))` is neither, and was silently dropped: the app linked the
  pod's classes and carried no `__TEXT,__init_offsets` section, so the core came up on
  the first `getBootstrap()` from JavaScript instead of before it. Any early-start hook in
  this pod therefore lives beside an Objective-C class. The check on a built app is
  `otool -l` on the linked image for that section, not a unit test: nothing inside the pod
  can see whether the host linked the file in.
- Resolution is proven, not parsed: `pod install` in a throwaway RN 0.87.1 app under
  /tmp installed 85 pods including both c15t pods from those paths, under
  CocoaPods 1.17.0 and `DEVELOPER_DIR` pointing at Xcode 27.
- The binding's RN config file is `react-native.config.js`, written as ESM, and it must
  keep that name. It used to be `.cjs`, on the reasoning that a `"type": "module"`
  package hides a plain `.js` from `require`. That is wrong for Expo:
  `expo-modules-autolinking`'s `loadConfigAsync` searches exactly
  `react-native.config.js` and `react-native.config.ts` and nothing else, so a `.cjs`
  is not read. Reproduced on this tree, not theorised. With the file named `.cjs`,
  `expo-modules-autolinking react-native-config --platform android --json` from
  `internals/fixtures/expo-dev` returned only `expo`. Expo then falls back to
  `sourceDir: 'android'`, whose `build.gradle.kts` declares no namespace, so
  `parsePackageNameAsync` returns nothing, `resolveDependencyConfigImplAndroidAsync`
  returns `null`, and the package is dropped from the generated `PackageList.java`
  silently. CI's `assembleDebug` was green the whole time because an empty package list
  still assembles. After the rename the same command reports
  `sourceDir: .../android/c15t-react-native` with
  `packageImportPath: import com.c15t.reactnative.C15tReactNativePackage;`.
  `@expo/require-utils`' `evalModule` accepts ESM and CommonJS bodies in a `.js`, and
  the community CLI's cosmiconfig search order is `.js`, `.cjs`, `.ts`, `.mjs`, with the
  async loader used by `react-native config`, so one ESM `.js` satisfies both linkers.
  `scripts/react-native-autolink.ts` now asserts both, because the bare fixture alone
  could never see this: Expo's `expoAutolinking.rnConfigCommand` never asks the
  community CLI anything.
- `c15t.spec.source` is read by both build scripts. `auto` and `stub` compile the
  hand-written stand-in in `:c15t-spec`; `codegen` runs `@react-native/codegen` over
  `src/specs` through `android/codegen/generate-spec.mjs` and swaps that module's source
  set to the result, so this repository does run RN's generator against its own spec, on
  Linux, in CI. A host app has no `:c15t-spec` project, so there the bridge generates into
  itself and `auto` resolves to generation rather than to a stand-in that is not linked.
  Either source reaches the bridge as `compileOnly`, so no copy of the class enters the
  AAR. An unrecognised value fails the build instead of quietly picking one.

Expo config plugin, as built
----------------------------

`packages/react-native/src/expo-plugin/` is published as
`@c15t/react-native/expo-plugin`. It runs at `expo prebuild`, `expo run:*`, and
`eas build` time and ships nothing that executes in the app, so Continuous
Native Generation needs no patch step and `prebuild --clean` loses nothing. Its
default export is `withC15t` inside `createRunOncePlugin`, and
`applyParamsOnConfig` is exported next to it because that is the pure core the
tests drive. A standard install adds one `plugins` entry and nothing else:

    ["@c15t/react-native/expo-plugin", {
      "backendURL": "https://consent.example.com"
    }]

`backendURL` is required in every mode but `offline`, and a base path is allowed
so a same-origin deployment works unchanged. `mode` is `hosted`, `selfHosted`,
`offline`, or `custom`. There is no credential parameter: a project is identified
by its backend URL, and neither core's `/init` nor its `/subjects` request carries
a key, so the plugin has nowhere honest to put one. `forceGPC` is for staged
builds. `consentCategories` declares the categories the app offers, so the same
backend and the same declaration list the same rows as a web app; an unknown id
or an empty list fails the prebuild rather than quietly meaning something else.
`autoBootstrap`
defaults to `true`, and to `false` under `mode: 'custom'`, where leaving it on
would race the host. `skipNativeBuildCheck` waives the Expo Go check for a
harness that drives `expo start` in a container without opening Expo Go.

Keys the plugin writes
----------------------

Both platforms get the flat reverse-DNS names their readers already use, not a
`C15t` dictionary. iOS reads them through `C15tBridgeConfiguration.InfoPlistKey`,
Android through `C15tAndroid` and `C15tReactNativeBootstrap`:

    iOS Info.plist                      Android <meta-data>
    com.c15t.backend.url                com.c15t.BACKEND_URL
    com.c15t.backend.mode               com.c15t.MODE (offline only)
    com.c15t.policy.rules               com.c15t.POLICY_RULES
    com.c15t.backend.domain             com.c15t.BACKEND_DOMAIN
    com.c15t.forceGPC                   com.c15t.FORCE_GPC
    com.c15t.backend.initUrl            com.c15t.BACKEND_INIT_URL
    com.c15t.categories                 com.c15t.CATEGORIES
    com.c15t.reactnative.AutoBootstrap  com.c15t.reactnative.AUTO_BOOTSTRAP

Each key keeps its platform's casing, lowercase dotted on iOS and upper snake on
Android, and both spell the same concept with the same words. Absent values stay absent: the
bridge treats a missing key as "not configured" and has to parse an empty
string. `AutoBootstrap` is written only in the opt-out case, since on is the
bridge's own default.

`consentCategories` is the host-facing parameter; the two keys are its native
spellings, the same declaration a web host passes to its provider as
`consentCategories`. The list is what the app offers, and it only ever narrows
the optional half of the resolved policy scope: `snapshot.consentCategories` is
`necessary` plus (scope ∩ declaration), and a name the policy does not govern is
dropped. With no declaration a strict or IAB rule offers its full scope and any other
permissive rule offers `necessary` alone, with an acknowledgement prompt; see "State model". iOS reads a string
array and drops entries that are not category raw values; Android reads a
comma-separated list, trims spaces around each name, and drops unknown names the
same way, so a mistyped id narrows the rows rather than installing a category
that cannot exist. A declaration that parses to nothing reads as absent. Neither key travels to JavaScript
through `extra.c15t`: the snapshot already carries the decided list, and a
second copy could only disagree with it.

Android types the value, not the app: an unquoted `android:value="true"` reaches the
meta-data bundle as a `Boolean` and an unquoted `1` as a `Long`, and only a quoted
literal stays text. So every Android key here is read through `C15tManifestValue`,
which takes the raw entry and accepts the boolean, the number, and the text spellings
of each, with `true`/`false` case-insensitive and `1`/`0` allowed. A value that means
neither reads as absent, never as `false`. A reader that named one type would honour
whichever spelling the app happened to use, which is how the plugin's
`com.c15t.FORCE_GPC` and a hand-written manifest nearly disagreed about a staged build.

Every key in that table has a reader, and the rule is that it must. Both ends are
greppable, so `native-key-readers.test.ts` in `packages/react-native` reads the
reader sources and fails the build when the plugin writes a key no constant names.
An unread key is not a spare knob: it is a wrong promise carried inside a shipped
binary, and the app looks configured while one platform runs something else.
`com.c15t.backend.publicKey` / `com.c15t.PUBLIC_KEY` were exactly that and are
gone; iOS `com.c15t.backend.initUrl` was a silent wrong-backend bug, since Android
honoured its `com.c15t.BACKEND_INIT_URL` and iOS kept building `${base}/init`, and the
bridge now passes it to `HostedTransport` the way `@c15t/core` and Android do:
the value is used as given, and only an absent key takes the default.

`mode` is spelled three ways on purpose. `custom` is the iOS bridge's `none` and
no androidx.startup initializer on Android. `offline` embeds no backend URL at
all. `selfHosted` reaches JavaScript as `hosted`, because
`ProviderTransportKind` in `@c15t/core` has no self-hosted kind. JavaScript reads
the same values from `extra.c15t`: `backendURL`, `initURL`, `domain`,
`mode`, `enableAppTrackingTransparency`, and the `protocol` range.
There is no second config source.

Theme keys
----------

The `theme` prop writes the native theme keys, `com.c15t.consent.*`, that
`ConsentTheme.InfoPlistKey` in `consent-theme.swift` and `ConsentTheme.Meta` in
`consent-theme.kt` read. Its field names follow the web `Theme` in `@c15t/ui`,
and so do the native token names. The prop is the `ConsentThemeOptions` type
`createConsentTheme` takes, so one object themes both renderers. The plugin
maps it in `src/expo-plugin/theme.ts`:

    theme field              web token                 iOS / Android key suffix
    colors.primary           --c15t-primary            primary / PRIMARY
    colors.textOnPrimary     --c15t-text-on-primary    textOnPrimary / TEXT_ON_PRIMARY
    colors.surface           --c15t-surface            surface / SURFACE
    colors.text              --c15t-text               text / TEXT
    colors.textMuted         --c15t-text-muted         textMuted / TEXT_MUTED
    colors.canvas            (none)                    canvas / CANVAS
    colors.surfaceMuted      (none)                    surfaceMuted / SURFACE_MUTED
    colors.decision          (none)                    decision / DECISION
    colors.textOnDecision    (none)                    textOnDecision / TEXT_ON_DECISION
    radius.sm, .md, .lg      --c15t-radius-*           radiusSm.. / RADIUS_SM..
    spacing.xs .. .xl        --c15t-space-*            spaceXs.. / SPACE_XS..
    typography.fontSize.*    --c15t-font-size-*        fontSizeSm.. / FONT_SIZE_SM..
    typography.fontFamily    --c15t-font-family        fontFamily / FONT_FAMILY
    typography.headlineFont  (none)                    headlineFont / HEADLINE_FONT
    slots.<slot>.<field>     web slots                 <slot>.<field> / <SLOT>_<FIELD>
    brand.name, brand.mark   (none)                    brandName, brandMark / BRAND_NAME, BRAND_MARK
    brand.hidden (inverted)  (none)                    brand / BRAND
    branding.provider        (none)                    brandingProvider / BRANDING_PROVIDER
    branding.name, .mark     (none)                    brandingName, brandingMark / BRANDING_NAME, BRANDING_MARK
    branding.hidden (inv.)   (none)                    branding / BRANDING

`dark.<color>` joins its `colors.<color>` as the `#light,#dark` pair both readers
parse, and needs that light value. Colors must be `#RRGGBB`; a CSS function, an
alpha channel, or a field neither renderer draws fails the prebuild. Fields only
the React Native components draw (`motion`, `typography.fontWeight`,
`typography.lineHeight`, and colors such as `border`) are checked and not
written.
`typography.fontFamily` and `typography.headlineFont` take one string or
`{ ios, android }`: iOS reads a PostScript name and Android a font resource name.
A single string must be a valid resource name (lowercase letters, digits, `_`), or
for `headlineFont` a keyword such as `serif`; otherwise the prebuild fails and
shows the per-platform form. A per-platform name is written to that platform's
key only. The body readers know no keywords, so `fontFamily: 'serif'` fails too.
With `theme` set the plugin owns every key above and clears the ones the prop no
longer names; without it the plugin registers no theme write, so an app-owned
config plugin keeps working. The copy keys (`headline`, `introduction`) are not
part of the prop. `__tests__/theme.test.ts` checks every key against both reader
sources.

Rules the plugin enforces at build time
---------------------------------------

- App Tracking Transparency is opt-in and never implied.
  `NSUserTrackingUsageDescription` and `SKAdNetworkItems` are written only under
  `enableAppTrackingTransparency: true`, which also requires
  `trackingUsageDescription` because Apple rejects a string the plugin invented.
  A prompt string the host already wrote survives. Consent to marketing cookies
  is not Apple tracking authorization, so no consent setting turns these on.
  `trackingMarkdownUsageDescription` is optional beside it and never replaces it:
  Apple falls back to the plain string outside the regions it gates the expanded
  prompt to and on every system that predates it, so the plain key is written
  whenever the opt-in is on. Per-locale copies go to each
  `<locale>.lproj/InfoPlist.strings`, because `Info.plist` holds one value per
  key, and that file is merged rather than rewritten because the host's own
  localized strings live in it. Markdown copy named while the opt-in is off
  fails the prebuild: it would compile a prompt into the binary that no sheet can
  draw.
- The privacy manifest is declared as `ios.privacyManifests`
  (`NSPrivacyTracking`, `NSPrivacyTrackingDomains`) instead of as a
  `PrivacyInfo.xcprivacy` the plugin writes itself, because prebuild's default
  plugins already merge that field and would fight the file.
  `NSPrivacyTracking` mirrors the ATT opt-in. `NSPrivacyTrackingDomains` defaults
  to the backend host, has to contain it when ATT is on, and is refused when ATT
  is off, because a tracking domain with no tracking prompt is not a claim the
  plugin can make for the host. The core declares no required-reason API: the
  Keychain and its own application-support files are not on Apple's list.
- Android gets `android.permission.INTERNET` and an
  `androidx.startup.InitializationProvider` with authority
  `${applicationId}.androidx-startup` pointing at
  `com.c15t.reactnative.C15tReactNativeInitializer`, so the core is hydrated
  before the first Activity exists. Starting it twice is harmless, since
  `C15t.bootstrap` ignores the second call. In an SDK 57 prebuild only the
  provider is observable in a diff against the same app with no plugin: the
  bare template already asks for INTERNET, so the plugin's write lands on a
  permission that is already there.
- The plugin does not add `android.permission.ACCESS_NETWORK_STATE`. That
  permission buys only the reachability leg of the queue replay, and a host that
  wants the shorter retry declares it itself; the plugin writing it would trade
  every host's manifest for one wake-up nobody asked for.
- The Android SDK floor, `minSdk` 24 and `compileSdk` 36 from
  `native/core-android/gradle/libs.versions.toml`, is checked, not raised.
  Below it the manifest merger or the AAR compile fails with a message that
  names neither c15t nor the number. An Expo 55 to 58 template writes no SDK
  number: `app/build.gradle` reads `rootProject.ext.*`, and the
  `expo-root-project` Gradle plugin fills that from a root `ext` block, then the
  `android.minSdkVersion` and `android.compileSdkVersion` keys in
  `gradle.properties` (which `expo-build-properties` writes), then React
  Native's version catalog. The catalog defaults (24, and 36 or 37) meet the
  floor, so only an explicit value can fall below it, and an explicit value was
  set on purpose and would be written back by the next prebuild. A finalized
  Android mod, which runs after every other plugin's mods, reads
  `gradle.properties` and the root and app `build.gradle(.kts)` and fails the
  prebuild when the level Gradle applies (an app-module literal, else the last root `ext` assignment, else the last `gradle.properties` entry; comments never count) is below the floor, naming that setting and where to change it.
  `__tests__/android-sdk-floor.test.ts` runs it against the unchanged SDK 55,
  57 and 58 templates. `targetSdkVersion` is never read.
- Expo Go fails the build with a message rather than failing at runtime. The
  check stays quiet when an `EAS_BUILD*` variable is set, when the command is a
  native one (`prebuild`, `run:`, `build`, `config`, `doctor`), or when an `ios/`
  or `android/` directory exists.
- Registering the module by hand as well is an error, detected in
  `MainApplication` (`C15tReactNativePackage`), in `ios/Podfile`
  (`pod 'C15tReactNative'`), and in `android/app/build.gradle`
  (`project(":c15t-react-native")`). Autolinking and the plugin are the only two
  supported routes, and combining them yields two registrations.
- An over-the-air bundle cannot outrun the binary. With `updates.url` set and no
  `runtimeVersion` the plugin throws, since that combination serves any JavaScript
  revision to any shipped binary. The supported range goes out in
  `extra.c15t.protocol`, which is what `getBootstrap()`'s `protocolVersion` gets
  checked against in the version handshake above.

How Expo loads the plugin
-------------------------

`@expo/config-plugins` is CommonJS, and `@expo/require-utils` hands a plugin
specifier to Node's CommonJS resolver, then `require()`s whichever file comes
back. Resolution takes the first matching condition in `exports`, so
`./expo-plugin` lists `require` ahead of `import` and points it at
`dist/expo-plugin/index.cjs`: one bundled CommonJS file from a second `rslib`
entry with `bundle: true` and `format: 'cjs'`, which `autoExtension` names
`.cjs` because the package declares `"type": "module"`.

Bundling is the load-bearing half, not the extension. An unbundled CommonJS tree
fails the way the ESM tree did: the entry itself loads, then the real `require`
of its `./constants.js` sibling throws `ERR_REQUIRE_ESM`. That is the exact error
a real `expo config` produced before this was settled, and it is why the entry is
`bundle: true` while the rest of the package stays bundleless.
`@expo/config-plugins` stays external, so the plugin registers its mods through
the host's own `withMod` rather than a second copy of the library.

Node versions that are safe: `require()` of an ES module is unflagged on
Node 20.19+, 22.12+, and 24+, and `@expo/require-utils` names that same set as
its own floor. On anything older, and on any of those with
`--no-experimental-require-module`, only a CommonJS entry loads. Metro and every
bundler still take the `import` condition, and nothing outside
`src/expo-plugin/` imports it, so the ES module entry stays the public one for
the app bundle.

Proven against a generated project rather than a unit harness: Expo SDK 57.0.23,
`expo` CLI 57.0.25, `@expo/config-plugins` 57.0.9, in a `create-expo-app` blank
template under /tmp. `expo config --type prebuild` loaded the plugin on Node
24.21.0, 22.22.2, and 20.19.6, and again on 24.21.0 with
`--no-experimental-require-module`; the same run on the ESM-only build threw
`ERR_REQUIRE_ESM` under that flag. `expo prebuild --platform ios --no-install`
and `--platform android --no-install` both finished clean, and the `Info.plist`,
`PrivacyInfo.xcprivacy`, and `AndroidManifest.xml` they wrote carry the keys
above, including the `mode: 'custom'` shape: `com.c15t.backend.mode` of `none`,
both auto-bootstrap keys `false`, and no androidx.startup provider at all. The
privacy manifest is the plugin's doing and not the template's, since the same
template with no plugin writes no `PrivacyInfo.xcprivacy`.

Corrections to this contract
----------------------------

The first draft of this file was wrong in two places, and both were caught by an
implementation rather than by review. The TypeScript kernel is the authority, so
the contract moved, not the kernel.

- Overrides are `KernelOverrides`: `country`, `region`, `language`, and `gpc`.
  There is no `test` override. Publisher test mode is a client option, not an
  override, and it never reaches the save body. The `gpc` override is load
  bearing: `decisionInputsMatchOverrides` in `@c15t/core` compares it against the
  decision inputs remembered from the last init, and a save whose inputs no
  longer match is rejected as stale. A native core that drops `gpc` cannot
  produce a valid save body.
- Privacy signals follow `KernelPrivacySignals`: `gpc` is an object with
  `detected`, `override`, and `active`, and the evaluator honors `active`. There
  is no `msa` signal anywhere in v3.
- GPC is a live signal, never a stored record. The snapshot has no
  `optOutDirectives` and `restrictions` has no `opt-out-directive` reason: the `gpc`
  restriction applies while `privacySignals.gpc.active` is true and lifts when it is
  not. No directive is stored or sent to a server; the signal reaches the backend
  only as the decision inputs of a save. An alpha of v3 briefly recorded a standing directive from a live
  signal; that was removed, and the native cores never recorded one.
- `revision` is a monotonic counter over committed mutations, not a count of the
  steps a runner took. It is not comparable
  across the three implementations, because hydration and bootstrap are mutations in
  some cores and not in others, and the absolute number a fixture states is therefore
  each core's own business. Pin the number a fixture states; do not derive it from
  how many calls the runner made. What *is* comparable is the cost of a step, and
  `revision-trace-*.json` pins that per step; "Revisions and error writes" is the
  rule it pins.

Evaluator parity
----------------

Rule 4 says the native cores must produce what `@c15t/core` produces. Where the
TS evaluator has a rule the kernels have never been run against, that gap is now
written down with its measurement: the web answer table and the three kernel
divergences it found live in
[`docs/internal/evaluator-parity.md`](../docs/internal/evaluator-parity.md).
Read it before changing either `PolicyEvaluator`, or the evaluation scenarios in
`packages/react-native/scripts/generate-protocol-fixtures.ts`. Permissions and
`restrictions` are bridge and storage surface: a kernel may not change them to
match a hunch, and no fixture expectation may be edited to make a core pass.

### Identity recovery during core hydration

Both cores discard the consent envelope and pending saves before adopting a new
subject when the stored identity is missing or undecodable. They report
`subject-id-missing` or `subject-id-corrupt` when records were orphaned. An envelope
whose subject differs from the stored identity also fails closed with
`subject-id-mismatch`. A fresh install with no records needs no recovery diagnostic.
Swift applies this rule on every public `hydrate()` call. Kotlin applies it during
synchronous bootstrap and subsequent subject resolution. Replay checks the current
subject even for category-only saves. No installer or RN bridge is required for
these checks, and vendor storage never supplies identity or consent authority.


A vendor list with any entry of the wrong type is refused whole on both cores, as
the CLI and Expo refuse it at build (`gvl-fields.ts`). The TC String's vendor-list
version says the subject saw that list, and a list with entries dropped or blanked
is not it. A refused list reads as no list: a core keeps the one it holds while
that one is still within its age limit. `invalid-resources.json` pins the cases.

Native IAB disclosure lifecycle: fetch time is durable and defaults to a seven-day
list age limit. No-GVL responses do not renew it. Native lifecycle reads distinguish
fresh, cached, offline, stale, missing and unconfigured states. Only exact
configuration, policy, identity and normalized disclosure agreement retains an
existing choice; any change requires a fresh action and removes obsolete queued
grants. List staleness suspends a compatible choice and queued grants without
erasing them. Reads, gates and replay deny that authority until an identical list
refresh restores it; choice expiry still discards it. Foreground and connectivity
recovery finish replay before refreshing policy, including a delivery pass already
in progress. These callbacks schedule work without blocking their caller.
Custom IAB saves require the revision the draft opened on. TCF 2.4
standardTexts, including the Features explanation, survive narrowing and storage.
See docs/internal/native-iab-commits.mdx for refresh and retry behavior.
Native Additional Consent v2 uses the backend's scoped official ATP disclosures,
not GVL vendor IDs. A complete native draft carries ATP selections; purposes 1,
3 and 4 gate every positive ATP signal. The generated addtlConsent, TCF authority
and exact HTTP body commit together. List content changes require fresh consent;
missing responses retain only an unexpired cache, empty lists disable AC, and
malformed lists clear it. The bound ATP cache participates in expiry scheduling
even when a newer GVL remains current. Stale lists cannot grant. The platform bus owns
IABTCF_AddtlConsent as a string and removes it with invalid authority or reset.
ATT remains a separate permission. RN API and shared UI wiring remain an ENG-511
acceptance gate after this native foundation integrates.

The complete IABTCF bus is an egress projection of validated native authority.
Explicit CMP detection is synchronous at bootstrap. Consent values use native
integer/string types and the exact committed TC vectors. Apple removes TC/AC
markers first and writes TCString last; Android replaces the complete map in one
synchronous preferences transaction. Mirror rejection removes owned values and
can be repaired from the core without reading vendor storage as authority.
Numbered publisher restriction keys are owned and cleared. Reset removes consent
rows while configured CMP detection remains. See the spec-linked key/type table
and reader ordering limits in docs/internal/native-iab-commits.mdx. The real ad SDK
reference, device latency and power-loss behavior remain separate evidence gates.

## Build policy fallback

Configuration picks one of two modes, and they do not mix.

- Backend mode has a backend URL. Policy precedence is the live `/init`
  response, then the last good cached response, then the manifest bundled at
  build time. A bundled manifest replaces a cached one only when the cached one
  also came from a bundle and is stale, older, or bound to another endpoint.
- No-backend mode has no backend URL. Swift uses `OfflineTransport`, Kotlin
  uses `OfflineTransport` with `NativeConfig.backendUrl = null`, and the
  Android manifest key `com.c15t.MODE=offline` selects it. A bundled manifest
  is refused: Kotlin's `NativeConfig` throws, and the Expo plugin refuses
  `policyResource` and `iab` with `mode: 'offline'`. The only policy source is
  `ConsentPolicy`, rules in the backend's `PolicyRule` names (`CoreConfig.policy`,
  `NativeConfig.policy`, Expo `policy`). Both cores normalize rules exactly as
  `normalizePolicyRule` does and match them as `resolvePolicyRules` does;
  `native/protocol/local-policy/parity.json`, generated from `@c15t/schema`,
  holds the shared cases: a matrix of every `PolicyRule` field against every
  kind of value, sorted by the backend's own `inspectPolicyRules` into
  policies all three validators (Expo prebuild and both cores) must refuse and
  policies they must accept and normalize identically. Matching returns the
  backend's three outcomes: a location no rule covers resolves to `no-match`
  (the safe opt-in fallback) or `failed` with `insufficient-inputs`, never to
  silence, for in-code policies and bundled manifests alike. An explicit
  `no-match` or `unconfigured` answer replaces the rule in force on both cores,
  as `resolveEffectivePolicy` does on the web; only a failed init keeps it. An
  in-code answer is local and final, so no init will revise it: a location the
  in-code policy cannot answer without a region drops the rule in force, sets
  `policyPending` and denies optional gates on both cores. Stored choices stay,
  and apply again when the policy answers. The `transitions` cases pin this. Validity days may be fractional and round to whole
  milliseconds. Fingerprints hash the backend's fingerprint inputs on the device
  and never leave it; choice and notice validity feed only their own prompt. A
  declared policy a core refuses is reported as `policy-invalid` with resolution
  reason `invalid-configuration`, and fails closed: a policy cached by an earlier
  build stops applying and optional gates are denied, while stored choices stay
  for a later build with a usable policy. Bootstrap and `reset()` both report it. The `iab` model is refused without a backend. iOS reads the
  rules file from `com.c15t.policy.rules`, Android from `com.c15t.POLICY_RULES`.

Native bootstrap can resolve an endpoint-bound resource exported from hosted
`/manifest` before JavaScript starts. See
[mobile policy resources](docs/mobile-policy-resources.md) for resource
version 1, expiry, unknown-geography and disclosure rules.

The resource has no visitor identity, grant, receipt, queue or policy token.
Its original GVL and ATP timestamps survive storage and relaunch. A manifest
past `expiresAt` stays usable: the prompt shows, choices save, optional gates
need an explicit grant, and both cores emit `policyStale` once per manifest
(Swift `CoreEvent.policyStale`, Kotlin `ConsentCore.onPolicyStale`) and report
`isPolicyStale`. A manifest bound to another endpoint or issued in the future
supplies no policy and reports `bundled-policy-unusable`. Readable disclosure
copy remains separate from authority to accept a new IAB grant. Hosted refresh
and durable replay stay installed.

The iOS bridge reads `com.c15t.policy.resource` from Info.plist. Android reads
`com.c15t.POLICY_RESOURCE` as an app asset path. The Expo plugin writes both from
`policyResource` and copies the exact resource bytes during prebuild.

## IAB GPP

Both cores encode the IAB Global Privacy Platform string with the same rules as
`@c15t/iab/gpp` on the web. `GppEncoder.kt` and `GPPEncoder.swift` port
`packages/iab/src/gpp/encoder.ts`; `GppResolver.kt` and `GPPResolver.swift` port
`resolveUSSectionDefinition` and `resolveUSSectionValues` from
`packages/iab/src/gpp/us-section.ts`, restricted to the two sections a device
encodes. State sections (`usca`, `usva` and the rest) are not encoded on mobile.

**GPP is off by default.** A US section reports notices as given, and that is
the app's claim about its own UI, so the SDK makes it only when the host turns
GPP on. With `gpp` unset, `gppString` is `null` and no IABGPP_* row is written.
Turning GPP off removes the rows an earlier launch wrote.

**Which section applies.** Nothing applies until the snapshot is ready, no policy
is pending and the resolution is `matched`. Then:

| Matched rule | Section |
| --- | --- |
| `iab`, with a committed TC String that still authorizes vendors, `tcf` not `false` | TCF EU (ID 2): the TC String, byte for byte |
| `iab`, any other case | none |
| any other model with the `preferences` or `opt-out` right, and the country (override, else location) is `US` | US National (ID 7) |
| anything else | none |

The rule's `rights` come from `/init`. Kotlin's `EvaluationPolicy.rights` falls
back to `requiredPolicyRights(model)` for an envelope stored before the key
existed; Swift reads them from the stored wire.

**US National values.** `SharingNotice` is 1 with the `disclosure` right, else 2.
The three opt-out notices are 1. The sale, sharing and targeted advertising
opt-outs are 1 when any `optOutCategories` entry (default `marketing`) is not
permitted in the snapshot's effective permissions, else 2. `Gpc` is
`privacySignals.gpc.active`. MSPA fields follow `mspaMode`: unset reports
`MspaCoveredTransaction` 2 and both modes 0; service provider mode reports the
notices and opt-outs as 0. Every field c15t has no input for is 0 (not
applicable): `SensitiveDataProcessingOptOutNotice`,
`SensitiveDataLimitUseNotice`, all 16 `SensitiveDataProcessing` entries, all 3
`KnownChildSensitiveDataConsents` entries and `PersonalDataConsents`.

**Why version 2.** IAB Tech Lab published US National version 3 on 2026-11-04.
It replaces every field with `MspaVersion`, `MspaNotice`, `MspaOptOut` and a
14-bit `MspaId` behind a section header. No reference decoder reads it yet
(`@iabgpp/cmpapi` 3.2.0, `iabgpp-java` 4.0.0), and the web encodes version 2, so
both cores encode version 2 until web and mobile move together.

**Where the string goes.** `snapshot.gppString` carries it on the wire; the key
is always present. The stored envelope never keeps a copy: Kotlin writes `null`
and recomputes on install, Swift adds the string only to snapshots it hands out,
so `isAllowed` never pays for an encode. The in-app rows follow the GPP CMP API
"In-App Key Names" table and the TCF EU section's key table:

| Key | Value |
| --- | --- |
| `IABGPP_HDR_Version` | `"1"`, the header version |
| `IABGPP_HDR_Sections`, `IABGPP_GppSID` | section IDs joined with `_`, such as `"7"` |
| `IABGPP_HDR_GppString` | the full GPP string |
| `IABGPP_[ID]_String` | each section's string |
| `IABGPP_2_TCString` | the TC String, the TCF EU table's name for the same value |
| `IABGPP_TCFEU2_*` | the IABTCF_* consent rows renamed by the TCF EU table, plus `gdprApplies` 1. The table names `UseNonStandardStacks`, TCF 2.0's name for `UseNonStandardTexts` |

No document defines per-field keys for US National, so none are written. The rows
share the IABTCF_* sink: Android replaces both tables in one preferences commit,
Apple treats `IABGPP_HDR_GppString` as a marker it removes first and writes last.

**Conformance.** `native/protocol/gpp/cases.json` holds encoder and resolver
cases with the expected string and in-app rows. `GppTest.kt` and
`GPPTests.swift` assert every case, and
`packages/iab/src/__tests__/native-gpp-fixtures.test.ts` checks each expected
string against the web encoder and decodes it with `@iabgpp/cmpapi`.
