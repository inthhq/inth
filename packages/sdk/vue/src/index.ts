import type { ProviderTransportFactory } from '@c15t/core';
import type { ConsentRuntime } from '@c15t/core/runtime';
import type { ConsentTesting } from '@c15t/core/testing';
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

export type { AllConsentNames, ClearOnRevocationConfig } from '@c15t/core';
export {
	resolveActionLabels,
	resolvePreferenceControlLabels,
	resolvePromptCopy,
} from '@c15t/core';
export type {
	PreferenceControl,
	PresentationAction,
	PromptCopy,
} from '@c15t/core';
export type * from '@c15t/schema/config';
export { defineTheme, type Theme } from '@c15t/ui/theme';
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
export type { ConsentTesting } from '@c15t/core/testing';
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
	'backendURL' | 'timeoutMs'
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
				 * `c15t/vue/vite` read from `VITE_C15T_BACKEND_URL` or
				 * `VITE_INTH_PROJECT_URL`.
				 *
				 * @example
				 * ```ts
				 * app.use(c15tVue, { backendURL: '/api/c15t' });
				 * ```
				 */
				backendURL?: string;
				/**
				 * Resolve the policy from the backend's consent manifest
				 * instead: `manifest()` from `c15t/vue/vue-plugin`.
				 *
				 * @example
				 * ```ts
				 * import { c15tVue, manifest } from 'c15t/vue/vue-plugin';
				 *
				 * app.use(c15tVue, { mode: manifest() });
				 * ```
				 */
				mode?: ProviderTransportFactory;
				/**
				 * Replace the backend in a test: `withoutNetwork()` from
				 * `c15t/vue/testing`. It throws in production builds. To keep
				 * consent out of the way in an app's own tests instead, set
				 * `enabled: false`.
				 */
				testing?: ConsentTesting;
				runtime?: undefined;
		  }
		| {
				backendURL?: undefined;
				mode?: undefined;
				testing?: undefined;
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
				 * import { c15tVue } from 'c15t/vue/vue-plugin';
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
 * import { c15tVue, manifest } from 'c15t/vue/vue-plugin';
 * import { createApp } from 'vue';
 *
 * createApp(App).use(c15tVue, { backendURL: '/api/c15t' }).mount('#app');
 * ```
 */
export const c15tVue: Plugin<[C15tVuePluginOptions]> = {
	install(app: App, options: C15tVuePluginOptions) {
		app.provide(consentConfigKey, options);

		const { backendURL, mode: chosen, runtime, testing, ...rest } = options;
		const config = rest as RuntimeConsentConfig;
		const mode = runtime
			? undefined
			: selectedMode({ backendURL, mode: chosen, testing });
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
