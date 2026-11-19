/**
 * The dialog's scroll lock and focus trap, and the hook that lends them to
 * `inth.dialog.js` (see `./locks-shared.ts`).
 *
 * @packageDocumentation
 * @internal
 */

import { setupFocusTrap, setupScrollLock } from '@inth/sdk-ui/utils';

import { LOCKS_KEY } from './locks-shared';
import type { SharedLocks } from './locks-shared';

export { setupFocusTrap, setupScrollLock };

/**
 * Lend this bundle's scroll lock and focus trap to `inth.dialog.js`, so the
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
