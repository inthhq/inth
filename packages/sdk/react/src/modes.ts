/**
 * `@c15t/react/modes` — `manifest()` for single-page apps, defaulting to
 * what the build integration downloaded.
 *
 * `manifest()` here reads `@c15t/core/generated`, which
 * `consentManifest()` from `c15t/build` fills with the policy snapshot and
 * the backend URL. `c15t/react` exports it.
 *
 * The package index does not import this module. Server-framework packages
 * re-export the index, and their browser bundles must not import
 * `@c15t/core/generated`: Next.js fails the build when they do.
 *
 * A provider that talks to the hosted backend needs no mode: it sets
 * `backendURL`.
 *
 * @example
 * ```tsx
 * import { ConsentProvider, manifest } from 'c15t/react';
 *
 * <ConsentProvider options={{ mode: manifest() }}>{children}</ConsentProvider>;
 * ```
 */
export { manifest } from './transports/manifest';
export type {
	BrowserManifestModeFactory,
	ManifestModeOptions,
} from './transports/manifest';
