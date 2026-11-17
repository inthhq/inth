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
export { consentManifest } from '@inth/sdk/build';
export type {
	ConsentManifestPluginOptions,
	ManifestBuildErrorMode,
	ManifestBuildOptions,
} from '@inth/sdk/build';
