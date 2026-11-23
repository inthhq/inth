/**
 * Generates the conformance fixtures in `packages/native-protocol/`.
 *
 * Every expectation comes from the real `@inth/sdk/engine` kernel, so the Swift and
 * Kotlin cores are tested against the JavaScript implementation rather than
 * against a hand-written idea of it. Run it with:
 *
 * ```bash
 * bun run --cwd packages/react-native generate:fixtures
 * ```
 *
 * A fixture hands a client what a client actually gets, and nothing else. The
 * inputs are therefore the `/init` transport response, the records already in
 * protected storage, the overrides and privacy signals the device reports, and
 * a fixed clock. No fixture asks a core to resolve a policy pack: the backend
 * matches the pack and answers with a resolved `policyResolution` wire value,
 * which is the only thing a client ever reads.
 *
 * What lands in `packages/native-protocol/`:
 *
 * - `evaluation-*.json` — init response plus stored records in, snapshot out.
 * - `save-body-*.json` — the same plus a commit, and the exact
 *   `POST /v1/consent/records` request (headers and body) a client puts on the wire
 *   for the payload the kernel produced. See `buildConsentRecordBody`.
 * - `native-envelope-*.json` — what a native core keeps on the device: the field
 *   set its stored envelope must carry, the snapshot inside it, and the decision
 *   a relaunch with no backend has to reach from those bytes alone. The unreadable
 *   cases — an unrecognised field, a write cut short, a retired field shape, a
 *   foreign envelope — all have to read as nothing stored.
 * - `revision-trace-*.json` — a mutation sequence in, the revision and publication
 *   trace the kernel produced for it out. The cross-core parity fixture.
 * - `reset-consent-*.json` — a device with a recorded answer in, the wipe out: the
 *   baseline `reset()` publishes, what its deletion leaves on disk, and the snapshot
 *   the device answers with once the init it re-ran lands.
 * - `tc-string-*.json` — a TC Model plus a vendor list in, the base64url TCF string the
 *   reference encoder produced out, and the field map its decoder read back. These are
 *   the only fixtures the Inth kernel has no hand in: their oracle is
 *   `@iabtechlabtcf/core`, because there is no native TC String SDK to adopt. Two
 *   populations, recorded per fixture as `population` and `expects`. See
 *   `./tc-string-fixtures.ts` for what each one obliges a core to do.
 * - `index.json` — every fixture's id, kind, protocolVersion, and SHA-256, so a
 *   runner enumerates fixtures instead of hard-coding names and can prove it read
 *   the bytes this script wrote.
 *
 * Each file carries a complete `input` and a literal `expected`, so a native test
 * reads the file, applies `input`, and compares values. Nothing is re-derived.
 *
 * Determinism rules this script depends on: the clock is always an input, a save
 * is always stamped with that same clock, the subject id is always supplied
 * rather than generated, the language is always pinned, and every object here is
 * built in a fixed key order. Re-running the script must not change a byte.
 *
 * The consent *policy* half of IAB TCF stays out of scope: no kernel fixture carries a
 * TC string, no GVL, and the snapshot `iab` slot is emitted as `null`. The wire half is
 * now in scope as its own kind, and it is deliberately not threaded through the kernel —
 * Inth's own encoder populates a subset of `TCModel`, so a vector set cut only from
 * Inth's outputs would pass a decoder that cannot see publisherRestrictions or
 * purposeOneTreatment at all. Both populations therefore drive the reference directly.
 *
 * Stored envelopes are the one thing here the kernel does not produce, because it has
 * no stored-envelope path to derive one from. Swift and Kotlin encode independently,
 * so `native-envelope-*` pins the field set and the values each core has to keep, and
 * names the reference implementation for any disagreement about spelling. It never
 * pins one core's byte layout, because the other core would have to fail rather than
 * disagree. The snapshot inside an envelope is still kernel output; the deny-all
 * decision an unreadable one has to leave behind is written out below rather than
 * computed, and `OFFLINE_DENY_ALL` and `RESET_BASELINE` are the two
 * hand-written expectations this script emits, and each is written down only because
 * the harness always gives the kernel a transport answer, which leaves no run of it
 * that ends in the state either one describes.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	createConsentKernel,
	mapInitOutputToInitResponse,
	policyRulePresets,
	readPolicyResolutionWire,
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@inth/sdk/engine';
import type {
	ConsentSnapshot as KernelSnapshot,
	AllConsentNames,
	CategoryDecision,
	ConsentState,
	ConsentSubject,
	ExplicitChoice,
	HydrationRecords,
	InitOutput,
	InitResponse,
	KernelActiveUI,
	KernelModel,
	KernelOverrides,
	KernelPrivacySignals,
	KernelTranslations,
	KernelUser,
	LocationResponse,
	NoticeDismissal,
	OptOutRecord,
	OptionalConsentCategory,
	PolicyResolution,
	PolicyResolutionWire,
	PolicyRule,
	PromptRequirement,
	RestrictionReason,
	SaveInput,
	SavePayload,
} from '@inth/sdk/engine';

import type { CommitIntent } from '../src/protocol/commit-payload.model';
import { DEFAULT_NATIVE_LANGUAGE } from '../src/protocol/native-overrides.model';
import {
	isProtocolVersionSupported,
	PROTOCOL_VERSION,
} from '../src/protocol/protocol-version.model';
import {
	buildSubjectPostBody,
	isValidSubjectId,
	POLICY_CONTRACT_HEADER_VALUE as CONTRACT_HEADER_VALUE,
} from './native-wire';
import { buildTcStringFixtures } from './tc-string-fixtures';
import type { TcStringFixture } from './tc-string-fixtures';
import { buildVendorListScopeFixtures } from './vendor-list-scope-fixtures';
import type { VendorListScopeFixture } from './vendor-list-scope-fixtures';

// -- Fixed inputs ------------------------------------------------------------

/** Evaluation clock for every fixture. Nothing here reads the wall clock. */
const NOW = 1_770_000_000_000;

/**
 * The `property` a `POST /v1/consent/records` body names.
 *
 * On a phone it is the application or bundle ID, lowercase, which is what both cores
 * default to. The fixtures pin one so a runner configures it rather than reading the
 * test host's own bundle.
 */
const PROPERTY = 'com.example.app';

/**
 * The subject ids fixtures replay: lowercase UUIDv7, the form a `/v1` route takes
 * and the form both cores mint.
 *
 * Minted by `mintUuidV7` below from the clock reading and the ten random bytes in
 * `SUBJECT_MINTS`, which is the layout `subject-id/uuidv7.json` pins for every
 * platform. They are constants and not drawn at write time because the expected
 * snapshot and the expected request body both carry the id, and a random one would
 * make every regeneration a diff.
 */
const SUBJECT = {
	/** The subject behind the California scenarios. */
	california: '019c1c38-a400-7100-8000-000000000001',
	/** The California device on its first launch. */
	californiaFirstLaunch: '019c1c38-a400-7100-8000-000000000011',
	/** The subject behind the Europe scenarios, and most envelope cases. */
	europe: '019c1c38-a400-7100-8000-000000000002',
	/** The Europe device on its first launch. */
	europeFirstLaunch: '019c1c38-a400-7100-8000-000000000012',
	/** The subject with an active GPC signal. */
	gpc: '019c1c38-a400-7100-8000-000000000003',
	/** The subject on the no-match rule. */
	noMatch: '019c1c38-a400-7100-8000-000000000004',
	/** The subject on the notice-only rule. */
	notice: '019c1c38-a400-7100-8000-000000000005',
} as const;

/**
 * The clock reading and the ten random bytes behind each id above.
 *
 * `assertSubjectIdsAreProducible` re-mints every id here and refuses a literal that
 * is not what the encoder writes, so a literal cannot drift into a string no
 * generator produces.
 */
const SUBJECT_MINTS: Record<string, { clock: number; randomHex: string }> = {
	california: { clock: NOW, randomHex: '01000000000000000001' },
	californiaFirstLaunch: { clock: NOW, randomHex: '01000000000000000011' },
	europe: { clock: NOW, randomHex: '01000000000000000002' },
	europeFirstLaunch: { clock: NOW, randomHex: '01000000000000000012' },
	gpc: { clock: NOW, randomHex: '01000000000000000003' },
	noMatch: { clock: NOW, randomHex: '01000000000000000004' },
	notice: { clock: NOW, randomHex: '01000000000000000005' },
};

/**
 * The idempotency key each save-body case sends, minted the same way.
 *
 * A core makes one key per save action and freezes it with the payload, so a replay
 * sends the same key. A fixture supplies it, like the subject id, so no fixture
 * depends on a random draw.
 */
const IDEMPOTENCY_MINTS: Record<string, string> = {
	all: '01000000000000000101',
	'ccpa-gpc': '01000000000000000104',
	'ccpa-opt-out-lifted': '01000000000000000108',
	'ccpa-opt-out-measurement-grant': '01000000000000000110',
	'ccpa-refuse-marketing': '01000000000000000109',
	'ccpa-reject-all': '01000000000000000107',
	'explicit-partial': '01000000000000000103',
	necessary: '01000000000000000102',
	'necessary-only-all': '01000000000000000105',
	'necessary-only-necessary': '01000000000000000106',
};

/**
 * The translation bundle `/init` serves.
 *
 * A partial bundle, which is what the backend serves when a project overrides
 * only part of the copy. It is pinned because a snapshot carries the bundle
 * through untouched: a fixture that let it vary could not tell a carried bundle
 * from a rebuilt one.
 */
const TRANSLATIONS: KernelTranslations = {
	language: DEFAULT_NATIVE_LANGUAGE,
	translations: {
		common: {
			acceptAll: 'Accept all',
			customize: 'Customize',
			rejectAll: 'Reject all',
			save: 'Save',
		},
		consentManagerDialog: {},
		consentTypes: {},
		cookieBanner: {},
		rights: {},
	},
};

/** The configured policy pack most scenarios resolve against. */
const POLICY_RULES: readonly PolicyRule[] = [
	policyRulePresets.europeOptIn(),
	policyRulePresets.californiaOptOut(),
];

/**
 * Notice-only rule for the dismissal pair. It lives here rather than in a
 * preset because the fixture needs a `notice` prompt, and no shipped preset
 * uses one.
 */
const NOTICE_RULE: PolicyRule = {
	categories: ['marketing', 'measurement'],
	id: 'fixture_notice_only',
	match: { countries: ['GB'] },
	model: 'opt-out',
	prompt: 'notice',
	scopeMode: 'strict',
	validity: { noticeDays: 180 },
};

/** One day on the fixture clock, for ageing a stored receipt. */
const DAY_MS = 86_400_000;

/**
 * A rule that governs exactly one optional category.
 *
 * `marketing` is outside the scope of every rule built here, which is the cell
 * divergence 1 in `docs/internal/evaluator-parity.md` is about: out of scope,
 * `defaultPermission` in `packages/sdk/core/src/consent-record/evaluate.ts` answers
 * from `scopeMode` alone and never reads the model, so permissive allows and
 * strict refuses for all four models at once. Both scope modes and two models
 * are swept because the native cores read a model in that branch today and they
 * get it wrong in opposite directions: an `opt-in` device denies what permissive
 * allows, and an `opt-out` device allows past a recorded refusal.
 *
 * One country each, so no pack ever holds two matching rules, and a 30-day
 * validity so `ageChoice` can take a receipt past its life. A rule cannot say a
 * zero-length validity (`validity.choiceDays` is finite and greater than zero in
 * `packages/sdk/schema/src/shared/policy-rule.ts`), which is why the expiry axis
 * ages the record rather than the policy.
 */
const narrowRule = function narrowRule(
	id: string,
	country: string,
	model: 'iab' | 'opt-in' | 'opt-out',
	scopeMode: 'permissive' | 'strict'
): PolicyRule {
	return {
		categories: ['functionality'],
		id,
		match: { countries: [country] },
		model,
		prompt: 'choice',
		scopeMode,
		validity: { choiceDays: 30 },
	};
};

/** Out of scope and permissive, under the model that denies by default. */
const NARROW_PERMISSIVE_OPT_IN_RULE = narrowRule(
	'fixture_narrow_permissive_opt_in',
	'FR',
	'opt-in',
	'permissive'
);

/** Out of scope and permissive, under the model that allows by default. */
const NARROW_PERMISSIVE_OPT_OUT_RULE = narrowRule(
	'fixture_narrow_permissive_opt_out',
	'ES',
	'opt-out',
	'permissive'
);

/** Out of scope and strict, where a recorded refusal is reported first. */
const NARROW_STRICT_RULE = narrowRule(
	'fixture_narrow_strict_opt_in',
	'IT',
	'opt-in',
	'strict'
);

/** An IAB rule, narrow scope, so `iab` can be graded against `opt-in`'s cells. */
const NARROW_IAB_RULE = narrowRule(
	'fixture_narrow_iab_permissive',
	'PT',
	'iab',
	'permissive'
);

/**
 * A full-scope opt-in rule that names the categories an active GPC denies.
 *
 * No shipped preset configures `privacySignals`, so nothing on the table today
 * can grade the reason a device reports for a category the model had already
 * denied. `collectRestrictions` in
 * `packages/sdk/core/src/consent-record/evaluate.ts` gathers reasons independently
 * of the answer, and a live kernel also records a durable GPC opt-out when a
 * matched rule maps GPC, so the web answer here is `marketing: ['gpc', 'opt-out']`
 * and `measurement: ['opt-out']` on categories the model had already denied. A core
 * that only records a reason when it is the reason that flipped the answer publishes
 * nothing, which is a different snapshot over the bridge rather than the same denial
 * arrived at another way.
 */
const GPC_DENYING_OPT_IN_RULE: PolicyRule = {
	categories: ['experience', 'functionality', 'marketing', 'measurement'],
	id: 'fixture_gpc_denying_opt_in',
	match: { countries: ['NL'] },
	model: 'opt-in',
	privacySignals: { gpc: { denyCategories: ['marketing'] } },
	prompt: 'choice',
	validity: { choiceDays: 30 },
};

/**
 * A full-scope opt-in choice rule for an app that declares no categories.
 *
 * Under `permissive` the kernel projects an empty choice scope, because the
 * categories nobody is asked about stay allowed outside it, and the prompt asks
 * for an acknowledgement that only strictly necessary processing runs. Under
 * `strict` nothing outside the scope may run, so the whole scope is asked about
 * as before. `copyRevision` is the axis a policy edit moves, the same way
 * `stalePolicyRule` moves it. One country each, so no pack holds two matching
 * rules, and a 30-day validity so an acknowledgement can be aged past it.
 */
const necessaryOnlyRule = function necessaryOnlyRule(
	scopeMode: 'permissive' | 'strict',
	copyRevision: string
): PolicyRule {
	return {
		categories: ['experience', 'functionality', 'marketing', 'measurement'],
		copyRevision,
		id: `fixture_nothing_declared_${scopeMode}`,
		match: { countries: [scopeMode === 'permissive' ? 'SE' : 'DK'] },
		model: 'opt-in',
		prompt: 'choice',
		scopeMode,
		validity: { choiceDays: 30 },
	};
};

/**
 * The two halves of the stale-policy axis.
 *
 * They differ only in `copyRevision`, which is hashed into both prompt
 * fingerprints, so a receipt minted under `v1` reads as `policy-changed` against
 * `v2`. Each sits alone in its pack, so neither resolution is ambiguous, and
 * both keep the full optional scope: divergence 3 is about a recorded refusal
 * under a policy the subject no longer stands under, not about scope.
 */
const stalePolicyRule = function stalePolicyRule(
	copyRevision: string,
	id: string,
	prompt: 'choice' | 'none' = 'choice'
): PolicyRule {
	return {
		categories: ['experience', 'functionality', 'marketing', 'measurement'],
		copyRevision,
		id,
		match: { countries: ['US'] },
		model: 'opt-out',
		prompt,
		validity: { choiceDays: 30 },
	};
};

/**
 * The fingerprint a minted receipt carries.
 *
 * Read off the receipt rather than recomputed, so an amendment cannot pin a basis
 * the kernel never wrote.
 */
const mintedFingerprint = function mintedFingerprint(
	choice: ExplicitChoice
): string {
	for (const decision of Object.values(choice.categories)) {
		if (decision?.basis.kind === 'choice-v1') {
			return decision.basis.fingerprint;
		}
	}
	throw new Error(
		'A minted receipt must carry a choice-v1 basis, or the axis is not testing a receipt a device could hold.'
	);
};

/**
 * Move every confirmation on a minted receipt back by `days`.
 *
 * Minting always happens at the pinned clock, so ageing is the only way a fixture
 * gets a receipt that has outlived the rule's validity. Every category moves
 * together, because that is what a device stores: the native `ExplicitChoice`
 * keeps one `actionAt` and one fingerprint for the whole receipt, so an axis that
 * aged one category and not its siblings would pin a record neither core can
 * hold.
 */
const ageChoice = function ageChoice(
	choice: ExplicitChoice,
	days: number
): ExplicitChoice {
	const shift = days * DAY_MS;
	const categories: Partial<Record<OptionalConsentCategory, CategoryDecision>> =
		{};
	for (const [name, decision] of Object.entries(choice.categories)) {
		if (!decision) {
			continue;
		}
		categories[name as OptionalConsentCategory] = {
			...decision,
			confirmedAt: decision.confirmedAt - shift,
		};
	}
	return { categories, version: choice.version };
};

/**
 * Record answers for categories the minted receipt does not name.
 *
 * A save only writes what the prompt could ask about, so an out-of-scope answer
 * has to arrive the way it does on a real device: recorded while a wider policy
 * was in force. The minted fingerprint is copied unchanged and the confirmation
 * time is the caller's, so the only thing added is the category. The pinned
 * expectation is still the kernel's answer to this record, which is the rule
 * `docs/internal/evaluator-parity.md` sets: no hand-written permission, and here,
 * no hand-written basis either.
 */
