# Internal consent records

These helpers implement the record model used by the kernel, persistence, transports and framework adapters. The record API is exported from `@inth/sdk/consent-record`. The kernel exposes explicit choices, durable opt-outs, effective permissions, prompt requirements and notice dismissals as separate facts. GPC restricts permissions immediately on evaluation and, once a live browser kernel resolves a policy with a deny list, creates a durable opt-out record that persists after the browser stops sending the signal.

## Files

| File | Role |
| --- | --- |
| `types.ts` | One latest `CategoryDecision` per optional category, plus separate notice dismissal, policy and evaluation types. |
| `validation.ts` | Checks own fields on objects with a plain or null prototype. Includes non-enumerable category keys and copies validated basis fields explicitly. Choice and notice timestamps must be safe non-negative integer milliseconds no later than the supplied `now`. Durable opt-out timestamps must be safe non-negative integer milliseconds and are never rejected for being in the future. |
| `opt-out.ts` | Returns the categories a durable opt-out switches off (`marketing` and `measurement`, filtered to `policy.scope`). |
| `normalize.ts` | Reads raw v2 `{ consents, consentInfo }` with its encoding. Compact cookies restore omitted `false`; JSON keeps absent keys absent. Retains original times and legacy fingerprints. |
| `record.ts` | Replaces each supplied own optional key at the captured action time with the current choice basis. Omitted decisions retain their time and basis. |
| `evaluation-policy.ts` | Validates model, prompt and scope mode, fingerprints, durations, scope and GPC mappings. Copies validity fields explicitly. Fingerprints arrive precomputed. |
| `evaluate.ts` | Derives permissions, restrictions, the prompt requirement and the next deadline from records and an explicit `now`. |

## Semantics

Opt-in and IAB default to denied within scope; opt-out defaults to allowed. Outside scope, strict mode denies and permissive mode allows. A compatible, unexpired positive decision grants within scope. Explicit false, strict scope exclusion, an applicable live GPC signal and a durable opt-out record override grants and defaults. A durable opt-out switches off `marketing` and `measurement` (whichever are in `policy.scope`) under every model, ignores the GPC deny list, does not expire and does not depend on the choice fingerprint. Denials also do not expire and do not depend on the choice fingerprint. An expired opt-out grant can still be allowed by default, with its source reported as `default`.

A `choice-v1` basis must match the policy's choice fingerprint. A `legacy-v2` basis compares only with the policy's legacy material fingerprint. If either legacy fingerprint is absent, the decision is grandfathered.

Positive decisions expire at `confirmedAt + choice.maxAgeMs` and remain valid while `now < expiresAt`. An explicit `maxAgeMs: null` retains unbounded compatibility behavior in the record evaluator. Resolved policy rules supply finite validity durations.

A choice prompt uses the active optional scope. Empty scope requires no prompt. Otherwise, no decisions yields `missing`; any incompatible in-scope basis yields `policy-changed`; missing required coverage yields `missing`; any expired positive decision yields `expired`. Complete matching coverage requires no prompt. Matching denials satisfy coverage regardless of age.

A notice prompt depends only on its dismissal. Missing dismissal yields `missing`, a fingerprint mismatch yields `policy-changed`, and expiry yields `expired`. Category expiry and GPC do not acknowledge a notice. A category save made while a notice is owed does: the kernel records the dismissal with the choice, so the notice does not return after an opt-out made from the preference center.

`nextDeadline` is the earliest expiry that changes a permission or the aggregate prompt. An unmasked opt-in or IAB grant still needs an expiry deadline when choice coverage is missing. A masked grant or opt-out grant needs one only when expiry changes satisfied choice coverage to `expired`. Existing `missing`, `policy-changed` and `expired` prompts keep their reason as other grants expire. A notice deadline uses the dismissal's independent lifetime.

## Runtime integration

The kernel records choices through accept, reject and save, then evaluates these records against the current resolved policy. Persistence reads raw v2 and v3 records without creating a choice or writing during hydration. Producers compute policy and prompt fingerprints before the kernel applies a resolution.

Notice dismissal has its own command, record and event. An opt-out has its own durable record, commands (`optOut` and `optIn`) and events (`opt-out:recorded`, `opt-out:lifted` and `opt-out:synced`). `commands.optOut()` works under any `opt-out` rule. Under an `opt-out` rule, `commands.save()` also records an opt-out when it confirms `false` for at least one switched-off category and leaves every switched-off category (`marketing` and `measurement` in scope) at `false`, such as rejecting all or turning both off in preferences. Once a live browser kernel sees GPC under a matched rule with a GPC deny list, it records an opt-out automatically so the denial survives after the browser stops sending GPC. Local opt-out records start with `rights: []` when the transport supports opt-outs and block `marketing` and `measurement` immediately; the backend derives the applicable rights from the visitor's location and returns them in `optOut.rights`. When the transport has no `optOut` method, local records start with all three rights (`sale`, `share`, `targeted_ads`). When the backend answers `404` on an opt-out route, the outbox fills empty local `rights` with all three rights through `opt-out:synced` without overwriting backend-supplied rights, and later records in that kernel start with all three rights. Lifting the opt-out requires an explicit `optIn()` or a preference save that turns `marketing` or `measurement` back on while GPC is not active (or not mapped) and the opt-out is device-held. Clearing Inth data invalidates pending record work. Transport acknowledgements may associate a successful current save with its canonical subject; failures preserve the local choice and existing subject.
