/**
 * Kernel snapshot selection for the hooks and the stock components. A
 * component selector reads a single derived value, so a component
 * re-renders only when that value changes. Not exported from any package
 * entry.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot } from '@inth/sdk/engine';
import { useSyncExternalStore } from 'react';

import { useKernel } from './use-kernel';
import { useServerSnapshot } from './use-server-snapshot';

/**
 * Subscribes to one slice of the kernel snapshot. React re-renders the
 * caller only when the selected value `Object.is`-differs, so a selector
 * must return a primitive or a reference the snapshot already holds.
 *
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
