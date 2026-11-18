'use client';

import { useSyncExternalStore } from 'react';

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

const subscribeToReducedMotion = (onStoreChange: () => void) => {
	if (typeof window === 'undefined') {
		return () => undefined;
	}

	const mediaQuery = window.matchMedia(reducedMotionQuery);
	mediaQuery.addEventListener('change', onStoreChange);
	return () => mediaQuery.removeEventListener('change', onStoreChange);
};

const getReducedMotionSnapshot = () =>
	typeof window !== 'undefined' &&
	window.matchMedia(reducedMotionQuery).matches;

const getServerSnapshot = () => false;

/**
 * Hook to detect if the user prefers reduced motion.
 *
 * The hook returns `false` during SSR to avoid hydration mismatches,
 * then updates to the actual preference on the client.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const prefersReducedMotion = useReducedMotion();
 *
 *   return (
 *     <motion.div
 *       animate={prefersReducedMotion ? {} : { scale: 1.1 }}
 *     />
 *   );
 * }
 * ```
 *
 * @public
 */
export const useReducedMotion = function useReducedMotion(): boolean {
	return useSyncExternalStore(
		subscribeToReducedMotion,
		getReducedMotionSnapshot,
		getServerSnapshot
	);
};
