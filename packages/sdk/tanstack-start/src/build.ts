import { createConsentManifestPlugin } from '@inth/sdk/build';
import type { ConsentManifestPluginOptions } from '@inth/sdk/build';

export type {
	ConsentManifestPluginOptions,
	ManifestBuildErrorMode,
	ManifestBuildOptions,
} from '@inth/sdk/build';

/**
 * Serves the deployment's consent manifest and backend URL as the virtual
 * module `@inth/sdk/generated`. `vite build`
 * fetches the manifest once the server bundle is known to read it, which
 * `createConsentStateHandler()` and `createConsentRoute()` do; `vite dev`
 * fetches when the server first loads the module.
 * `createConsentStateHandler()` and `createConsentRoute()` read the backend
 * URL and the snapshot from it, so they need no options. No file is
 * written into the app.
 *
 * The snapshot stays on the server: in the client environment, `snapshot`
 * is `undefined`. `projectUrl` is public and reaches both.
 *
 * The backend URL comes from `projectUrl` or, when that is omitted, from
 * `VITE_INTH_PROJECT_URL`, including `.env` files. When that is unset, the
 * plugin sets `import.meta.env.VITE_INTH_PROJECT_URL` to the URL it used,
 * so server and browser code read the same value.
 *
 * The fetch waits at most 10 seconds. When it fails, `vite build` and
 * `vite dev` log a warning and serve `snapshot: undefined`, so the server
 * fetches the policy at runtime and asks the backend's `/v1/consent/init` while the
 * manifest is unavailable. Set `onBuildError: 'fail'`, or
 * `INTH_ON_BUILD_ERROR=fail`, to stop the build instead. The fetch is skipped
 * for a `projectUrl` that is not absolute http(s), and with
 * `source: 'runtime'`, for an app whose `manifest({ source: 'runtime' })`
 * reads the policy at runtime.
 *
 * In the browser bundle, the stylesheets `ConsentBanner` puts in the
 * server HTML load as the `<style>` already in the page instead of as a
 * second copy inside a JavaScript chunk.
 *
 * @param options - Backend URL, `onBuildError` and `source`. The build
 * appends `/v1/consent/manifest`.
 * @returns A Vite plugin to place before the TanStack Start plugin.
 * @throws {Error} When the fetch fails in `'fail'` mode, the default for
 * `vite build`.
 * @example
 * ```ts
 * import { consentManifest } from '@inth/tanstack-start/build';
 *
 * // Reads VITE_INTH_PROJECT_URL, for example from `.env`.
 * const plugins = [consentManifest()];
 * ```
 */
export const consentManifest = (options: ConsentManifestPluginOptions = {}) =>
	createConsentManifestPlugin(options, {
		envNames: ['VITE_INTH_PROJECT_URL'],
		label: '@inth/tanstack-start/build',
		packages: ['@inth/tanstack-start'],
		serverRendered: true,
	});
