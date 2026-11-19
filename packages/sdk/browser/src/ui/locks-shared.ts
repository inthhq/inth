/**
 * The dialog's scroll lock and focus trap in `inth.dialog.js`: borrowed
 * from the bundle that loaded the file (`inth.js` or `inth.hosted.js`).
 *
 * The scroll lock is reference counted per copy of `@inth/sdk/ui`. A banner
 * that locks scrolling and the dialog must share one count, or closing
 * the dialog back to that banner gives the page its scrolling back while
 * the banner still holds the lock. `rslib.config.ts` swaps this module in
 * for `./locks` in `inth.dialog.js` only.
 *
 * @packageDocumentation
 * @internal
 */

import type {
	setupFocusTrap as FocusTrap,
	setupScrollLock as ScrollLock,
} from '@inth/sdk-ui/utils';

/** Global the loading bundle publishes its lock functions on. */
export const LOCKS_KEY = '__inthLocks';

/** What {@link LOCKS_KEY} holds. @internal */
export interface SharedLocks {
	setupFocusTrap: typeof FocusTrap;
	setupScrollLock: typeof ScrollLock;
}

const shared = (): SharedLocks | undefined =>
	(window as unknown as Record<string, SharedLocks | undefined>)[LOCKS_KEY];

const release = (): void => undefined;

/** The loading bundle's scroll lock. */
export const setupScrollLock: typeof ScrollLock = () =>
	shared()?.setupScrollLock() ?? release;

/** The loading bundle's focus trap. */
export const setupFocusTrap: typeof FocusTrap = (...args) =>
	shared()?.setupFocusTrap(...args) ?? release;
