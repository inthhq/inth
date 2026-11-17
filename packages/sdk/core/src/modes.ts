/**
 * `@c15t/core/modes` — consent modes as plain data.
 *
 * A provider's optional `mode` picks how the visitor's policy is resolved:
 *
 * - `manifest()` reads the backend's consent manifest, and falls back to
 *   the backend's `/init` with a warning when the manifest is unavailable.
 *   The default in server-framework packages (Next.js, TanStack Start,
 *   Nuxt, SvelteKit, Angular SSR, Astro).
 * - `hosted()` asks the backend's `/init` for every visitor. The default
 *   in client-only packages.
 * - `testing()` from a package's `/testing` entry resolves a policy with
 *   no backend, for tests.
 *
 * Server-framework packages read their config on the server and in the
 * browser, and Nuxt and Astro serialize it. A transport factory can't
 * cross that boundary, so these factories return a serializable
 * `{ type, …options }` object. Each framework's client turns it into a
 * transport with `@c15t/core/runtime/client-mode`, which loads every
 * non-default mode with `import()`.
 *
 * This module has no runtime imports, so importing it adds only these
 * functions to a bundle.
 *
 * Single-page apps use the implementation factory for manifest mode
 * (`manifest()` from `@c15t/core/transports/manifest-browser`). It carries
 * the same `type` and options, so either kind satisfies
 * {@link ConsentMode}.
 */
import type { ConsentManifest, PolicyRule } from '@c15t/schema/types';

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
	 * `${projectUrl}/manifest`. In the browser it defaults to
	 * `${routePrefix}/manifest`, else `${projectUrl}/manifest`.
	 */
	manifestUrl?: string;
	/**
	 * A same-origin route that answers with the visitor's
	 * `{ country, region }`. Browser resolution only: asked when the
	 * manifest's policy depends on a location the browser doesn't know yet.
	 */
	geoUrl?: string;
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

/** Ask the hosted backend's `/init` for every visitor. */
export interface HostedMode {
	type: 'hosted';
}

/** Options for `testing()` from a package's `/testing` entry. */
export interface TestingModeOptions {
	/**
	 * Resolve these policy rules instead of the recommended pack, such as
	 * one rule with a `notice` prompt to show the opt-out notice banner,
	 * which no recommended rule reaches. The kernel's location overrides
	 * pick the matching rule, as the backend would.
	 */
	policy?: PolicyRule | readonly PolicyRule[];
	/**
	 * Resolve the IAB TCF variant of the recommended pack, so Europe gets
	 * the IAB banner. Set it where the runtime cannot tell that IAB is on,
	 * such as a React tree that renders `IABProvider`. Defaults to whether
	 * the provider configures `iab`. Ignored with `policy`.
	 */
	iab?: boolean;
}

/**
 * The data form of `testing()`, as server-framework packages pass it
 * between the server and the browser.
 */
export interface TestingMode extends TestingModeOptions {
	type: 'testing';
}

/**
 * The options a {@link TestingMode} carries, without its `type`.
 *
 * @param mode - The testing mode.
 * @returns Its `policy` and `iab`, where set.
 * @internal
 */
export const testingOptionsOf = function testingOptionsOf(
	mode: TestingMode
): TestingModeOptions {
	const options: TestingModeOptions = {};
	if (mode.policy !== undefined) {
		options.policy = mode.policy;
	}
	if (mode.iab !== undefined) {
		options.iab = mode.iab;
	}
	return options;
};

/** Every consent mode, as data. */
export type ConsentMode = ManifestMode | HostedMode | TestingMode;

/** The `type` of a {@link ConsentMode}. */
export type ConsentModeType = ConsentMode['type'];

/**
 * Ask the hosted backend's `/init` for every visitor, at the provider's
 * `projectUrl`. The default in client-only packages; a server-framework
 * package uses it instead of its default, the manifest.
 *
 * @returns A serializable hosted mode.
 * @example
 * ```ts
 * import { hosted } from '@c15t/core/modes';
 *
 * const mode = hosted();
 * ```
 */
export const hosted = function hosted(): HostedMode {
	return { type: 'hosted' };
};

/**
 * Resolve init from the backend's consent manifest. The default mode in
 * every server-framework package. When the manifest is unavailable (the
 * build could not fetch it, the backend has no `/manifest`, or the read
 * fails at runtime), init falls back to the backend's `/init` with a
 * warning.
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
