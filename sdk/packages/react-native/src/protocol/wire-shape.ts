/**
 * The snapshot's wire shape, checked by key name rather than by cast.
 *
 * `ConsentSnapshot` is the shape on the wire, but the bridge hands JavaScript a
 * JSON string, so TypeScript cannot see a renamed key: the declared type says
 * `subject.subjectId`, a core sends `subject.id`, and every app on that platform
 * reads `undefined` with nothing failing anywhere. Four keys drifted that way once,
 * behind a fixture runner that tolerated them, and the only visible symptom was a
 * consent screen printing an empty subject.
 *
 * The kernel owns the spelling of five objects on the snapshot. Here that spelling
 * is written down once so the protocol fixtures generated from the TypeScript kernel
 * can be checked against it, and so a native core that renames a key is a failing
 * assertion rather than an undefined read in someone's app.
 *
 * The check stops at the top of the vendor list inside `iab`. That document belongs
 * to the IAB framework, and any of its fields may be absent on every platform, so
 * a key name inside one of its records is a question for `gvl.ts`, which the vendor
 * list tests compare against all four places it is written.
 *
 * @packageDocumentation
 */

/** Keys the kernel uses inside an object it owns, with which of them must appear. */
interface KernelOwnedKeys {
	/** The snapshot field holding the object. */
	readonly path: string;
	/** Keys that must be present whenever the object is. */
	readonly required: readonly string[];
	/** Keys allowed but not required. Anything else is drift. */
	readonly optional: readonly string[];
}

/**
 * Every key `ConsentSnapshot` declares.
 *
 * `iab` belongs on the list whether it holds a vendor list or `null`: a payload that
 * drops the key is a wire change either way, and `native/CONTRACT.md` asks for a
 * serialised `null` rather than an absent key where there is no state.
 */
export const SNAPSHOT_KEYS = [
	'revision',
	'policyPending',
	'ready',
	'model',
	'activeUI',
	'promptRequirement',
	'effectivePermissions',
	'explicitChoice',
	'consentCategories',
	'restrictions',
	'resolution',
	'policySnapshotToken',
	'subject',
	'location',
	'overrides',
	'privacySignals',
	'translations',
	'nextDeadline',
	'evaluatedAt',
	'error',
	'iab',
	'gppString',
] as const;

/**
 * Keys a native bridge adds to the kernel's snapshot wire.
 *
 * They are native bookkeeping rather than kernel state, so `@c15t/core` has no such
 * field and the protocol fixtures, which {@link SNAPSHOT_KEYS} is checked against, do
 * not carry them. `promptOwedSince` is the revision at which the prompt owed now
 * became owed, which the auto-present ledger uses to tell a new owed prompt from one
 * it already presented when the bridge delivered only the latest snapshot.
 */
export const BRIDGE_SNAPSHOT_KEYS = [
	'promptOwedSince',
	'iabMarketingPurposes',
] as const;

/**
 * Snapshot keys added after protocol version 1 shipped, with the value an older native
 * build means by leaving the key out.
 *
 * A JavaScript-only update (Expo Updates, CodePush) can run this package over a binary
 * built before a key existed, and the protocol version does not move for an additive
 * key. Such a binary simply has none of the state the key describes, so the client
 * fills the default before anything reads the snapshot or grades its shape: the public
 * type keeps its promise, and an older binary is not reported as drift. Every key
 * added to {@link SNAPSHOT_KEYS} or {@link BRIDGE_SNAPSHOT_KEYS} from here on belongs in
 * this table, with the default that means "this build has no such state". A key whose
 * absence cannot be answered that way needs a protocol version instead.
 *
 * `gppString: null` means the build writes no GPP string, which is also what a build
 * with GPP off reports. `iabMarketingPurposes: null` means no TC String answer is
 * known, so the ATT sequence does not ask under an IAB policy. `promptOwedSince: null`
 * means the build names no owed prompt, so auto-present falls back to telling prompts
 * apart by the transitions it observes.
 */
