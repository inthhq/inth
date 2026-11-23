/**
 * The snapshot hydration renders, for `useSyncExternalStore`. Not exported
 * from any package entry.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentKernel, ConsentSnapshot } from '@inth/sdk/engine';
import { useContext } from 'react';

import { HydrationSnapshotContext } from './context';

/**
 * Reads the snapshot hydration renders: the kernel's server snapshot, or,
 * inside a streamed consent surface, the snapshot the server rendered that
 * surface from.
 *
 * @returns A `getServerSnapshot` for `useSyncExternalStore`.
 * @internal
 */
export const useServerSnapshot = function useServerSnapshot(
	kernel: ConsentKernel | null
): () => ConsentSnapshot | undefined {
	const streamed = useContext(HydrationSnapshotContext);
	return () => streamed ?? kernel?.getServerSnapshot();
};
