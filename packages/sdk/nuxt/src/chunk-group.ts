import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';

import {
	CONSENT_CHUNK_GROUP,
	consentChunkGroupsConfig,
	shouldGroupConsentChunks,
} from '@inth/sdk/build';
import type {
	ConsentChunkGroup,
	ConsentManifestConfigContext,
	ConsentManifestUserConfig,
} from '@inth/sdk/build';
import type { Plugin, UserConfig } from 'vite';

/**
 * The c15t packages a Nuxt app's client bundle can reach, each with a
 * specifier that resolves (none exports its `package.json`).
 */
const CONSENT_PACKAGES = [
	['@inth/sdk', '@inth/sdk/engine'],
	['@inth/vue', '@inth/vue'],
] as const;

/** The directory of the nearest `package.json` named `name` above `file`. */
const packageRoot = function packageRoot(
	file: string,
	name: string
): string | undefined {
	let dir = dirname(file);
	while (dir !== dirname(dir)) {
		const manifest = join(dir, 'package.json');
		if (existsSync(manifest)) {
			try {
				if (
					(JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string })
						.name === name
				) {
					return dir;
				}
			} catch {
				// Not JSON: keep looking.
			}
		}
		dir = dirname(dir);
	}
	return undefined;
};

const escapeRegExp = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/**
 * The real directory of each c15t package this module resolves, the way
 * Vite names their modules. A workspace or linked install resolves outside
 * `node_modules`, where core's group test would not find them.
 *
 * @param from - A file inside `@inth/vue`.
 * @returns One directory per package that resolves.
 * @internal
 */
export const consentPackageDirs = function consentPackageDirs(
	from: string
): string[] {
	const require = createRequire(from);
	const dirs: string[] = [];
	for (const [name, specifier] of CONSENT_PACKAGES) {
		try {
			const root = packageRoot(require.resolve(specifier), name);
			if (root) {
				dirs.push(realpathSync(root));
			}
		} catch {
			// Not installed: core's test covers an installed copy anyway.
		}
	}
	return dirs;
};

/**
 * Core's c15t chunk group, also matching the given package directories:
 * the c15t modules the entry imports statically go into one chunk, not one
 * small chunk for each module the consent engine shares with the first
 * load.
 *
 * @param dirs - Real package directories, from {@link consentPackageDirs}.
 * @returns The group.
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
const CONFIG_MODULES =
	'(?:vue/dist/runtime/composables/config|vue/dist/runtime/utils/slot-attrs|ui/dist/utils/theme-slots|schema/dist/config/defaults|core/dist/libs/experiment-presentation|core/dist/libs/policy-actions)\\.js$';

/**
 * Keeps the modules every stock surface reads in one chunk. They leave the
 * first load (see {@link nuxtConsentChunkGroup}), and the dialog and the
 * consent engine both import them, so Rolldown would otherwise split them
 * into several small chunks the dialog fetches after a Customize tap. On a
 * page whose first load still holds connections, each extra request can
 * cost a round trip before the dialog shows.
 *
 * @param dirs - Real package directories.
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
		name: 'c15t-config',
		tags: [],
		test: new RegExp(`(?:${roots})${CONFIG_MODULES}`, 'u'),
	};
};

/**
 * A client-build Vite plugin that adds {@link nuxtConsentChunkGroup}, when
 * the Rolldown in use supports it and the app sets no chunking of its own.
 *
 * @param dirs - Real package directories.
 * @returns The Vite plugin.
 * @internal
 */
export const groupConsentChunks = function groupConsentChunks(
	dirs: readonly string[]
): Plugin {
	return {
		apply: 'build',
		config(config, env) {
			if (
				!shouldGroupConsentChunks(
					this as unknown as ConsentManifestConfigContext | undefined,
					config as ConsentManifestUserConfig,
					env
				)
			) {
				return;
			}
			// Nuxt 5, and Nuxt 4 with `compatibilityVersion: 5`, share this
			// config between the client and the server build: the groups go to
			// the client environment there.
			// Cast: the Vite types an app installs may predate Rolldown's
			// `codeSplitting` groups or their `tags`; the version check above
			// covers the Rolldown that runs.
			return consentChunkGroupsConfig(config as ConsentManifestUserConfig, [
				nuxtConsentChunkGroup(dirs),
				nuxtConsentConfigChunkGroup(dirs),
			]) as unknown as UserConfig;
		},
		name: '@inth/nuxt:chunk-group',
	};
};
