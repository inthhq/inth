import { getSurfaceSession, resolveOptOutReceipt } from '@inth/sdk/engine';
import type {
	ConsentSnapshot,
	SurfaceSession,
	SurfaceSessionState,
} from '@inth/sdk/engine';
import {
	getOptOutReceiptData,
	getServerOptOutReceiptData,
	subscribeOptOutReceiptData,
} from '@inth/sdk/surface-actions';
import { resolveRightsBundle } from '@inth/sdk/surface-state';
import type { OptOutReceiptData, RightsBundle } from '@inth/sdk/surface-state';
import { onMounted, onScopeDispose, shallowRef } from 'vue';
import type { ShallowRef } from 'vue';

import { useConsentKernel } from '../../composables/kernel';

/**
 * The kernel's surface session and its current state. Every Privacy
 * Choices part on the page reads the same session, so a confirmation or an
 * expanded panel is cleared on the same transitions everywhere (PERM-16).
 *
 * @internal
 */
export const useSurfaceSession = function useSurfaceSession(): {
	session: SurfaceSession;
	state: ShallowRef<SurfaceSessionState>;
} {
	const session = getSurfaceSession(useConsentKernel());
	const state = shallowRef(session.getState());
	// The server renders the state it starts with; only the browser follows.
	if (typeof window !== 'undefined') {
		onScopeDispose(
			session.subscribe(() => {
				state.value = session.getState();
			})
		);
	}
	return { session, state };
};

/**
 * This browser's local opt-out receipt data, which says whether a backend
 * answer confirmed the held record's rights.
 *
 * It starts from the server's copy, which the server rendered with, so
 * hydration matches the HTML, and reads the browser's own once mounted, as
 * React's `useSyncExternalStore` does. A browser render that hydrates
 * nothing switches before it paints.
 *
 * @internal
 */
export const useOptOutReceiptData = function useOptOutReceiptData(): ShallowRef<
	Readonly<OptOutReceiptData>
> {
	const kernel = useConsentKernel();
	const local = shallowRef(getServerOptOutReceiptData(kernel));
	let stop: (() => void) | undefined;
	onMounted(() => {
		local.value = getOptOutReceiptData(kernel);
		stop = subscribeOptOutReceiptData(kernel, () => {
			local.value = getOptOutReceiptData(kernel);
		});
	});
	onScopeDispose(() => stop?.());
	return local;
};

/**
 * The rights bundle the sale row names (COPY-01, SR-04): the confirmed
 * rights of a held opt-out, else sale, sharing and targeted ads, which
 * every US preset covers. The rights count as confirmed only through the
 * local receipt data, so it must be passed.
 *
 * @internal
 */
export const rightsBundleOf = function rightsBundleOf(
	snapshot: Pick<ConsentSnapshot, 'optOut'>,
	local: Partial<OptOutReceiptData> | null
): RightsBundle {
	return (
		resolveRightsBundle(resolveOptOutReceipt(snapshot, local).rights) ?? 'all'
	);
};
