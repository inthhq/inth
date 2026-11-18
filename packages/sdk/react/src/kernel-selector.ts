/**
 * Kernel access for the hooks and the stock components. The component
 * selectors below each read a single derived value, so a component
 * re-renders only when that value changes. Not exported from any package
 * entry.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentKernel, ConsentSnapshot } from '@inth/sdk/engine';
import { useContext, useSyncExternalStore } from 'react';

import { HydrationSnapshotContext, KernelContext } from './context';

/**
 * Reads the kernel from the nearest provider.
 *
 * @returns The provider's kernel.
 * @throws {Error} When called outside a `ConsentProvider`.
 * @internal
 */
export const useKernel = function useKernel(): ConsentKernel {
	const kernel = useContext(KernelContext);
	if (!kernel) {
		throw new Error(
			'c15t: no kernel in context. Wrap your app with <ConsentProvider options={...}> from @inth/react.'
		);
	}
	return kernel;
};

/**
 * Reads the snapshot hydration renders: the kernel's server snapshot, or,
 * inside a streamed consent surface, the snapshot the server rendered that
 * surface from.
 *
 * @param kernel - The provider's kernel.
 * @returns A `getServerSnapshot` for `useSyncExternalStore`.
 * @internal
 */
export const useServerSnapshot = function useServerSnapshot(
	kernel: ConsentKernel | null
): () => ConsentSnapshot | undefined {
	const streamed = useContext(HydrationSnapshotContext);
	return () => streamed ?? kernel?.getServerSnapshot();
};

/**
 * Subscribes to one slice of the kernel snapshot. React re-renders the
 * caller only when the selected value `Object.is`-differs, so a selector
 * must return a primitive or a reference the snapshot already holds.
 *
 * @param selector - Picks the slice from a snapshot.
 * @returns The selected slice.
 * @internal
 */
export const useKernelSelector = function useKernelSelector<SliceType>(
	selector: (snap: ConsentSnapshot) => SliceType
): SliceType {
	const kernel = useKernel();
	const serverSnapshot = useServerSnapshot(kernel);
	return useSyncExternalStore(
		(listener) => kernel.subscribe(listener),
		() => selector(kernel.getSnapshot()),
		// Hydration must render what the SERVER rendered. Client boot
		// mutations (sync persistence hydrate, eager init) can flip the live
		// snapshot before hydration completes — rendering the mutated state
		// here mismatches the server HTML and strands SSR'd consent UI as
		// unowned DOM (a banner React never removes).
		() => selector(serverSnapshot() as ConsentSnapshot)
	);
};

/**
 * Like `useKernelSelector`, for selectors that evaluate a gate at a point in
 * time. The server render and hydration evaluate at the snapshot's own
 * `evaluatedAt`, so they never read the clock: a Next.js `cacheComponents`
 * prerender rejects `Date.now()` in a Client Component. In the browser the
 * gate is evaluated at `Date.now()`, so an expiry the kernel's deadline
 * timer has not processed yet still denies.
 *
 * @param selector - Picks the slice from a snapshot at the given time.
 * @returns The selected slice.
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