const decideExtra = function decideExtra(
	choice: ExplicitChoice,
	extras: Partial<Record<OptionalConsentCategory, boolean>>,
	confirmedAt: number
): ExplicitChoice {
	const fingerprint = mintedFingerprint(choice);
	const categories: Partial<Record<OptionalConsentCategory, CategoryDecision>> =
		{
			...choice.categories,
		};
	for (const [category, value] of Object.entries(extras) as [
		OptionalConsentCategory,
		boolean,
	][]) {
		categories[category] = {
			basis: { fingerprint, kind: 'choice-v1' },
			confirmedAt,
			value,
		};
	}
	return { categories, version: choice.version };
};

// -- Emitted shapes ----------------------------------------------------------

/** The `/init` body, exactly as the backend writes it. */
type InitResponseBody = InitOutput;

/**
 * The `/init` response to serve: status, response headers, and the body. A native
 * runner answers its transport with these three values and nothing else.
 */
interface InitTransport {
	status: 200;
	headers: Record<string, string>;
	body: InitResponseBody;
}

/** Overrides the app pins, before `/init` resolved anything. */
interface FixtureOverrides {
	country: string | null;
	gpc: boolean | null;
	language: string | null;
	region: string | null;
}

/**
 * Privacy signals as the device reports them.
 *
 * `detected` is the platform signal and `override` the app's explicit setting;
 * `null` means the host has no answer to give. `active`, which is what the
 * evaluator honors, is derived from the two, so it appears in `expected` and
 * never in an input.
 */
interface FixturePrivacySignals {
	gpc: { detected: boolean | null; override: boolean | null };
}

/** The explainability half of a policy resolution, as a snapshot carries it. */
interface FixtureResolution {
	fingerprint: string | null;
	policyId: string | null;
	status: PolicyResolution['status'];
}

/**
 * The snapshot a native core must produce.
 *
 * The kernel snapshot restricted to the fields that matter on device, plus the
 * two lifecycle flags the kernel does not model (`ready`, `error`) and the
 * reserved `iab` slot held as `null`. `overrides` and `privacySignals` are the
 * kernel's own shapes, which is what "Corrections to this contract" in
 * `packages/native-protocol/CONTRACT.md` settles: there is no `test` override and no `msa` signal,
 * and GPC is a `detected` / `override` / `active` triple rather than one boolean.
 */
interface FixtureSnapshot {
	readonly activeUI: KernelActiveUI;
	readonly consentCategories: readonly AllConsentNames[] | null;
	readonly effectivePermissions: ConsentState;
	readonly error: { code: string; message: string } | null;
	readonly evaluatedAt: number;
	readonly explicitChoice: ExplicitChoice | null;
	/**
	 * `null` in every fixture: GPP is off unless the app turns it on, and no fixture
	 * does. `packages/native-protocol/gpp/cases.json` covers the string itself.
	 */
	readonly gppString: null;
	readonly iab: null;
	readonly location: LocationResponse | null;
	readonly model: Exclude<KernelModel, 'iab'>;
	readonly nextDeadline: number | null;
	readonly optOut: OptOutRecord | null;
	readonly overrides: FixtureOverrides;
	readonly policyPending: boolean;
	readonly policySnapshotToken: string | null;
	readonly privacySignals: KernelPrivacySignals;
	readonly promptRequirement: PromptRequirement;
	readonly ready: boolean;
	readonly resolution: FixtureResolution;
	readonly restrictions: Partial<
		Record<OptionalConsentCategory, readonly RestrictionReason[]>
	>;
	readonly revision: number;
	readonly subject: ConsentSubject | null;
	readonly translations: KernelTranslations | null;
}

/** What protected storage holds before the core starts, `null` meaning absent. */
interface StoredRecords {
	subject: ConsentSubject | null;
	choice: ExplicitChoice | null;
	noticeDismissal: NoticeDismissal | null;
	optOut: OptOutRecord | null;
}

/**
 * The state a fixture replays: everything a native core has to work with before
 * the asserted step runs, in the form a client receives it.
 */
interface FixtureInput {
	/** Evaluation clock. Every timestamp in `expected` is derived from it. */
	now: number;
	/**
	 * Whether `hydrate()` found a stored envelope before the step under test.
	 *
	 * This is the one hydration fact that latches `ready`, and it is the only one:
	 * a hydrate that read nothing leaves the flag low no matter how far the step
	 * runs. The subject id lives in its own slot, so a fixture can carry an
	 * identity and still hydrate into nothing stored.
	 */
	hydrated: boolean;
	/** The `/init` response to serve, verbatim. */
	transport: InitTransport;
	/** Records already in protected storage. */
	storedRecords: StoredRecords;
	/** Overrides the app pinned, before `/init` resolved anything. */
	overrides: FixtureOverrides;
	/** Privacy signals the device reports, before `/init` resolved anything. */
	privacySignals: FixturePrivacySignals;
	/** Identified user, when the app has one. */
	user: KernelUser | null;
	/**
	 * The categories the app declares, when a fixture is about the declaration.
	 *
	 * Absent means the app declares every category, `APP_CATEGORIES` below, which
	 * is the declaration every fixture without this key was generated under. `null`
	 * means the app declares nothing, the way a host that never sets
	 * `consentCategories` configures a native core.
	 */
	consentCategories?: readonly AllConsentNames[] | null;
}

interface EvaluationFixture {
	protocolVersion: number;
	kind: 'evaluation';
	id: string;
	description: string;
	notes: string[];
	input: FixtureInput;
	expected: {
		snapshot: FixtureSnapshot;
	};
}

interface SaveBodyFixture {
	protocolVersion: number;
	kind: 'save-body';
	id: string;
	description: string;
	notes: string[];
	input: FixtureInput & {
		/** Confirmation time for the commit. Always `input.now`. */
		actionAt: number;
		/** The key the core makes for this action. Supplied, never drawn. */
		idempotencyKey: string;
		intent: CommitIntent;
		/** The `property` the body names: an application or bundle ID. */
		property: string;
	};
	expected: {
		snapshotBefore: FixtureSnapshot;
		snapshotAfter: FixtureSnapshot;
		savePayload: NativeSavePayload;
		request: {
			method: 'POST';
			path: string;
			headers: Record<string, string>;
			body: unknown;
		};
	};
}

/** The two native cores, named the way `packages/native-protocol/CONTRACT.md` names them. */
const NATIVE_CORES = ['swift', 'kotlin'] as const;

/** One of the native cores that owns a stored envelope. */
type NativeCore = (typeof NATIVE_CORES)[number];

/**
 * One fact a stored envelope has to hold, described once for both cores.
 *
 * The two cores are separate implementations of the same idea, and they spell
 * parts of it differently: Swift keeps the raw policy wire under
 * `policyResolution`, Kotlin keeps a typed `EvaluationPolicy` under
 * `evaluationPolicy`, and only Swift records a format version and a write time.
 * So a field is named by what it is for (`key`, a label neither core writes), and
 * `carriers` gives each core its own name for it. A core whose name is absent does
 * not carry the fact at all, which `packages/native-protocol/CONTRACT.md` records as a difference
 * rather than a defect.
 */
interface NativeEnvelopeField {
	/** Where each core keeps the fact. Omitted for a core that does not keep it. */
	readonly carriers: Partial<Record<NativeCore, string>>;
	/** `'present'`, `'empty'`, or a literal the decoded value must equal. */
	readonly expect: 'empty' | 'present' | boolean | number | string;
	/** `true` when a consent decision changes if this field is lost or wrong. */
	readonly loadBearing: boolean;
	/** Cores that must write the field. Others may omit it entirely. */
	readonly requiredBy: readonly NativeCore[];
	/** Neutral label for the fact, never a name either core writes. */
	readonly key: string;
	/** Why the fact is in the envelope at all. */
	readonly role: string;
}

/** The implementation whose envelope layout `packages/native-protocol/CONTRACT.md` documents. */
interface NativeEnvelopeReference {
	readonly core: NativeCore;
	/** How that core orders keys, which is the only byte-level claim made here. */
	readonly keyOrder: 'alphabetical';
	readonly why: string;
}

/** The action a write fixture asks the core to take before it stores anything. */
type NativeEnvelopeAction =
	| CommitIntent
	| { readonly action: 'dismiss-notice' };

/**
 * The defect a read fixture introduces, applied to bytes its own core just wrote.
 *
 * Stated as an operation rather than as a literal string because the two cores
 * write different bytes: the base envelope is only valid for the core that wrote
 * it, so the runner produces it and then breaks it the same way. Only
 * `foreign-wire` ships the bytes, because those come from a third surface that
 * neither core wrote and both must refuse.
 */
type NativeEnvelopeDefect =
	| {
			/** A field neither the format nor this build names. */
			readonly addField: string;
			readonly kind: 'unknown-field';
			readonly value: boolean;
	  }
	/** Everything from the last comma of the envelope onwards is gone. */
	| { readonly kind: 'truncate' }
	/** The snapshot rewritten into the shape the first contract draft described. */
	| { readonly kind: 'pre-correction' }
	| {
			readonly envelope: string;
			readonly kind: 'foreign-wire';
			readonly source: string;
	  };

/**
 * What the core answers when it boots over stored bytes and reaches no backend.
 *
 * This is the whole reason an envelope exists: a phone in a tunnel still has to
 * honour the decision the subject already made, and a phone whose bytes are
 * unreadable still has to deny. Both halves are read offline so no transport
 * result can stand in for the envelope's own content.
 */
interface NativeEnvelopeRelaunch {
	readonly decision: {
		readonly allowed: Record<AllConsentNames, boolean>;
		readonly policyPending: boolean;
		readonly ready: boolean;
	};
	readonly offline: true;
}

interface NativeEnvelopeFixture {
	protocolVersion: number;
	kind: 'native-envelope';
	id: string;
	description: string;
	notes: string[];
	/** Which core settles a disagreement about how a fact is spelled. */
	reference: NativeEnvelopeReference;
	/** The stored field set, in the order a reader should walk it. */
	fields: NativeEnvelopeField[];
	input: FixtureInput & {
		action?: NativeEnvelopeAction;
		defect?: NativeEnvelopeDefect;
	};
	expected: {
		/** The snapshot inside the envelope. Kernel-derived, so a real expectation. */
		snapshot?: FixtureSnapshot;
		/** Present on the read cases: the bytes must yield nothing. */
		read?: {
			decoded: false;
			identicalToFreshInstall: true;
			stored: false;
		};
		relaunch: NativeEnvelopeRelaunch;
		/** Present on the write cases: the bytes must read back as themselves. */
		write?: {
			decoded: 'itself';
			storedSnapshotMatchesLive: true;
		};
	};
}

/** What one step of a mutation sequence asks a core to do. */
type TraceStep =
	/** Deliver `/init`, the way a later refresh or a reconnected device does. */
	| {
			readonly op: 'init';
			readonly step: string;
			readonly transport: InitTransport;
	  }
	/** Commit a consent action. */
	| {
			readonly op: 'save';
			readonly step: string;
			readonly intent: CommitIntent;
	  }
	/** Close the current notice. */
	| { readonly op: 'dismiss-notice'; readonly step: string };

/**
 * One step, as observed from outside the core.
 *
 * Both numbers come from watching the kernel, not from reasoning about it:
 * `revisionDelta` is the change in `snapshot.revision` across the step, and
 * `publications` counts the snapshot listeners the step woke. They are expected
 * to agree on every step (a published change is a bumped revision), and stating
 * both is what makes a core that bumps without publishing, or publishes without
 * bumping, show up as a mismatch rather than a passing run.
 */
interface TraceObservation {
	readonly publications: number;
	readonly revisionDelta: number;
	readonly step: string;
}

/**
 * A mutation sequence with the revision trace the kernel produced for it.
 *
 * This is the one fixture kind that pins a number the three implementations
 * cannot share absolutely: `packages/native-protocol/CONTRACT.md` says hydration and bootstrap are
 * mutations in some cores and not in others, so a core's absolute revision is its
 * own. What all three must agree on is what each step costs, which is what this
 * fixture measures. See "Revisions and error writes" in `packages/native-protocol/CONTRACT.md`.
 */
interface RevisionTraceFixture {
	protocolVersion: number;
	kind: 'revision-trace';
	id: string;
	description: string;
	notes: string[];
	input: Omit<FixtureInput, 'transport'> & {
		/** The `/init` bootstrap serves, before any step runs. */
		transport: InitTransport;
		steps: TraceStep[];
	};
	expected: {
		trace: TraceObservation[];
	};
}

/**
 * A device that had answered, wiped, and what it has to answer with afterwards.
 *
 * `expected.baseline` is the snapshot `reset()` publishes and nothing else has run
 * yet; `expected.disk` is what the wipe's deletion leaves under it; `expected.afterInit`
 * is the snapshot the device settles on once the init the wipe re-ran has landed, which
 * is the same snapshot a device that never decided settles on. The two fixtures of this
 * kind differ only in `input.intent`, and their `expected` halves are identical, which
 * is the claim "Wiping consent (reset)" in `packages/native-protocol/CONTRACT.md` makes: a wipe leaves no
 * trace of which decision it deleted.
 */
interface ResetConsentFixture {
	protocolVersion: number;
	kind: 'reset-consent';
	id: string;
	description: string;
	notes: string[];
	input: FixtureInput & {
		/** The decision on the device at the moment the wipe lands. */
		intent: CommitIntent;
	};
	expected: {
		baseline: {
			/** Read at the baseline publication, before the re-run init can write. */
			disk: {
				envelope: false;
				pendingSaves: false;
				subject: true;
			};
			/**
			 * What the wipe costs the numbering.
			 *
			 * One bump, stated as a delta because the absolute is the device's own: the
			 * contract says so under "Revisions and error writes", and a core that
			 * installs the baseline without publishing, or restarts the count at the
			 * cold-start number, fails here rather than in a comment.
			 */
			revisionDelta: number;
			snapshot: Omit<FixtureSnapshot, 'revision'>;
		};
		afterInit: {
			snapshot: Omit<FixtureSnapshot, 'revision'>;
		};
	};
}

type Fixture =
	| EvaluationFixture
	| SaveBodyFixture
	| NativeEnvelopeFixture
	| ResetConsentFixture
	| RevisionTraceFixture
	| TcStringFixture
	| VendorListScopeFixture;

/** What a scenario holds that a client never sees. */
interface Scenario {
	/**
	 * Policy pack the producer serves. The backend matches it and answers with a
	 * resolution, so it appears in no fixture: a client cannot resolve a pack.
	 */
	policyRules: readonly PolicyRule[];
	/** Geo the backend resolved for this request. Reaches the client as `location`. */
	geo: { country: string | null; region: string | null };
	/** Privacy signals the device reports for this subject. */
	gpc: boolean;
	/** Pinned language, so translation selection never varies. */
	language: string;
	/** Signed policy token the init response carried, when it carried one. */
	policySnapshotToken: string | null;
	/** Records already in protected storage. */
	storedRecords: StoredRecords;
	/** Identified user, when the app has one. */
	user: KernelUser | null;
}

// -- Transport and record plumbing ------------------------------------------

/** Resolve the pack the way the producer does, then put it on the wire. */
const resolutionWireFor = function resolutionWireFor(
	scenario: Scenario
): PolicyResolutionWire {
	return writePolicyResolutionWire(
		resolvePolicyRules({
			countryCode: scenario.geo.country,
			regionCode: scenario.geo.region,
			rules: [...scenario.policyRules],
		})
	);
};

/**
 * The `/init` body for a scenario, built in a fixed key order.
 *
 * `policySnapshotToken` is omitted rather than sent as null, because that is
 * what the backend does when snapshot tokens are not configured, and the schema
 * draws the distinction.
 */
const initBodyFor = function initBodyFor(scenario: Scenario): InitResponseBody {
	const body: InitResponseBody = {
		branding: 'c15t',
		location: {
			countryCode: scenario.geo.country,
			regionCode: scenario.geo.region,
		},
		policyResolution: resolutionWireFor(scenario),
		translations: TRANSLATIONS,
	};
	// Omitted rather than nulled: the field is absent on a real /init that has
	// nothing to snapshot, and a fixture must not invent the key.
	return scenario.policySnapshotToken === null
		? body
		: { ...body, policySnapshotToken: scenario.policySnapshotToken };
};

const transportFor = function transportFor(
	body: InitResponseBody
): InitTransport {
	return {
		body,
		headers: { 'x-request-id': 'req_fixture_init' },
		status: 200,
	};
};

/** A policy resolution status no wire defines. */
const UNREADABLE_POLICY_STATUS = 'unreadable';

/**
 * A readable `/init` body whose policy resolution no client can represent.
 *
 * The status is not one the wire defines, so contract rule 5 applies: the core
 * serves `policyPending` with every optional category denied.
 */
const unreadablePolicyTransportFor = function unreadablePolicyTransportFor(
	body: InitResponseBody
): InitTransport {
	return {
		body: {
			...body,
			policyResolution: {
				...body.policyResolution,
				status: UNREADABLE_POLICY_STATUS,
			} as unknown as PolicyResolutionWire,
		},
		headers: { 'x-request-id': 'req_fixture_init_unreadable' },
		status: 200,
	};
};

/**
 * Fold an `InitTransport` into the response a client hands its kernel.
 *
 * Every `/v1` response is read under the current policy contract.
 */
const initResponseFor = function initResponseFor(
	transport: InitTransport
): InitResponse {
	return mapInitOutputToInitResponse(
		transport.body,
		{},
		{ producerContract: Number(CONTRACT_HEADER_VALUE) }
	);
};

/**
 * Whether an `/init` response is the definitive answer the ready latch waits for.
 *
 * `packages/native-protocol/CONTRACT.md` counts two ways to be told: an envelope at hydrate, and the
 * first init that lands a definitive answer, which on `/v1` is any `200` body.
 */
const isDefinitiveInit = function isDefinitiveInit(
	transport: InitTransport
): boolean {
	return transport.status === 200;
};

