import { isPlatformBrowser } from '@angular/common';
import { effect, inject, PLATFORM_ID, signal, untracked } from '@angular/core';
import type { Signal } from '@angular/core';
import { isLateEntry } from '@c15t/ui/utils/late-entry';

/** The banner's mount and visibility state. @internal */
export interface BannerVisibility {
	/** Keep the banner's elements in the DOM. */
	readonly shouldRender: Signal<boolean>;
	/** Show the banner. */
	readonly isVisible: Signal<boolean>;
	/** The banner mounted after the page painted, so it fades in. */
	readonly lateEntry: Signal<boolean>;
}

/**
 * Mount and visibility lifecycle for the consent banner. Call it in an
 * injection context.
 *
 * - On show: mounts in the visible state, so it shows on its first frame.
 *   A mount after the page has painted reports `lateEntry`.
 * - On hide: unmounts at once, as `@c15t/react`'s banner does. A choice
 *   frees the page in the next frame, which is what CookieBench's
 *   `action.dismissed` times; a fade-out would hold the banner's area for
 *   its duration.
 * - Server render: when the first evaluation already says "show", the
 *   banner starts mounted and visible, so it is part of the first paint.
 *
 * @param shouldShow - Whether the banner should show.
 * @returns The visibility signals.
 * @internal
 */
export const bannerVisibility = function bannerVisibility(
	shouldShow: () => boolean
): BannerVisibility {
	const initial = untracked(shouldShow);
	const isVisible = signal(initial);
	const shouldRender = signal(initial);
	const lateEntry = signal(false);
	const browser = isPlatformBrowser(inject(PLATFORM_ID));

	effect(() => {
		const show = shouldShow();
		if (show) {
			if (!untracked(shouldRender)) {
				// Decided once per mount, as the element is about to render.
				lateEntry.set(browser && isLateEntry());
			}
			shouldRender.set(true);
			isVisible.set(true);
			return;
		}
		isVisible.set(false);
		shouldRender.set(false);
	});

	return {
		isVisible: isVisible.asReadonly(),
		lateEntry: lateEntry.asReadonly(),
		shouldRender: shouldRender.asReadonly(),
	};
};
