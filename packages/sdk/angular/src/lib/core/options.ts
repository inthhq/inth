import { InjectionToken } from '@angular/core';
import type {
	IABConfig,
	LegalLinks,
	ProviderTransportFactory,
} from '@c15t/core';
import type {
	ConsentRuntime,
	ConsentRuntimeOptions,
	RuntimeGPPOptions,
	RuntimeNetworkBlockerOptions,
	RuntimePersistenceOptions,
	RuntimeScriptLoaderOptions,
} from '@c15t/core/runtime';
import type { ConsentTesting } from '@c15t/core/testing';
import type { CreateIABOptions } from '@c15t/iab';
import type { Theme, UIOptions } from '@c15t/ui/theme';

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
export type C15tCallbacks = NonNullable<ConsentRuntimeOptions['callbacks']>;

/**
 * Options for {@link provideC15t}, besides `mode` and `runtime`.
 *
 * Everything not declared here is the framework-agnostic
 * `ConsentRuntimeOptions` contract from `@c15t/core/runtime`, forwarded
 * untouched to the runtime. `createIAB` and `loadGPP` are supplied by this
 * package and `pkg` is fixed to `'@c15t/angular'`.
 */
export interface C15tSharedOptions
	extends
		Omit<
			ConsentRuntimeOptions,
			| 'backendURL'
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
	 * `@c15t/iab/gpp`, so apps that leave it off never download it.
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
	 * Set `false` when the app imports `@c15t/angular/styles.css` itself.
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
	 * browser: put `generateThemeCSS(theme)` from `@c15t/ui/theme` in a
	 * stylesheet or a `<style id="c15t-theme">`. In development the provider
	 * warns when `theme` has tokens and the page has no `#c15t-theme`.
	 */
	theme?: Theme;
}

/**
 * Options for {@link provideC15t} when it creates and owns the runtime.
 *
 * @example
 * ```ts
 * import { provideC15t } from '@c15t/angular';
 *
 * export const appConfig: ApplicationConfig = {
 *   providers: [provideC15t({ backendURL: '/api/c15t' })],
 * };
 * ```
 */
export interface C15tOptions extends C15tSharedOptions {
	/**
	 * Backend URL, relative (`/api/c15t`) or absolute. Setting it is how the
	 * app talks to the hosted backend. Read once.
	 */
	backendURL?: string;
	/**
	 * Resolve the policy from the backend's consent manifest instead:
	 * `manifest()` from `@c15t/angular`. Read once.
	 */
	mode?: ProviderTransportFactory;
	/**
	 * Replace the backend in a test: `withoutNetwork()` from
	 * `@c15t/angular/testing`. It throws in production builds. To keep
	 * consent out of the way in an app's own tests instead, set
	 * `enabled: false`. Read once.
	 */
	testing?: ConsentTesting;
	/** Not allowed together with these; see {@link C15tRuntimeOptions}. */
	runtime?: undefined;
}

/**
 * Options for {@link provideC15t} with a runtime created elsewhere, such as
 * one shared between applications on the page with `createConsentRuntime()`.
 * Its owner configures, starts and disposes it; the provider only renders it.
 * `consentCategories` still applies.
 */
export interface C15tRuntimeOptions extends C15tSharedOptions {
	/** The runtime to render. Its owner starts and disposes it. */
	runtime: ConsentRuntime;
	/** The external runtime brings its own transport. */
	backendURL?: undefined;
	mode?: undefined;
	testing?: undefined;
}

/** Either way of configuring {@link provideC15t}. */
export type C15tProviderOptions = C15tOptions | C15tRuntimeOptions;

/**
 * The options handed to `provideC15t()`, as given.
 *
 * Inject {@link ConsentManager} and read `options()` for the live value,
 * which `updateOptions()` changes.
 */
export const C15T_OPTIONS = new InjectionToken<C15tProviderOptions>(
	'C15T_OPTIONS'
);

/** Options without the runtime, as `ConsentManager.options()` holds them. */
export type C15tResolvedOptions = Omit<C15tSharedOptions, never> & {
	backendURL?: string;
	mode?: ProviderTransportFactory;
	testing?: ConsentTesting;
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
	options: C15tResolvedOptions
) {
	return {
		...options,
		// Only an app that configured IAB reaches for `@c15t/iab`, and even
		// then the module arrives through a dynamic import.
		createIAB: isIABConfigured(options.iab) ? lazyCreateIAB : undefined,
		// Called only when `gpp` is set, so other apps never fetch the chunk.
		loadGPP,
		mode: selectedMode(options),
		pkg: '@c15t/angular',
		// `mode` is the transport the testing value selected.
		testing: undefined,
	};
};
