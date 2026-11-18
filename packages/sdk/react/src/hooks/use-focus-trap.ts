'use client';

import { setupFocusTrap } from '@inth/sdk/ui/utils/dom';
import type { FocusTrapOptions } from '@inth/sdk/ui/utils/dom';
import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Hook that manages focus trapping within a container.
 *
 * @param options - Where the trap puts focus when it starts
 *
 * @public
 */
export const useFocusTrap = function useFocusTrap(
	shouldTrap: boolean,
	containerRef: RefObject<HTMLElement | null> | null,
	options?: FocusTrapOptions
): void {
	const initialFocus = options?.initialFocus;
	useEffect(() => {
		if (!shouldTrap || !containerRef || !containerRef.current) {
			return;
		}

		return setupFocusTrap(containerRef.current, { initialFocus });
	}, [shouldTrap, containerRef, initialFocus]);
};