/**
 * Derive `ready` instead of copying `hydrated`.
 *
 * Copying it reads the flag as "a stored envelope exists", which is the mistake
 * `packages/native-protocol/CONTRACT.md` calls out: a fresh install with nothing stored is stranded on
 * `false` for its whole first session, so `GRANTED` is unreachable on the one launch
 * a prompt is actually on screen and a listener waiting on readiness never resumes.
 */
const readyFor = function readyFor(
	input: Pick<FixtureInput, 'hydrated' | 'transport'>
): boolean {
	return input.hydrated || isDefinitiveInit(input.transport);
};

const inputFor = function inputFor(
	scenario: Scenario,
	options: {
		/** The app's declaration, when the fixture is about it. See `FixtureInput`. */
		declared?: readonly AllConsentNames[] | null;
		hydrated?: boolean;
		records?: StoredRecords;
	} = {}
): FixtureInput {
	const input: FixtureInput = {
		// Every scenario carries a stored subject, so the default is a returning
		// device whose hydrate() found an envelope. A first launch has to say so, and
		// then `ready` can only come from the response the transport serves.
		hydrated: options.hydrated ?? true,
		now: NOW,
		// The app pins a language and nothing else: geo is what the backend resolves,
		// and it reaches the client as `init.location`.
		overrides: {
			country: null,
			gpc: null,
			language: scenario.language,
			region: null,
		},
		privacySignals: { gpc: { detected: scenario.gpc, override: null } },
		storedRecords: options.records ?? scenario.storedRecords,
		transport: transportFor(initBodyFor(scenario)),
		user: scenario.user,
	};
	// Only a fixture about the declaration carries the key, so every other
	// fixture keeps the bytes it was generated with.
	if (options.declared !== undefined) {
		input.consentCategories = options.declared;
	}
	return input;
};

/**
 * Map stored records onto the kernel's hydration boundary.
 *
 * Absent members are omitted rather than sent as `undefined`, which is how the
 * kernel distinguishes "nothing stored" from a record it must validate.
 */
const hydrationFor = function hydrationFor(
	records: StoredRecords
): HydrationRecords {
	const hydrated: HydrationRecords = { now: NOW };
	if (records.choice !== null) {
		hydrated.choice = records.choice;
	}
	if (records.noticeDismissal !== null) {
		hydrated.noticeDismissal = records.noticeDismissal;
	}
	if (records.optOut !== null) {
		hydrated.optOut = records.optOut;
	}
	if (records.subject !== null) {
		hydrated.subject = records.subject;
	}
	return hydrated;
};

// -- Subject ids -------------------------------------------------------------

/** Ten hex bytes, the random part of a UUIDv7. */
const hexBytes = function hexBytes(hex: string): number[] {
	// parseInt reads a lone last digit and stops at a non-hex one, so check the
	// whole string before reading it.
	if (!/^[0-9a-f]{20}$/u.test(hex)) {
		throw new Error(`${hex} must be exactly 10 random bytes in lowercase hex`);
	}
	const bytes: number[] = [];
	for (let index = 0; index < hex.length; index += 2) {
		bytes.push(Number.parseInt(hex.slice(index, index + 2), 16));
	}
	return bytes;
};

/** The largest millisecond count 48 bits hold. */
const UUID_V7_MAX_MS = 2 ** 48 - 1;

/**
 * Mint a lowercase UUIDv7 from a clock reading and ten random bytes.
 *
 * The layout `subject-id/uuidv7.json` pins for every platform:
 *
 * - bytes 0 to 5: the milliseconds since the Unix epoch, big-endian. A reading
 *   below zero is written as zero and one above 48 bits as the 48-bit maximum, so
 *   a device with a wrong clock still writes an ID the backend accepts.
 * - byte 6: `0x70` or the low four bits of random byte 0.
 * - byte 7: random byte 1.
 * - byte 8: `0x80` or the low six bits of random byte 2.
 * - bytes 9 to 15: random bytes 3 to 9.
 */
const mintUuidV7 = function mintUuidV7(
	randomHex: string,
	clock: number
): string {
	const random = hexBytes(randomHex);
	const ms = Math.min(Math.max(Math.trunc(clock), 0), UUID_V7_MAX_MS);
	const bytes: number[] = [];
	let remaining = ms;
	for (let index = 5; index >= 0; index -= 1) {
		bytes[index] = remaining % 256;
		remaining = Math.floor(remaining / 256);
	}
	// Arithmetic rather than bit operators: the version nibble is 7 over the low four
	// bits of random byte 0, and the variant is binary 10 over the low six of byte 2.
	bytes.push(
		0x70 + ((random[0] ?? 0) % 16),
		random[1] ?? 0,
		0x80 + ((random[2] ?? 0) % 64),
		...random.slice(3)
	);
	const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/**
 * Whether an ID is a subject ID a `/v1` route takes from a client this build wrote:
 * a lowercase UUIDv7 with the RFC 4122 variant, not the nil or max UUID.
 */
const isUuidV7 = function isUuidV7(candidate: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
		candidate
	);
};

// -- /v1 save body ------------------------------------------------------------

/**
 * The kernel's save payload as a native pending queue holds it.
 *
 * Two differences from the kernel's `SavePayload`. `idempotencyKey` is added: the
 * core makes it once per action and freezes it with the payload. `timeToDecisionMs`
 * is dropped: it is a measurement the web banner takes and the native cores do not.
 */
type NativeSavePayload = Omit<SavePayload, 'timeToDecisionMs'> & {
	idempotencyKey: string;
};

const nativeSavePayload = function nativeSavePayload(
	payload: SavePayload,
	idempotencyKey: string
): NativeSavePayload {
	const { timeToDecisionMs: _measured, ...rest } = payload;
	return { ...rest, idempotencyKey };
};

/** The order `confirmed` lists categories in: the web kernel's canonical order. */
const CANONICAL_OPTIONAL_CATEGORIES = [
	'functionality',
	'experience',
	'measurement',
	'marketing',
] as const;

/**
 * The `POST /v1/consent/records` body for one native save payload.
 *
 * Built from the kernel's 3.x cookie-banner body so every field the `/v1` contract
 * leaves unchanged keeps the kernel's value, then renamed and trimmed as the contract
 * says:
 *
 * - removed: `type`, `domain`, `preferences`, `choice`, `externalSubjectId`;
 * - added: `idempotencyKey`, `property`, `answer`, `confirmed`, `externalId`.
 *
 * `answer` is every receipt the subject holds after the action, each
 * `{ value, confirmedAt, basis }`. `confirmed` lists the categories this action confirmed, in the canonical
 * order the web transport uses, and every entry is a key of `answer.categories`. The decision-input assertion is not added:
 * every save-body scenario carries a policy snapshot token, which makes it absent.
 */
const buildConsentRecordBody = function buildConsentRecordBody(
	payload: NativeSavePayload,
	property: string
): Record<string, unknown> {
	const {
		choice: _confirmedReceipts,
		domain: _domain,
		externalSubjectId,
		metadata,
		preferences: _preferences,
		type: _type,
		...unchanged
	} = buildSubjectPostBody(payload as SavePayload, { domain: property });
	const categories = payload.choice.categories as Record<string, unknown>;
	const confirmed = CANONICAL_OPTIONAL_CATEGORIES.filter(
		(category) =>
			Object.hasOwn(payload.confirmed.categories, category) &&
			categories[category] !== undefined
	);
	const body: Record<string, unknown> = {
		...unchanged,
		answer: { categories: { ...categories } },
		confirmed,
		idempotencyKey: payload.idempotencyKey,
		property,
	};
	if (externalSubjectId !== undefined) {
		body.externalId = externalSubjectId;
	}
	if (metadata !== undefined) {
		const { timeToDecisionMs: _measured, ...kept } = metadata as Record<
			string,
			unknown
		>;
		if (Object.keys(kept).length > 0) {
			body.metadata = kept;
		}
	}
	// JSON has no undefined: drop the keys the kernel left unset, as a client would.
	return JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
};

// -- Kernel harness ---------------------------------------------------------

/**
 * Map a commit intent onto the input the kernel's save command accepts.
 *
 * `necessary` is a reject-all here: the prompt offers it as "only necessary",
 * and the kernel records an explicit false for every category in scope.
 */
const saveInputFor = function saveInputFor(intent: CommitIntent): SaveInput {
	if (intent.action === 'all') {
		return 'all';
	}
	return intent.action === 'necessary' ? 'none' : intent.consents;
};

/**
 * The categories a fixture app declares unless its input says otherwise. With
 * none declared, a permissive policy offers only necessary and asks for an
 * acknowledgement, and most fixtures exercise the optional categories
 * themselves. The `necessary-only` fixtures set `input.consentCategories`.
 */
const APP_CATEGORIES: readonly AllConsentNames[] = [
	'necessary',
	'experience',
	'functionality',
	'marketing',
	'measurement',
];

/**
 * The answer of an opt-out route no fixture serves: the request fails as it
 * does offline, so the act stays queued and a record the kernel creates is
 * observed as it stands before the backend answers.
 */
const optOutUnanswered = function optOutUnanswered(): Promise<never> {
	return Promise.reject(
		new Error('fixture: the opt-out route is not answered')
	);
};

/**
 * Build a kernel over a transport double, with nothing injected but the device.
 *
 * Both harnesses -- the single-step fixtures and the revision trace -- go through
 * here, so the two cannot drift into different definitions of "the same input".
 * Policy, records, and overrides all arrive the way they arrive on device, which
 * is what makes the kernel's own revision numbering the number under test.
 *
 * @param input - Device state the kernel starts from.
 * @param init - What `/init` answers, called on every init including a retry.
 * @returns The kernel, and the save payloads it put on the wire.
 */
const kernelFor = function kernelFor(
	input: Pick<
		FixtureInput,
		| 'consentCategories'
		| 'now'
		| 'overrides'
		| 'privacySignals'
		| 'storedRecords'
		| 'user'
	>,
	init: () => Promise<InitResponse>
): {
	kernel: ReturnType<typeof createConsentKernel>;
	payloads: SavePayload[];
} {
	const payloads: SavePayload[] = [];
	const initialOverrides: KernelOverrides = {
		language: input.overrides.language ?? DEFAULT_NATIVE_LANGUAGE,
	};
	if (input.overrides.gpc !== null) {
		initialOverrides.gpc = input.overrides.gpc;
	}
	return {
		kernel: createConsentKernel({
			consentCategories:
				input.consentCategories === undefined
					? [...APP_CATEGORIES]
					: (input.consentCategories ?? undefined),
			initialOverrides,
			initialPolicyPending: true,
			initialPrivacySignals: {
				gpc: input.privacySignals.gpc.detected ?? false,
			},
			initialRecords: hydrationFor(input.storedRecords),
			initialUser: input.user ?? undefined,
			now: input.now,
			transport: {
				init,
				// A native core always talks to a backend that stores opt-outs, so
				// the fixture kernel has the opt-out routes too. No fixture serves
				// their answer: a record the kernel creates keeps the empty rights
				// it starts with, which is what a core holds until the backend
				// answers.
				liftOptOut: optOutUnanswered,
				optOut: optOutUnanswered,
				save: (payload) => {
					payloads.push(payload);
					return Promise.resolve({ ok: true, subjectId: payload.subjectId });
				},
			},
		}),
		payloads,
	};
};

/**
 * Replay a fixture input against the real kernel.
 *
 * The policy arrives the way it arrives on device: through the init command, fed
 * by the transport response in the input. Nothing is injected at construction,
 * so the revision numbering and the override fold in `expected` are the ones a
 * client actually observes.
 */
const runFixture = async function runFixture(
	input: FixtureInput,
	options: {
		/** Dismiss the current notice before the snapshot is read. */
		dismiss?: boolean;
		/** Record a durable button opt-out before the snapshot is read. */
		optOut?: boolean;
		intent?: CommitIntent;
		actionAt?: number;
	} = {}
): Promise<{
	before: KernelSnapshot;
	after: KernelSnapshot;
	payload: SavePayload | null;
}> {
	const response = initResponseFor(input.transport);
	const { kernel, payloads } = kernelFor(input, () =>
		Promise.resolve(response)
	);
	await kernel.commands.init();
	const before = kernel.getSnapshot();
	let payload: SavePayload | null = null;
	if (options.intent) {
		await kernel.commands.save(saveInputFor(options.intent), {
			actionAt: options.actionAt ?? input.now,
		});
		payload = payloads[0] ?? null;
	}
	if (options.optOut) {
		await kernel.commands.optOut({
			actionAt: options.actionAt ?? input.now,
		});
	}
	if (options.dismiss) {
		await kernel.commands.dismissNotice();
	}
	const after = kernel.getSnapshot();
	kernel.dispose();
	if (after.model === 'iab' || before.model === 'iab') {
		throw new Error('Fixture produced an IAB model, which is out of scope.');
	}
	return { after, before, payload };
};

/**
 * Run a mutation sequence and record what each step cost the kernel.
 *
 * The two numbers come from two independent observations of the same run: the
 * revision the snapshot carries afterwards, and the count of snapshot listeners
 * the step woke. Nothing here computes what the trace "should" be -- the kernel
 * decides that by running, which is the whole reason the fixture exists.
 *
 * The transport answers whatever the current step says it should, which is also
 * what a retry sees: an init the kernel retries internally gets the same
 * declaration again, exactly as a device re-asking the same backend would.
 *
 * @param input - The device state, the bootstrap response, and the steps.
 * @returns One observation per step, in order.
 */
const runTraceFixture = async function runTraceFixture(
	input: RevisionTraceFixture['input']
): Promise<TraceObservation[]> {
	let serving = initResponseFor(input.transport);
	const { kernel } = kernelFor(input, () => Promise.resolve(serving));
	await kernel.commands.init();

	// Attached after bootstrap, so a publication belongs to a step and never to
	// the hydration some other core counts as its own mutation.
	let publications = 0;
	kernel.subscribe(() => {
		publications += 1;
	});
	let { revision } = kernel.getSnapshot();

	const trace: TraceObservation[] = [];
	/* oxlint-disable no-await-in-loop -- sequential on purpose; one clock for all */
	for (const step of input.steps) {
		if (step.op === 'init') {
			serving = initResponseFor(step.transport);
			await kernel.commands.init();
		} else if (step.op === 'save') {
			await kernel.commands.save(saveInputFor(step.intent), {
				actionAt: input.now,
			});
		} else {
			await kernel.commands.dismissNotice();
		}
		const next = kernel.getSnapshot().revision;
		trace.push({
			publications,
			revisionDelta: next - revision,
			step: step.step,
		});
		publications = 0;
		revision = next;
	}
	return trace;
};

// -- Projection -------------------------------------------------------------

const NOTES = [
	'Compare parsed values, not serialized bytes: object key order is not part of the contract.',
	'transport is the /init response to serve, headers included. Answer it once, before any save.',
	'storedRecords is what protected storage holds before the core starts. A null member means nothing is stored for it. The subject id is always supplied, never generated, so no fixture depends on a random uuid.',
	'input.overrides and input.privacySignals are what the device reports. expected.overrides and expected.privacySignals are what the kernel settled: init.location sets country and region, init.translations sets language, and privacySignals.gpc.active is the override when set, otherwise the detection.',
	'there is no test override and no msa signal. Overrides are country, region, language, and gpc; gpc is a detected / override / active triple. See "Corrections to this contract" in packages/native-protocol/CONTRACT.md.',
	'revision is a monotonic counter that starts at 0 and bumps once per committed mutation. It is not a count of the steps a runner took. Compare it as a number, and read the pinned value rather than deriving it.',
	'The gpc restriction applies while privacySignals.gpc.active is true and the matched rule maps GPC. The first time a live kernel sees an active GPC signal under a matched rule that maps GPC, it records a durable opt-out on snapshot.optOut with method gpc, and marketing and measurement in scope carry the opt-out restriction even after the signal stops. No snapshot carries the retired optOutDirectives field.',
	'evaluatedAt equals input.now. Both it and ready are native lifecycle facts, not kernel output: ready is latched by a hydrate() that found a stored envelope and by the first /init that lands a definitive answer, which on /v1 is any 200 body. Nothing stored plus a resolved init is therefore ready true, and only an init that failed or never arrived leaves it false.',
	'error is null in every fixture: no fixture exercises a transport failure or an unreadable wire.',
	'Any field this file does not mention must not be invented. Unknown wire values fail closed.',
];

/**
 * Project a kernel snapshot onto the shape a native core must produce.
 *
 * This is the mapping the native cores implement, written down once so the
 * fixtures and the TypeScript side cannot drift apart. `ready` and `error` are
 * native lifecycle facts the kernel does not model, so the caller derives `ready`
 * with {@link readyFor} and the error stays `null` for every fixture here.
 */
/**
 * Spell every override member out.
 *
 * The kernel omits an override it never received, and a snapshot must not depend
 * on whether a key is absent or present-but-null: a reader that defaults a
 * missing member is a reader that invents a value.
 */
const fixtureOverrides = function fixtureOverrides(
	overrides: KernelOverrides
): FixtureOverrides {
	return {
		country: overrides.country ?? null,
		gpc: overrides.gpc ?? null,
		language: overrides.language ?? null,
		region: overrides.region ?? null,
	};
};

/** The signals verbatim, in a fixed key order. */
const fixturePrivacySignals = function fixturePrivacySignals(
	signals: KernelPrivacySignals
): KernelPrivacySignals {
	return {
		gpc: {
			active: signals.gpc.active,
			detected: signals.gpc.detected,
			override: signals.gpc.override ?? null,
		},
	};
};

const fixtureResolution = function fixtureResolution(
	resolution: PolicyResolution
): FixtureResolution {
	return {
		fingerprint:
			resolution.status === 'matched' ? resolution.fingerprints.policy : null,
		policyId: resolution.status === 'matched' ? resolution.policyId : null,
		status: resolution.status,
	};
};

