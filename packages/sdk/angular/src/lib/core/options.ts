import { InjectionToken } from '@angular/core';
import type {
	IABConfig,
	LegalLinks,
	ProviderTransportFactory,
} from '@inth/sdk/engine';
import type { CreateIABOptions } from '@inth/sdk/iab';
import type { HostedMode } from '@inth/sdk/modes';
import type {
	ConsentRuntime,
	ConsentRuntimeOptions,
	RuntimeGPPOptions,
	RuntimeNetworkBlockerOptions,
	RuntimePersistenceOptions,
	RuntimeScriptLoaderOptions,
	WithProjectUrl,
} from '@inth/sdk/runtime';
import type { ConsentTesting } from '@inth/sdk/testing';
import type { Theme, UIOptions } from '@inth/sdk/ui/theme';

import type { DialogPreload } from './dialog-warming';
import { isIABConfigured, lazyCreateIAB, loadGPP } from './iab-loader';
import { selectedMode } from './modes';

/** IAB options the provider accepts, or `false` to leave IAB unmounted. */
export type ProviderIABOptions =
	| (Partial<Omit<CreateIABOptions, 'kernel' | 'gvl'>> &
			Partial<Pick<IABConfig, 'enabled' | 'cmpId' | 'cmpVersion' | 'vendors'>> &
			Partial<Pick<CreateIABOptions, 'gvl'>>)
	| false;

/** Options for the script-loader module. The runtime's own contract. */
export type ScriptLoaderOptions = RuntimeScriptLoaderOptions;

/** Options for the network-blocker module. The runtime's own contract. */
export type NetworkBlockerOptions = RuntimeNetworkBlockerOptions;

/** Options for the persistence module. The runtime's own contract. */
export type PersistenceOptions = RuntimePersistenceOptions;

/** Public policy lifecycle callbacks. */
export type InthCallbacks = NonNullable<ConsentRuntimeOptions['callbacks']>;

/**
 * Options for {@link provideInth}, besides `mode` and `runtime`.
 *
 * Everything not declared here is the framework-agnostic
 * `ConsentRuntimeOptions` contract from `@inth/sdk/runtime`, forwarded
 * untouched to the runtime. `createIAB` and `loadGPP` are supplied by this
 * package and `pkg` is fixed to `'@inth/angular'`.
 */
export interface InthSharedOptions
	extends
		Omit<
			ConsentRuntimeOptions,
			| 'projectUrl'
			| 'createIAB'
			| 'gpp'
			| 'iab'
			| 'loadGPP'
			| 'mode'
			| 'pkg'
			| 'testing'
		>,
		Pick<
			UIOptions,
			| 'colorScheme'
			| 'disableAnimation'
			| 'noStyle'
			| 'scrollLock'
			| 'trapFocus'
		> {
	/** IAB TCF configuration. Pass `false` to disable the TCF addon. */
	iab?: ProviderIABOptions;
	/**
	 * IAB Global Privacy Platform (GPP 1.1). Installs `window.__gpp` once
	 * the runtime starts and keeps the GPP string in step with the visitor's
	 * choices. `true` or `{}` uses the defaults; omitted or `false` leaves
	 * GPP off. The GPP code loads through a dynamic import of
	 * `@inth/sdk/iab/gpp`, so apps that leave it off never download it.
	 *
	 * Ignored with an external `runtime`: set `gpp` on that runtime.
	 *
	 * @default undefined
	 */
	gpp?: RuntimeGPPOptions | boolean;
	/** Links rendered in the banner and preference-center footers. */
	legalLinks?: LegalLinks;
	/**
	 * When the consent dialog starts loading before its first open.
	 * `'idle'` loads it in browser idle time after the page's load event
	 * while a control that opens it is rendered, and on hover or focus of
	 * that control. `'intent'` loads it on hover or focus only.
	 *
	 * @default 'idle'
	 */
	preloadDialog?: DialogPreload;
	/**
	 * Whether the stock surfaces add their own stylesheets.
	 *
	 * Each surface inserts the rules it uses into `<head>` as `<style>`
	 * elements, carrying `nonce`. On a server-rendered page the rules are in
	 * the HTML, so no stylesheet `<link>` holds back the first paint.
	 *
	 * Set `false` when the app imports `@inth/angular/styles.css` itself.
	 *
	 * @default true
	 */
	styles?: boolean;
	/**
	 * CSP nonce for the `<style>` elements the surfaces add. Defaults to
	 * Angular's `CSP_NONCE` token when the app provides one.
	 */
	nonce?: string;
	/**
	 * Slot styles and consent-action variants. Design tokens (colors, dark,
	 * typography, spacing, radius, shadows, motion) are not applied in the
	 * browser: put `generateThemeCSS(theme)` from `@inth/sdk/ui/theme` in a
	 * stylesheet or a `<style id="inth-theme">`. In development the provider
	 * warns when `theme` has tokens and the page has no `#inth-theme`.
	 */
	theme?: Theme;
}

