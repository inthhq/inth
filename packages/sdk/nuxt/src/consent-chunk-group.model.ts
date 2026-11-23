import { basename, dirname } from 'node:path';

import {
	CONSENT_CHUNK_GROUP,
	CORE_SURFACE_CONFIG_MODULES,
	coreModulePattern,
} from '@inth/sdk/build';
import type { ConsentChunkGroup } from '@inth/sdk/build';

const escapeRegExp = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/**
 * Core's Inth chunk group, also matching the given package directories:
 * the Inth modules the entry imports statically go into one chunk, not one
 * small chunk for each module the consent engine shares with the first
 * load.
 *
 * @param dirs - Real package directories, from `consentPackageDirs`.
 * @internal
 */
export const nuxtConsentChunkGroup = function nuxtConsentChunkGroup(
	dirs: readonly string[]
): ConsentChunkGroup {
	if (dirs.length === 0) {
		return CONSENT_CHUNK_GROUP;
	}
	// Vite names modules with `/` on every platform.
	const own = dirs
		.map((dir) => `${escapeRegExp(dir.replaceAll('\\', '/'))}/`)
		.join('|');
	return {
		...CONSENT_CHUNK_GROUP,
		test: new RegExp(`${CONSENT_CHUNK_GROUP.test.source}|^(?:${own})`, 'u'),
	};
};

/**
 * Modules every stock surface reads: the ones behind `useConsentConfig`
 * (the config composable, theme slots, slot attributes, the schema
 * defaults and the experiment theme merge) and the policy actions.
 */
const CONFIG_MODULES = `(?:(?:vue/dist/runtime/composables/config|vue/dist/runtime/utils/slot-attrs|ui/dist/utils/theme-slots|schema/dist/config/defaults)\\.js$|${coreModulePattern(CORE_SURFACE_CONFIG_MODULES)})`;

/**
 * Keeps the modules every stock surface reads in one chunk. They leave the
 * first load (see {@link nuxtConsentChunkGroup}), and the dialog and the
 * consent engine both import them, so Rolldown would otherwise split them
 * into several small chunks the dialog fetches after a Customize tap. On a
 * page whose first load still holds connections, each extra request can
 * cost a round trip before the dialog shows.
 *
 * @returns The group; list it after {@link nuxtConsentChunkGroup}, which
 * keeps any of these modules a first load imports.
 * @internal
 */
export const nuxtConsentConfigChunkGroup = function nuxtConsentConfigChunkGroup(
	dirs: readonly string[]
): ConsentChunkGroup {
	// `CONFIG_MODULES` starts with the folder name: `vue/…` for @inth/vue,
	// matched from the directory's parent, and `ui/…`, `core/…` for the
	// parts @inth/sdk ships under its `lib/`.
	const parents = dirs.map((dir) => {
		const posix = dir.replaceAll('\\', '/');
		return `${escapeRegExp(basename(posix) === 'sdk' ? `${posix}/lib` : dirname(posix))}/`;
	});
	const roots = [
		'[\\\\/]node_modules[\\\\/]@inth[\\\\/](?:sdk[\\\\/]lib[\\\\/])?',
		...parents.map((parent) => `^${parent}`),
	].join('|');
	return {
		entriesAware: false,
		includeDependenciesRecursively: false,
		name: 'inth-config',
		tags: [],
		test: new RegExp(`(?:${roots})${CONFIG_MODULES}`, 'u'),
	};
};