/**
 * The subject-facing category list the native snapshot carries.
 *
 * The native cores decide this list themselves -- `decidedCategories` in each of
 * them -- and it is the set the web dialog shows for the same input: `necessary`,
 * then the choice scope the kernel projects (the policy scope narrowed by the
 * categories the app registered, or the whole policy scope when it registered
 * none). `necessary` leads and the optional names follow in canonical sorted
 * order, which is the order both cores emit; the JavaScript layer re-orders that
 * into display order. The fixture configs register no categories, so what the
 * kernel projects is the sorted scope, and both cores have to agree with it.
 */
const fixtureDecisionCategories = function fixtureDecisionCategories(
	snapshot: KernelSnapshot
): readonly AllConsentNames[] {
	const decided =
		snapshot.evaluationPolicy.choiceScope ?? snapshot.evaluationPolicy.scope;
	return [
		'necessary',
		...[...decided].sort((left, right) => left.localeCompare(right)),
	];
};

const toFixtureSnapshot = function toFixtureSnapshot(
	snapshot: KernelSnapshot,
	ready: boolean
): FixtureSnapshot {
	const { overrides } = snapshot;
	const { resolution } = snapshot;
	return {
		activeUI: snapshot.activeUI,
		consentCategories: fixtureDecisionCategories(snapshot),
		effectivePermissions: { ...snapshot.effectivePermissions },
		error: null,
		evaluatedAt: snapshot.evaluatedAt,
		explicitChoice: snapshot.explicitChoice
			? structuredClone(snapshot.explicitChoice)
			: null,
		gppString: null,
		iab: null,
		location: snapshot.location ? { ...snapshot.location } : null,
		model: snapshot.model,
		nextDeadline: snapshot.nextDeadline,
		optOut: snapshot.optOut
			? {
					heldBy: snapshot.optOut.heldBy,
					method: snapshot.optOut.method,
					recordedAt: snapshot.optOut.recordedAt,
					rights: [...snapshot.optOut.rights],
				}
			: null,
		overrides: fixtureOverrides(overrides),
		policyPending: snapshot.policyPending,
		policySnapshotToken: snapshot.policySnapshotToken,
		privacySignals: fixturePrivacySignals(snapshot.privacySignals),
		promptRequirement: { ...snapshot.promptRequirement },
		ready,
		resolution: fixtureResolution(resolution),
		restrictions: { ...snapshot.restrictions },
		revision: snapshot.revision,
		subject: snapshot.subject ? { ...snapshot.subject } : null,
		translations: snapshot.translations
			? {
					language: snapshot.translations.language,
					translations: snapshot.translations.translations,
				}
			: null,
	};
};

// -- Scenarios --------------------------------------------------------------

const storedFor = function storedFor(
	subjectId: string,
	extras: {
		choice?: ExplicitChoice;
		noticeDismissal?: NoticeDismissal;
		optOut?: OptOutRecord;
	} = {}
): StoredRecords {
	return {
		choice: extras.choice ?? null,
		noticeDismissal: extras.noticeDismissal ?? null,
		optOut: extras.optOut ?? null,
		subject: { subjectId },
	};
};

const EU_SCENARIO: Scenario = {
	geo: { country: 'DE', region: null },
	gpc: false,
	language: DEFAULT_NATIVE_LANGUAGE,
	policyRules: POLICY_RULES,
	policySnapshotToken: 'tok-europe-opt-in',
	storedRecords: storedFor(SUBJECT.europe),
	user: null,
};

const CCPA_SCENARIO: Scenario = {
	geo: { country: 'US', region: 'CA' },
	gpc: false,
	language: DEFAULT_NATIVE_LANGUAGE,
	policyRules: POLICY_RULES,
	policySnapshotToken: 'tok-california-opt-out',
	storedRecords: storedFor(SUBJECT.california),
	user: null,
};

const GPC_SCENARIO: Scenario = {
	...CCPA_SCENARIO,
	gpc: true,
	storedRecords: storedFor(SUBJECT.gpc),
};

/** Only the California rule is configured, so Germany matches nothing. */
const NO_MATCH_SCENARIO: Scenario = {
	geo: { country: 'DE', region: 'BE' },
	gpc: false,
	language: DEFAULT_NATIVE_LANGUAGE,
	policyRules: [policyRulePresets.californiaOptOut()],
	policySnapshotToken: null,
	storedRecords: storedFor(SUBJECT.noMatch),
	user: null,
};

const NOTICE_SCENARIO: Scenario = {
	geo: { country: 'GB', region: null },
	gpc: false,
	language: DEFAULT_NATIVE_LANGUAGE,
	policyRules: [NOTICE_RULE],
	policySnapshotToken: 'tok-notice-only',
	storedRecords: storedFor(SUBJECT.notice),
	user: null,
};

/** A device holding a receipt minted while `v1` copy was in force. */
const STALE_POLICY_MINT_SCENARIO: Scenario = {
	geo: { country: 'US', region: 'CA' },
	gpc: false,
	language: DEFAULT_NATIVE_LANGUAGE,
	policyRules: [stalePolicyRule('v1', 'fixture_california_opt_out')],
	policySnapshotToken: 'tok-stale-mint',
	storedRecords: storedFor(SUBJECT.california),
	user: null,
};

/** The same device, on the launch after the publisher revised the copy. */
const STALE_POLICY_REPLAY_SCENARIO: Scenario = {
	...STALE_POLICY_MINT_SCENARIO,
	policyRules: [stalePolicyRule('v2', 'fixture_california_opt_out')],
	policySnapshotToken: 'tok-stale-replay',
};

/** A no-prompt opt-out rule on the stale-policy axis, for durable opt-out replay. */
const STALE_OPT_OUT_MINT_SCENARIO: Scenario = {
	...STALE_POLICY_MINT_SCENARIO,
	policyRules: [
		stalePolicyRule('v1', 'fixture_california_opt_out_no_prompt', 'none'),
	],
	policySnapshotToken: 'tok-stale-opt-out-mint',
};

/** The same no-prompt opt-out rule after the publisher revised the copy. */
const STALE_OPT_OUT_REPLAY_SCENARIO: Scenario = {
	...STALE_OPT_OUT_MINT_SCENARIO,
	policyRules: [
		stalePolicyRule('v2', 'fixture_california_opt_out_no_prompt', 'none'),
	],
	policySnapshotToken: 'tok-stale-opt-out-replay',
};

/**
 * The scope and basis scenarios.
 *
 * Each reuses a subject id from `SUBJECT` rather than minting its own. Reuse is
 * deliberate: a fixture replays one state and never shares storage with another,
 * and the id is only an identity the snapshot and the save body carry.
 */
const NARROW_PERMISSIVE_OPT_IN_SCENARIO: Scenario = {
	geo: { country: 'FR', region: null },
	gpc: false,
	language: DEFAULT_NATIVE_LANGUAGE,
	policyRules: [NARROW_PERMISSIVE_OPT_IN_RULE],
	policySnapshotToken: 'tok-narrow-permissive-opt-in',
	storedRecords: storedFor(SUBJECT.europe),
	user: null,
};

const NARROW_PERMISSIVE_OPT_OUT_SCENARIO: Scenario = {
	...NARROW_PERMISSIVE_OPT_IN_SCENARIO,
	geo: { country: 'ES', region: null },
	policyRules: [NARROW_PERMISSIVE_OPT_OUT_RULE],
	policySnapshotToken: 'tok-narrow-permissive-opt-out',
};

const NARROW_STRICT_SCENARIO: Scenario = {
	...NARROW_PERMISSIVE_OPT_IN_SCENARIO,
	geo: { country: 'IT', region: null },
	policyRules: [NARROW_STRICT_RULE],
	policySnapshotToken: 'tok-narrow-strict',
};

const NARROW_IAB_SCENARIO: Scenario = {
	...NARROW_PERMISSIVE_OPT_IN_SCENARIO,
	geo: { country: 'PT', region: null },
	policyRules: [NARROW_IAB_RULE],
	policySnapshotToken: 'tok-narrow-iab',
};

const GPC_DENYING_SCENARIO: Scenario = {
	...NARROW_PERMISSIVE_OPT_IN_SCENARIO,
	geo: { country: 'NL', region: null },
	gpc: true,
	policyRules: [GPC_DENYING_OPT_IN_RULE],
	policySnapshotToken: 'tok-gpc-denying',
};

/** A permissive rule on a device whose app declares no categories. */
const NOTHING_DECLARED_SCENARIO: Scenario = {
	...NARROW_PERMISSIVE_OPT_IN_SCENARIO,
	geo: { country: 'SE', region: null },
	policyRules: [necessaryOnlyRule('permissive', 'v1')],
	policySnapshotToken: 'tok-nothing-declared',
};

/** A permissive IAB rule on a device whose app declares no categories. */
const NOTHING_DECLARED_IAB_SCENARIO: Scenario = {
	...NOTHING_DECLARED_SCENARIO,
	geo: { country: 'FI', region: null },
	policyRules: [
		{
			...necessaryOnlyRule('permissive', 'v1'),
			id: 'fixture_nothing_declared_iab',
			match: { countries: ['FI'] },
			model: 'iab',
		},
	],
	policySnapshotToken: 'tok-nothing-declared-iab',
};

/** The same device after the publisher revised the rule's copy. */
const NOTHING_DECLARED_REVISED_SCENARIO: Scenario = {
	...NOTHING_DECLARED_SCENARIO,
	policyRules: [necessaryOnlyRule('permissive', 'v2')],
	policySnapshotToken: 'tok-nothing-declared-revised',
};

/** A strict rule on a device whose app declares no categories. */
const NOTHING_DECLARED_STRICT_SCENARIO: Scenario = {
	...NARROW_PERMISSIVE_OPT_IN_SCENARIO,
	geo: { country: 'DK', region: null },
	policyRules: [necessaryOnlyRule('strict', 'v1')],
	policySnapshotToken: 'tok-nothing-declared-strict',
};

/**
 * Notes for the fixtures about an app that declares no categories. Only those
 * fixtures carry them, so every other fixture keeps its bytes.
 */
const DECLARATION_NOTES = [
	'input.consentCategories is the list the app declares: null means it declares nothing, which is a host that never sets consentCategories. A fixture without the key declares every category, necessary, experience, functionality, marketing and measurement.',
	'with nothing declared, a permissive rule asks about no category: consentCategories lists necessary alone and the choice prompt asks for an acknowledgement. Any save answers it by recording a notice dismissal bound to the choice fingerprint, stamped with the action time. A strict rule, and an IAB rule, still ask about their whole scope.',
	'the acknowledgement lasts the choice lifetime. It stops answering once it is that old (reason expired) or once the choice fingerprint moves (reason policy-changed), and any category decision still valid under the current choice fingerprint answers the prompt too. nextDeadline includes the moment the last of those runs out.',
];

/**
 * Move an acknowledgement back by `days`, the way `ageChoice` ages a receipt.
 * The record is otherwise the one the save command wrote.
 */
const ageDismissal = function ageDismissal(
	dismissal: NoticeDismissal,
	days: number
): NoticeDismissal {
	return { ...dismissal, dismissedAt: dismissal.dismissedAt - days * DAY_MS };
};

/**
 * Move an opt-out record's timestamp back by `days`, the way `ageChoice` ages a receipt.
 * The record is otherwise the one the opt-out command wrote.
 */
const ageOptOut = function ageOptOut(
	optOut: OptOutRecord,
	days: number
): OptOutRecord {
	return {
		...optOut,
		recordedAt: optOut.recordedAt - days * DAY_MS,
		rights: [...optOut.rights],
	};
};

// -- Fixtures ---------------------------------------------------------------

const evaluationFixture = function evaluationFixture(
	id: string,
	description: string,
	input: FixtureInput,
	snapshot: KernelSnapshot,
	notes: readonly string[] = NOTES
): EvaluationFixture {
	return {
		description,
		expected: { snapshot: toFixtureSnapshot(snapshot, readyFor(input)) },
		id: `evaluation-${id}`,
		input,
		kind: 'evaluation',
		notes: [...notes],
		protocolVersion: PROTOCOL_VERSION,
	};
};

/**
 * The acknowledgement a save records for an app that declares nothing, minted by
 * the real save command against `scenario`.
 */
const mintAcknowledgement = async function mintAcknowledgement(
	scenario: Scenario
): Promise<NoticeDismissal> {
	const minted = await runFixture(inputFor(scenario, { declared: null }), {
		intent: { action: 'all' },
	});
	if (!minted.after.noticeDismissal) {
		throw new Error(
			'A save on a choice prompt with nothing to decide recorded no acknowledgement, so the axis proves nothing.'
		);
	}
	return minted.after.noticeDismissal;
};

/**
 * An app that declares no categories, against a permissive and a strict rule.
 *
 * Every record replayed here comes from the real save command: the
 * acknowledgement from a save with nothing declared, the category decisions from
 * a save made while the app still declared every category. Only its age or the
 * rule it is judged against changes.
 */
const buildNothingDeclaredEvaluationFixtures =
	async function buildNothingDeclaredEvaluationFixtures(): Promise<
		EvaluationFixture[]
	> {
		const acknowledgement = await mintAcknowledgement(
			NOTHING_DECLARED_SCENARIO
		);
		const granted = await runFixture(inputFor(NOTHING_DECLARED_SCENARIO), {
			intent: { action: 'all' },
		});
		const cases: {
			id: string;
			description: string;
			scenario: Scenario;
			records: StoredRecords;
		}[] = [
			{
				description:
					'A permissive opt-in rule on a device whose app declares no categories and has nothing stored. The choice scope is empty, so the subject is offered necessary alone, every governed category stays denied, and the choice prompt is owed with reason missing.',
				id: 'necessary-only-pending',
				records: storedFor(SUBJECT.europe),
				scenario: NOTHING_DECLARED_SCENARIO,
			},
			{
				description:
					'The same device on a later launch, holding the acknowledgement an accept-all recorded. It is a notice dismissal bound to the choice fingerprint and still inside the choice lifetime, so nothing is owed, no surface renders, and the next deadline is when the acknowledgement runs out.',
				id: 'necessary-only-acknowledged',
				records: storedFor(SUBJECT.europe, {
					noticeDismissal: acknowledgement,
				}),
				scenario: NOTHING_DECLARED_SCENARIO,
			},
			{
				description:
					'The acknowledgement aged 400 days against a 30-day choice lifetime. It no longer answers the prompt, and because it was made against the current choice fingerprint the prompt is owed with reason expired.',
				id: 'necessary-only-acknowledgement-expired',
				records: storedFor(SUBJECT.europe, {
					noticeDismissal: ageDismissal(acknowledgement, 400),
				}),
				scenario: NOTHING_DECLARED_SCENARIO,
			},
			{
				description:
					'The acknowledgement replayed after the publisher revised the rule copy, which moves the choice fingerprint. A dismissal made against another fingerprint does not answer the prompt, and it is owed with reason policy-changed.',
				id: 'necessary-only-policy-changed',
				records: storedFor(SUBJECT.europe, {
					noticeDismissal: acknowledgement,
				}),
				scenario: NOTHING_DECLARED_REVISED_SCENARIO,
			},
			{
				description:
					'An accept-all recorded while the app still declared every category, replayed after it stopped declaring any. There is no acknowledgement, but a category decision still valid under the choice fingerprint answers the prompt, so nothing is owed and the grants keep their permissions.',
				id: 'necessary-only-answered-by-decision',
				records: storedFor(SUBJECT.europe, {
					choice: granted.after.explicitChoice ?? null,
				}),
				scenario: NOTHING_DECLARED_SCENARIO,
			},
			{
				description:
					'A strict opt-in rule on a device whose app declares no categories. Nothing outside a strict scope may run, so the subject is still asked about the whole scope: every optional category is listed and the choice prompt is owed with reason missing.',
				id: 'nothing-declared-strict',
				records: storedFor(SUBJECT.europe),
				scenario: NOTHING_DECLARED_STRICT_SCENARIO,
			},
			{
				description:
					'A permissive IAB rule on a device whose app declares no categories. TCF consent is given per purpose and recorded in the TC string, so the subject is still asked about the whole scope: every optional category is listed and the choice prompt is owed with reason missing.',
				id: 'nothing-declared-iab',
				records: storedFor(SUBJECT.europe),
				scenario: NOTHING_DECLARED_IAB_SCENARIO,
			},
		];
		const fixtures: EvaluationFixture[] = [];
		// Sequential for the same reason as the evaluation cases: one kernel at a
		// time against the pinned clock.
		/* oxlint-disable no-await-in-loop -- sequential on purpose, see above */
		for (const testCase of cases) {
			const input = inputFor(testCase.scenario, {
				declared: null,
				records: testCase.records,
			});
			const { after } = await runFixture(input);
			fixtures.push(
				evaluationFixture(testCase.id, testCase.description, input, after, [
					...NOTES,
					...DECLARATION_NOTES,
				])
			);
		}
		return fixtures;
	};

