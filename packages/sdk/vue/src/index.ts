import type { ProviderTransportFactory } from '@inth/sdk/engine';
import type { HostedMode } from '@inth/sdk/modes';
import type { ConsentRuntime } from '@inth/sdk/runtime';
import type { ConsentTesting } from '@inth/sdk/testing';
// oxlint-disable oxc/no-barrel-file -- Public framework entry point intentionally re-exports the supported API.
import { getCurrentInstance } from 'vue';
import type { App, Plugin } from 'vue';

import { applyColorScheme } from './runtime/color-scheme';
import { consentConfigKey } from './runtime/composables/config';
import {
	createVueConsentKernelContext,
	provideVueConsentContext,
} from './runtime/kernel';
import type { RuntimeConsentConfig } from './runtime/kernel';
import { selectedMode } from './runtime/modes';
import { mountTokensStyle } from './runtime/theme-tokens';

export type {
	AllConsentNames,
	ClearOnRevocationConfig,
} from '@inth/sdk/engine';
export {
	resolveActionLabels,
	resolvePreferenceControlLabels,
	resolvePromptCopy,
} from '@inth/sdk/engine';
export type {
	PreferenceControl,
	PresentationAction,
	PromptCopy,
} from '@inth/sdk/engine';
export type * from '@inth/sdk/schema/config';
export { defineTheme, type Theme } from '@inth/sdk/ui/theme';
export * from './runtime/components/index';
export * from './runtime/composables';
export type {
	ConsentConfig,
	ConsentConfig as VueConsentConfig,
} from './runtime/config';
export type {
	RuntimeConsentConfig,
	UseNetworkBlockerOptions,
} from './runtime/kernel';
export {
	manifest,
	type BrowserManifestModeFactory,
	type HostedModeFactory,
	type ProviderTransportFactory,
} from './runtime/modes';
export type { ConsentTesting } from '@inth/sdk/testing';
export { hosted, type HostedMode } from '@inth/sdk/modes';
export {
	generateTokensCSS,
	type TokensCSSOptions,
} from './runtime/theme-tokens';

/**
 * The consent config the {@link c15tVue} plugin takes, without where the
 * policy comes from: the browser modules it starts on mount (`scripts`,
 * `networkBlocker`, `iframeBlocker`, `gpp`, `storageConfig`, `nonce`), the
 * UI options and callbacks.
 */
export type C15tVuePluginConfig = Omit<
	Partial<RuntimeConsentConfig>,
	'projectUrl' | 'timeoutMs'
>;

/**
 * Options accepted by the {@link c15tVue} plugin: a `mode`, or a `runtime`
 * the host owns, plus the {@link C15tVuePluginConfig}.
 */
export type C15tVuePluginOptions = C15tVuePluginConfig &
	(
		| {
				/**
				 * Backend URL. Setting it is how the app talks to the hosted
				 * backend. Defaults to the URL `consentManifest()` from
				 * `@inth/vue/vite` read from `VITE_C15T_BACKEND_URL` or
				 * `VITE_INTH_PROJECT_URL`.
				 *
				 * @example
				 * ```ts
				 * app.use(c15tVue, { projectUrl: '/api/c15t' });
				 * ```
				 */
				projectUrl?: string;
				/**
				 * How the visitor's policy is resolved.
				 *
				 * - Omitted, or `hosted()`: ask `${projectUrl}/init`.
				 * - `manifest()` from `@inth/vue/vue-plugin`: resolve from the
				 *   backend's consent manifest in the browser, falling back to
				 *   `/init` with a warning when it is unavailable.
				 * - `testing()` from `@inth/vue/testing`: resolve a policy with
				 *   no backend, for tests. It throws in production builds. To
				 *   keep consent out of the way in an app's own tests instead,
				 *   set `enabled: false`.
				 *
				 * @example
				 * ```ts
				 * import { c15tVue, manifest } from '@inth/vue/vue-plugin';
				 *
				 * app.use(c15tVue, { mode: manifest() });
				 * ```
				 */
				mode?: ProviderTransportFactory | HostedMode | ConsentTesting;
				runtime?: undefined;
		  }
		| {
				projectUrl?: undefined;
				mode?: undefined;
				/**
				 * A runtime this app should render instead of building its own
				 * kernel.
				 *
				 * Hosts without a single component tree — an Astro page whose
				 * islands cannot see each other, a SvelteKit layout — create one
				 * runtime with `createConsentRuntime()` and hand it to whatever
				 * renders. The plugin then neither starts nor disposes it, and
				 * mounts none of the modules the runtime already owns.
				 *
				 * @example
				 * ```ts
				 * import { createApp } from 'vue';
				 * import { c15tVue } from '@inth/vue/vue-plugin';
				 *
				 * createApp(Dialog).use(c15tVue, { runtime }).mount(target);
				 * ```
				 */
				runtime: ConsentRuntime;
		  }
	);

/**
 * The c15t Vue plugin. One consent runtime per app, shared with every
 * component through `provide`/`inject`; it starts once the root mounts.
 *
 * @example
 * ```ts
 * import { c15tVue, manifest } from '@inth/vue/vue-plugin';
 * import { createApp } from 'vue';
 *
 * createApp(App).use(c15tVue, { projectUrl: '/api/c15t' }).mount('#app');
 * ```
 */
export const c15tVue: Plugin<[C15tVuePluginOptions]> = {
	install(app: App, options: C15tVuePluginOptions) {
		app.provide(consentConfigKey, options);

		const { projectUrl, mode: chosen, runtime, ...rest } = options;
		const config = rest as RuntimeConsentConfig;
		const mode = runtime
			? undefined
			: selectedMode({ mode: chosen, projectUrl });
		// One runtime per app, shared through `provide`/`inject`.
		const context = createVueConsentKernelContext({ config, mode, runtime });
		provideVueConsentContext(app, context);
		// Tokens and the color scheme apply from install, before the first
		// render, so every surface is styled whether or not a ConsentRoot
		// mounts. A borrowed runtime's host renders its own theme and owns
		// the `c15t-dark` class.
		const removeTokensStyle = runtime
			? () => undefined
			: mountTokensStyle(config);
		const releaseColorScheme = runtime
			? () => undefined
			: applyColorScheme(config.colorScheme);
		app.mixin({
			mounted() {
				// The app may hydrate server markup, so the runtime starts once
				// the root has mounted. Exposed roots have a different public
				// proxy from lifecycle `this`.
				if (getCurrentInstance()?.parent === null) {
					context.start();
				}
			},
		});
		// `app.onUnmount` is Vue 3.5+. On older runtimes skip cleanup
		// registration rather than throwing during plugin install.
		if (typeof app.onUnmount === 'function') {
			app.onUnmount(() => {
				context.dispose();
				removeTokensStyle();
				releaseColorScheme();
			});
		}
	},
};

// Engine types the guides use; the helpers are in the `engine` entry.
export type {
	CategoryDecision,
	ExperimentArmName,
	ExperimentAssignment,
	PrefetchOptions,
	ResolvedVendor,
	Script,
	ScriptCallbackInfo,
	TCData,
	TCDataOutsideTCF,
	Vendor,
} from '@inth/sdk/engine';
