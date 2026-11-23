/**
 * Snapshot construction and freezing.
 *
 * Pure: no DOM, no window, no network, no hashing, no timers. The initial
 * snapshot evaluates the supplied records against the supplied (or
 * precomputed) policy resolution at `config.now`, so a server render and a
 * client construction with the same inputs produce the same revision-0
 * snapshot.
 */

import type { OptOutRecord, PolicyResolution } from '@inth/sdk-schema/types';

import type {
	ConsentSnapshot,
	ConsentState,
	KernelConfig,
	KernelIABAuthority,
	KernelIABState,
	KernelVendorsState,
	VendorChoice,
	ResolvedVendor,
	PromptSurface,
} from '../consent-kernel.model';
import { DEFAULT_BRANDING } from '../consent-kernel.model';
import { evaluateConsentRecord } from '../consent-record/evaluate';
import { OPTIONAL_CONSENT_CATEGORIES } from '../consent-record/types';
import type {
	ExplicitChoice,
	OptionalConsentCategory,
} from '../consent-record/types';
import { deriveActiveUI } from '../derive-surface';
import { deepFreeze, ownScriptRegistry } from '../libs/freeze-data.model';
import { buildEvaluationPolicy, resolveEffectivePolicy } from '../policy';
import { deriveModel } from '../policy-choice.model';
import type { PresentedSelection } from '../policy-choice.model';
import { applyTranslationOverrides } from '../translations';
import {
	deriveEffectiveRecords,
	freezeAccountLayer,
	normalizeUserConsent,
	shouldAdoptAccountLayer,
} from './account-layer';
import type {
	AccountConsentLayer,
	AccountLayerSource,
	BrowserConsentRecords,
} from './account-layer';
import {
	evaluateExternalPermissions,
	normalizeExternalPermissions,
} from './external-permissions.model';
import { validateHydrationRecords } from './record-validation.model';

/** Optional permissions held to `false` while `userConsentPending` is true. */
export const PENDING_PERMISSIONS: Readonly<ConsentState> = Object.freeze({
	experience: false,
	functionality: false,
	marketing: false,
	measurement: false,
	necessary: true,
});

/**
 * Default IAB slice. Used as the base when constructing the initial IAB
 * state and when folding partial IAB patches onto a previously-null slice.
 */
export const DEFAULT_IAB: KernelIABState = {
	authority: null,
	cmpId: null,
	customVendors: [],
	enabled: false,
	gvl: null,
	purposeConsents: {},
	purposeLegitimateInterests: {},
	specialFeatureOptIns: {},
	tcString: null,
	vendorConsents: {},
	vendorLegitimateInterests: {},
};

/** Default vendor slice: nothing declared, no list version. */
export const DEFAULT_VENDORS: KernelVendorsState = {
	declared: [],
	listVersion: null,
};

const UNCONFIGURED: PolicyResolution = Object.freeze({
	policy: null,
	status: 'unconfigured',
});

// The fallback evaluation without records has no expiry deadline.
// Its permissions and prompt are independent of the clock and GPC because
// the fallback has no GPC deny mapping. Compute the real evaluator once and
// freeze its result before sharing it between independently owned snapshots.
const DEFAULT_EFFECTIVE_POLICY = resolveEffectivePolicy(UNCONFIGURED);
const DEFAULT_EVALUATION_POLICY = buildEvaluationPolicy(
	DEFAULT_EFFECTIVE_POLICY
);
const EMPTY_OVERRIDES = Object.freeze({});
/** No prompt surface has been shown yet. Shared by every fresh snapshot. */
export const UNSHOWN_SURFACES: ConsentSnapshot['surfaceShownAt'] =
	Object.freeze({ banner: null, dialog: null });

/** Whether an active UI value is a prompt surface the kernel timestamps. */
export const isPromptSurface = function isPromptSurface(
	value: unknown
): value is PromptSurface {
	return value === 'banner' || value === 'dialog';
};
const DEFAULT_PRIVACY_SIGNALS: ConsentSnapshot['privacySignals'] =
	Object.freeze({
		gpc: Object.freeze({ active: false, detected: false, override: undefined }),
	});
const DEFAULT_RECORD_EVALUATION = evaluateConsentRecord({
	choice: null,
	noticeDismissal: null,
	now: 0,
	policy: DEFAULT_EVALUATION_POLICY,
});
deepFreeze(DEFAULT_RECORD_EVALUATION);

/**
 * Staged draft values from a `Partial<ConsentState>`. Only own boolean
 * values for optional categories are kept; `necessary` and unknown keys
 * are dropped. Returns `null` when nothing usable was supplied.
 */
