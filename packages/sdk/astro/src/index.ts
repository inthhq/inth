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
 * // astro.config.mjs, with PUBLIC_INTH_PROJECT_URL in .env
 * import svelte from '@astrojs/svelte';
 * import { defineConfig } from 'astro/config';
 * import Inth from '@inth/astro';
 *
 * export default defineConfig({
 *   integrations: [svelte(), inth()],
 * });
 * ```
 */

export { inth, inth as default, resolveOptions } from './integration';
export { createConsentMiddleware } from './create-consent-middleware';
export type { ConsentMiddlewareOptions } from './create-consent-middleware';
export { hosted, manifest } from './mode';
export type {
	ConsentMode,
	HostedMode,
	ManifestMode,
	ManifestModeOptions,
	TestingMode,
} from '@inth/sdk/modes';
export type {
	InthAstroOptions,
	InthClientOptionsExtension,
	InthColorScheme,
	InthI18nOptions,
	InthIABOptions,
	InthLocals,
	InthMiddlewareOptions,
	InthResolvedOptions,
	InthUIAdapterName,
} from './inth-options.model';
export type {
	ConsentDialogAdapter,
	ConsentDialogContext,
	ConsentDialogHandle,
	ConsentDialogKind,
	ConsentDialogSurfaceLoader,
} from './ui/register-dialog-adapter';
export { registerDialogAdapter, registerDialogSurface } from './ui/register-dialog-adapter';
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

// Engine types the guides use; the helpers are in the `engine` entry.
export type {
	CategoryDecision,
	ExperimentArmName,
	ExperimentAssignment,
	PrefetchOptions,
	ScriptCallbackInfo,
	TCData,
	TCDataOutsideTCF,
} from '@inth/sdk/engine';
export { defineTheme } from '@inth/sdk/ui/theme';
