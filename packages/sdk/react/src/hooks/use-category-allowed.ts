import type { AllConsentNames } from '@inth/sdk/engine';
import { evaluateConsent } from '@inth/sdk/engine';

import { useGateSelector } from '../use-kernel-selector';

/**
 * Whether content gated on one category may render, with the kernel's gate
 * semantics. Server rendering and hydration read no clock; see
 * `useGateSelector`.
 *
 * @internal
 */
export const useCategoryAllowed = function useCategoryAllowed(
	category: AllConsentNames
): boolean {
	return useGateSelector((snap, now) =>
		evaluateConsent({ category }, snap, now)
	);
};
