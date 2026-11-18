'use client';

import {
	prefersReducedMotion,
	subscribeReducedMotion,
} from '@inth/sdk/ui/utils/reduced-motion';
import { useSyncExternalStore } from 'react';

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
		subscribeReducedMotion,
		prefersReducedMotion,
		getServerSnapshot
	);
};
