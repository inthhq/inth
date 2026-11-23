import type { ProviderTransportFactory } from '@inth/sdk/engine';
import type { HostedMode } from '@inth/sdk/modes';
import type { ConsentRuntime } from '@inth/sdk/runtime';
import type { ConsentTesting } from '@inth/sdk/testing';
import { setupColorScheme } from '@inth/sdk/ui/utils/color-scheme';
// oxlint-disable oxc/no-barrel-file -- Public framework entry point intentionally re-exports the supported API.
import { getCurrentInstance } from 'vue';
import type { App, Plugin } from 'vue';

import { consentConfigKey } from './runtime/composables/config';
import { mountTokensStyle } from './runtime/generate-tokens-css';
import {
	createVueConsentKernelContext,
	provideVueConsentContext,
} from './runtime/kernel';
import type { RuntimeConsentConfig } from './runtime/kernel';
import { selectedMode } from './runtime/modes.model';

export type {
	AllConsentNames,
	BannerEdge,
	CardPosition,
	ClearOnRevocationConfig,
	ConsentContainer,
	ConsentEdgeStyle,
	ConsentPresentation,
	DrawerSide,
	PreferencesPresentation,
	PromptPresentation,
	ResolvedConsentLayout,
	ResolvedConsentPresentation,
} from '@inth/sdk/engine';
export {
	resolveActionLabels,
	resolveOptInConfirmationSentence,
	resolveOptOut,
	resolveOptOutBlockHeading,
	resolveOptOutCopy,
	resolveOptOutLink,
	resolveOptOutReceipt,
	resolveOptOutReceiptSentence,
	resolveOptOutState,
	resolvePreferenceControlLabels,
	resolvePromptCopy,
} from '@inth/sdk/engine';
export type {
	OptOutLinkIcon,
	OptOutLinkVariant,
	OptOutLocalAct,
	OptOutLock,
	OptOutReceipt,
	OptOutReceiptData,
	OptOutReceiptScope,
	OptOutReceiptSource,
	OptOutResult,
	OptOutState,
	OptOutVia,
	PreferenceControl,
	PresentationAction,
	PromptCopy,
	ResolvedOptOutLink,
	ResolvedOptOutState,
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
} from './runtime/modes.model';
export type { ConsentTesting } from '@inth/sdk/testing';
export { hosted, type HostedMode } from '@inth/sdk/modes';
export {
	generateTokensCSS,
	type TokensCSSOptions,
} from './runtime/generate-tokens-css';

/**
 * The consent config the {@link inth} plugin takes, without where the
 * policy comes from: the browser modules it starts on mount (`scripts`,
 * `networkBlocker`, `iframeBlocker`, `gpp`, `storageConfig`, `nonce`), the
 * UI options and callbacks.
 */
export type InthVuePluginConfig = Omit<
	Partial<RuntimeConsentConfig>,
	'projectUrl' | 'timeoutMs'
>;

/**
 * Options accepted by the {@link inth} plugin: a `mode`, or a `runtime`
 * the host owns, plus the {@link InthVuePluginConfig}.
 */
export type InthVuePluginOptions = InthVuePluginConfig &
	(
		| {
				/**
				 * Backend URL. Setting it is how the app talks to the hosted
				 * backend. Defaults to the URL `consentManifest()` from
				 * `@inth/vue/vite` read from `VITE_INTH_PROJECT_URL`.
				 *
				 * @example
				 * ```ts
				 * app.use(inth, { projectUrl: '/api/inth' });
				 * ```
				 */
				projectUrl?: string;
				/**
				 * How the visitor's policy is resolved.
				 *
				 * - Omitted, or `hosted()`: ask `${projectUrl}/v1/consent/init`.
				 * - `manifest()` from `@inth/vue/vue-plugin`: resolve from the
				 *   backend's consent manifest in the browser, falling back to
				 *   `/v1/consent/init` with a warning when it is unavailable.
				 * - `testing()` from `@inth/vue/testing`: resolve a policy with
				 *   no backend, for tests. It throws in production builds. To
				 *   keep consent out of the way in an app's own tests instead,
				 *   set `enabled: false`.
				 *
				 * @example
				 * ```ts
				 * import { inth, manifest } from '@inth/vue/vue-plugin';
				 *
				 * app.use(inth, { mode: manifest() });
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
				 * import { inth } from '@inth/vue/vue-plugin';
				 *
				 * createApp(Dialog).use(inth, { runtime }).mount(target);
				 * ```
				 */
				runtime: ConsentRuntime;
		  }
	);

/**
 * The Inth Vue plugin. One consent runtime per app, shared with every
 * component through `provide`/`inject`; it starts once the root mounts.
 *
 * @example
 * ```ts
 * import { inth, manifest } from '@inth/vue/vue-plugin';
 * import { createApp } from 'vue';
 *
 * createApp(App).use(inth, { projectUrl: '/api/inth' }).mount('#app');
 * ```
 */
export const inth: Plugin<[InthVuePluginOptions]> = {
	install(app: App, options: InthVuePluginOptions) {
		app.provide(consentConfigKey, options);

		const { projectUrl, mode: chosen, runtime, ...rest } = options;
		const config = rest as RuntimeConsentConfig;
		const mode = runtime
			? undefined
			: selectedMode({ mode: chosen, projectUrl });
		const context = createVueConsentKernelContext({ config, mode, runtime });
		provideVueConsentContext(app, context);
		// Tokens and the color scheme apply from install, before the first
		// render, so every surface is styled whether or not an InthProvider
		// mounts. A borrowed runtime's host renders its own theme and owns
		// the `inth-dark` class.
		const removeTokensStyle = runtime
			? () => undefined
			: mountTokensStyle(config);
		const releaseColorScheme = runtime
			? () => undefined
			: setupColorScheme(config.colorScheme);
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
