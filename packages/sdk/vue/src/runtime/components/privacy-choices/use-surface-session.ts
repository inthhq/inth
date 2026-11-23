import { getSurfaceSession, resolveOptOutReceipt } from '@inth/sdk/engine';
import type {
	ConsentSnapshot,
	SurfaceSession,
	SurfaceSessionState,
} from '@inth/sdk/engine';
import { resolveRightsBundle } from '@inth/sdk/surface-state';
import type { RightsBundle } from '@inth/sdk/surface-state';
import { onScopeDispose, shallowRef } from 'vue';
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
 * The rights bundle the sale row names (COPY-01): the confirmed rights of a
 * held opt-out, else sale, sharing and targeted ads, which every US preset
 * covers.
 *
 * @internal
 */
export const rightsBundleOf = function rightsBundleOf(
	snapshot: ConsentSnapshot
): RightsBundle {
	return resolveRightsBundle(resolveOptOutReceipt(snapshot).rights) ?? 'all';
};
