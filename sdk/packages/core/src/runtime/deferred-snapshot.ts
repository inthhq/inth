/**
 * `@c15t/core/runtime/deferred-snapshot`: what a client-rendered provider
 * needs to show the banner before the consent engine has loaded.
 *
 * A page that ran the inline `/init` prefetch already has the policy and
 * the copy. These helpers turn that response into the snapshot the kernel
 * would compute from it, with the same pure functions the kernel uses, so
 * the stock banner can render from it. Nothing here persists, sends or
 * hydrates anything: the engine does that once it loads, and its own init
 * takes the same prefetched response.
 *
 * @packageDocumentation
 * @internal
 */

import {
	POLICY_CONTRACT_VERSION,
	readPolicyResolutionWire,
} from '@c15t/schema/types';
import type { InitOutput, PolicyResolutionWire } from '@c15t/schema/types';

import { buildInitialSnapshot } from '../kernel/snapshot';
import type { PrefetchedInitialData } from '../libs/prefetch/prefetch';
import type {
	ConsentSnapshot,
	HydrationRecords,
	KernelBranding,
	KernelConfig,
	KernelOverrides,
} from '../types';

// The light half, which a first-load chunk takes on its own.
export {
	findPrefetchedInit,
	findPrefetchedInitFor,
	hasStoredConsent,
	primeInitRequest,
	startPrefetchedInit,
} from './deferred-boot';
export type { PrefetchedInitialData } from '../libs/prefetch/prefetch';

/** The provider options a deferred snapshot depends on. @internal */
export interface DeferredSnapshotOptions {
	consentCategories?: KernelConfig['consentCategories'];
	overrides?: KernelOverrides;
	translationOverrides?: KernelConfig['translationOverrides'];
	/**
	 * The browser's Global Privacy Control signal, as the engine reads it.
	 * Without it the snapshot assumes none, and a save planned from it
	 * would ignore the signal.
	 */
	gpc?: boolean;
	/**
	 * Stored records to evaluate, as persistence reads them
	 * (`readStoredRecords`). Without them the snapshot is a fresh visitor's.
	 */
	records?: HydrationRecords;
}

const baseConfig = function baseConfig(
	options: DeferredSnapshotOptions
): KernelConfig {
	return {
		consentCategories: options.consentCategories,
		initialOverrides: options.overrides,
		initialPrivacySignals:
			options.gpc === undefined ? undefined : { gpc: options.gpc },
		initialRecords: options.records,
		translationOverrides: options.translationOverrides,
	};
};

/**
 * The snapshot a hosted kernel starts from before its policy arrives:
 * policy pending, nothing granted, no surface shown.
 *
 * @param options - Categories and overrides from the provider options.
 * @returns A frozen snapshot.
 * @internal
 */
export const pendingSnapshot = function pendingSnapshot(
	options: DeferredSnapshotOptions
): ConsentSnapshot {
	return buildInitialSnapshot({
		...baseConfig(options),
		initialPolicyPending: true,
		now: 0,
	});
};

/**
 * Whether the stand-in can read this `/init` answer. An IAB or vendor
 * response, or a contract this client does not speak, leaves the decision
 * to the engine.
 */
const isReadableInit = function isReadableInit(
	payload: Partial<InitOutput> | undefined,
	declared: PrefetchedInitialData['producerPolicyContract'] | undefined
): payload is Partial<InitOutput> & Pick<InitOutput, 'policyResolution'> {
	if (!payload?.policyResolution) {
		return false;
	}
	if (
		declared !== undefined &&
		declared !== null &&
		Number(declared) !== POLICY_CONTRACT_VERSION
	) {
		return false;
	}
	return !(
		payload.gvl ||
		payload.gvlReference ||
		payload.vendors?.length ||
		payload.customVendors?.length
	);
};

/** The provider's overrides, with the location and language `/init` resolved. */
const overridesFromInit = function overridesFromInit(
	overrides: KernelOverrides | undefined,
	payload: Partial<InitOutput>
): KernelOverrides {
	const { location, translations } = payload;
	const merged: KernelOverrides = { ...overrides };
	if (location?.countryCode) {
		merged.country = location.countryCode;
	}
	if (location?.regionCode) {
		merged.region = location.regionCode;
	}
	if (translations?.language) {
		merged.language = translations.language;
	}
	return merged;
};

/**
 * The kernel configuration a prefetched `/init` response stands for: the
 * policy, copy, location, branding and hosting, as a runtime's `prefetch`
 * option takes them. A runtime given it starts with the policy resolved
 * and sends no `/init` of its own. Records, categories and other options
 * are left to the runtime.
 *
 * @param prefetched - The resolved prefetch.
 * @param overrides - The overrides the request was sent with.
 * @param now - Evaluation clock. Defaults to `Date.now()`.
 * @returns The configuration, or `undefined` for a response only the
 * engine can read: IAB or vendor data, an unknown contract, or none.
 * @internal
 */
export const configFromPrefetchedInit = function configFromPrefetchedInit(
	prefetched: PrefetchedInitialData | undefined,
	overrides?: KernelOverrides,
	now: number = Date.now()
): KernelConfig | undefined {
	const payload = prefetched?.init as Partial<InitOutput> | undefined;
	if (!isReadableInit(payload, prefetched?.producerPolicyContract)) {
		return undefined;
	}
	try {
		return {
			initialBranding:
				payload.branding && payload.branding !== 'none'
					? (payload.branding as KernelBranding)
					: undefined,
			initialHosting: payload.hosting,
			initialLocation: payload.location,
			initialOverrides: overridesFromInit(overrides, payload),
			initialPolicyResolution: readPolicyResolutionWire(
				payload.policyResolution as PolicyResolutionWire
			),
			initialPolicySnapshotToken: payload.policySnapshotToken,
			initialTranslations: payload.translations,
			now,
		};
	} catch {
		return undefined;
	}
};

/**
 * The snapshot a fresh kernel computes once a prefetched `/init` response
 * resolved: for a visitor with no stored records, or with the records in
 * `options.records`.
 *
 * @param prefetched - The resolved prefetch.
 * @param options - Categories and overrides from the provider options.
 * @param now - Evaluation clock. Defaults to `Date.now()`.
 * @returns A frozen snapshot, or `undefined` for a response that could not
 * be read.
 * @internal
 */
export const snapshotFromPrefetchedInit = function snapshotFromPrefetchedInit(
	prefetched: PrefetchedInitialData | undefined,
	options: DeferredSnapshotOptions,
	now: number = Date.now()
): ConsentSnapshot | undefined {
	const config = configFromPrefetchedInit(prefetched, options.overrides, now);
	if (!config) {
		return undefined;
	}
	try {
		return buildInitialSnapshot({ ...baseConfig(options), ...config });
	} catch {
		return undefined;
	}
};
