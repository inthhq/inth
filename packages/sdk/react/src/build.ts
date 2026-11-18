/**
 * `@inth/react/build` — `consentManifest()`, the Vite plugin that downloads
 * the consent manifest at build time and serves it as
 * `@inth/react/generated`.
 *
 * @example
 * ```ts
 * import react from '@vitejs/plugin-react';
 * import { consentManifest } from '@inth/react/build';
 * import { defineConfig } from 'vite';
 *
 * export default defineConfig({ plugins: [react(), consentManifest()] });
 * ```
 */
import { createConsentManifestPlugin } from '@inth/sdk/build';
import type {
	ConsentManifestPlugin,
	ConsentManifestPluginOptions,
} from '@inth/sdk/build';

/**
 * `consentManifest()` from `@inth/sdk/build`, which also serves
 * `@inth/react/generated`.
 *
 * @param options - Backend URL, `onBuildError`, `source` and the
 * `index.html` options.
 */
export const consentManifest = (
	options: ConsentManifestPluginOptions = {}
): ConsentManifestPlugin =>
	createConsentManifestPlugin(options, {
		adviseHostedForLocation: true,
		envNames: ['VITE_INTH_PROJECT_URL'],
		label: '@inth/react/build',
		packages: ['@inth/react'],
	});
export type {
	ConsentManifestPluginOptions,
	ManifestBuildErrorMode,
	ManifestBuildOptions,
} from '@inth/sdk/build';
