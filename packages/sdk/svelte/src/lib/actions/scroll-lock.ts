import { setupScrollLock } from '@inth/sdk/ui/utils';

/**
 * Svelte action that locks document scrolling when enabled.
 * Wraps @inth/sdk/ui's framework-agnostic setupScrollLock.
 */
export const scrollLock = function scrollLock(
	_node: HTMLElement,
	enabled = true
) {
	let cleanup: (() => void) | undefined;

	if (enabled) {
		cleanup = setupScrollLock();
	}

	return {
		destroy() {
			cleanup?.();
		},
		update(newEnabled: boolean) {
			cleanup?.();
			cleanup = undefined;
			if (newEnabled) {
				cleanup = setupScrollLock();
			}
		},
	};
};