export const buildDraft = function buildDraft(
	input: Partial<ConsentState> | undefined
): PresentedSelection | null {
	if (!input || typeof input !== 'object') {
		return null;
	}
	const draft: PresentedSelection = {};
	let any = false;
	for (const category of OPTIONAL_CONSENT_CATEGORIES) {
		if (
			Object.hasOwn(input, category) &&
			typeof input[category] === 'boolean'
		) {
			draft[category] = input[category];
			any = true;
		}
	}
	return any ? draft : null;
};

/**
 * Merge a user-supplied initial IAB slice over the IAB defaults. Returns
 * `null` when no IAB seed was provided.
 */
export const copyIABAuthority = function copyIABAuthority(
	authority: KernelIABAuthority | null
): KernelIABAuthority | null {
	if (!authority) {
		return null;
	}
	return {
		...authority,
		...(authority.publisherRestrictions && {
			publisherRestrictions: authority.publisherRestrictions.map(
				(restriction) => ({
					...restriction,
					vendorIds: [...restriction.vendorIds],
				})
			),
		}),
		purposeConsents: { ...authority.purposeConsents },
		purposeLegitimateInterests: { ...authority.purposeLegitimateInterests },
		specialFeatureOptIns: { ...authority.specialFeatureOptIns },
		vendorConsents: { ...authority.vendorConsents },
		vendorLegitimateInterests: { ...authority.vendorLegitimateInterests },
		...(authority.adTechProviderConsents && {
			adTechProviderConsents: { ...authority.adTechProviderConsents },
		}),
	};
};

export const buildInitialIab = function buildInitialIab(
	initial: Partial<KernelIABState> | undefined
): KernelIABState | null {
	if (!initial) {
		return null;
	}
	return {
		...DEFAULT_IAB,
		...initial,
		authority: copyIABAuthority(initial.authority ?? null),
	};
};

/** Copy a caller-supplied vendor slice so later mutation cannot leak in. */
export const buildInitialVendors = function buildInitialVendors(
	initial: KernelVendorsState | undefined
): KernelVendorsState | null {
	if (
		!initial ||
		(initial.declared.length === 0 && initial.listVersion === null)
	) {
		return null;
	}
	return {
		// Plain JSON copies: freezing the snapshot must not freeze a nested
		// category condition the caller's config or script still references.
		declared: initial.declared.map(
			(vendor) => JSON.parse(JSON.stringify(vendor)) as ResolvedVendor
		),
		listVersion: initial.listVersion ?? null,
	};
};

const freezeOptOut = function freezeOptOut(optOut: OptOutRecord | null): void {
	if (!optOut || Object.isFrozen(optOut)) {
		return;
	}
	Object.freeze(optOut.rights);
	if (optOut.categories) {
		Object.freeze(optOut.categories);
	}
	Object.freeze(optOut);
};

const freezeVendorChoice = function freezeVendorChoice(
	choice: VendorChoice | null
): void {
	if (!choice || Object.isFrozen(choice)) {
		return;
	}
	Object.freeze(choice.denied);
	Object.freeze(choice);
};

const freezeChoice = function freezeChoice(
	choice: ExplicitChoice | null
): void {
	if (!choice || Object.isFrozen(choice)) {
		return;
	}
	for (const category of Object.keys(
		choice.categories
	) as OptionalConsentCategory[]) {
		const decision = choice.categories[category];
		if (decision) {
			Object.freeze(decision.basis);
			Object.freeze(decision);
		}
	}
	Object.freeze(choice.categories);
	Object.freeze(choice);
};

/**
 * Deep-freeze a snapshot in place and return it typed as `ConsentSnapshot`.
 * Nested objects are frozen so subscribers can trust `===` at any depth.
 */
