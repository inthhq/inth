import { IABUnavailableError, policyNeedsIAB } from '@inth/sdk/engine';
import { useContext } from 'react';

import { IABContext } from '~/context/iab-context-value';
import { useKernelSelector } from '~/kernel-selector';

/**
 * Marks that `@inth/react/iab` has loaded. A registry symbol, so a copy of
 * this module in another chunk reads the same mark.
 */
const IAB_PROVIDER_LOADED = Symbol.for('c15t.react.iab-provider');

/**
 * Callbacks waiting for `IABProvider` to load (`whenIABProviderLoads` in
 * `../deferred/boot`), under a registry symbol for the same reason.
 */
const IAB_PROVIDER_WAITERS = Symbol.for('c15t.react.iab-provider-waiters');

/**
 * Record that `IABProvider` is part of the app, and run what waited for
 * it. `@inth/react/iab` calls this when it loads.
 *
 * @internal
 */
export const markIABProviderLoaded = function markIABProviderLoaded(): void {
	const host = globalThis as Record<symbol, unknown>;
	host[IAB_PROVIDER_LOADED] = true;
	const waiters = host[IAB_PROVIDER_WAITERS] as (() => void)[] | undefined;
	Reflect.deleteProperty(host, IAB_PROVIDER_WAITERS);
	for (const waiter of waiters ?? []) {
		waiter();
	}
};

/**
 * The error the standard surfaces throw for an `iab` policy without
 * `<IABProvider>`.
 *
 * @returns A fresh {@link IABUnavailableError}.
 * @internal
 */
export const missingIABProviderError =
	function missingIABProviderError(): IABUnavailableError {
		return new IABUnavailableError(
			'no <IABProvider> is mounted',
			"Wrap your IAB consent UI in <IABProvider> from '@inth/react/iab' (or '@inth/react/iab')"
		);
	};

/**
 * Throw while rendering when the visitor's policy needs a CMP and the app
 * has none.
 *
 * The standard banner and dialog do not answer for the IAB model, so
 * without `<IABProvider>` a visitor under an `iab` policy would see no
 * consent UI at all. Throwing during render reaches error boundaries and
 * framework error overlays, on the server render and in the browser alike,
 * since both read the same snapshot.
 *
 * `<IABProvider>` usually sits beside the standard surfaces rather than
 * around them, so a missing IAB context alone does not prove the app has
 * none. The check also passes once `@inth/react/iab` has loaded.
 *
 * A custom banner or preference center that only handles opt-in and
 * opt-out should call this too, and render nothing when `useModel()` is
 * `'iab'`, as the standard surfaces do.
 *
 * @throws {IABUnavailableError} When the policy needs IAB and neither an
 * IAB context nor `@inth/react/iab` is present.
 *
 * @example
 * ```tsx
 * function Banner() {
 *   useIABPolicyGuard();
 *   const model = useModel();
 *   const { banner } = useHeadlessConsentUI();
 *   const copy = useBannerCopy();
 *   if (model === 'iab' || !banner.isVisible) return null;
 *   return <section>{copy.title}</section>;
 * }
 * ```
 * @public
 */
export const useIABPolicyGuard = function useIABPolicyGuard(): void {
	const iab = useContext(IABContext);
	const needsIAB = useKernelSelector(policyNeedsIAB);
	if (
		needsIAB &&
		iab === null &&
		(globalThis as Record<symbol, unknown>)[IAB_PROVIDER_LOADED] !== true
	) {
		throw missingIABProviderError();
	}
};
