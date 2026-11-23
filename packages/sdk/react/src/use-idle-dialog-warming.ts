/**
 * Idle warming for the deferred `ConsentDialog`: a component that can open
 * the dialog soon holds a gate open, and the dialog's chunk loads in the
 * browser's first idle period after the page's load event while a gate is
 * open (`warm-dialog-chunk.ts`).
 *
 * @packageDocumentation
 * @internal
 */

import { useEffect } from 'react';

import { useUIConfig } from './use-ui-config';
import { holdIdleWarmingGate } from './warm-dialog-chunk';

/**
 * Hold an idle-warming gate open while `active`: the dialog loads in the next
 * idle period after the page's load event, if a gate is still open then.
 * Consumers opt out with `preloadDialog: 'intent'`.
 *
 * @param active - Whether the dialog can be opened soon from this component,
 * for example because the banner is shown or a trigger is mounted.
 * @internal
 */
export const useIdleDialogWarming = function useIdleDialogWarming(
	active: boolean
): void {
	const { preloadDialog = 'idle' } = useUIConfig();
	const enabled = active && preloadDialog === 'idle';
	useEffect(() => {
		if (!enabled) {
			return;
		}
		return holdIdleWarmingGate();
	}, [enabled]);
};
