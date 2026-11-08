/**
 * The banner's focus trap and scroll lock, with their code loaded when
 * they first switch on.
 *
 * Most banners neither trap focus nor lock scrolling, so the page's
 * first-load JavaScript leaves that code out. A blocking banner loads it
 * once it mounts. The dialog keeps the synchronous actions in
 * `focus-trap.ts` and `scroll-lock.ts`: its code loads on its own.
 */

import type * as DomModule from '@c15t/ui/utils/dom';

import type { FocusTrapParams } from './focus-trap';

type DomUtils = typeof DomModule;

let domUtils: Promise<DomUtils> | undefined;
const loadDomUtils = (): Promise<DomUtils> => {
	domUtils ??= import('@c15t/ui/utils/dom');
	return domUtils;
};

/**
 * Runs `setup` while `enabled`, once its code has loaded. An update or
 * destroy before then cancels it.
 */
const lazyAction = function lazyAction<Params>(
	enabledOf: (params: Params) => boolean,
	setup: (utils: DomUtils, node: HTMLElement, params: Params) => () => void
) {
	return (node: HTMLElement, params: Params) => {
		let cleanup: (() => void) | undefined;
		let run = 0;
		const start = (next: Params) => {
			cleanup?.();
			cleanup = undefined;
			run += 1;
			const current = run;
			if (!enabledOf(next)) {
				return;
			}
			// oxlint-disable-next-line promise/prefer-await-to-then -- Fire and forget; a newer call wins.
			void loadDomUtils().then((utils) => {
				if (current === run) {
					cleanup = setup(utils, node, next);
				}
			});
		};
		start(params);
		return {
			destroy() {
				run += 1;
				cleanup?.();
			},
			update: start,
		};
	};
};

/** Traps keyboard focus in the banner while the param is true. @internal */
export const bannerFocusTrap = lazyAction<FocusTrapParams>(
	(next) => (typeof next === 'boolean' ? next : next.enabled),
	(utils, node, next) =>
		utils.setupFocusTrap(
			node,
			typeof next === 'boolean' ? {} : { initialFocus: next.initialFocus }
		)
);

/** Locks document scrolling while the param is true. @internal */
export const bannerScrollLock = lazyAction<boolean>(
	(enabled) => enabled,
	(utils) => utils.setupScrollLock()
);
