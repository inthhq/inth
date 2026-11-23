import { isPlatformBrowser } from '@angular/common';
import {
	ApplicationRef,
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
import type { OptOutReceiptData, RightsBundle } from '@inth/sdk/surface-state';

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

/** A Privacy Choices banner the server rendered and the browser hydrates. */
const SERVER_RENDERED_PROMPT =
	'[data-testid="consent-banner-root"][data-design="privacy-choices"]';

/**
 * Whether the phone layout applies (`PHONE_LAYOUT_QUERY`). The server
 * renders desktop, and so does the browser over a server-rendered prompt
 * until the application is stable, after hydration; a
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
	// Over server markup, the desktop layout holds until the application is
	// stable, which is when hydration has finished: a switch before then
	// would render markup the server did not send.
	let ready = !hydrating;
	const sync = () => {
		if (ready) {
			phone.set(query.matches);
		}
	};
	if (hydrating) {
		// oxlint-disable-next-line promise/prefer-await-to-then -- Fire and forget inside an injection context.
		void inject(ApplicationRef)
			.whenStable()
			.then(() => {
				ready = true;
				sync();
			});
	}
	query.addEventListener('change', sync);
	inject(DestroyRef).onDestroy(() => {
		ready = false;
		query.removeEventListener('change', sync);
	});
	return phone.asReadonly();
};
