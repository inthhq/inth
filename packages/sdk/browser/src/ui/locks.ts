/**
 * The dialog's scroll lock and focus trap, and the hook that lends them to
 * `c15t.dialog.js` (see `./locks-shared.ts`).
 *
 * @packageDocumentation
 * @internal
 */

import { setupFocusTrap, setupScrollLock } from '@c15t/ui/utils';

import { LOCKS_KEY } from './locks-shared';
import type { SharedLocks } from './locks-shared';

export { setupFocusTrap, setupScrollLock };

/**
 * Lend this bundle's scroll lock and focus trap to `c15t.dialog.js`, so the
 * dialog counts its lock with this bundle's banner.
 *
 * @internal
 */
export const shareLocks = function shareLocks(): void {
	(window as unknown as Record<string, SharedLocks>)[LOCKS_KEY] = {
		setupFocusTrap,
		setupScrollLock,
	};
};
