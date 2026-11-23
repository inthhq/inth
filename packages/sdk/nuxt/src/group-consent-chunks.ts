import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import {
	consentChunkGroupsConfig,
	shouldGroupConsentChunks,
} from '@inth/sdk/build';
import type {
	ConsentManifestConfigContext,
	ConsentManifestUserConfig,
} from '@inth/sdk/build';
import type { Plugin, UserConfig } from 'vite';

import {
	nuxtConsentChunkGroup,
	nuxtConsentConfigChunkGroup,
} from './consent-chunk-group.model';

/**
 * The Inth packages a Nuxt app's client bundle can reach, each with a
 * specifier that resolves (none exports its `package.json`).
 */
const CONSENT_PACKAGES = [
	['@inth/sdk', '@inth/sdk/engine'],
	['@inth/vue', '@inth/vue'],
] as const;

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

/**
 * The real directory of each Inth package this module resolves, the way
 * Vite names their modules. A workspace or linked install resolves outside
 * `node_modules`, where core's group test would not find them.
 *
 * @param from - A file inside `@inth/vue`.
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
 * A client-build Vite plugin that adds {@link nuxtConsentChunkGroup}, when
 * the Rolldown in use supports it and the app sets no chunking of its own.
 *
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