export const freezeSnapshot = function freezeSnapshot(
	snapshot: ConsentSnapshot
): ConsentSnapshot {
	deepFreeze(snapshot.iab?.authority);
	// Only skip branches whose identity proves they are our frozen defaults.
	// Caller-owned objects still take the full freezing path.
	if (snapshot.effectivePermissions !== DEFAULT_RECORD_EVALUATION.permissions) {
		Object.freeze(snapshot.effectivePermissions);
	}
	if (snapshot.overrides !== EMPTY_OVERRIDES) {
		Object.freeze(snapshot.overrides);
	}
	if (
		snapshot.promptRequirement !== DEFAULT_RECORD_EVALUATION.promptRequirement
	) {
		Object.freeze(snapshot.promptRequirement);
	}
	if (
		snapshot.restrictions !== DEFAULT_RECORD_EVALUATION.restrictions &&
		!Object.isFrozen(snapshot.restrictions)
	) {
		for (const reasons of Object.values(snapshot.restrictions)) {
			Object.freeze(reasons);
		}
		Object.freeze(snapshot.restrictions);
	}
	if (snapshot.privacySignals !== DEFAULT_PRIVACY_SIGNALS) {
		Object.freeze(snapshot.privacySignals.gpc);
		Object.freeze(snapshot.privacySignals);
	}
	if (snapshot.resolution !== UNCONFIGURED) {
		deepFreeze(snapshot.resolution);
	}
	if (snapshot.policyRule !== DEFAULT_EFFECTIVE_POLICY.rule) {
		deepFreeze(snapshot.policyRule);
	}
	if (snapshot.evaluationPolicy !== DEFAULT_EVALUATION_POLICY) {
		deepFreeze(snapshot.evaluationPolicy);
	}
	freezeChoice(snapshot.explicitChoice as ExplicitChoice | null);
	freezeOptOut(snapshot.optOut as OptOutRecord | null);
	freezeVendorChoice(snapshot.vendorChoice as VendorChoice | null);
	deepFreeze(snapshot.vendors);
	for (const nested of [
		snapshot.consentCategories,
		snapshot.noticeDismissal,
		snapshot.subject,
		snapshot.user,
		snapshot.translations,

		snapshot.iab,
		snapshot.location,
		snapshot.experiment,
	]) {
		if (nested) {
			Object.freeze(nested);
		}
	}
	if (snapshot.surfaceShownAt !== UNSHOWN_SURFACES) {
		Object.freeze(snapshot.surfaceShownAt);
	}
	return Object.freeze(snapshot) as ConsentSnapshot;
};

export interface InitialKernelState {
	readonly snapshot: ConsentSnapshot;
	readonly browserRecords: BrowserConsentRecords;
	readonly accountLayer: AccountConsentLayer | null;
	readonly accountLayerSource: AccountLayerSource;
}

/**
 * Build the initial frozen snapshot and its separate browser and account
 * record layers from a kernel config.
 *
 * Pure. Evaluates once at `config.now` (default `Date.now()`), using the
 * precomputed resolution when supplied and the safe fallback otherwise.
 * A pending policy or pending `userConsent` keeps the first layer hidden
 * until it settles.
 */
