import type { ConsentConfig } from '@inth/vue/runtime/config.js';
import type { NuxtConsentModeConfig } from '@inth/vue/runtime/nuxt-mode.js';
import type {
	RuntimeConsentConfig,
	UseNetworkBlockerOptions,
} from '@inth/vue/runtime/vue-consent-kernel-context.model.js';

/** The Nuxt module's configuration under the `inth` key. */
export interface InthNuxtConfig
	extends
		ConsentConfig,
		NuxtConsentModeConfig,
		Pick<
			RuntimeConsentConfig,
			'gpp' | 'iframeBlocker' | 'nonce' | 'scriptLoader' | 'storageConfig'
		> {
	/**
	 * Block `fetch` and XHR requests that match these rules until the
	 * visitor's consent allows them. Omitted or `false` disables it.
	 *
	 * Module options reach the browser through `runtimeConfig.public` as
	 * JSON, so the `onRequestBlocked` callback is not accepted here. Set it
	 * under `inth.networkBlocker` in `app.config.ts` instead.
	 */
	networkBlocker?: Omit<UseNetworkBlockerOptions, 'onRequestBlocked'> | false;
}

/** Module-only options. They stay out of runtime config. */
export interface ConsentModuleOptions {
	/**
	 * What a failed build-time manifest download does in `manifest()` mode.
	 * `'runtime'` (the default) logs a warning, and the policy is read at
	 * runtime instead, from the backend's `/v1/consent/init` while the manifest is
	 * unavailable. `'fail'` stops `nuxt build` and `nuxt dev`. A missing
	 * backend URL counts as a failed
	 * download. The `INTH_ON_BUILD_ERROR` environment variable overrides this
	 * option. The download waits at most 10 seconds; `nuxt prepare` never
	 * downloads.
	 */
	onBuildError?: 'fail' | 'runtime';
	/**
	 * Add an Inth tab to Nuxt DevTools in development. The tab embeds Inth
	 * DevTools for the app's consent kernel. @default true
	 */
	devtools?: boolean;
	/**
	 * Start the policy request from the HTML of `ssr: false` pages, before
	 * the app's JavaScript loads. A small inline script in the page head
	 * calls the backend's `/v1/consent/init`, and the app uses that response instead of
	 * sending its own request. Applies in `hosted()` mode when no
	 * `consentSource`, `experiment` or init `headers` are configured;
	 * server-rendered pages are unchanged.
	 *
	 * The script carries `nuxt-security`'s per-request nonce, or the
	 * `nonce` option. Set `false` when your Content Security Policy cannot
	 * allow it. To turn it off for some routes only, set
	 * `routeRules: { '/path': { inth: { initPrefetch: false } } }`, for
	 * example where a client plugin changes Inth's config for that route.
	 *
	 * @default true
	 */
	initPrefetch?: boolean;
}

export type ModuleOptions = Partial<InthNuxtConfig> & ConsentModuleOptions;

/**
 * The `inth` key of `app.config.ts`, merged over the module options when
 * the app starts. App config is bundled with the app instead of passing
 * through JSON, so it also accepts functions such as
 * `networkBlocker.onRequestBlocked`. `mode` and `routePrefix` decide what
 * the build bundles and which routes the server has, so they are set in
 * `nuxt.config.ts` only.
 *
 * @example
 * ```ts
 * // app/app.config.ts
 * export default defineAppConfig({
 * 	inth: {
 * 		networkBlocker: {
 * 			rules: [{ category: 'measurement', domain: 'tracker.example' }],
 * 			onRequestBlocked: (info) => console.info('Blocked', info.url),
 * 		},
 * 	},
 * });
 * ```
 */
export interface InthNuxtAppConfig extends Omit<
	InthNuxtConfig,
	'mode' | 'networkBlocker' | 'routePrefix'
> {
	/**
	 * Block `fetch` and XHR requests that match these rules until the
	 * visitor's consent allows them. Omitted or `false` disables it. Rules
	 * set here are added to rules from the module options.
	 */
	networkBlocker?: UseNetworkBlockerOptions | false;
}
