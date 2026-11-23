import { isPlatformBrowser } from '@angular/common';
import {
	computed,
	DestroyRef,
	effect,
	inject,
	linkedSignal,
	PLATFORM_ID,
	signal,
	untracked,
} from '@angular/core';
import type { Signal } from '@angular/core';
import { getSurfaceSession } from '@inth/sdk/engine';
import type {
	ConsentSnapshot,
	SurfaceSession,
	SurfaceSessionState,
} from '@inth/sdk/engine';
import {
	PHONE_LAYOUT_QUERY,
	resolveOptOutReceipt,
	resolveRightsBundle,
} from '@inth/sdk/surface-state';
import type { RightsBundle } from '@inth/sdk/surface-state';

import { ConsentManager } from '../core/consent-manager';

/** The kernel's surface session and its current state, as signals. */
export interface SurfaceSessionSignals {
	readonly session: Signal<SurfaceSession>;
	readonly state: Signal<SurfaceSessionState>;
}

/**
 * The kernel's surface session and its current state. Every Privacy
 * Choices part on the page reads the same session, so a confirmation or an
 * expanded panel is cleared on the same transitions everywhere (PERM-16).
 * Call it in an injection context.
 *
 * @internal
 */
export const injectSurfaceSession =
	function injectSurfaceSession(): SurfaceSessionSignals {
		const consent = inject(ConsentManager);
		const session = computed(() => getSurfaceSession(consent.kernel()));
		const state = linkedSignal(() => session().getState());
		effect((onCleanup) => {
			const current = session();
			untracked(() => state.set(current.getState()));
			onCleanup(
				current.subscribe(() => {
					state.set(current.getState());
				})
			);
		});
		return { session, state: state.asReadonly() };
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

/** A Privacy Choices banner the server rendered and the browser hydrates. */
const SERVER_RENDERED_PROMPT =
	'[data-testid="consent-banner-root"][data-design="privacy-choices"]';

/**
 * Whether the phone layout applies (`PHONE_LAYOUT_QUERY`). The server
 * renders desktop, and so does the browser's first render over a
 * server-rendered prompt, which it then switches after hydration; a
 * browser-only render reads the viewport at once. Call it in an injection
 * context.
 *
 * @internal
 */
export const injectPhoneLayout = function injectPhoneLayout(): Signal<boolean> {
	if (!isPlatformBrowser(inject(PLATFORM_ID))) {
		return signal(false).asReadonly();
	}
	if (typeof window.matchMedia !== 'function') {
		return signal(false).asReadonly();
	}
	const query = window.matchMedia(PHONE_LAYOUT_QUERY);
	const hydrating = document.querySelector(SERVER_RENDERED_PROMPT) !== null;
	const phone = signal(hydrating ? false : query.matches);
	const sync = () => phone.set(query.matches);
	if (hydrating) {
		queueMicrotask(sync);
	}
	query.addEventListener('change', sync);
	inject(DestroyRef).onDestroy(() => query.removeEventListener('change', sync));
	return phone.asReadonly();
};
