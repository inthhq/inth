'use client';

import { useEffect, useState } from 'react';

const DURATION_VARIABLE = '--iab-cd-animation-duration';

/** The exit time the IAB dialog's stylesheet sets, in ms; 150 without one. */
const exitDuration = (): number =>
	Number.parseInt(
		getComputedStyle(document.documentElement).getPropertyValue(
			DURATION_VARIABLE
		) || '150',
		10
	);

/**
 * Whether an IAB dialog part shows as visible: on the frame after it
 * opens, and until its exit transition, which `--iab-cd-animation-duration`
 * times, has run after it closes.
 *
 * @internal
 */
export const useExitTransition = function useExitTransition(
	isOpen: boolean,
	disableAnimation: boolean | undefined
): boolean {
	const [isVisible, setIsVisible] = useState(false);
	useEffect(() => {
		if (isOpen || disableAnimation) {
			const frame = requestAnimationFrame(() => setIsVisible(isOpen));
			return () => cancelAnimationFrame(frame);
		}
		const timer = setTimeout(() => setIsVisible(false), exitDuration());
		return () => clearTimeout(timer);
	}, [isOpen, disableAnimation]);
	return isVisible;
};
