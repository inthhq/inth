/**
 * `@inth/react/modes` — `manifest()` for single-page apps, defaulting to
 * what the build integration downloaded.
 *
 * `manifest()` here reads `@inth/sdk/generated`, which
 * `consentManifest()` from `@inth/sdk/build` fills with the policy snapshot and
 * the backend URL. `@inth/react` exports it.
 *
 * The package index does not import this module. Server-framework packages
 * re-export the index, and their browser bundles must not import
 * `@inth/sdk/generated`: Next.js fails the build when they do.
 *
 * A provider that talks to the hosted backend needs no mode: it sets
 * `projectUrl`.
 *
 * @example
 * ```tsx
 * import { InthProvider, manifest } from '@inth/react';
 *
 * <InthProvider options={{ mode: manifest() }}>{children}</InthProvider>;
 * ```
 */
export { manifest } from './transports/manifest';
export type {
	BrowserManifestModeFactory,
	ManifestModeOptions,
} from './transports/manifest';
