/**
 * The snapshot a deferred provider renders before its policy arrives, with
 * none of the kernel's code. A module of its own, so a first-load chunk can
 * import it without `./deferred-boot`'s request helpers: a bundler that
 * splits by file (esbuild, in Angular's builder) puts every module a
 * first-load import reaches next to it, even the engine's.
 *
 * @packageDocumentation
 * @internal
 */

import type { EvaluationPolicy } from '../consent-record/types';
import { deepFreeze } from '../libs/freeze-data';
import type { ConsentSnapshot, KernelConfig, KernelOverrides } from '../types';
import { DEFAULT_BRANDING } from '../types';

/** The provider options a pending snapshot depends on. @internal */
export interface PendingSnapshotOptions {
	consentCategories?: KernelConfig['consentCategories'];
	overrides?: KernelOverrides;
	/** The browser's Global Privacy Control signal, as the engine reads it. */
	gpc?: boolean;
}

const UNCONFIGURED = Object.freeze({
	policy: null,
	status: 'unconfigured',
}) as ConsentSnapshot['resolution'];

/** Categories the safe fallback asks about, in canonical order. */
const FALLBACK_SCOPE = [
	'experience',
	'functionality',
	'marketing',
	'measurement',
] as const;

/** A year, the safe fallback's validity for a choice and a notice. */
const FALLBACK_VALIDITY_MS = 31_536_000_000;

/**
 * The rule every unresolved policy runs on: the schema's safe opt-in
 * fallback (`safeFallbackPolicyInput`), written out, so this module does
 * not carry the schema's policy code. A test pins it to the schema's.
 */
const fallbackRule = (): ConsentSnapshot['policyRule'] => ({
	actions: {
		allowed: ['accept', 'customize', 'reject'],
		equivalent: [['accept', 'reject']],
		required: ['accept', 'reject'],
	},
	copyRevision: null,
	id: 'c15t_safe_fallback',
	model: 'opt-in',
	preselectedCategories: [],
	privacySignals: { gpc: { denyCategories: [] } },
	prompt: 'choice',
	proof: { storeIp: false, storeLanguage: false, storeUserAgent: false },
	rights: ['disclosure', 'preferences'],
	scope: [...FALLBACK_SCOPE],
	scopeMode: 'strict',
	validity: { choiceMs: FALLBACK_VALIDITY_MS, noticeMs: FALLBACK_VALIDITY_MS },
});

/**
 * The evaluator's projection of the safe fallback, as
 * `buildEvaluationPolicy` in `../policy` computes it. A test pins it.
 */
const fallbackEvaluationPolicy = (
	consentCategories: readonly string[] | null
): NonNullable<ConsentSnapshot['evaluationPolicy']> => {
	const policy: {
		-readonly [Key in keyof EvaluationPolicy]: EvaluationPolicy[Key];
	} = {
		choice: {
			fingerprint:
				'145fd951c0967e210d905acf5859a93cd03095c0291816b9c424d740048b7a47',
			maxAgeMs: FALLBACK_VALIDITY_MS,
		},
		choiceScope: consentCategories
			? FALLBACK_SCOPE.filter((category) =>
					consentCategories.includes(category)
				)
			: [...FALLBACK_SCOPE],
		gpcDenyCategories: [],
		legacyMaterialFingerprint: null,
		model: 'opt-in',
		notice: {
			fingerprint:
				'4b563e76133c49a5e14cffd9c0a0cc16885b811d9ff77548165cc01ee94996d7',
			maxAgeMs: FALLBACK_VALIDITY_MS,
		},
		prompt: 'choice',
		scope: [...FALLBACK_SCOPE],
		scopeMode: 'strict',
	};
	return policy;
};

/**
 * The snapshot a hosted kernel starts from before its policy arrives, for
 * a visitor whose records are not read yet: policy pending, nothing but
 * `necessary` granted, no surface shown. The same snapshot
 * `pendingSnapshot` in `deferred-snapshot` builds with the kernel's
 * evaluator (a test keeps them equal), without that evaluator: under the
 * safe fallback with no records, the answer is fixed.
 *
 * @param options - Categories, overrides and the GPC signal.
 * @returns A frozen snapshot.
 * @internal
 */
export const pendingBootSnapshot = function pendingBootSnapshot(
	options: PendingSnapshotOptions
): ConsentSnapshot {
	const consentCategories = options.consentCategories?.length
		? [...new Set(options.consentCategories)].sort()
		: null;
	const override = options.overrides?.gpc;
	const detected = options.gpc === true;
	const snapshot: ConsentSnapshot = {
		activeUI: 'none',
		branding: DEFAULT_BRANDING,
		consentCategories,
		// Not DENIED_CONSENTS: importing it would list one more chunk in
		// every first-load preload map.
		effectivePermissions: {
			experience: false,
			functionality: false,
			marketing: false,
			measurement: false,
			necessary: true,
		},
		evaluatedAt: 0,
		evaluationPolicy: fallbackEvaluationPolicy(consentCategories),
		experiment: null,
		experimentPending: false,
		explicitChoice: null,
		externalPermissions: undefined,
		hosting: null,
		iab: null,
		location: null,
		model: 'opt-in',
		nextDeadline: null,
		noticeDismissal: null,
		overrides: { ...options.overrides },
		policyPending: true,
		policyRule: fallbackRule(),
		policySnapshotToken: null,
		privacySignals: {
			gpc: { active: override ?? detected, detected, override },
		},
		promptRequirement: { kind: 'choice', reason: 'missing' },
		resolution: UNCONFIGURED,
		restrictions: {},
		revision: 0,
		scriptRegistry: null,
		subject: null,
		surfaceShownAt: { banner: null, dialog: null },
		translations: null,
		user: null,
		vendorChoice: null,
		vendors: null,
	} as ConsentSnapshot;
	deepFreeze(snapshot);
	return snapshot;
};
