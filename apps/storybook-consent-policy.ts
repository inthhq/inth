import type { ConsentPresentation } from '../packages/sdk/core/src/libs/policy-actions';
import type { ProviderTransportFactory } from '../packages/sdk/core/src/transports/mode';
import { createOfflineTransport } from '../packages/sdk/core/src/transports/offline';
import type { HydrationRecords } from '../packages/sdk/core/src/consent-kernel.model';
import {
	createPolicyRuleFingerprints,
	normalizePolicyRule,
	resolvePolicyRules,
} from '../packages/sdk/schema/src/types';
import type {
	PolicyRule,
	PolicyResolution,
	Vendor,
} from '../packages/sdk/schema/src/types';

export const storybookPolicy: PolicyRule = {
	categories: ['functionality', 'measurement', 'experience', 'marketing'],
	id: 'storybook',
	match: { fallback: true, isDefault: true },
	model: 'opt-in',
	prompt: 'choice',
	scopeMode: 'permissive',
};

export const storybookIABPolicy: PolicyRule = {
	...storybookPolicy,
	id: 'storybook-iab',
	model: 'iab',
};

export const storybookOptOutPolicy: PolicyRule = {
	...storybookPolicy,
	id: 'storybook-opt-out',
	model: 'opt-out',
	privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
	prompt: 'notice',
	rights: ['disclosure', 'preferences', 'opt-out'],
};

/**
 * The stories' `mode`: resolves `policy` in the browser and sends nothing.
 * A Storybook build is a production build, where `testing()` refuses to run,
 * so the stories build the transport it would hand the provider themselves.
 *
 * @param policy - The rules the story resolves.
 * @param options - `iab: true` resolves an IAB rule where the provider cannot
 *   tell that IAB is on, such as a React tree that renders `IABProvider`.
 * @returns A provider transport factory.
 */
export const storybookMode = function storybookMode(
	policy: PolicyRule[],
	options: { iab?: boolean } = {}
): ProviderTransportFactory {
	return Object.assign(
		(context: Parameters<ProviderTransportFactory>[0]) =>
			createOfflineTransport({
				acknowledgeNoRecords: true,
				iabEnabled: options.iab ?? context.iabEnabled,
				policyRules: policy,
				translations: context.translations,
				translationsFor: context.translationsFor,
			}),
		{ kind: 'offline' as const }
	);
};

/**
 * The storybook policy already resolved, for adapters whose provider can
 * take a prefetched resolution. Consent surfaces render only once a policy
 * is resolved, so a story that waits on an async init paints
 * without its link, trigger, and widget for a tick; a prefetched resolution
 * makes the first paint authoritative, as server rendering does in an app.
 */
export const storybookPolicyResolution: PolicyResolution = resolvePolicyRules({
	countryCode: null,
	regionCode: null,
	rules: [storybookPolicy],
});

export const storybookOptOutPolicyResolution: PolicyResolution =
	resolvePolicyRules({
		countryCode: 'US',
		regionCode: 'CA',
		rules: [storybookOptOutPolicy],
	});

/**
 * Shared story presentation. The prompt keeps the resolver's non-blocking
 * default (a labelled region that never steals focus); the preference dialog
 * keeps its blocking default (backdrop, focus trap, scroll lock). Stories
 * that need a blocking banner pass `blockUntilChoice`.
 */
export const storybookPresentation: ConsentPresentation = {
	preferences: {
		direction: 'row',
		layout: [['reject', 'accept'], 'save'],
		primaryActions: ['reject', 'accept'],
		uiProfile: 'compact',
	},
	prompt: {
		direction: 'row',
		layout: [['reject', 'accept'], 'customize'],
		primaryActions: ['reject', 'accept'],
		uiProfile: 'compact',
	},
};

/**
 * Vendors the `With Vendors` stories declare in every adapter, so the three
 * surfaces render identical rows and the parity gate compares markup, not
 * fixtures.
 */
export const storybookVendors: Vendor[] = [
	{
		category: 'marketing',
		description: 'Ad conversion measurement and audiences.',
		id: 'meta-pixel',
		name: 'Meta Pixel',
		privacyPolicyUrl: 'https://www.facebook.com/privacy/policy/',
	},
	{
		category: 'marketing',
		id: 'google-ads',
		name: 'Google Ads',
		privacyPolicyUrl: 'https://policies.google.com/privacy',
	},
	{
		category: 'measurement',
		id: 'google-analytics',
		name: 'Google Analytics',
		privacyPolicyUrl: 'https://policies.google.com/privacy',
	},
];

