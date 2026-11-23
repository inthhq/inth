/**
 * Reactive reads the prompt's and dialog's parts share: the kernel's
 * surface session, the phone layout, and the rights bundle the sale row
 * names. The React port's `use-surface-session` and `use-phone-layout`.
 */
import {
	getSurfaceSession,
	PHONE_LAYOUT_QUERY,
	resolveOptOutReceipt,
} from '@inth/sdk/engine';
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
import {
	prefersReducedMotion,
	subscribeReducedMotion,
} from '@inth/sdk/ui/utils';

import { getConsentContext } from '../../context.svelte';

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

/**
 * This browser's local opt-out receipt data, which says whether a backend
 * answer confirmed the held record's rights.
 *
 * It starts from the data the server rendered with, so hydration adopts
 * the server's markup, and follows this browser's own data once mounted,
 * as React's `useSyncExternalStore` does.
 *
 * Call while a component initializes.
 *
 * @internal
 */
export const useOptOutReceiptData = function useOptOutReceiptData(): {
	readonly current: Readonly<OptOutReceiptData>;
} {
	const consent = getConsentContext();
	let current = $state.raw(getServerOptOutReceiptData(consent.kernel));
	$effect(() => {
		const { kernel } = consent;
		current = getOptOutReceiptData(kernel);
		return subscribeOptOutReceiptData(kernel, () => {
			current = getOptOutReceiptData(kernel);
		});
	});
	return {
		get current() {
			return current;
		},
	};
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

/**
 * Whether the phone layout applies. The server renders desktop; the
 * browser switches once mounted, keeping every node (ARCH-01).
 *
 * Call while a component initializes.
 *
 * @internal
 */
export const usePhoneLayout = function usePhoneLayout(): {
	readonly phone: boolean;
} {
	let phone = $state(false);
	// After mount, so hydration adopts the server's desktop markup first.
	$effect(() => {
		if (typeof window === 'undefined' || !window.matchMedia) {
			return;
		}
		const query = window.matchMedia(PHONE_LAYOUT_QUERY);
		phone = query.matches;
		const listener = () => {
			phone = query.matches;
		};
		query.addEventListener('change', listener);
		return () => query.removeEventListener('change', listener);
	});
	return {
		get phone() {
			return phone;
		},
	};
};

/**
 * Whether the visitor's system asks for reduced motion. Off on the server
 * and until mounted, so hydration adopts the server's markup.
 *
 * Call while a component initializes.
 *
 * @internal
 */
export const useReducedMotion = function useReducedMotion(): {
	readonly reduced: boolean;
} {
	let reduced = $state(false);
	$effect(() => {
		reduced = prefersReducedMotion();
		return subscribeReducedMotion((next) => {
			reduced = next;
		});
	});
	return {
		get reduced() {
			return reduced;
		},
	};
};