// oxlint-disable-next-line complexity -- Construction reads every config field once in a fixed order.
export const buildInitialKernelState = function buildInitialKernelState(
	config: KernelConfig
): InitialKernelState {
	// One clock for validation and evaluation: an explicit config clock, else
	// the clock the record seed was read with, else the wall clock.
	const now = config.now ?? config.initialRecords?.now ?? Date.now();
	const resolution = config.initialPolicyResolution ?? UNCONFIGURED;
	const effective = resolveEffectivePolicy(resolution);
	const consentCategories =
		config.consentCategories?.length || config.inferredConsentCategories?.length
			? [
					...new Set([
						...(config.consentCategories ?? []),
						...(config.inferredConsentCategories ?? []),
					]),
				].sort()
			: null;
	const evaluationPolicy = buildEvaluationPolicy(effective, consentCategories);
	const policyPending = config.initialPolicyPending ?? false;
	const userConsentPending = config.initialUserConsentPending === true;

	const validated = config.initialRecords
		? validateHydrationRecords(config.initialRecords, now)
		: null;
	const records = validated?.ok === true ? validated.records : null;
	const noticeDismissal = records?.noticeDismissal ?? null;
	const subject = records?.subject ?? null;
	const user = config.initialUser ? { ...config.initialUser } : null;

	const browserChoice = records?.choice ?? null;
	const browserOptOut = records?.optOut ?? null;
	const browserVendorChoice = records?.vendorChoice ?? null;
	const browserVendorDeclared = records?.vendorDeclared ?? null;
	freezeChoice(browserChoice);
	freezeOptOut(browserOptOut);
	freezeVendorChoice(browserVendorChoice);
	if (browserVendorDeclared) {
		Object.freeze(browserVendorDeclared);
	}
	const browserRecords: BrowserConsentRecords = {
		choice: browserChoice,
		optOut: browserOptOut,
		vendorChoice: browserVendorChoice,
		vendorDeclared: browserVendorDeclared,
	};

	const userExternalId = user?.externalId ?? null;
	const storedAccount =
		records?.accountLayer &&
		userExternalId !== null &&
		records.accountLayer.externalId === userExternalId
			? records.accountLayer
			: null;
	let accountLayer: AccountConsentLayer | null = null;
	let accountLayerSource: AccountLayerSource = 'stored';
	if (config.initialUserConsent === null) {
		accountLayer = null;
	} else {
		if (storedAccount !== null) {
			accountLayer = freezeAccountLayer(storedAccount);
			accountLayerSource = 'stored';
		}
		if (config.initialUserConsent !== undefined && userExternalId !== null) {
			const normalizedInitial =
				config.initialUserConsent.sync?.externalId === userExternalId
					? normalizeUserConsent(config.initialUserConsent, now)
					: null;
			if (
				normalizedInitial !== null &&
				shouldAdoptAccountLayer({
					current: accountLayer,
					currentSource: accountLayerSource,
					incoming: normalizedInitial,
					incomingSource: 'incoming',
					userExternalId,
				})
			) {
				accountLayer = freezeAccountLayer(normalizedInitial);
				accountLayerSource = 'incoming';
			}
		}
	}

	const derivedRecords = deriveEffectiveRecords(
		browserRecords,
		accountLayer,
		user,
		evaluationPolicy
	);
	const { choice: explicitChoice, optOut, vendorChoice } = derivedRecords;

	const iab = buildInitialIab(
		config.initialExternalPermissions === undefined
			? config.initialIab
			: config.initialIab && {
					...config.initialIab,
					authority: null,
					enabled: false,
				}
	);
	const vendors = buildInitialVendors(config.initialVendors);
	const override = config.initialOverrides?.gpc;
	const detected = config.initialPrivacySignals?.gpc === true;
	const privacySignals =
		override === undefined && !detected
			? DEFAULT_PRIVACY_SIGNALS
			: { gpc: { active: override ?? detected, detected, override } };

	const externalPermissions =
		config.initialExternalPermissions === undefined
			? undefined
			: normalizeExternalPermissions(config.initialExternalPermissions);
	const recordEvaluation =
		evaluationPolicy === DEFAULT_EVALUATION_POLICY &&
		explicitChoice === null &&
		noticeDismissal === null &&
		optOut === null
			? DEFAULT_RECORD_EVALUATION
			: evaluateConsentRecord({
					choice: explicitChoice,
					gpc: privacySignals.gpc.active,
					noticeDismissal,
					now,
					optOut,
					policy: evaluationPolicy,
				});

	let evaluation: {
		nextDeadline: number | null;
		permissions: Readonly<ConsentState>;
		promptRequirement: ConsentSnapshot['promptRequirement'];
		restrictions: ConsentSnapshot['restrictions'];
	} = recordEvaluation;
	if (externalPermissions) {
		evaluation = evaluateExternalPermissions(externalPermissions);
	} else if (userConsentPending) {
		evaluation = { ...recordEvaluation, permissions: PENDING_PERMISSIONS };
	}
	const draftSnapshot: ConsentSnapshot & { hasAccountLayer?: boolean } = {
		activeUI: externalPermissions
			? 'none'
			: deriveActiveUI({
					experimentPending: config.initialExperimentPending === true,
					policyPending,
					promptRequirement: evaluation.promptRequirement,
					resolution,
					userConsentPending,
				}),
		branding: config.initialBranding ?? DEFAULT_BRANDING,
		consentCategories,
		effectivePermissions: evaluation.permissions,
		evaluatedAt: now,
		evaluationPolicy,
		experiment: config.initialExperiment
			? { ...config.initialExperiment }
			: null,
		experimentPending: config.initialExperimentPending === true,
		explicitChoice,
		externalPermissions,
		hosting: config.initialHosting ?? null,
		iab,
		location: config.initialLocation ? { ...config.initialLocation } : null,
		model: deriveModel(effective.rule, iab?.enabled ?? false),
		nextDeadline: evaluation.nextDeadline,
		noticeDismissal,
		optOut,
		overrides: config.initialOverrides
			? { ...config.initialOverrides }
			: EMPTY_OVERRIDES,
		policyPending,
		policyRule: effective.rule,
		policySnapshotToken: config.initialPolicySnapshotToken ?? null,
		privacySignals,
		promptRequirement: evaluation.promptRequirement,
		resolution,
		restrictions: evaluation.restrictions,
		revision: 0,
		scriptRegistry: ownScriptRegistry(config.initialScriptRegistry),
		subject,
		surfaceShownAt: config.initialSurfaceShownAt
			? { ...UNSHOWN_SURFACES, ...config.initialSurfaceShownAt }
			: UNSHOWN_SURFACES,
		translations: config.initialTranslations
			? applyTranslationOverrides(
					{ ...config.initialTranslations },
					config.translationOverrides
				)
			: null,
		user,
		userConsentPending,
		vendorChoice,
		vendors,
	};
	if (derivedRecords.activeAccount !== null) {
		draftSnapshot.hasAccountLayer = true;
	}
	const snapshot = freezeSnapshot(draftSnapshot);
	return { accountLayer, accountLayerSource, browserRecords, snapshot };
};

/**
 * Build the initial frozen snapshot from a kernel config.
 *
 * Pure. Evaluates once at `config.now` (default `Date.now()`), using the
 * precomputed resolution when supplied and the safe fallback otherwise.
 * A pending policy keeps the first layer hidden until init finishes.
 */
export const buildInitialSnapshot = function buildInitialSnapshot(
	config: KernelConfig
): ConsentSnapshot {
	return buildInitialKernelState(config).snapshot;
};
