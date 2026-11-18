'use client';

import { setupScrollLock } from '@inth/sdk/ui/utils/dom';
import { useEffect } from 'react';

/**
 * Locks page scroll while `shouldLock` is true, as the stock banner does
 * when its policy is blocking.
 *
 * @remarks
 * Locks are counted, so a banner and a dialog can both hold one and the page
 * scrolls again only when both release. Unmounting releases the lock.
 *
 * @example
 * ```tsx
 * const { banner } = useHeadlessConsentUI();
 * useScrollLock(banner.isVisible && banner.blocking);
 * ```
 *
 * @public
 */
export const useScrollLock = function useScrollLock(shouldLock: boolean): void {
	useEffect(() => {
		if (shouldLock) {
			return setupScrollLock();
		}
	}, [shouldLock]);
};
