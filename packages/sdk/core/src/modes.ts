/**
 * `@c15t/core/modes` — consent modes as plain data.
 *
 * Server-framework packages (Next.js, TanStack Start, Nuxt, Astro and
 * SvelteKit) read their config on the server and in the browser, and Nuxt
 * and Astro serialize it. A transport factory can't cross that boundary, so
 * these factories return a serializable `{ type, …options }` object. Each
 * framework's client turns it into a transport with
 * `@c15t/core/runtime/client-mode`, which loads every non-default mode with
 * `import()`.
 *
 * This module has no runtime imports, so importing it adds only these
 * functions to a bundle.
 *
 * A provider with only `backendURL` talks to the hosted backend, so there
 * is no mode to build for it. Tests pass `withoutNetwork()` from a
 * package's `/testing` entry as the `testing` option instead.
 *
 * Single-page apps use the implementation factory instead (`manifest()`
 * from `@c15t/core/transports/manifest-browser`). It carries the same
 * `type` and options, so either kind satisfies {@link ConsentMode}.
 */
import type { ConsentManifest } from '@c15t/schema/types';

/** A visitor location known before init, such as one an edge worker injected. */
export interface ManifestModeInputs {
	/** ISO 3166-1 alpha-2 country code, such as `DE`. */
	country?: string;
	/** ISO 3166-2 subdivision code without the country prefix, such as `CA`. */
	region?: string;
}

/** Options every `manifest()` accepts, wherever it resolves. */
export interface ManifestModeBaseOptions {
	/**
	 * Where to fetch the manifest at runtime. On the server it defaults to
	 * `${backendURL}/manifest`. In the browser it defaults to
	 * `${routePrefix}/manifest`, else `${backendURL}/manifest`.
	 */
	manifestURL?: string;
	/**
	 * A same-origin route that answers with the visitor's
	 * `{ country, region }`. Browser resolution only: asked when the
	 * manifest's policy depends on a location the browser doesn't know yet.
	 */
	geoURL?: string;
	/**
	 * The visitor's location, when the page already knows it. Browser
	 * resolution only. Kernel overrides win over these.
	 */
	inputs?: ManifestModeInputs;
}

/**
 * Where the manifest comes from. `snapshot` and `source` are mutually
 * exclusive: a manifest you pass in is its own source.
 */
export type ManifestModeSourceOptions =
	| {
			/**
			 * `'build'` (default) uses the snapshot the build integration
			 * fetched. With none, such as in dev or after
			 * `onBuildError: 'runtime'`, the manifest is fetched at runtime.
			 * `'runtime'` always fetches it at runtime.
			 */
			source?: 'build' | 'runtime';
			snapshot?: never;
	  }
	| {
			/** A manifest you supply yourself. */
			snapshot: ConsentManifest;
			source?: never;
	  };

/** Options for the data `manifest()` from `@c15t/core/modes`. */
export type ManifestModeOptions = ManifestModeBaseOptions &
	ManifestModeSourceOptions & {
		/**
		 * Where init is resolved. `'server'` (default) resolves on the server
		 * and ships no resolver to the browser. `'browser'` loads the resolver
		 * in the browser, for pages the server doesn't render per visitor.
		 * Server-framework packages only.
		 */
		resolve?: 'server' | 'browser';
	};

/** Resolve init from the backend's consent manifest. */
export type ManifestMode = { type: 'manifest' } & ManifestModeOptions;

/**
 * The data form of a `testing` value, as server-framework packages pass it
 * between the server and the browser. `withoutNetwork()` from a package's
 * `/testing` entry builds it.
 */
export interface WithoutNetworkTestingData extends WithoutNetworkOptions {
	type: 'without-network';
}

/** Options for `withoutNetwork()`. */
export interface WithoutNetworkOptions {
	/**
	 * Resolve the IAB TCF variant of the recommended pack, so Europe gets
	 * the IAB banner. Set it where the runtime cannot tell that IAB is on,
	 * such as a React tree that renders `IABProvider`. Defaults to whether
	 * the provider configures `iab`.
	 */
	iab?: boolean;
}

/** Every consent mode, as data. */
export type ConsentMode = ManifestMode;

/** The `type` of a {@link ConsentMode}. */
export type ConsentModeType = ConsentMode['type'];

/**
 * Resolve init from the backend's consent manifest. The default mode in
 * every server-framework package.
 *
 * @param options - Where the manifest comes from and where init resolves.
 * @returns A serializable manifest mode.
 * @example
 * ```ts
 * import { manifest } from '@c15t/core/modes';
 *
 * const mode = manifest();
 * const staticPages = manifest({ resolve: 'browser' });
 * ```
 */
export const manifest = function manifest(
	options: ManifestModeOptions = {}
): ManifestMode {
	return { ...options, type: 'manifest' };
};
