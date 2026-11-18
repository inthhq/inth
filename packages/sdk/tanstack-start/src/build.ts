import { createConsentManifestPlugin } from '@inth/sdk/build';
import type { ConsentManifestPluginOptions } from '@inth/sdk/build';

export type {
	ConsentManifestPluginOptions,
	ManifestBuildErrorMode,
	ManifestBuildOptions,
} from '@inth/sdk/build';

/**
 * The sheets a server-rendered banner, trigger and ConsentGate put in the
 * HTML. The browser bundle gets each one's `-deferred` module: the same
 * `id`, and a `load()` that fetches the text only when a surface renders
 * first in the browser. With the sheet in the page, the surface adopts the
 * server's `<style>` and the text ships once. The same list as the static
 * banner's in `@inth/sdk/build`.
 */
const SERVER_RENDERED_SHEETS = new Set([
	'tokens',
	'button',
	'banner',
	'trigger',
	'consent-gate',
]);
const SHEETS_PREFIX = '@inth/sdk/ui/styles/sheets/';

/** A module of the installed `@inth/react`, whatever the package manager. */
const REACT_PACKAGE = /[\\/]node_modules[\\/]@c15t[\\/]react[\\/]/u;

/** The `-deferred` twin of a sheet `@inth/react` imports, else `undefined`. */
const deferredSheet = function deferredSheet(
	id: string,
	importer: string | undefined
): string | undefined {
	if (
		!(importer && REACT_PACKAGE.test(importer) && id.startsWith(SHEETS_PREFIX))
	) {
		return undefined;
	}
	return SERVER_RENDERED_SHEETS.has(id.slice(SHEETS_PREFIX.length))
		? `${id}-deferred`
		: undefined;
};

/** The slice of Vite's resolve context the sheet rewrite reads. */
interface SheetResolveContext {
	environment?: { config?: { consumer?: string } };
	resolve?: (
		id: string,
		importer?: string,
		options?: { skipSelf?: boolean }
	) => Promise<{ id: string } | null>;
}

/**
 * Serves the deployment's consent manifest and backend URL as the virtual
 * module `@inth/sdk/generated` (also `@inth/sdk/generated`). `vite build`
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
 * `VITE_C15T_BACKEND_URL`, then `VITE_INTH_PROJECT_URL`, including `.env`
 * files. When `VITE_C15T_BACKEND_URL` is unset, the plugin sets
 * `import.meta.env.VITE_C15T_BACKEND_URL` to the URL it used, so server and
 * browser code read the same value.
 *
 * The fetch waits at most 10 seconds. When it fails, `vite build` and
 * `vite dev` log a warning and serve `snapshot: undefined`, so the server
 * fetches the policy at runtime and asks the backend's `/init` while the
 * manifest is unavailable. Set `onBuildError: 'fail'`, or
 * `C15T_ON_BUILD_ERROR=fail`, to stop the build instead. The fetch is skipped
 * for a `projectUrl` that is not absolute http(s), and with
 * `source: 'runtime'`, for an app whose `manifest({ source: 'runtime' })`
 * reads the policy at runtime.
 *
 * In the browser bundle, the stylesheets `ConsentBanner` puts in the
 * server HTML load as the `<style>` already in the page instead of as a
 * second copy inside a JavaScript chunk.
 *
 * @param options - Backend URL, `onBuildError` and `source`. The build
 * appends `/manifest`.
 * @returns A Vite plugin to place before the TanStack Start plugin.
 * @throws {Error} When the fetch fails in `'fail'` mode, the default for
 * `vite build`.
 * @example
 * ```ts
 * import { consentManifest } from '@inth/tanstack-start/build';
 *
 * // Reads VITE_C15T_BACKEND_URL, for example from `.env`.
 * const plugins = [consentManifest()];
 * ```
 */
export const consentManifest = (options: ConsentManifestPluginOptions = {}) => {
	const plugin = createConsentManifestPlugin(options, {
		envNames: ['VITE_C15T_BACKEND_URL', 'VITE_INTH_PROJECT_URL'],
		label: '@inth/tanstack-start/build',
		serverRendered: true,
	});
	const resolveGenerated = plugin.resolveId;
	return Object.assign(plugin, {
		resolveId(
			this: unknown,
			id: string,
			importer?: string,
			resolveOptions?: { ssr?: boolean }
		) {
			const context = this as SheetResolveContext | undefined;
			const deferred = deferredSheet(id, importer);
			if (
				deferred &&
				context?.resolve &&
				!resolveOptions?.ssr &&
				context.environment?.config?.consumer === 'client'
			) {
				// A `@inth/sdk/ui` without the deferred module keeps the sheet's text.
				return (async () =>
					(await context.resolve?.(deferred, importer, { skipSelf: true }))
						?.id)();
			}
			return resolveGenerated.call(this, id, importer, resolveOptions);
		},
	});
};
