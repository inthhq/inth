/**
 * Kernel access for the hooks and the stock components. Not exported
 * from any package entry.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentKernel } from '@inth/sdk/engine';
import { useContext } from 'react';

import { KernelContext } from './context';

/**
 * Reads the kernel from the nearest provider.
 *
 * @throws {Error} When called outside an `InthProvider`.
 * @internal
 */
export const useKernel = function useKernel(): ConsentKernel {
	const kernel = useContext(KernelContext);
	if (!kernel) {
		throw new Error(
			'inth: no kernel in context. Wrap your app with <InthProvider options={...}> from @inth/react.'
		);
	}
	return kernel;
};
