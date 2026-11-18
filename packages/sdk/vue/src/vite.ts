import { createConsentManifestPlugin } from '@inth/sdk/build';
import type {
	ConsentManifestPlugin,
	ConsentManifestPluginOptions,
} from '@inth/sdk/build';

import { VITE_PROJECT_URL_ENV } from './runtime/env-names';

export type {
	ConsentManifest,
	ConsentManifestPluginOptions,
	ManifestBuildErrorMode,
	ManifestBuildOptions,
} from '@inth/sdk/build';

/**
 * Packages that ship `.vue` files. Vite's dependency pre-bundling cannot
 * load them, so they stay out of it, along with the `inth` umbrella that
 * re-exports them.
 */
const VUE_SOURCE_PACKAGES = ['@inth/vue', 'inth'];

/** What {@link consentManifest} returns: one Vite plugin. */
export type VueConsentManifestPlugin = Omit<ConsentManifestPlugin, 'config'> & {
	config: () => ReturnType<ConsentManifestPlugin['config']>;
};

/**
 * The Inth Vite plugin for a plain Vue app. It serves the deployment's
 * consent manifest and backend URL as the virtual module
 * `@inth/sdk/generated` (also `@inth/sdk/generated`), which `manifest()` and
 * `hosted()` from `@inth/vue/vue-plugin` read. No file is written into the
 * app. It also keeps `@inth/vue`, whose components are `.vue` files, out of
 * dependency pre-bundling.
 *
 * `projectUrl` defaults to `VITE_INTH_PROJECT_URL`, including `.env`
 * files. When it is unset, the plugin sets
 * `import.meta.env.VITE_INTH_PROJECT_URL` to the URL it used, so app code
 * reads the same value.
 *
 * `vite build` fetches the manifest only when the bundle uses `manifest()`,
 * so a `hosted()` or `local()` build never depends on the backend. With
 * `manifest()`, a missing URL or a failed fetch stops `vite build`. `vite
 * dev` fetches when the app first loads the module and only warns, and
 * `manifest()` then fetches the manifest when the app starts. Set
 * `onBuildError` or `INTH_ON_BUILD_ERROR` to change that. When the policy
 * depends on the visitor's location, the build warns and suggests
 * `hosted()`. With `manifest({ manifestUrl })` or
 * `manifest({ source: 'runtime' })`, pass `source: 'runtime'` here too, so
 * the build never fetches a snapshot the app would discard.
 *
 * @param options - Backend URL, `onBuildError` and `source`. Appends
 * `/manifest`.
 * @returns A Vite plugin.
 * @throws {Error} When the fetch fails in `'fail'` mode, the default for
 * `vite build`.
 * @example
 * ```ts
 * import vue from '@vitejs/plugin-vue';
 * import { consentManifest } from '@inth/vue/vite';
 * import { defineConfig } from 'vite';
 *
 * export default defineConfig({
 * 	plugins: [vue(), consentManifest()],
 * });
 * ```
 */
export const consentManifest = (
	options: ConsentManifestPluginOptions = {}
): VueConsentManifestPlugin => {
	const plugin = createConsentManifestPlugin(options, {
		adviseHostedForLocation: true,
		envNames: [VITE_PROJECT_URL_ENV],
		label: '@inth/vue/vite',
	});
	return {
		...plugin,
		config: () => {
			const config = plugin.config();
			return {
				...config,
				optimizeDeps: {
					exclude: [...config.optimizeDeps.exclude, ...VUE_SOURCE_PACKAGES],
				},
			};
		},
	};
};
