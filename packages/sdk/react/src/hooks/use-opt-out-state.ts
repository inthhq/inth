import { resolveOptOutState } from '@inth/sdk/surface-state';
import type { ResolvedOptOutState } from '@inth/sdk/surface-state';
import { useMemo } from 'react';

import { useKernelSelector } from '../kernel-selector';

/**
 * Derive the opt-out display state from the current snapshot: whether an
 * opt-out is available, whether one is honored, how it was recorded, why this
 * browser cannot lift it right now, which categories it switches off, and the
 * earliest time an opt-in prompt is allowed.
 *
 * @returns The resolved opt-out state.
 * @public
 */
export const useOptOutState = function useOptOutState(): ResolvedOptOutState {
	const evaluationPolicy = useKernelSelector(
		(snapshot) => snapshot.evaluationPolicy
	);
	const optOut = useKernelSelector((snapshot) => snapshot.optOut);
	const privacySignals = useKernelSelector(
		(snapshot) => snapshot.privacySignals
	);
	return useMemo(
		() => resolveOptOutState({ evaluationPolicy, optOut, privacySignals }),
		[evaluationPolicy, optOut, privacySignals]
	);
};