/** Marketing and measurement on, so every vendor switch is live. */
export const storybookVendorStoredConsent: Record<string, boolean> = {
	experience: false,
	functionality: false,
	marketing: true,
	measurement: true,
	necessary: true,
};

/** The explicit choice record a fixture stores, with its confirmation metadata. */
export const storybookChoiceRecord = (
	consents: Record<string, boolean>,
	policy: PolicyRule = storybookPolicy
): NonNullable<HydrationRecords['choice']> => {
	const confirmedAt = Date.now();
	const basis = {
		fingerprint: createPolicyRuleFingerprints(normalizePolicyRule(policy))
			.choice,
		kind: 'choice-v1' as const,
	};
	return {
		categories: Object.fromEntries(
			Object.entries(consents)
				.filter(([category]) => category !== 'necessary')
				.map(([category, value]) => [category, { basis, confirmedAt, value }])
		),
		version: 3,
	};
};

/** Seed explicit fixture choices with their original confirmation metadata. */
export const seedStorybookChoice = (
	consents: Record<string, boolean>,
	policy: PolicyRule = storybookPolicy
): void => {
	window.localStorage.setItem(
		'inth',
		JSON.stringify(storybookChoiceRecord(consents, policy))
	);
};

/** IAB comparison stories use the default modal presentation in every adapter. */
export const storybookIABPresentation: ConsentPresentation = {
	...storybookPresentation,
	preferences: { ...storybookPresentation.preferences, blocking: true },
	prompt: { ...storybookPresentation.prompt, blockUntilChoice: true },
};

/** Stored grants under an opt-out policy; opted-out categories still show off. */
export const storybookOptOutStoredConsent: Record<string, boolean> = {
	experience: true,
	functionality: true,
	marketing: true,
	measurement: true,
	necessary: true,
};

/** Fixed timestamp for deterministic opt-out receipt stories. */
export const STORYBOOK_OPT_OUT_RECORDED_AT = Date.UTC(2026, 0, 15, 12, 0, 0);

/** Fixed local reference for deterministic opt-out receipt stories. */
export const STORYBOOK_OPT_OUT_REFERENCE =
	'0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d';

/** Initial choice and opt-out records for the opt-out widget and dialog stories. */
export const storybookOptOutRecords = (
	kind: 'request' | 'gpc' | 'account'
): HydrationRecords => {
	const records: HydrationRecords = {
		choice: storybookChoiceRecord(
			storybookOptOutStoredConsent,
			storybookOptOutPolicy
		),
		optOut: {
			heldBy: kind === 'account' ? 'person' : 'device',
			method: kind === 'gpc' ? 'gpc' : 'button',
			recordedAt: STORYBOOK_OPT_OUT_RECORDED_AT,
			rights: ['sale', 'share'],
		},
	};
	if (kind === 'gpc') {
		records.optOutGpcReported = true;
	}
	return records;
};

/** Variants for the five opt-out confirmation receipt stories. */
export type StorybookOptOutConfirmationKind =
	| 'request'
	| 'confirmed'
	| 'account-covered'
	| 'signal'
	| 'account-adopted';

/** Seeded opt-out records for the opt-out confirmation receipt stories. */
export const storybookOptOutConfirmationRecords = (
	kind: StorybookOptOutConfirmationKind
): HydrationRecords => {
	if (kind === 'account-adopted') {
		return {
			optOut: {
				heldBy: 'person',
				method: 'propagated',
				recordedAt: STORYBOOK_OPT_OUT_RECORDED_AT,
				rights: ['sale', 'share', 'targeted_ads'],
			},
			optOutRightsConfirmed: true,
		};
	}
	if (kind === 'signal') {
		return {
			optOut: {
				heldBy: 'device',
				method: 'gpc',
				recordedAt: STORYBOOK_OPT_OUT_RECORDED_AT,
				rights: ['sale', 'share'],
			},
			optOutGpcReported: true,
			optOutLocalAct: 'gpc',
			optOutReference: STORYBOOK_OPT_OUT_REFERENCE,
		};
	}
	return {
		optOut: {
			heldBy: kind === 'account-covered' ? 'both' : 'device',
			method: 'button',
			recordedAt: STORYBOOK_OPT_OUT_RECORDED_AT,
			rights: ['sale', 'share'],
		},
		optOutLocalAct: 'button',
		optOutReference: STORYBOOK_OPT_OUT_REFERENCE,
		optOutRightsConfirmed: kind === 'confirmed' || kind === 'account-covered',
	};
};
