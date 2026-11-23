/**
 * Gate selection at a point in time for the hooks and the stock
 * components. Not exported from any package entry.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot } from '@inth/sdk/engine';
import { useSyncExternalStore } from 'react';

import { useKernel } from './use-kernel';
import { useServerSnapshot } from './use-server-snapshot';

/**
 * Like `useKernelSelector`, for selectors that evaluate a gate at a point in
 * time. The server render and hydration evaluate at the snapshot's own
 * `evaluatedAt`, so they never read the clock: a Next.js `cacheComponents`
 * prerender rejects `Date.now()` in a Client Component. In the browser the
 * gate is evaluated at `Date.now()`, so an expiry the kernel's deadline
 * timer has not processed yet still denies.
 *
 * @param selector - Picks the slice from a snapshot at the given time.
 * @internal
 */
export const useGateSelector = function useGateSelector<SliceType>(
	selector: (snap: ConsentSnapshot, now: number) => SliceType
): SliceType {
	const kernel = useKernel();
	const serverSnapshot = useServerSnapshot(kernel);
	return useSyncExternalStore(
		(listener) => kernel.subscribe(listener),
		() => selector(kernel.getSnapshot(), Date.now()),
		() => {
			const snap = serverSnapshot() as ConsentSnapshot;
			return selector(snap, snap.evaluatedAt);
		}
	);
};