const buildEvaluationFixtures =
	async function buildEvaluationFixtures(): Promise<EvaluationFixture[]> {
		const cases: {
			id: string;
			description: string;
			scenario: Scenario;
		}[] = [
			{
				description:
					'Germany resolves the Europe opt-in rule. With no stored choice every optional category is denied and a choice prompt is owed, so the banner is the surface to render.',
				id: 'eu-opt-in',
				scenario: EU_SCENARIO,
			},
			{
				description:
					'California resolves the CCPA opt-out rule. Optional categories are allowed until denied, no prompt is owed, and no surface renders.',
				id: 'us-ccpa-opt-out',
				scenario: CCPA_SCENARIO,
			},
			{
				description:
					'Germany with only the California rule configured resolves to no-match. The evaluator falls back to the safe opt-in rule, denies every optional category, and still reports a rule the user can be shown.',
				id: 'no-rule-matched',
				scenario: NO_MATCH_SCENARIO,
			},
			{
				description:
					'An active GPC signal under the CCPA opt-out rule denies marketing and measurement even though the model would allow them, records a durable opt-out with method gpc and no rights yet, because the backend has not answered, and reports both gpc and opt-out restrictions on the snapshot.',
				id: 'gpc-signal-present',
				scenario: GPC_SCENARIO,
			},
			{
				description:
					'A notice-only rule with no stored dismissal still owes the notice, so the banner renders and permissions follow the opt-out default.',
				id: 'notice-pending',
				scenario: NOTICE_SCENARIO,
			},
		];
		const fixtures: EvaluationFixture[] = [];
		// One kernel per case, run to completion before the next. The cases share a
		// pinned Date.now, so overlapping them would let one case's async work land
		// inside another's and make the expectations depend on scheduling.
		/* oxlint-disable no-await-in-loop -- sequential on purpose, see above */
		for (const testCase of cases) {
			const input = inputFor(testCase.scenario);
			const { after } = await runFixture(input);
			fixtures.push(
				evaluationFixture(testCase.id, testCase.description, input, after)
			);
		}

		// A stored grant and a stored partial denial are the two records a real
		// second launch brings back. They come from the real save command, so the
		// receipt fingerprints and confirmation times are the core's own.
		const granted = await runFixture(inputFor(EU_SCENARIO), {
			intent: { action: 'all' },
		});
		const grantInput = inputFor(EU_SCENARIO, {
			records: storedFor(SUBJECT.europe, {
				choice: granted.after.explicitChoice ?? null,
			}),
		});
		const replayedGrant = await runFixture(grantInput);
		fixtures.push(
			evaluationFixture(
				'eu-explicit-grants',
				'The same Europe opt-in rule on a second launch, with a stored accept-all. The receipts carry the rule choice fingerprint, every optional category is allowed, and nothing is owed, so no surface renders.',
				grantInput,
				replayedGrant.after
			)
		);

		const partial = await runFixture(inputFor(EU_SCENARIO), {
			intent: {
				action: 'explicit',
				consents: { marketing: false, measurement: true },
			},
		});
		const partialInput = inputFor(EU_SCENARIO, {
			records: storedFor(SUBJECT.europe, {
				choice: partial.after.explicitChoice ?? null,
			}),
		});
		const replayedPartial = await runFixture(partialInput);
		fixtures.push(
			evaluationFixture(
				'eu-partial-denials',
				'A stored partial choice under the Europe opt-in rule keeps absent categories absent. Measurement carries the stored grant, marketing carries the stored denial, and functionality and experience take the opt-in default rather than an invented value.',
				partialInput,
				replayedPartial.after
			)
		);

		// The dismissal has to come from the real command so its fingerprint and
		// timestamp are the core's, not a hand-written guess. The second run then
		// replays that record through hydration, which is what a relaunch does.
		const undismissed = await runFixture(inputFor(NOTICE_SCENARIO), {
			dismiss: true,
		});
		const dismissedInput = inputFor(NOTICE_SCENARIO, {
			records: storedFor(SUBJECT.notice, {
				noticeDismissal: undismissed.after.noticeDismissal ?? null,
			}),
		});
		const dismissed = await runFixture(dismissedInput);
		fixtures.push(
			evaluationFixture(
				'notice-dismissed',
				'The same notice-only rule after the notice was dismissed: the dismissal record is honoured, no interaction is owed, no surface renders, and permissions are unchanged from the undismissed run.',
				dismissedInput,
				dismissed.after
			)
		);

		// -- Scope, expiry, basis and model axes ---------------------------------
		// Every case above resolves a full four-category scope against a current
		// receipt, which is exactly why the three divergences in
		// `docs/internal/evaluator-parity.md` were invisible to CI. Each case below
		// mints its receipt with the real save command and then changes only the
		// record's age, or records an answer for a category outside the minting
		// rule's scope. The expectation stays whatever the kernel answers, which is
		// what makes a failing core the finding rather than the fixture.
		const scopeCases: {
			id: string;
			description: string;
			/** The scenario whose policy the replayed record is judged against. */
			scenario: Scenario;
			/** The subject the receipt is stored under. */
			subjectId: string;
			/** The save that mints the receipt, and the pack it is minted against. */
			mint?: { intent: CommitIntent; scenario?: Scenario };
			/** How the minted record is amended before it is replayed. */
			amend?: (choice: ExplicitChoice) => ExplicitChoice;
		}[] = [
			{
				description:
					'A rule that governs only functionality, permissively, on a device with no receipt. The in-scope category is denied by the opt-in model, and marketing outside a permissive scope is allowed with no reason recorded: out of scope the model is not consulted at all.',
				id: 'narrow-permissive-no-receipt',
				scenario: NARROW_PERMISSIVE_OPT_IN_SCENARIO,
				subjectId: SUBJECT.europe,
			},
			{
				amend: (choice) => decideExtra(choice, { marketing: false }, NOW),
				description:
					'The same permissive scope holding a recorded refusal for the category it does not govern. A refusal is a refusal whether or not the rule asked for it, so marketing is denied and carries explicit-denial rather than sitting at the permissive default.',
				id: 'narrow-permissive-denial-opt-in',
				mint: {
					intent: { action: 'explicit', consents: { functionality: true } },
				},
				scenario: NARROW_PERMISSIVE_OPT_IN_SCENARIO,
				subjectId: SUBJECT.europe,
			},
			{
				amend: (choice) => decideExtra(choice, { marketing: false }, NOW),
				description:
					'A permissive scope under the opt-out model with the same recorded refusal. The model default allows and the receipt denies, and the denial wins: this is the cell where reading the model instead of the record turns a subject no into a yes.',
				id: 'narrow-permissive-denial-opt-out',
				mint: {
					intent: { action: 'explicit', consents: { functionality: true } },
				},
				scenario: NARROW_PERMISSIVE_OPT_OUT_SCENARIO,
				subjectId: SUBJECT.europe,
			},
			{
				amend: (choice) => decideExtra(choice, { marketing: false }, NOW),
				description:
					'A strict scope with a recorded refusal for the category outside it. Both reasons apply and the order is the web order: explicit-denial first, strict-scope second, because the subject said no before the rule said nothing.',
				id: 'narrow-strict-denial',
				mint: {
					intent: { action: 'explicit', consents: { functionality: true } },
				},
				scenario: NARROW_STRICT_SCENARIO,
				subjectId: SUBJECT.europe,
			},
			{
				amend: (choice) =>
					ageChoice(decideExtra(choice, { marketing: false }, NOW), 400),
				description:
					'A refusal aged 400 days against a 30-day validity, on the permissive narrow scope. The in-scope grant has lapsed and stops being an authority, while the refusal still denies and still reports explicit-denial: a denial never ages, expired basis or not.',
				id: 'narrow-permissive-denial-expired',
				mint: {
					intent: { action: 'explicit', consents: { functionality: true } },
				},
				scenario: NARROW_PERMISSIVE_OPT_IN_SCENARIO,
				subjectId: SUBJECT.europe,
			},
			{
				amend: (choice) => ageChoice(choice, 400),
				description:
					'An expired accept-all under the Europe opt-in rule. The receipts are still on record and carry the rule fingerprint, every optional category is back to the opt-in default with no reason attached, and the choice prompt is owed again with reason expired.',
				id: 'opt-in-grant-expired',
				mint: { intent: { action: 'all' } },
				scenario: EU_SCENARIO,
				subjectId: SUBJECT.europe,
			},
			{
				description:
					'An IAB rule with a narrow scope on a device with no receipt. The in-scope category waits for a grant exactly as it would under opt-in, and the category outside a permissive scope is allowed; the snapshot reports the model as opt-in because the fixture kernel runs without the IAB module.',
				id: 'narrow-iab-no-receipt',
				scenario: NARROW_IAB_SCENARIO,
				subjectId: SUBJECT.europe,
			},
			{
				amend: (choice) => decideExtra(choice, { marketing: false }, NOW),
				description:
					'The same IAB rule holding a refusal for the category outside its scope. An IAB rule answers the evaluator exactly as opt-in does, including the reason, so a core that special-cases the model name diverges here first.',
				id: 'narrow-iab-denial',
				mint: {
					intent: { action: 'explicit', consents: { functionality: true } },
				},
				scenario: NARROW_IAB_SCENARIO,
				subjectId: SUBJECT.europe,
			},
			{
				description:
					'An active GPC signal under an opt-in rule that maps marketing. The live kernel records a durable opt-out with method gpc, so marketing carries gpc and opt-out and measurement carries opt-out beside the other two categories, because reasons are gathered independently of the opt-in default.',
				id: 'gpc-under-opt-in-no-receipt',
				scenario: GPC_DENYING_SCENARIO,
				subjectId: SUBJECT.europe,
			},
			{
				description:
					'A refusal minted under the first revision of the policy text, replayed after the publisher revised it. The basis no longer matches, so the grant half is not an authority, while the refusal still denies: a policy edit re-opens a permission, never a refusal.',
				id: 'opt-out-denial-under-stale-policy',
				mint: {
					intent: {
						action: 'explicit',
						consents: { marketing: false, measurement: true },
					},
					scenario: STALE_POLICY_MINT_SCENARIO,
				},
				scenario: STALE_POLICY_REPLAY_SCENARIO,
				subjectId: SUBJECT.california,
			},
			{
				description:
					'The same revised policy against a stored grant for marketing and a refusal of measurement. The grant is not an authority under a basis the subject no longer stands under, and under opt-out marketing is allowed by default anyway with no reason recorded, while measurement keeps its denial.',
				id: 'opt-out-grant-under-stale-policy',
				mint: {
					intent: {
						action: 'explicit',
						consents: { marketing: true, measurement: false },
					},
					scenario: STALE_POLICY_MINT_SCENARIO,
				},
				scenario: STALE_POLICY_REPLAY_SCENARIO,
				subjectId: SUBJECT.california,
			},
		];
		// Sequential for the same reason as the cases above: the mint and the replay
		// are two runs of one kernel each, against the pinned clock.
		/* oxlint-disable no-await-in-loop -- sequential on purpose, see above */
		for (const scopeCase of scopeCases) {
			let records = storedFor(scopeCase.subjectId);
			if (scopeCase.mint) {
				const minted = await runFixture(
					inputFor(scopeCase.mint.scenario ?? scopeCase.scenario),
					{ intent: scopeCase.mint.intent }
				);
				const choice = minted.after.explicitChoice;
				if (!choice) {
					throw new Error(
						`Fixture ${scopeCase.id}: the minting save stored no receipt, so the axis proves nothing.`
					);
				}
				records = storedFor(scopeCase.subjectId, {
					choice: scopeCase.amend ? scopeCase.amend(choice) : choice,
				});
			}
			const scopeInput = inputFor(scopeCase.scenario, { records });
			const scopeRun = await runFixture(scopeInput);
			fixtures.push(
				evaluationFixture(
					scopeCase.id,
					scopeCase.description,
					scopeInput,
					scopeRun.after
				)
			);
		}

		// The two launches every other fixture skips: nothing stored, so hydrate() has
		// no envelope to find and `ready` can only arrive with the init response. A core
		// that reads the flag as "a stored envelope exists" answers both `false` and
		// strands the device in PENDING for the whole of its first session, which is the
		// one session a prompt is on screen. The pinned subject id is not storage: the
		// identity has its own slot, and packages/native-protocol/CONTRACT.md keeps an envelope refusal from
		// costing a device its identity. It is a UUIDv7, so nothing here reads as the
		// refused-id case the Subject identity ruling sends to a first launch -- these two
		// are a first launch because the envelope slot is empty, and for no other reason.
		const freshCases: {
			id: string;
			description: string;
			scenario: Scenario;
			/** A first launch still pins its identity: the slot is separate from the envelope. */
			subjectId: string;
		}[] = [
			{
				description:
					'The Europe opt-in rule on a device with nothing stored. Hydrate found no envelope, so the resolved init is the only thing that could raise `ready`; permissions still deny every optional category and the choice prompt is still owed. Fail closed and ready are not opposites, and the flag is what tells a host the answer has landed.',
				id: 'eu-fresh-install',
				scenario: EU_SCENARIO,
				subjectId: SUBJECT.europeFirstLaunch,
			},
			{
				description:
					'The California opt-out rule on a device with nothing stored. The init resolves, so the first launch is ready, and the opt-out default leaves every optional category allowed: GRANTED on a launch with no stored envelope, which is exactly the state a core that latches `ready` on stored bytes cannot reach.',
				id: 'us-ccpa-fresh-install',
				scenario: CCPA_SCENARIO,
				subjectId: SUBJECT.californiaFirstLaunch,
			},
		];
		// Sequential for the same reason as the cases above: one kernel against the
		// pinned clock at a time.
		/* oxlint-disable no-await-in-loop -- sequential on purpose, see above */
		for (const freshCase of freshCases) {
			const freshInput = inputFor(freshCase.scenario, {
				hydrated: false,
				records: storedFor(freshCase.subjectId),
			});
			const fresh = await runFixture(freshInput);
			fixtures.push(
				evaluationFixture(
					freshCase.id,
					freshCase.description,
					freshInput,
					fresh.after
				)
			);
		}

		fixtures.push(...(await buildNothingDeclaredEvaluationFixtures()));

		// -- Durable opt-out record axes -----------------------------------------
		// Each stored opt-out below starts from a real kernel run and sets the
		// California backend's rights (`sale`, `share`), representing a device
		// holding a record after a backend answered.
		const storedCaliforniaRights = (optOut: OptOutRecord): OptOutRecord => ({
			...optOut,
			rights: ['sale', 'share'],
		});
		const gpcRecorded = await runFixture(inputFor(GPC_SCENARIO));
		if (!gpcRecorded.after.optOut) {
			throw new Error(
				'An active GPC signal under the CCPA opt-out rule recorded no opt-out, so the stored opt-out axis proves nothing.'
			);
		}
		const storedWithoutGpcInput = inputFor(CCPA_SCENARIO, {
			records: storedFor(SUBJECT.gpc, {
				optOut: storedCaliforniaRights(gpcRecorded.after.optOut),
			}),
		});
		const storedWithoutGpc = await runFixture(storedWithoutGpcInput);
		fixtures.push(
			evaluationFixture(
				'opt-out-stored-without-gpc',
				'A stored durable opt-out recorded earlier from GPC, replayed under the CCPA opt-out rule after GPC turns off. The gpc restriction lifts, while the durable opt-out stays held and keeps marketing and measurement denied with reason opt-out.',
				storedWithoutGpcInput,
				storedWithoutGpc.after
			)
		);

		const buttonOptOutRun = await runFixture(inputFor(CCPA_SCENARIO), {
			optOut: true,
		});
		if (!buttonOptOutRun.after.optOut) {
			throw new Error(
				'commands.optOut() under the CCPA opt-out rule recorded no opt-out, so the aged opt-out axis proves nothing.'
			);
		}
		const agedOptOutInput = inputFor(CCPA_SCENARIO, {
			records: storedFor(SUBJECT.california, {
				optOut: storedCaliforniaRights(
					ageOptOut(buttonOptOutRun.after.optOut, 400)
				),
			}),
		});
		const agedOptOut = await runFixture(agedOptOutInput);
		fixtures.push(
			evaluationFixture(
				'opt-out-aged-over-year',
				'A stored button opt-out with rights sale and share evaluated 400 days after recordedAt under the CCPA opt-out rule. A durable opt-out never expires, so marketing and measurement stay denied with reason opt-out, no deadline is scheduled, and no prompt is owed.',
				agedOptOutInput,
				agedOptOut.after
			)
		);

		const staleOptOutMint = await runFixture(
			inputFor(STALE_OPT_OUT_MINT_SCENARIO),
			{ optOut: true }
		);
		if (!staleOptOutMint.after.optOut) {
			throw new Error(
				'commands.optOut() under the stale-policy opt-out rule recorded no opt-out, so the policy-change opt-out axis proves nothing.'
			);
		}
		const staleOptOutInput = inputFor(STALE_OPT_OUT_REPLAY_SCENARIO, {
			records: storedFor(SUBJECT.california, {
				optOut: storedCaliforniaRights(staleOptOutMint.after.optOut),
			}),
		});
		const staleOptOut = await runFixture(staleOptOutInput);
		fixtures.push(
			evaluationFixture(
				'opt-out-under-stale-policy',
				'A stored durable opt-out minted under the first revision of an opt-out policy and replayed after the publisher revised the copy. A durable opt-out ignores policy changes, so marketing and measurement stay denied with reason opt-out.',
				staleOptOutInput,
				staleOptOut.after
			)
		);

		const measurementGrantedRun = await runFixture(inputFor(CCPA_SCENARIO), {
			intent: {
				action: 'explicit',
				consents: { marketing: false, measurement: true },
			},
		});
		if (
			!(
				measurementGrantedRun.after.optOut &&
				measurementGrantedRun.after.explicitChoice
			)
		) {
			throw new Error(
				'Refusing marketing while granting measurement under the CCPA opt-out rule recorded no opt-out or choice.'
			);
		}
		const measurementGrantedInput = inputFor(CCPA_SCENARIO, {
			records: storedFor(SUBJECT.california, {
				choice: measurementGrantedRun.after.explicitChoice,
				optOut: storedCaliforniaRights(measurementGrantedRun.after.optOut),
			}),
		});
		const measurementGranted = await runFixture(measurementGrantedInput);
		fixtures.push(
			evaluationFixture(
				'opt-out-measurement-granted',
				'A stored button opt-out under the CCPA opt-out rule alongside an explicit refusal of marketing and a valid grant of measurement. Marketing stays denied with explicit-denial and opt-out while the explicit measurement grant stands permitted.',
				measurementGrantedInput,
				measurementGranted.after
			)
		);

		return fixtures;
	};

const SAVE_NOTES = [
	...NOTES,
	'savePayload is what the pending queue must persist before the request, byte-for-byte, and a replay must resend it unchanged after a later init changes policy.',
	'request.headers is empty: these fixtures pin no request header. transport/cases.json pins the headers every request carries.',
	'request.body is the POST /v1/consent/records body. answer holds every receipt the subject has after the action, confirmed names the categories this action confirmed, and property is input.property. tcString is absent because IAB is out of scope: never add the key.',
	'input.idempotencyKey is the key the core makes once for this action. It is part of savePayload and of the body, and a replay sends it unchanged.',
	'the commit happens at input.now, so givenAt, every confirmedAt, and snapshotAfter.evaluatedAt all equal it.',
	'snapshotBefore is the snapshot after init and before the commit, and snapshotAfter is the snapshot the commit leaves behind. Both are asserted.',
	'consentAction and uiSource come from the kernel, not from the intent name: a partial save is custom even when the user turned everything on.',
];

