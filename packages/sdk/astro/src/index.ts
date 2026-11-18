/**
 * `@inth/astro` — consent management for Astro.
 *
 * The banner is a server-rendered `.astro` component with no framework
 * JavaScript; the preference centre and the IAB dialog are Svelte, React or
 * Vue islands mounted only when someone opens them; and because Astro
 * islands never share a component tree, the kernel is a page-level
 * singleton created by the script this integration injects rather than a
 * provider. The components are in `@inth/astro/components`.
 *
 * ```js
 * // astro.config.mjs, with PUBLIC_C15T_BACKEND_URL in .env
 * import svelte from '@astrojs/svelte';
 * import { defineConfig } from 'astro/config';
 * import c15t from '@inth/astro';
 *
 * export default defineConfig({
 *   integrations: [svelte(), c15t()],
 * });
 * ```
 */

export { c15t, c15t as default, resolveOptions } from './integration';
export { createConsentMiddleware } from './middleware-handler';
export type { ConsentMiddlewareOptions } from './middleware-handler';
export { hosted, manifest } from './mode';
export type {
	ConsentMode,
	HostedMode,
	ManifestMode,
	ManifestModeOptions,
	TestingMode,
} from '@inth/sdk/modes';
export type {
	C15tAstroOptions,
	C15tClientOptionsExtension,
	C15tColorScheme,
	C15tI18nOptions,
	C15tIABOptions,
	C15tLocals,
	C15tMiddlewareOptions,
	C15tResolvedOptions,
	C15tUIAdapterName,
} from './types';
export type {
	ConsentDialogAdapter,
	ConsentDialogContext,
	ConsentDialogHandle,
	ConsentDialogKind,
	ConsentDialogSurfaceLoader,
} from './ui/adapter';
export { registerDialogAdapter, registerDialogSurface } from './ui/adapter';
export type { ConsentRuntime, ConsentRuntimeOptions } from '@inth/sdk/runtime';

// Re-exported so an app can stay inside `@inth/astro` for the common types.
export type {
	AllConsentNames,
	ClearOnRevocationConfig,
	ConsentSnapshot,
	ConsentState,
	KernelConfig,
	LegalLinks,
	PolicyRule,
	ResolvedVendor,
	Script,
	StorageConfig,
	Vendor,
	VendorChoice,
} from '@inth/sdk/engine';
export { policyRulePresets } from '@inth/sdk/engine';
export type { Theme } from '@inth/sdk/ui/theme';
