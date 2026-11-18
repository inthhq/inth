import { createLazyIABFactory } from '@inth/sdk/runtime';
import { mountRuntimeIAB } from '@inth/sdk/runtime/on-demand';

import type { PageIAB } from '../client';

/**
 * The IAB wiring the integration's boot script registers for a site that
 * sets `iab`. Suites that boot an IAB site without the boot script register
 * it themselves.
 *
 * @returns A fresh lazy factory and the runtime mount.
 */
export const createTestPageIAB = function createTestPageIAB(): PageIAB {
	return {
		...createLazyIABFactory(() => import('@inth/sdk/iab')),
		mount: mountRuntimeIAB,
	};
};
