import type * as IabtechlabtcfCoreTypes from '@iabtechlabtcf/core';
/**
 * Loads `@iabtechlabtcf/core` (about 50KB) on first use, so pages that never
 * encode or decode a TC string never download it.
 *
 * @packageDocumentation
 */

export type TCFCoreModule = typeof IabtechlabtcfCoreTypes;

let tcfCoreModule: TCFCoreModule | null = null;

let loadingPromise: Promise<TCFCoreModule> | null = null;

/** @public */
export const getTCFCore = function getTCFCore(): Promise<TCFCoreModule> {
	if (tcfCoreModule) {
		return Promise.resolve(tcfCoreModule);
	}

	if (loadingPromise) {
		return loadingPromise;
	}

	loadingPromise = (async () => {
		try {
			const module = await import('@iabtechlabtcf/core');
			tcfCoreModule = module;
			loadingPromise = null;
			return module;
		} catch (error) {
			loadingPromise = null;
			throw new Error(
				`Failed to load @iabtechlabtcf/core: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
					'Make sure it is installed as a dependency.',
				{ cause: error }
			);
		}
	})();

	return loadingPromise;
};