export const ADDITIVE_SNAPSHOT_DEFAULTS = {
	gppString: null,
	iabMarketingPurposes: null,
	promptOwedSince: null,
} as const satisfies Partial<
	Record<
		(typeof SNAPSHOT_KEYS)[number] | (typeof BRIDGE_SNAPSHOT_KEYS)[number],
		unknown
	>
>;

/**
 * Fill every {@link ADDITIVE_SNAPSHOT_DEFAULTS} key the payload leaves out.
 *
 * @param candidate - A parsed snapshot payload.
 * @returns The same object when nothing was missing, else a copy with the defaults.
 */
export const withAdditiveSnapshotDefaults =
	function withAdditiveSnapshotDefaults(
		candidate: Record<string, unknown>
	): Record<string, unknown> {
		const missing = Object.keys(ADDITIVE_SNAPSHOT_DEFAULTS).some(
			(key) => !Object.hasOwn(candidate, key)
		);
		return missing
			? { ...ADDITIVE_SNAPSHOT_DEFAULTS, ...candidate }
			: candidate;
	};

/**
 * Bootstrap keys added after protocol version 1 shipped, with what an older native
 * build means by leaving them out: the same additive rule as the snapshot keys.
 * A binary before `commitRevision` ignores a commit's `revision`, so it cannot be
 * trusted to refuse a draft built on an older snapshot. Every binary before
 * `nativeUI` linked the stock native screens.
 */
export const ADDITIVE_BOOTSTRAP_DEFAULTS = {
	commitRevision: false,
	nativeUI: true,
} as const;

/**
 * Keys the bridge adds inside the snapshot's `iab` object after protocol version 1
 * shipped, with the value an older native build means by leaving them out.
 *
 * The same rule as the top-level additive keys in `native/CONTRACT.md` ("Version
 * handshake"): a JavaScript-only update can run this package over an older binary,
 * and the protocol version does not move for an additive key, so each absence must
 * mean "this build has no such state". An older bridge cannot commit a headless TCF
 * draft, so it is not `editable` and has no `acceptAll`; it publishes no committed
 * decision and names no `headlessUnsupported` configuration either. The client
 * fills these before anything reads the snapshot.
 */
export const ADDITIVE_IAB_DEFAULTS = {
	acceptAll: null,
	committed: null,
	editable: false,
	headlessUnsupported: [],
} as const;

/**
 * Fill every {@link ADDITIVE_IAB_DEFAULTS} key an `iab` object leaves out.
 *
 * @param candidate - A parsed snapshot payload.
 * @returns The same object when nothing was missing, else a copy with the defaults.
 */
export const withAdditiveIABDefaults = function withAdditiveIABDefaults(
	candidate: Record<string, unknown>
): Record<string, unknown> {
	const { iab } = candidate;
	if (typeof iab !== 'object' || iab === null || Array.isArray(iab)) {
		return candidate;
	}
	const missing = Object.keys(ADDITIVE_IAB_DEFAULTS).some(
		(key) => !Object.hasOwn(iab, key)
	);
	return missing
		? { ...candidate, iab: { ...ADDITIVE_IAB_DEFAULTS, ...iab } }
		: candidate;
};

/**
 * The five objects whose key names come from `@c15t/core` and are not a native
 * implementation detail. Names inside a core, and names inside a stored envelope,
 * stay the core's own business.
 *
 * `gvl` is a required key with a nullable value inside `iab`, which is what
 * `KernelIABState` declares in `packages/core/src/types.ts`: Swift encodes it
 * unconditionally and refuses any other name inside the object. Kotlin's
 * `KernelIabState` types the field non-null, so it refuses `{"gvl":null}` where Swift
 * reads an object carrying no list. Neither core publishes those bytes -- both build
 * the object around a list they accepted -- so absence lives on `iab` itself and a
 * reader never has to tell "no list served" from "no answer given". An `iab` of
 * `null` is skipped by the walker, which is what a device that was never served a
 * list sends, and what every generated fixture carries.
 */