const buildSaveBodyFixtures = async function buildSaveBodyFixtures(): Promise<
	SaveBodyFixture[]
> {
	const buttonOptOutRun = await runFixture(inputFor(CCPA_SCENARIO), {
		optOut: true,
	});
	if (!buttonOptOutRun.after.optOut) {
		throw new Error(
			'commands.optOut() under the CCPA opt-out rule recorded no opt-out, so the opt-out lift fixture proves nothing.'
		);
	}
	const refusedBothRun = await runFixture(inputFor(CCPA_SCENARIO), {
		intent: {
			action: 'explicit',
			consents: { marketing: false, measurement: false },
		},
	});
	if (!(refusedBothRun.after.optOut && refusedBothRun.after.explicitChoice)) {
		throw new Error(
			'Refusing marketing and measurement under the CCPA opt-out rule recorded no opt-out or choice.'
		);
	}
	const cases: {
		id: string;
		description: string;
		scenario: Scenario;
		intent: CommitIntent;
		/** Set on the cases about an app that declares nothing. See `FixtureInput`. */
		declared?: null;
		/** Stored records to seed instead of the scenario's defaults. */
		records?: StoredRecords;
	}[] = [
		{
			description:
				'Accept all under the Europe opt-in rule. The receipts carry the choice fingerprint, the payload confirms exactly the four optional categories, and the wire body sends both the complete preference map and the receipts for this act.',
			id: 'all',
			intent: { action: 'all' },
			scenario: EU_SCENARIO,
		},
		{
			description:
				'Reject all under the Europe opt-in rule. Necessary stays permitted, every optional category gets an explicit false receipt, and no optional category is left undecided.',
			id: 'necessary',
			intent: { action: 'necessary' },
			scenario: EU_SCENARIO,
		},
		{
			description:
				'An explicit partial save under the Europe opt-in rule confirms only marketing and measurement. Functionality and experience get no receipt, so the kernel must not renew or invent them, and consentAction is custom.',
			id: 'explicit-partial',
			intent: {
				action: 'explicit',
				consents: { marketing: true, measurement: false },
			},
			scenario: EU_SCENARIO,
		},
		{
			description:
				'Accept all under the CCPA opt-out rule while GPC is active. The live kernel records a durable GPC opt-out before the save, and accepting all cannot lift it while GPC stays active, so the receipts record the grants while marketing and measurement keep both gpc and opt-out restrictions.',
			id: 'ccpa-gpc',
			intent: { action: 'all' },
			scenario: GPC_SCENARIO,
		},
		{
			description:
				'Reject all under the CCPA opt-out rule. Every optional category gets an explicit false receipt, and refusing marketing (the deciding category) under an opt-out rule records a durable opt-out with method button and no rights yet, because the backend has not answered.',
			id: 'ccpa-reject-all',
			intent: { action: 'necessary' },
			scenario: CCPA_SCENARIO,
		},
		{
			description:
				'Refusing marketing alone under the CCPA opt-out rule. Marketing gets an explicit false receipt while measurement stays undecided, and refusing the deciding category records a durable opt-out with method button and no rights yet that denies both marketing and measurement.',
			id: 'ccpa-refuse-marketing',
			intent: {
				action: 'explicit',
				consents: { marketing: false },
			},
			scenario: CCPA_SCENARIO,
		},
		{
			description:
				'A stored device-held button opt-out under the CCPA opt-out rule followed by a save that grants marketing. With GPC inactive, granting the deciding category lifts the durable opt-out record, clears the opt-out restrictions, and allows marketing and measurement.',
			id: 'ccpa-opt-out-lifted',
			intent: {
				action: 'explicit',
				consents: { marketing: true },
			},
			records: storedFor(SUBJECT.california, {
				optOut: {
					...buttonOptOutRun.after.optOut,
					rights: ['sale', 'share'],
				},
			}),
			scenario: CCPA_SCENARIO,
		},
		{
			description:
				'A stored device-held button opt-out with marketing and measurement refused under the CCPA opt-out rule followed by a save that grants measurement alone. Granting a non-deciding category does not lift the opt-out; marketing stays denied with explicit-denial and opt-out while measurement becomes permitted.',
			id: 'ccpa-opt-out-measurement-grant',
			intent: {
				action: 'explicit',
				consents: { measurement: true },
			},
			records: storedFor(SUBJECT.california, {
				choice: refusedBothRun.after.explicitChoice,
				optOut: {
					...refusedBothRun.after.optOut,
					rights: ['sale', 'share'],
				},
			}),
			scenario: CCPA_SCENARIO,
		},
		{
			declared: null,
			description:
				'Accept all under a permissive opt-in rule on a device whose app declares no categories. There is no category to confirm, so no receipt is written and the explicit choice stays empty; the save records the acknowledgement as a notice dismissal bound to the choice fingerprint at the action time, the prompt is answered, and the wire body is a receipt for strictly necessary alone with consentAction all.',
			id: 'necessary-only-all',
			intent: { action: 'all' },
			scenario: NOTHING_DECLARED_SCENARIO,
		},
		{
			declared: null,
			description:
				'Reject all on the same device. It records the same acknowledgement and sends the same necessary-only receipt, with consentAction necessary: with nothing to decide, both bulk actions cover everything the subject was shown.',
			id: 'necessary-only-necessary',
			intent: { action: 'necessary' },
			scenario: NOTHING_DECLARED_SCENARIO,
		},
	];
	const fixtures: SaveBodyFixture[] = [];
	// Sequential for the same reason as the evaluation cases: one kernel at a
	// time against the pinned clock.
	/* oxlint-disable no-await-in-loop -- sequential on purpose, see above */
	for (const testCase of cases) {
		const input = inputFor(testCase.scenario, {
			declared: testCase.declared,
			records: testCase.records,
		});
		const { after, before, payload } = await runFixture(input, {
			actionAt: input.now,
			intent: testCase.intent,
		});
		if (!payload) {
			throw new Error(`No save payload captured for ${testCase.id}.`);
		}
		const idempotencyKey = mintUuidV7(
			IDEMPOTENCY_MINTS[testCase.id] ?? '',
			input.now
		);
		const savePayload = nativeSavePayload(payload, idempotencyKey);
		fixtures.push({
			description: testCase.description,
			expected: {
				request: {
					body: buildConsentRecordBody(savePayload, PROPERTY),
					headers: {},
					method: 'POST',
					path: '/v1/consent/records',
				},
				savePayload,
				snapshotAfter: toFixtureSnapshot(after, readyFor(input)),
				snapshotBefore: toFixtureSnapshot(before, readyFor(input)),
			},
			id: `save-body-${testCase.id}`,
			input: {
				...input,
				actionAt: input.now,
				idempotencyKey,
				intent: testCase.intent,
				property: PROPERTY,
			},
			kind: 'save-body',
			notes:
				testCase.declared === undefined
					? SAVE_NOTES
					: [...SAVE_NOTES, ...DECLARATION_NOTES],
			protocolVersion: PROTOCOL_VERSION,
		});
	}
	return fixtures;
};

/** Serialized v3 consent-record envelope, in the field order the codec emits. */
interface StoredEnvelope {
	categories: unknown;
	subject?: Record<string, string>;
	version: 3;
}

/**
 * Write the web consent-record envelope.
 *
 * Neither native core writes this shape, which is exactly why it survives here: it
 * is the bytes one Inth surface stores and another must refuse. Producing it from
 * the real v3 codec rather than typing it by hand keeps the refusal honest — the
 * fixture hands over a genuine web envelope, not a guess at one.
 */
const encodeEnvelope = function encodeEnvelope(
	envelope: StoredEnvelope
): string {
	return JSON.stringify({
		categories: envelope.categories,
		subject: envelope.subject,
		version: 3,
	});
};

// -- Native stored envelopes ------------------------------------------------

/**
 * The envelope format version the reference core stamps.
 *
 * Swift declares a number and Kotlin carries none, so this is pinned against the
 * reference core and carried as a gap in `packages/native-protocol/CONTRACT.md` rather than demanded
 * of both. It gates readability, not a decision: an envelope at any other number is
 * unreadable, and an unreadable envelope is nothing stored.
 */
const ENVELOPE_FORMAT_VERSION = 1;

/** The field a read fixture adds when it wants one this build cannot name. */
const UNRECOGNISED_ENVELOPE_FIELD = 'com.inth.experiment';

/**
 * What a core that reaches no backend answers with.
 *
 * `packages/native-protocol/CONTRACT.md` states this under "The stored envelope" rather than leaving it
 * to each core: nothing resolved, every optional category denied, and `ready` false so a
 * host can tell a cold install apart from a denied one. It is not kernel output,
 * because the kernel in this harness always gets a transport answer; an offline
 * relaunch is a native-only case, and this is the one place in the file where an
 * expectation is written down instead of produced by running something.
 */
const OFFLINE_DENY_ALL: Record<AllConsentNames, boolean> = {
	experience: false,
	functionality: false,
	marketing: false,
	measurement: false,
	necessary: true,
};

/** The implementation whose stored layout the contract documents. */
const ENVELOPE_REFERENCE: NativeEnvelopeReference = {
	core: 'swift',
	keyOrder: 'alphabetical',
	why: 'Swift writes its envelope with a sorted-keys JSON encoder, so its layout is a plain function of the value and the one packages/native-protocol/CONTRACT.md documents field by field. Kotlin encrypts its blob and keys two of these facts differently. Where the two disagree about how a fact is spelled, this core is the reference and the other moves.',
};

const ENVELOPE_NOTES = [
	...NOTES,
	'this kind pins what a stored consent snapshot looks like on a device. The kernel has no such format: Swift writes a StoredEnvelope as plain JSON and Kotlin writes a SnapshotEnvelope into an encrypted blob, so expected.snapshot is the only kernel-derived half of this file.',
	'reference.core names the implementation whose layout packages/native-protocol/CONTRACT.md documents. A disagreement about how a fact is spelled is settled by that core and the other one moves, which is why nothing here pins a byte layout: the other core could only fail rather than disagree.',
	'fields is the stored field set. fields[].key is a neutral label and never a name either core writes; carriers holds each core name for the fact, and a core with no entry there does not carry it at all. requiredBy lists the cores that must write it.',
	'fields[].loadBearing is true where a consent decision changes if the field is lost or wrong. expect is present (a non-null value), empty (null or absent), or a literal the decoded value must equal. Compare the decoded value and not the serialized key, because Kotlin writes every key every time and key presence alone proves nothing.',
	'relaunch.offline means start a second core over the bytes the first one wrote, with no backend to answer. That is the case a phone in a tunnel is in, and it is the only case that proves the envelope carries enough to answer on its own.',
	'read.identicalToFreshInstall means the defective bytes have to leave the core answering exactly what an empty store leaves it answering, field for field, revision included. A half-decoded envelope answers like a returning user, and that is the thing this forbids.',
	'a defect is applied to the bytes the core itself just wrote, so the base envelope is always valid for the core that wrote it. Only the named defect may make it unreadable; a base that never decoded in the first place makes the fixture meaningless rather than passing.',
	'every read case starts from an accept-all, so the bytes really do hold a marketing grant. Denying everything is then the observable difference between failing closed and reading what is there.',
];

/**
 * The stored field set, with the dismissal expectation set per case.
 *
 * This is a description of a format rather than kernel output, and it belongs here
 * rather than in either runner so the two cannot each grow their own idea of what an
 * envelope holds. A change to it is a change to `packages/native-protocol/CONTRACT.md`, which records
 * the same field set in prose.
 */
const envelopeFieldsFor = function envelopeFieldsFor(
	noticeDismissal: 'empty' | 'present'
): NativeEnvelopeField[] {
	return [
		{
			carriers: { kotlin: 'snapshot', swift: 'snapshot' },
			expect: 'present',
			key: 'snapshot',
			loadBearing: true,
			requiredBy: ['swift', 'kotlin'],
			role: 'the last derived snapshot, so a cold start answers snapshot() on the first synchronous call with no network and no re-derivation',
		},
		{
			carriers: {
				kotlin: 'evaluationPolicy',
				swift: 'policyResolution',
			},
			expect: 'present',
			key: 'policy',
			loadBearing: true,
			requiredBy: ['swift', 'kotlin'],
			role: 'the policy the stored receipts were judged against. Without it a relaunch has to reach the backend before it can answer at all, which turns a cached grant back into a prompt',
		},
		{
			carriers: { kotlin: 'noticeDismissal', swift: 'noticeDismissal' },
			expect: noticeDismissal,
			key: 'noticeDismissal',
			loadBearing: true,
			requiredBy: ['swift', 'kotlin'],
			role: 'a record and not a permission: it decides whether the notice is still owed, so it is stored beside the snapshot rather than folded into it',
		},
		{
			carriers: { swift: 'version' },
			expect: ENVELOPE_FORMAT_VERSION,
			key: 'version',
			loadBearing: false,
			requiredBy: ['swift'],
			role: 'the envelope format version. It gates readability rather than the decision: an envelope at any other number is unreadable here and is therefore ignored',
		},
		{
			carriers: { swift: 'storedAt' },
			expect: NOW,
			key: 'storedAt',
			loadBearing: false,
			requiredBy: ['swift'],
			role: 'epoch milliseconds of the write, for diagnostics and the newest-writer-wins check. Kotlin records no write time at all, which packages/native-protocol/CONTRACT.md carries as a known gap',
		},
	];
};

/**
 * Build the stored-envelope fixtures.
 *
 * Two directions. A write case boots a core, has it store a real decision, and asks
 * what the bytes must hold; a read case does the same and then breaks those bytes
 * before a second core reads them. Both end the same way, offline, because that is
 * the only moment the envelope itself is what is being tested.
 */
const buildNativeEnvelopeFixtures =
	async function buildNativeEnvelopeFixtures(): Promise<
		NativeEnvelopeFixture[]
	> {
		const grants = await runFixture(inputFor(EU_SCENARIO), {
			intent: { action: 'all' },
		});
		if (!grants.payload) {
			throw new Error('No save payload captured for the envelope fixtures.');
		}
		const partial = await runFixture(inputFor(EU_SCENARIO), {
			intent: {
				action: 'explicit',
				consents: { marketing: false, measurement: true },
			},
		});
		const dismissed = await runFixture(inputFor(NOTICE_SCENARIO), {
			dismiss: true,
		});
		const optOut = await runFixture(inputFor(CCPA_SCENARIO), {
			intent: { action: 'all' },
		});
		const acknowledgedInput = inputFor(NOTHING_DECLARED_SCENARIO, {
			declared: null,
		});
		const acknowledged = await runFixture(acknowledgedInput, {
			intent: { action: 'all' },
		});

		// A genuine web envelope, produced by the v3 codec and stored by neither
		// native core. The refusal is only worth pinning if the bytes are real.
		const foreignWire = encodeEnvelope({
			categories: grants.payload.choice.categories,
			subject: { subjectId: SUBJECT.europe },
			version: 3,
		});

		/** Every read case starts here, so the bytes hold a real grant to lose. */
		const grantedInput = (): FixtureInput => ({
			...inputFor(EU_SCENARIO),
			action: { action: 'all' },
		});

		const cases: {
			after: KernelSnapshot;
			description: string;
			id: string;
			input: NativeEnvelopeFixture['input'];
			notes?: readonly string[];
			noticeDismissal: 'empty' | 'present';
			read: boolean;
		}[] = [
			{
				after: grants.after,
				description:
					'An accept-all under a Europe opt-in rule stores the resolved policy and the receipts beside it, and a relaunch that reaches no backend still allows every optional category from those bytes alone.',
				id: 'native-envelope-opt-in-grants',
				input: { ...inputFor(EU_SCENARIO), action: { action: 'all' } },
				noticeDismissal: 'empty',
				read: false,
			},
			{
				after: partial.after,
				description:
					'A partial save stores exactly the two categories the subject touched. The relaunch keeps measurement allowed and marketing denied, and takes the opt-in default for the two the subject never looked at.',
				id: 'native-envelope-partial-denials',
				input: {
					...inputFor(EU_SCENARIO),
					action: {
						action: 'explicit',
						consents: { marketing: false, measurement: true },
					},
				},
				noticeDismissal: 'empty',
				read: false,
			},
			{
				after: dismissed.after,
				description:
					'Dismissing a notice-only prompt is a record and not a permission, so the dismissal is stored beside the snapshot and a relaunch with no backend still knows the notice was closed.',
				id: 'native-envelope-notice-dismissed',
				input: {
					...inputFor(NOTICE_SCENARIO),
					action: { action: 'dismiss-notice' },
				},
				noticeDismissal: 'present',
				read: false,
			},
			{
				after: optOut.after,
				description:
					'The same accept-all under a California opt-out rule, stored and read back offline. The opt-out policy travels with the receipts, so a relaunch cannot mistake a cached decision for a pending one.',
				id: 'native-envelope-opt-out-grants',
				input: { ...inputFor(CCPA_SCENARIO), action: { action: 'all' } },
				noticeDismissal: 'empty',
				read: false,
			},
			{
				after: acknowledged.after,
				description:
					'An accept-all on a device whose app declares no categories, under a permissive rule. It confirms no category, so the acknowledgement it records is the decision: the envelope stores it as the notice dismissal beside the snapshot, and a relaunch with no backend answers with the same permissions.',
				id: 'native-envelope-choice-acknowledged',
				input: { ...acknowledgedInput, action: { action: 'all' } },
				notes: [...ENVELOPE_NOTES, ...DECLARATION_NOTES],
				noticeDismissal: 'present',
				read: false,
			},
			{
				after: grants.after,
				description: `A valid envelope with one field this build does not recognise: \`${UNRECOGNISED_ENVELOPE_FIELD}\`. Reading it partly would restore the grant inside it, so the whole envelope is dropped, nothing is applied, and the answer is identical to a fresh install.`,
				id: 'native-envelope-unknown-field',
				input: {
					...grantedInput(),
					defect: {
						addField: UNRECOGNISED_ENVELOPE_FIELD,
						kind: 'unknown-field',
						value: true,
					},
				},
				noticeDismissal: 'empty',
				read: true,
			},
			{
				after: grants.after,
				description:
					'A valid envelope with everything from the last comma onwards missing, the way an interrupted write leaves it. These bytes are a prefix of a real grant, which is precisely why a reader that repairs what it can parse is the wrong reader.',
				id: 'native-envelope-truncated-write',
				input: { ...grantedInput(), defect: { kind: 'truncate' } },
				noticeDismissal: 'empty',
				read: true,
			},
			{
				after: grants.after,
				description:
					'A valid envelope whose snapshot has been rewritten into the shape the first draft of packages/native-protocol/CONTRACT.md described: overrides.test, a boolean privacySignals.gpc, and privacySignals.msa. Those names model nothing this build has, so the grant sitting next to them is not evidence.',
				id: 'native-envelope-pre-correction-shape',
				input: { ...grantedInput(), defect: { kind: 'pre-correction' } },
				noticeDismissal: 'empty',
				read: true,
			},
			{
				after: grants.after,
				description:
					'The web v3 consent-record envelope written into native protected storage. It is a real Inth format and not this one, so a native core that read it would be granting consent out of a codec it has never written and cannot re-derive.',
				id: 'native-envelope-foreign-wire',
				input: {
					...grantedInput(),
					defect: {
						envelope: foreignWire,
						kind: 'foreign-wire',
						source: 'the web SDK consent-record envelope (v3 record format)',
					},
				},
				noticeDismissal: 'empty',
				read: true,
			},
		];

		return cases.map((testCase) => ({
			description: testCase.description,
			expected: {
				...(testCase.read
					? {
							read: {
								decoded: false as const,
								identicalToFreshInstall: true as const,
								stored: false as const,
							},
						}
					: {
							snapshot: toFixtureSnapshot(
								testCase.after,
								readyFor(testCase.input)
							),
							write: {
								decoded: 'itself' as const,
								storedSnapshotMatchesLive: true as const,
							},
						}),
				relaunch: {
					decision: testCase.read
						? {
								allowed: { ...OFFLINE_DENY_ALL },
								policyPending: true,
								ready: false,
							}
						: {
								allowed: { ...testCase.after.effectivePermissions },
								policyPending: false,
								ready: true,
							},
					offline: true as const,
				},
			},
			fields: envelopeFieldsFor(testCase.noticeDismissal),
			id: testCase.id,
			input: testCase.input,
			kind: 'native-envelope',
			notes: [...(testCase.notes ?? ENVELOPE_NOTES)],
			protocolVersion: PROTOCOL_VERSION,
			reference: ENVELOPE_REFERENCE,
		}));
	};

