/**
 * Reactive read of the kernel's surface session that the prompt's and
 * dialog's parts share. The React port's `use-surface-session`.
 */
import { getSurfaceSession } from '@inth/sdk/engine';
import type { SurfaceSession, SurfaceSessionState } from '@inth/sdk/engine';

import { getConsentContext } from '../../get-consent-context.svelte';

/** The kernel's surface session and its current state. */
export interface SurfaceSessionRead {
	readonly session: SurfaceSession;
	readonly state: SurfaceSessionState;
}

/**
 * The kernel's surface session and its current state. Every Privacy
 * Choices part on the page reads the same session, so a confirmation or an
 * expanded panel is cleared on the same transitions everywhere (PERM-16).
 *
 * Call while a component initializes.
 *
 * @internal
 */
export const useSurfaceSession =
	function useSurfaceSession(): SurfaceSessionRead {
		const consent = getConsentContext();
		const session = $derived(getSurfaceSession(consent.kernel));
		let state = $state.raw<SurfaceSessionState>(
			getSurfaceSession(consent.kernel).getState()
		);
		$effect.pre(() => {
			const current = session;
			state = current.getState();
			return current.subscribe(() => {
				state = current.getState();
			});
		});
		return {
			get session() {
				return session;
			},
			get state() {
				return state;
			},
		};
	};