export const KERNEL_OWNED_KEYS = [
	{
		optional: ['externalId', 'identityProvider'],
		path: 'subject',
		required: ['subjectId'],
	},
	{
		optional: [],
		path: 'location',
		required: ['countryCode', 'regionCode'],
	},
	{
		optional: ['reason'],
		path: 'promptRequirement',
		required: ['kind'],
	},
	{
		optional: [],
		path: 'explicitChoice',
		required: ['version', 'categories'],
	},
	{
		// The bridge's own additions beside the kernel's `gvl`; see ADDITIVE_IAB_DEFAULTS.
		optional: ['committed', 'editable', 'acceptAll', 'headlessUnsupported'],
		path: 'iab',
		required: ['gvl'],
	},
] as const satisfies readonly KernelOwnedKeys[];

/**
 * How strictly to read a payload against the declared shape.
 */
export interface WireDriftOptions {
	/**
	 * Accept keys the declared types do not name.
	 *
	 * `native/CONTRACT.md` lets a native build send a field the JavaScript side has
	 * not caught up with, so a payload from a newer core is not drift, and a warning
	 * about it would be a false alarm on every app that upgraded its native half. The
	 * keys a kernel owns are still checked for the ones that must be there, and when
	 * one of those is missing the keys that turned up instead get named. That is what
	 * makes a rename visible: it is invisible in every other way, and it costs a
	 * user's consent state.
	 *
	 * @defaultValue `false`
	 */
	readonly allowUnknownKeys?: boolean;
}

const isRecord = function isRecord(
	value: unknown
): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
};

/**
 * Name every way a parsed bridge payload departs from the declared snapshot shape.
 *
 * Deliberately structural and deliberately non-throwing. A value that fails here is
 * not unusable in every respect, and the caller already has a fail-closed path for
 * payloads it cannot read at all; this exists to say specifically which keys are
 * wrong, because "not a readable snapshot" is not something a core author can act on.
 *
 * @param candidate - The parsed value from `getSnapshot()`, or a fixture's expected snapshot.
 * @param options - Looseness for a payload from a newer native build than this package.
 * @returns One line per problem, in the order the shape was walked, empty when it matches.
 *
 * @example
 * ```ts
 * const problems = describeSnapshotWireDrift(JSON.parse(nativeModule.getSnapshot()));
 *
 * if (problems.length > 0) {
 * 	// Each line names a key, so a core author fixes the bridge rather than the app
 * 	// that read `undefined` from it.
 * 	report(problems);
 * }
 * ```
 */
export const describeSnapshotWireDrift = function describeSnapshotWireDrift(
	candidate: unknown,
	options: WireDriftOptions = {}
): string[] {
	const { allowUnknownKeys = false } = options;
	if (!isRecord(candidate)) {
		return ['the snapshot payload is not a JSON object'];
	}

	const problems: string[] = [];

	for (const key of SNAPSHOT_KEYS) {
		if (!Object.hasOwn(candidate, key)) {
			problems.push(
				`${key}: required by the snapshot type, absent from the payload`
			);
		}
	}

	if (!allowUnknownKeys) {
		for (const key of Object.keys(candidate)) {
			if (!SNAPSHOT_KEYS.includes(key as (typeof SNAPSHOT_KEYS)[number])) {
				problems.push(`${key}: not a key the snapshot type declares`);
			}
		}
	}

	for (const owned of KERNEL_OWNED_KEYS) {
		const value = candidate[owned.path];

		if (value === null || value === undefined) {
			continue;
		}

		if (!isRecord(value)) {
			problems.push(
				`${owned.path}: expected an object the kernel owns, found ${typeof value}`
			);
			continue;
		}

		const allowed = new Set<string>([...owned.required, ...owned.optional]);

		let missing = 0;

		for (const key of owned.required) {
			if (!Object.hasOwn(value, key)) {
				missing += 1;
				problems.push(
					`${owned.path}.${key}: required here, absent from the payload`
				);
			}
		}

		// Naming a key the kernel does not use is only useful once something required
		// is gone, because that is what a rename looks like from here. An object that is
		// complete apart from a field added by a newer core stays quiet.
		if (!allowUnknownKeys || missing > 0) {
			for (const key of Object.keys(value)) {
				if (!allowed.has(key)) {
					problems.push(
						`${owned.path}.${key}: the kernel owns these key names and does not use "${key}" here`
					);
				}
			}
		}
	}

	return problems;
};