// -- Guards -----------------------------------------------------------------

const TRACE_NOTES = [
	...NOTES,
	'the trace starts after bootstrap has settled: hydration and bootstrap are mutations in some cores and not in others, so the anchor is the settled snapshot and the absolute revision a core reports is its own business. What every core must reproduce is what each step costs.',
	'revisionDelta is the change in snapshot.revision across the step, and publications counts the snapshot listeners it woke. A committed change bumps the revision exactly once and publishes exactly once; a write that changes the committed value nowhere bumps nothing and publishes nothing. See "Revisions and error writes" in packages/native-protocol/CONTRACT.md.',
	'two of these steps are the same answer twice on purpose. Re-serving an init that changed nothing, and re-reporting an error the snapshot already carries, are not new changes: a bridge that dedups by revision has to be able to treat them as noise.',
	'the unreadable-policy steps serve the ordinary Europe body with a policy resolution status no wire defines. Contract rule 5 applies: the core serves policyPending with every optional category denied.',
	'expected.trace is not about which fields the error write touches. Swift, Kotlin, and the kernel write different fields for an unreadable policy; what they must not disagree about is whether the write was a change at all.',
];

/**
 * Build the revision trace for a backend that refuses to be understood.
 *
 * The sequence is the one a misconfigured app actually walks into: it starts with
 * a working backend, a save lands, the producer is then upgraded past what the
 * shipped binary speaks, and every later init is refused. Whether the error write
 * is a revision-bearing change decides whether JavaScript hears about it at all,
 * because the bridge pump drops a `snapshot` event whose revision it has already
 * announced.
 */
const buildRevisionTraceFixtures =
	async function buildRevisionTraceFixtures(): Promise<RevisionTraceFixture[]> {
		const scenario = EU_SCENARIO;
		const resolved = transportFor(initBodyFor(scenario));
		const unreadable = unreadablePolicyTransportFor(initBodyFor(scenario));
		const input: RevisionTraceFixture['input'] = {
			...inputFor(scenario),
			steps: [
				{
					intent: { action: 'all' },
					op: 'save',
					step: 'save-all',
				},
				{ op: 'init', step: 'init-resolved-again', transport: resolved },
				{
					op: 'init',
					step: 'init-unreadable-policy',
					transport: unreadable,
				},
				{
					op: 'init',
					step: 'init-unreadable-policy-again',
					transport: unreadable,
				},
			],
			transport: resolved,
		};
		return [
			{
				description:
					'A commit, a re-served init, and a policy resolution the SDK cannot read, twice. The commit and the unreadable policy each cost one revision and one publication; the init that changed nothing and the repeated error cost nothing.',
				expected: { trace: await runTraceFixture(input) },
				id: 'revision-trace-error-writes',
				input,
				kind: 'revision-trace',
				notes: TRACE_NOTES,
				protocolVersion: PROTOCOL_VERSION,
			},
		];
	};

/**
 * The snapshot a wiped device is left holding, before the init it re-ran answers.
 *
 * Written down rather than run, for the reason the file header gives: every kernel
 * harness in this script serves a transport answer, so no run of it ends with a device
 * that has dropped its policy claim and not yet acquired a new one. The values are the
 * table in "Wiping consent (reset)" in `packages/native-protocol/CONTRACT.md`, and they are the same ones
 * a core installs on a first launch that has not heard from the network.
 *
 * `revision` is absent rather than pinned. A wipe is a committed mutation, so the number
 * it publishes is the one the device was on plus one, which no absolute can state; the
 * delta below pins the half that is stateable.
 */
/**
 * The list a pending device lists.
 *
 * A wipe (or a first launch) leaves the core without a policy, and the pending
 * evaluator runs the safe fallback rule over every optional category, so the
 * subject-facing list is `necessary` plus all four in canonical sorted order.
 * Same rule as `fixtureDecisionCategories`, with the fallback scope behind it.
 */
const FULL_DECIDED_CATEGORIES: readonly AllConsentNames[] = [
	'necessary',
	'experience',
	'functionality',
	'marketing',
	'measurement',
];

const RESET_BASELINE: Omit<
	FixtureSnapshot,
	| 'consentCategories'
	| 'effectivePermissions'
	| 'overrides'
	| 'privacySignals'
	| 'revision'
	| 'subject'
> = {
	activeUI: 'none',
	error: null,
	evaluatedAt: NOW,
	explicitChoice: null,
	gppString: null,
	iab: null,
	location: null,
	model: 'opt-in',
	nextDeadline: null,
	optOut: null,
	policyPending: true,
	policySnapshotToken: null,
	promptRequirement: { kind: 'none' },
	ready: false,
	resolution: {
		fingerprint: null,
		policyId: null,
		status: 'unconfigured',
	},
	restrictions: {},
	translations: null,
};

const RESET_NOTES = [
	...NOTES,
	'a wipe is judged against one yardstick: the state a device that has never been used boots into. expected.baseline is that state, and every field of it is either installed by the wipe or kept by it, never carried over from whatever the device was doing.',
	'installed: policyPending true, ready false, promptRequirement none, activeUI none, effectivePermissions necessary-only, evaluatedAt equal to input.now, and no explicitChoice, notice dismissal, optOut, policy claim, resolution, snapshot token, location, translations, deadline, or error. A device that stops at a recorded denial instead would keep promptRequirement at none and no surface would ever come back, which is the one state a subject cannot get out of.',
	'kept: the subject id, because packages/native-protocol/CONTRACT.md refuses to orphan the audit history the backend holds against it; overrides and privacySignals, because a country pinned for QA and a GPC switch are configuration rather than consent; and the configured category scope, which a wipe recomputes from configuration rather than consent. No fixture configures a narrower scope, so the baseline lists `necessary` plus every optional category: the rows the safe fallback rule covers until a policy resolves.',
	'revision is not pinned. A wipe is a committed mutation, so it publishes the revision the device was on plus one, and packages/native-protocol/CONTRACT.md refuses to compare the absolute numbering the three implementations start from. A core that restarts the numbering at the cold-start baseline fails anyway, because the revision it announces goes backwards.',
	'revisionDelta is the one revision claim this kind can make. A wipe is a committed mutation, so it publishes current + 1, and a core that installs the baseline silently or restarts the numbering fails here.',
	'baseline.disk is read at the baseline publication, before the init the wipe schedules has had a chance to write. That is the only moment the deletion is observable: the re-run init caches the policy it resolves, exactly as a first launch init does, so an envelope existing later is not by itself a failure. What must never exist again is the bytes the wipe started from.',
	'baseline.snapshot.effectivePermissions is the deny-everything-optional reading, spelled the same way OFFLINE_DENY_ALL spells it. It is the half a recorded denial shares with a wipe, which is why nothing here stops at it: promptRequirement is the field that tells the two apart.',
	'expected.afterInit is kernel output: the same /init served to a device with the same pinned identity, the same overrides, and no stored records at all. The wiped device has to settle on the same answer field for field, which is what makes the re-run init part of the wipe rather than something the caller is asked to remember.',
	'the two fixtures of this kind carry different input.intent and identical expected halves. A device that had accepted everything and a device that had refused everything have to be indistinguishable after both wipe, or the wipe left a trace of what it deleted.',
];

/** Serialize with object keys sorted, so a comparison does not depend on order. */
const stableStringify = function stableStringify(value: unknown): string {
	return JSON.stringify(value, (_key, item: unknown) => {
		if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
			const source = item as Record<string, unknown>;
			const sorted: Record<string, unknown> = {};
			for (const name of Object.keys(source).sort()) {
				sorted[name] = source[name];
			}
			return sorted;
		}
		return item;
	});
};

/**
 * Build the pair that pins what a wipe leaves behind.
 *
 * The device starts as one a native runner can actually reach: it bootstraps over a
 * stored subject, resolves the Europe opt-in rule, and takes `intent` through the real
 * save command, so the receipt the wipe has to delete is a receipt the core wrote. Then
 * it wipes, and the two expectations are read off the kernel -- one by running a device
 * that never decided, one from the contract's own baseline table.
 */
const buildResetConsentFixtures =
	async function buildResetConsentFixtures(): Promise<ResetConsentFixture[]> {
		const decided = await runFixture(inputFor(EU_SCENARIO), {
			intent: { action: 'all' },
		});

		// A device that has decided, in the shape a runner seeds its storage with.
		const wipedInput = (
			intent: CommitIntent
		): ResetConsentFixture['input'] => ({
			...inputFor(EU_SCENARIO, {
				records: storedFor(SUBJECT.europe, {
					choice: decided.after.explicitChoice ?? null,
				}),
			}),
			intent,
		});

		// The same device with nothing it ever decided, which is the comparison the
		// contract offers: not a denial, a device that has not been asked yet.
		const freshInput = inputFor(EU_SCENARIO, {
			hydrated: false,
			records: storedFor(SUBJECT.europe),
		});
		const fresh = await runFixture(freshInput);
		const settled = toFixtureSnapshot(fresh.after, readyFor(freshInput));
		const { revision: _revision, ...afterInit } = settled;

		const cases: {
			id: string;
			description: string;
			intent: CommitIntent;
		}[] = [
			{
				description:
					'A device that accepted every category in scope under the Europe opt-in rule, then wiped. The receipt is gone, the choice prompt is owed again, and the device settles on what a device that was never asked settles on.',
				id: 'reset-consent-opt-in-grants',
				intent: { action: 'all' },
			},
			{
				description:
					'The same Europe rule on a device that recorded a deny-everything choice, then wiped. Its expectation is identical to the accept-all wipe above, field for field, which is the point: a wipe that leaves a recorded denial behind would still differ here, and the subject could never get out of it.',
				id: 'reset-consent-recorded-denial',
				intent: { action: 'necessary' },
			},
		];

		const fixtures = cases.map((testCase) => {
			const input = wipedInput(testCase.intent);
			return {
				description: testCase.description,
				expected: {
					afterInit: { snapshot: structuredClone(afterInit) },
					baseline: {
						disk: { envelope: false, pendingSaves: false, subject: true },
						revisionDelta: 1,
						snapshot: {
							...structuredClone(RESET_BASELINE),
							consentCategories: [...FULL_DECIDED_CATEGORIES],
							effectivePermissions: { ...OFFLINE_DENY_ALL },
							overrides: fixtureOverrides(input.overrides),
							privacySignals: fixturePrivacySignals({
								gpc: {
									active:
										input.privacySignals.gpc.override ??
										input.privacySignals.gpc.detected ??
										false,
									detected: input.privacySignals.gpc.detected ?? false,
									override: input.privacySignals.gpc.override ?? null,
								},
							}),
							subject: { subjectId: SUBJECT.europe },
						},
					},
				},
				id: testCase.id,
				input,
				kind: 'reset-consent' as const,
				notes: RESET_NOTES,
				protocolVersion: PROTOCOL_VERSION,
			} satisfies ResetConsentFixture;
		});

		// The pair claim is the whole reason there are two of these. Asserted here rather
		// than left to the prose, so the day one fixture starts expecting something the
		// other does not, the generator says so instead of two cores agreeing on a
		// difference nobody chose.
		const [first, second] = fixtures as [
			ResetConsentFixture,
			ResetConsentFixture,
		];
		if (stableStringify(first.expected) !== stableStringify(second.expected)) {
			throw new Error(
				'reset-consent fixtures disagree about what a wipe leaves behind. A wipe that records which decision it deleted is not a wipe.'
			);
		}
		return fixtures;
	};

/** Name of the index a native runner enumerates. */
const INDEX_FILE = 'index.json';

/**
 * Refuse to write a fixture whose protocolVersion is not the one this package
 * speaks.
 *
 * A fixture written against a protocol the installed code no longer reads is
 * worse than no fixture: two native cores would faithfully implement a wire the
 * JavaScript layer rejects, and the conformance suite would green-light it.
 *
 * Three ways that happens, all refused here:
 *
 * 1. A builder stamps something other than `PROTOCOL_VERSION`. Every builder takes
 *    it from the same import today, so this is the guard rail that keeps it that
 *    way when someone adds a per-fixture or hard-coded version.
 * 2. The version this run states is outside the range the installed package
 *    accepts, which is what happens when `PROTOCOL_VERSION` moves and
 *    `MAX_SUPPORTED_PROTOCOL_VERSION` does not follow.
 * 3. The fixtures already on disk were written for a different protocol. That is
 *    the accident that actually occurs: `PROTOCOL_VERSION` changes in a commit,
 *    nobody regenerates, and Swift and Kotlin keep passing against expectations
 *    derived under the old handshake. Re-stamping is not automatic, because a
 *    silent relabel would present old expectations as new. Pass
 *    `--allow-protocol-change` once the protocol really has moved.
 */
const assertProtocolVersions = function assertProtocolVersions(
	fixtures: readonly Fixture[],
	outDir: string,
	allowProtocolChange: boolean
): void {
	const offenders = fixtures.filter(
		(fixture) => fixture.protocolVersion !== PROTOCOL_VERSION
	);
	if (offenders.length > 0) {
		const listed = offenders
			.map(
				(fixture) =>
					`${fixture.id}=${String(fixture.protocolVersion)}/${String(PROTOCOL_VERSION)}`
			)
			.join(', ');
		throw new Error(
			`Fixture protocolVersion does not match PROTOCOL_VERSION (${String(PROTOCOL_VERSION)}): ${listed}. Regenerate against the current protocol instead of shipping the stale version.`
		);
	}
	if (!isProtocolVersionSupported(PROTOCOL_VERSION)) {
		throw new Error(
			`PROTOCOL_VERSION (${String(PROTOCOL_VERSION)}) is outside the range @inth/react-native supports, so no native core could accept a fixture built against it. Widen the supported range in src/protocol/version.ts first.`
		);
	}

	const indexPath = resolve(outDir, INDEX_FILE);
	if (!existsSync(indexPath) || allowProtocolChange) {
		return;
	}
	const previous = JSON.parse(
		readFileSync(indexPath, 'utf8')
	) as Partial<IndexEntry> & { protocolVersion?: number };
	if (
		typeof previous.protocolVersion === 'number' &&
		previous.protocolVersion !== PROTOCOL_VERSION
	) {
		throw new Error(
			`packages/native-protocol/${INDEX_FILE} was written for protocol ${String(previous.protocolVersion)}, and this package speaks ${String(PROTOCOL_VERSION)}. Every expectation has to be re-derived before the fixtures can be relabelled, so a native core does not pass against expectations from the old handshake. Rerun with --allow-protocol-change if the protocol really moved.`
		);
	}
};

/** Drop the contract version a wire carries but a resolution does not repeat. */
const withoutVersion = function withoutVersion(
	wire: PolicyResolutionWire
): Record<string, unknown> {
	const { version: _version, ...rest } = wire;
	return rest;
};

/**
 * Every `/init` response a fixture serves.
 *
 * A single-step fixture serves one. A revision trace serves one per step, plus the
 * bootstrap response the sequence starts from.
 */
