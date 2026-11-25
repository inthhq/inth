import { importChunk } from '@inth/sdk/runtime/import-chunk';

/**
 * Import a component's chunk with `load`, so that a retry on the same page
 * can load it again (see `importChunk`). A module loaded again from the
 * chunk's URL counts only when it exports the component as its default.
 *
 * @param load - Imports the chunk, as `() => import('./part.vue')`.
 * @returns The chunk's module. Rejects with `load`'s error when the chunk
 * did not load.
 * @internal
 */
export const importComponent = function importComponent<
	Module extends { default?: unknown },
>(load: () => Promise<Module>): Promise<Module> {
	return importChunk(load, (module) =>
		module.default === undefined ? undefined : module
	);
};
