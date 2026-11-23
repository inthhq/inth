import { CORE_CHUNK_MODULES, coreModuleFile } from '@inth/sdk/build';

/**
 * The part of a Nuxt client manifest entry this module reads and writes.
 * Declared here so the module does not depend on `vue-bundle-renderer`.
 */
export interface ClientManifestChunk {
	assets?: string[];
	css?: string[];
	dynamicImports?: string[];
	file?: string;
	imports?: string[];
	isDynamicEntry?: boolean;
	isEntry?: boolean;
	prefetch?: boolean;
	src?: string;
}

/**
 * Inth chunks a page may need before its first banner paints, so Nuxt keeps
 * prefetching them: the experiment controller. Matched against the end of
 * the source path, inside an Inth package. The IAB banner and the browser
 * resolver keep their hints only when the build uses them; see
 * {@link IAB_FIRST_BANNER_SOURCES} and {@link BROWSER_RESOLVER_SOURCE}.
 */
export const FIRST_BANNER_SOURCES = [
	coreModuleFile(CORE_CHUNK_MODULES.experimentAssignment),
];

/**
 * The IAB banner and its CMP, kept like {@link FIRST_BANNER_SOURCES} only
 * when the build turns IAB on. Without it nothing loads them.
 */
export const IAB_FIRST_BANNER_SOURCES = [
	'/iab/dist/headless.js',
	'/iab/dist/index.js',
	coreModuleFile(CORE_CHUNK_MODULES.iabBannerSummary),
	'/dist/runtime/components/iab-prompt.vue',
];

/**
 * Core's browser resolver with English base copy. Other languages load on
 * demand. Only `manifest({ resolve: 'browser' })` loads it while the page
 * starts; no other mode loads it at all, so a hint there would download it
 * on every page for nothing.
 */
export const BROWSER_RESOLVER_SOURCE = coreModuleFile(
	CORE_CHUNK_MODULES.browserResolver
);

/** What the Nuxt module knows about the build when it edits the manifest. */
export interface ConsentPrefetchOptions {
	/**
	 * Whether the mode is `manifest({ resolve: 'browser' })`, the only mode
	 * that loads the browser resolver at startup. Defaults to `false`.
	 */
	browserResolve?: boolean;
	/**
	 * Whether the module options turn IAB on. Only then do the IAB banner
	 * and its CMP keep their hints. Defaults to `false`.
	 */
	iab?: boolean;
}

/** The banner the Nuxt root loads as its own chunk (see `nuxt-inth-provider.vue`). */
export const BANNER_SOURCE = '/dist/runtime/components/prompt/prompt.vue';

/** The Nuxt plugin's consent engine chunk (`runtime/deferred/engine.ts`). */
export const ENGINE_SOURCES = [
	'/dist/runtime/deferred/engine.js',
	'/src/runtime/deferred/engine.ts',
];

/**
 * The client manifest key `runtime/deferred/deferred-boot.model.ts` names. Kept equal by a
 * test.
 */
export const DEFERRED_ENGINE_MANIFEST_KEY = 'inth:deferred-engine';