const transportsIn = function transportsIn(fixture: Fixture): InitTransport[] {
	// A tc-string fixture carries a TC Model and a vendor list and no transport: the
	// reference encoder is the whole pipeline, and no /init response reaches it. A
	// vendor-list-scope fixture is that shape of case from the other end -- a served GVL and a
	// scope in, the web filter's return value out -- so there is no response here to prove
	// readable either. Both kinds are exempt because they have no transport, not because the
	// check is optional.
	if (fixture.kind === 'tc-string' || fixture.kind === 'vendor-list-scope') {
		return [];
	}
	const { input } = fixture;
	if (!('steps' in input)) {
		return [input.transport];
	}
	return [
		input.transport,
		...input.steps.flatMap((step) =>
			step.op === 'init' ? [step.transport] : []
		),
	];
};

/**
 * Prove that every init body this run produced is a wire a client takes.
 *
 * The bodies are built from the producer-side resolver, but a native core reads
 * them with a strict client reader. If the two ever disagree, the generator fails
 * here rather than handing both cores a fixture neither can consume.
 */
const assertWiresReadable = function assertWiresReadable(
	fixtures: readonly Fixture[]
): void {
	const contractVersion = Number(CONTRACT_HEADER_VALUE);
	const seen = new Set<string>();
	for (const fixture of fixtures) {
		for (const transport of transportsIn(fixture)) {
			const { policyResolution } = transport.body;
			// The revision trace serves one resolution no client can read, on purpose:
			// it is the rule-5 step. Asking a client reader to consume it would assert
			// the opposite of the contract.
			if (
				(policyResolution as { status: string }).status ===
				UNREADABLE_POLICY_STATUS
			) {
				continue;
			}
			if (policyResolution.version !== contractVersion) {
				throw new Error(
					`${fixture.id}: the init body declares policy contract ${String(policyResolution.version)}, but this build reads ${CONTRACT_HEADER_VALUE}.`
				);
			}
			const wire = stableStringify(policyResolution);
			if (seen.has(wire)) {
				continue;
			}
			seen.add(wire);
			// The strict reader is the same one `applyInitResponse` runs on a live
			// response. Anything it refuses or rewrites makes the fixture a wire no
			// client can actually consume. The wire carries the contract version and a
			// resolution does not repeat it, so the version is dropped before comparing.
			const read = readPolicyResolutionWire(policyResolution);
			if (
				stableStringify(read) !==
				stableStringify(withoutVersion(policyResolution))
			) {
				throw new Error(
					`${fixture.id}: the strict client reader does not reproduce the resolution the producer served. The fixture body is not a wire a client can consume.`
				);
			}
		}
	}
};

// -- Writer -----------------------------------------------------------------

interface IndexEntry {
	bytes: number;
	file: string;
	id: string;
	kind: string;
	protocolVersion: number;
	sha256: string;
}

/**
 * Refuse a fixture whose hydration claim its own storage contradicts.
 *
 * `ready` is derived from `input.hydrated`, so that field is a claim the runner has to
 * honour rather than a description of what happened. Two ways it can lie: a fixture
 * that says `hydrate()` found an envelope while protected storage holds nothing latches
 * `ready` on a fact no device backs, which is the mirror of the bug the derivation
 * exists to keep visible; and a fixture that says nothing was found while it stores a
 * choice or a dismissal describes a record with no envelope to live in.
 *
 * A pinned subject id is neither. Identity has its own slot, and `packages/native-protocol/CONTRACT.md`
 * keeps an envelope refusal from costing a device its identity, which is exactly what
 * lets a first launch carry an id and still hydrate into nothing.
 */
const assertHydrationClaims = function assertHydrationClaims(
	fixtures: readonly Fixture[]
): void {
	for (const fixture of fixtures) {
		// The tc-string kind has no hydration to claim: nothing is stored and nothing is
		// read back off a device, so ready is not a fact this vector describes. The
		// vendor-list-scope kind is in the same position for the same reason -- its input is a
		// document and a scope, with no stored record and no subject anywhere -- and `ready`
		// would be read off a fixture that has no such field to read.
		if (fixture.kind === 'tc-string' || fixture.kind === 'vendor-list-scope') {
			continue;
		}
		const { hydrated, storedRecords } = fixture.input;
		const recordsInsideEnvelope =
			storedRecords.choice !== null ||
			storedRecords.noticeDismissal !== null ||
			storedRecords.optOut !== null;
		if (!hydrated && recordsInsideEnvelope) {
			throw new Error(
				`${fixture.id}: input.hydrated is false but storedRecords carries a choice, a dismissal, or an opt-out, which only exists inside a stored envelope.`
			);
		}
		if (hydrated && !recordsInsideEnvelope && storedRecords.subject === null) {
			throw new Error(
				`${fixture.id}: input.hydrated is true but protected storage holds nothing, so hydrate() had no envelope to latch ready with. Say "hydrated": false and let the init response carry the flag.`
			);
		}
	}
};

const sha256Of = function sha256Of(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
};

/**
 * Write `index.json` from the bytes on disk.
 *
 * The hashes are taken after formatting, so they describe the file a runner
 * actually opens. A runner that reads a fixture whose bytes do not match its
 * index entry knows the checkout is stale, and says so instead of failing an
 * assertion.
 */
const writeIndex = function writeIndex(
	outDir: string,
	fixtures: readonly Fixture[]
): IndexEntry[] {
	const entries: IndexEntry[] = fixtures.map((fixture) => {
		const file = `${fixture.id}.json`;
		const bytes = readFileSync(resolve(outDir, file));
		return {
			bytes: bytes.byteLength,
			file,
			id: fixture.id,
			kind: fixture.kind,
			protocolVersion: fixture.protocolVersion,
			sha256: sha256Of(bytes),
		};
	});
	const index = {
		clock: NOW,
		count: entries.length,
		fixtures: entries,
		generatedBy: 'packages/react-native/scripts/generate-protocol-fixtures.ts',
		kinds: [...new Set(entries.map((entry) => entry.kind))].sort(),
		protocolVersion: PROTOCOL_VERSION,
	};
	writeFileSync(
		resolve(outDir, INDEX_FILE),
		`${JSON.stringify(index, null, '\t')}\n`,
		'utf8'
	);
	return entries;
};

/**
 * The cases `subject-id/uuidv7.json` pins: mint vectors, then the read rule.
 *
 * Every platform mints the `vectors` and gets the same `id`, and answers `read`
 * the same way: `uuidv7` is an ID this build writes, `c15t` is a `sub_` ID a c15t
 * client stored, which a core keeps and sends until the backend returns the
 * canonical UUID, and `unusable` is anything else, including the UUIDv4 shape an
 * early prerelease wrote.
 */
const buildSubjectIdCases = function buildSubjectIdCases() {
	const vectors = [
		{ clock: NOW, randomHex: '00000000000000000000' },
		{ clock: NOW, randomHex: 'ffffffffffffffffffff' },
		{ clock: NOW, randomHex: '0123456789abcdef0123' },
		{ clock: 0, randomHex: '0a0b0c0d0e0f10111213' },
		{ clock: -1, randomHex: '0a0b0c0d0e0f10111213' },
		{ clock: UUID_V7_MAX_MS, randomHex: '5a5a5a5a5a5a5a5a5a5a' },
		{ clock: UUID_V7_MAX_MS + 1, randomHex: '5a5a5a5a5a5a5a5a5a5a' },
		{ clock: 1_763_467_200_000, randomHex: 'c3d2e1f0a5b4c3d2e1f0' },
	].map((vector) => ({
		...vector,
		id: mintUuidV7(vector.randomHex, vector.clock),
	}));
	const read = [
		{ id: SUBJECT.europe, kind: 'uuidv7' },
		{ id: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c', kind: 'uuidv7' },
		{ id: 'sub_1119tDZHoarNxm6kSm3BN6ze9d', kind: 'c15t' },
		{ id: 'sub_2VZxR7YmNpKq3WfLs8TgHd', kind: 'c15t' },
		{ id: '0193E5A8-6F00-7C3A-8A1B-5D2E7F9A0B1C', kind: 'unusable' },
		{ id: '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b', kind: 'unusable' },
		{ id: '0193e5a8-6f00-7c3a-ca1b-5d2e7f9a0b1c', kind: 'unusable' },
		{ id: '00000000-0000-0000-0000-000000000000', kind: 'unusable' },
		{ id: 'ffffffff-ffff-ffff-ffff-ffffffffffff', kind: 'unusable' },
		{ id: '0193e5a86f007c3a8a1b5d2e7f9a0b1c', kind: 'unusable' },
		// An Arabic-Indic zero where a hex digit belongs: only ASCII hex is a UUID.
		{ id: '\u0660193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c', kind: 'unusable' },
		{ id: 'sub_0OIl', kind: 'unusable' },
		{ id: 'sub_', kind: 'unusable' },
		{ id: '', kind: 'unusable' },
	];
	const kindOf = function kindOf(id: string): string {
		if (isUuidV7(id)) {
			return 'uuidv7';
		}
		return isValidSubjectId(id) ? 'c15t' : 'unusable';
	};
	for (const entry of read) {
		const kind = kindOf(entry.id);
		if (kind !== entry.kind) {
			throw new Error(`${entry.id} reads as ${kind}, not ${entry.kind}`);
		}
	}
	return {
		description:
			'Subject IDs. vectors: mint a UUIDv7 from clock (milliseconds since the Unix epoch, clamped to 0 and 2^48 - 1) and ten random bytes, and get id. read: how a core treats a stored ID. uuidv7 is the form this SDK writes; c15t is a sub_ ID a c15t client stored, which the core keeps and sends until a response carries the canonical subjectId; unusable is anything else, read as no identity at all.',
		layout: [
			'bytes 0-5: clock, big-endian',
			'byte 6: 0x70 | (random[0] & 0x0f)',
			'byte 7: random[1]',
			'byte 8: 0x80 | (random[2] & 0x3f)',
			'bytes 9-15: random[3..9]',
			'text: lowercase hex, 8-4-4-4-12',
		],
		read,
		vectors,
	};
};

/**
 * Refuse a fixture that carries a subject id other than a minted lowercase UUIDv7.
 *
 * A save-body fixture pins a `POST /v1/consent/records` request, and both native cores
 * are graded against it, so every id in it has to be one a core could have minted.
 * Walked over every `subjectId` in every emitted fixture rather than over the `SUBJECT`
 * table alone, because an id can reach a fixture from a scenario, a stored record, or a
 * kernel response, and only the emitted bytes are what a native runner reads.
 */
const assertSubjectIdsAreProducible = function assertSubjectIdsAreProducible(
	fixtures: readonly Fixture[]
): void {
	for (const [name, mint] of Object.entries(SUBJECT_MINTS)) {
		const pinned = SUBJECT[name as keyof typeof SUBJECT];
		const minted = mintUuidV7(mint.randomHex, mint.clock);
		if (pinned !== minted) {
			throw new Error(
				`SUBJECT.${name} is ${pinned}, but minting at clock ${String(mint.clock)} with entropy ${mint.randomHex} writes ${minted}. Mint fixture ids, do not invent them.`
			);
		}
	}

	const offenders = new Set<string>();
	const walk = function walk(value: unknown, where: string): void {
		if (Array.isArray(value)) {
			value.forEach((item, index) => walk(item, `${where}[${String(index)}]`));
			return;
		}
		if (value === null || typeof value !== 'object') {
			return;
		}
		for (const [key, item] of Object.entries(
			value as Record<string, unknown>
		)) {
			if (key === 'subjectId' && typeof item === 'string') {
				if (!isUuidV7(item)) {
					offenders.add(`${where}.subjectId=${item}`);
				}
				continue;
			}
			walk(item, `${where}.${key}`);
		}
	};
	for (const fixture of fixtures) {
		walk(fixture, fixture.id);
	}
	if (offenders.size > 0) {
		throw new Error(
			`Fixtures carry subject ids that are not lowercase UUIDv7: ${[...offenders].sort().join(', ')}. Mint them with mintUuidV7 at the pinned clock, as the SUBJECT table does.`
		);
	}
};

/** Refuse a fixture file the current run no longer produces. */
const assertNoStaleFixtures = function assertNoStaleFixtures(
	outDir: string,
	entries: readonly IndexEntry[]
): void {
	const expected = new Set<string>([
		...entries.map((entry) => entry.file),
		INDEX_FILE,
	]);
	const stale = readdirSync(outDir)
		.filter((name) => name.endsWith('.json') && !expected.has(name))
		.sort();
	if (stale.length > 0) {
		throw new Error(
			`packages/native-protocol holds fixtures no longer generated: ${stale.join(', ')}. Delete them so no runner reads a fixture the index has forgotten.`
		);
	}
};

const formatWith = function formatWith(paths: string[], cwd: string): void {
	// `cwd` is the repository root, whose own formatter config ignores SDK files.
	const sdkFormatArgs = [
		'-c',
		resolve(cwd, 'oxfmt.sdk.config.ts'),
		'--ignore-path',
		resolve(cwd, '.gitignore'),
	];
	const format = spawnSync('bunx', ['oxfmt', ...sdkFormatArgs, ...paths], {
		cwd,
		stdio: 'ignore',
	});
	if (format.status !== 0) {
		throw new Error(`Oxfmt failed on: ${paths.join(', ')}`);
	}
};

export const writeFixtures = async function writeFixtures(
	outDir?: string
): Promise<void> {
	const here = dirname(fileURLToPath(import.meta.url));
	const repoRoot = resolve(here, '..', '..', '..');
	const target = outDir ?? resolve(repoRoot, 'packages', 'native-protocol');
	mkdirSync(target, { recursive: true });
	// Kernel commands read Date.now() directly, so the whole generation runs against
	// a pinned clock. Without this a notice dismissal recorded by the real command
	// carries the wall-clock time and fails validation against NOW.
	const realDateNow = Date.now;
	Date.now = () => NOW;
	let fixtures: Fixture[];
	try {
		fixtures = [
			...(await buildEvaluationFixtures()),
			...(await buildSaveBodyFixtures()),
			...(await buildNativeEnvelopeFixtures()),
			...(await buildResetConsentFixtures()),
		];
		// Last, because the trace drives the same kernel through a sequence and a
		// half-finished save from here would land inside the next generation pass.
		fixtures.push(...(await buildRevisionTraceFixtures()));
		// The reference encoder reads no clock either -- every timestamp is handed to it
		// -- but it sits in this process, so it inherits the pin rather than argument for it.
		fixtures.push(...buildTcStringFixtures(NOW, PROTOCOL_VERSION));
		// The vendor-list-scope kind reads no clock and no kernel either: its oracle is the web
		// filter, called on a document this file builds. It goes last among the derived kinds so
		// a refusal from it cannot land inside the run of any other kind.
		fixtures.push(...buildVendorListScopeFixtures(PROTOCOL_VERSION));
	} finally {
		Date.now = realDateNow;
	}
	assertProtocolVersions(
		fixtures,
		target,
		process.argv.includes('--allow-protocol-change')
	);
	assertWiresReadable(fixtures);
	assertHydrationClaims(fixtures);
	assertSubjectIdsAreProducible(fixtures);
	for (const fixture of fixtures) {
		writeFileSync(
			resolve(target, `${fixture.id}.json`),
			`${JSON.stringify(fixture, null, '\t')}\n`,
			'utf8'
		);
	}
	// Format before hashing, so the index describes the bytes a runner opens. Oxfmt
	// collapses short arrays and switches indentation to tabs, so writing without
	// this step would leave every regenerated fixture dirty for autofix.ci to fix.
	formatWith([target], repoRoot);
	const entries = writeIndex(target, fixtures);
	// The index is written after the directory pass, so format it on its own. Its
	// output is a fixed point, which is what keeps two runs byte-identical.
	formatWith([resolve(target, INDEX_FILE)], repoRoot);
	for (const entry of entries) {
		const bytes = readFileSync(resolve(target, entry.file));
		if (sha256Of(bytes) !== entry.sha256) {
			throw new Error(
				`${entry.file} changed after the index was written. The generator is not byte-stable.`
			);
		}
		// Read the version back rather than trusting the value handed to the writer,
		// so a file that survived from an earlier protocol cannot hide in the set.
		const written = JSON.parse(bytes.toString('utf8')) as {
			protocolVersion?: number;
		};
		if (written.protocolVersion !== PROTOCOL_VERSION) {
			throw new Error(
				`${entry.file} carries protocolVersion ${String(written.protocolVersion)} on disk, not ${String(PROTOCOL_VERSION)}.`
			);
		}
	}
	assertNoStaleFixtures(target, entries);
	const subjectIdDir = resolve(target, 'subject-id');
	mkdirSync(subjectIdDir, { recursive: true });
	const subjectIdFile = resolve(subjectIdDir, 'uuidv7.json');
	writeFileSync(
		subjectIdFile,
		`${JSON.stringify(buildSubjectIdCases(), null, '\t')}\n`,
		'utf8'
	);
	formatWith([subjectIdFile], repoRoot);
	console.log(
		`Wrote ${String(fixtures.length)} fixtures and ${INDEX_FILE} to ${target}`
	);
	for (const fixture of fixtures) {
		console.log(`  ${fixture.kind.padEnd(11)} ${fixture.id}.json`);
	}
};

/**
 * Whether this file is the process entry point, compared by realpath.
 *
 * Same trap `android/codegen/generate-spec.mjs` documents: Node resolves a symlink when
 * it works out `import.meta.url` and a build is free to name this script through a link,
 * so a by-the-book comparison is false exactly where the generator has to run, and the
 * CLI would exit 0 having written nothing. Everything below the guard is exported, so a
 * test can generate into a temp directory and prove two runs agree byte for byte.
 */
const invokedAsProgram = function invokedAsProgram(): boolean {
	// argv[1] is the script; argv[0] is the interpreter. Destructuring to the
	// first element silently disables this guard, and the CLI then exits 0
	// having written nothing.
	const [, entry] = process.argv;
	if (entry === undefined) {
		return false;
	}
	try {
		return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
	} catch {
		return false;
	}
};

if (invokedAsProgram()) {
	await writeFixtures();
}