/**
 * Options for {@link provideInth} when it creates and owns the runtime.
 *
 * @example
 * ```ts
 * import { provideInth } from '@inth/angular';
 *
 * export const appConfig: ApplicationConfig = {
 *   providers: [provideInth({ projectUrl: '/api/inth' })],
 * };
 * ```
 */
export interface InthOptions extends InthSharedOptions {
	/**
	 * Backend URL, relative (`/api/inth`) or absolute: your Inth project
	 * URL. Required unless `mode` is `testing()` or `enabled` is `false`.
	 * Read once.
	 */
	projectUrl?: string;
	/**
	 * How the visitor's policy is resolved. Read once.
	 *
	 * - Omitted: the browser asks `${projectUrl}/init`. With
	 *   `provideInthServer()`, the server render resolves from the
	 *   backend's consent manifest, falling back to `/init` with a warning
	 *   when it is unavailable.
	 * - `hosted()` from `@inth/angular`: ask `${projectUrl}/init`, on the
	 *   server too.
	 * - `manifest()` from `@inth/angular`: resolve from the manifest in the
	 *   browser too.
	 * - `testing()` from `@inth/angular/testing`: resolve a policy with no
	 *   backend, for tests. It throws in production builds. To keep consent
	 *   out of the way in an app's own tests instead, set `enabled: false`.
	 */
	mode?: ProviderTransportFactory | HostedMode | ConsentTesting;
	/** Not allowed together with these; see {@link InthRuntimeOptions}. */
	runtime?: undefined;
}

/**
 * Options for {@link provideInth} with a runtime created elsewhere, such as
 * one shared between applications on the page with `createConsentRuntime()`.
 * Its owner configures, starts and disposes it; the provider only renders it.
 * `consentCategories` still applies.
 */
export interface InthRuntimeOptions extends InthSharedOptions {
	/** The runtime to render. Its owner starts and disposes it. */
	runtime: ConsentRuntime;
	/** The external runtime brings its own transport. */
	projectUrl?: undefined;
	mode?: undefined;
}

/**
 * Either way of configuring {@link provideInth}. The first needs
 * `projectUrl` unless `mode` is `testing()` or `enabled` is `false`.
 */
export type InthProviderOptions =
	| WithProjectUrl<InthOptions>
	| InthRuntimeOptions;

/**
 * The options handed to `provideInth()`, as given.
 *
 * Inject {@link ConsentManager} and read `options()` for the live value,
 * which `updateOptions()` changes.
 */
export const INTH_OPTIONS = new InjectionToken<InthProviderOptions>(
	'INTH_OPTIONS'
);

/** Options without the runtime, as `ConsentManager.options()` holds them. */
export type InthResolvedOptions = Omit<InthSharedOptions, never> & {
	projectUrl?: string;
	mode?: ProviderTransportFactory | HostedMode | ConsentTesting;
};

/**
 * The options the provider hands the runtime: its own, with the lazy IAB
 * and GPP loaders and the package name.
 *
 * @param options - The provider's options.
 * @returns The runtime options.
 * @internal
 */
export const runtimeOptionsFor = function runtimeOptionsFor(
	options: InthResolvedOptions
) {
	return {
		...options,
		// Only an app that configured IAB reaches for `@inth/sdk/iab`, and even
		// then the module arrives through a dynamic import.
		createIAB: isIABConfigured(options.iab) ? lazyCreateIAB : undefined,
		// Called only when `gpp` is set, so other apps never fetch the chunk.
		loadGPP,
		mode: selectedMode(options),
		pkg: '@inth/angular',
	};
};
