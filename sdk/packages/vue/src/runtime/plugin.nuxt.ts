import type { HydrationRecords } from '@c15t/core';
import type { RequestConsentState } from '@c15t/core/server';
import { defu } from 'defu';
import { computed, markRaw, shallowRef, toRaw, watch } from 'vue';

import {
	defineNuxtPlugin,
	showError,
	useAppConfig,
	useHead,
	useRequestEvent,
	useRequestHeaders,
	useRequestURL,
	useRuntimeConfig,
	useState as useNuxtState,
} from '#imports';

import {
	applyColorScheme,
	buildColorSchemeScript,
	COLOR_SCHEME_SCRIPT_KEY,
} from './color-scheme';
import { loadConsentBanner } from './components/lazy-surfaces';
import type { NuxtConsentBoot } from './deferred/boot';
import type { NuxtEngineInput } from './deferred/engine';
import { isDeferredBannerModule } from './deferred/lazy-modules';
import { createDeferredContext } from './deferred/shell';
import { INIT_HEADER_NAMES, pickAllowedInitHeaders } from './init-headers';
import type { RuntimeConsentConfig, VueConsentKernelContext } from './kernel';
import {
	readNuxtMode,
	readNuxtRoutePrefix,
	resolvesOnServer,
} from './nuxt-mode';
import type { NuxtConsentModeConfig } from './nuxt-mode';
import { provideVueConsentContext } from './provide';
import type { NuxtConsentRequest } from './server-consent';
import { isSharedNuxtRender } from './shared-render';
import { TOKENS_STYLE_ID } from './tokens-style-id';
import { consentConfigKey } from './utils/symbols';

export { withClientData } from './client-data';

/**
 * Development only: after the first init, warn when the `/init` request the
 * page's HTML started (see `server/init-prefetch.ts`) is still unused. The
 * app asked with other inputs than the server expected, so the page sent
 * two requests.
 */
const warnUnusedInitPrefetch = function warnUnusedInitPrefetch(
	context: Pick<VueConsentKernelContext, 'kernel'>
): void {
	const stop = context.kernel.events.on('command:init:completed', () => {
		stop();
		// The key core's prefetch script stores its requests under.
		const pending = (window as { __c15tInitialDataPromises?: object })
			.__c15tInitialDataPromises;
		if (pending && Object.keys(pending).length > 0) {
			// oxlint-disable-next-line no-console -- Development-only diagnostic.
			console.warn(
				"[c15t] This page's HTML started an /init request that the app did not use, so it sent its own. A client plugin probably changed c15t's config for this route: set `routeRules: { '<route>': { c15t: { initPrefetch: false } } }`."
			);
		}
	});
};

/**
 * The `<body>`-end script that starts the `scripts` entries a visitor's
 * consent already allows, or `undefined` when it starts nothing. A
 * failed import renders the page without it; the script loader then starts
 * those entries after hydration.
 *
 * @param config - The merged c15t config.
 * @param state - The state the server resolved, with its clock.
 * @returns The head entry for the script.
 * @internal
 */
export const serverScriptStartHead = async function serverScriptStartHead(
	config: Partial<RuntimeConsentConfig>,
	state: RequestConsentState
) {
	if (!config.scripts?.length) {
		return;
	}
	let code: string | undefined;
	try {
		const { serverScriptStart } =
			await import('@c15t/core/runtime/script-server-start');
		code = serverScriptStart({
			...(config as unknown as Parameters<typeof serverScriptStart>[0]),
			prefetch: state,
		});
	} catch {
		return;
	}
	if (!code) {
		return;
	}
	const tag: {
		innerHTML: string;
		key: string;
		nonce?: string;
		tagPosition: 'bodyClose';
	} = { innerHTML: code, key: 'c15t-server-start', tagPosition: 'bodyClose' };
	if (config.nonce) {
		tag.nonce = config.nonce;
	}
	return { script: [tag] };
};

/**
 * Whether this plugin run is the server render. Nuxt replaces
 * `import.meta.server` at build time; elsewhere (unit tests) a missing
 * `window` decides.
 * @returns `true` on the server.
 * @internal
 */
const rendersOnServer = function rendersOnServer(): boolean {
	return (
		(import.meta as ImportMeta & { server?: boolean }).server ??
		typeof window === 'undefined'
	);
};

/**
 * `false` in Nuxt's client build, where `import.meta.server` is `false`:
 * written into each server branch's condition so the build drops the
 * branch and the server-only code it reaches.
 */
const SERVER_BUILD = (import.meta as ImportMeta & { server?: boolean }).server;

/** The part of Nuxt's SSR context this plugin edits. */
interface NuxtSSRModules {
	event?: { context: Record<string, unknown> };
	modules?: Set<string>;
	'~lazyHydratedModules'?: Set<string>;
}

/**
 * Server only: which c15t chunks the page's HTML preloads.
 *
 * A deferred visitor's browser loads the engine, which brings the stock
 * banner, after the page's priority images (`deferred/shell.ts`): the
 * banner's components are marked the way Nuxt marks lazily hydrated ones,
 * so the HTML still inlines their styles but no longer preloads their
 * chunks. Any other visitor's browser loads the engine as the app starts,
 * so the HTML preloads it with its imports (`DEFERRED_ENGINE_MANIFEST_KEY`,
 * which the module adds to the client manifest).
 *
 * @param nuxtApp - The Nuxt app; only a real server render has an SSR context.
 * @param deferred - Whether the browser defers the engine.
 * @param engineKey - The engine's client manifest key.
 */
const markEnginePreload = function markEnginePreload(
	nuxtApp: {
		ssrContext?: NuxtSSRModules;
		hook: (
			name: 'app:rendered',
			run: (rendered: { ssrContext?: NuxtSSRModules }) => void
		) => unknown;
	},
	deferred: boolean,
	engineKey: string
): void {
	const { ssrContext } = nuxtApp;
	if (!ssrContext) {
		return;
	}
	if (!deferred) {
		ssrContext.modules ??= new Set();
		ssrContext.modules.add(engineKey);
		return;
	}
	nuxtApp.hook('app:rendered', ({ ssrContext: rendered = ssrContext }) => {
		rendered['~lazyHydratedModules'] ??= new Set();
		const lazy = rendered['~lazyHydratedModules'];
		for (const id of rendered.modules ?? []) {
			if (isDeferredBannerModule(id)) {
				lazy.add(id);
			}
		}
	});
};

// oxlint-disable-next-line complexity -- One plugin: config, server resolution, and the browser's deferred or eager start.
export default defineNuxtPlugin(async (nuxtApp) => {
	const appConfig = useAppConfig();
	const runtimeConfig = useRuntimeConfig();
	const config = computed(() => {
		const merged = defu(
			appConfig.c15t,
			runtimeConfig.public.c15t
		) as Partial<RuntimeConsentConfig>;
		// `defu` skips `null`, so an app config `colorScheme: null` would fall
		// back to the module options. Nitro replaces `null` in runtime config
		// with `''` during the build, so a module option `colorScheme: null`
		// arrives as `''`. Both leave `c15t-dark` to the site.
		if (
			appConfig.c15t?.colorScheme === null ||
			(merged.colorScheme as string | null | undefined) === ''
		) {
			merged.colorScheme = null;
		}
		return merged;
	});
	// `mode` and `routePrefix` come from `nuxt.config.ts` only: the build
	// decided from them what the client bundle and the server routes hold.
	const modeConfig = runtimeConfig.public.c15t as NuxtConsentModeConfig;
	const mode = readNuxtMode(modeConfig);
	const routePrefix = readNuxtRoutePrefix(modeConfig);
	const serverResolves = resolvesOnServer(mode);
	// Tokens go in the head from the plugin, so the server HTML carries them
	// for the first paint and composed surfaces without ConsentRoot get
	// them too. The color scheme script sets `c15t-dark` in `<head>`, before
	// the server-rendered banner paints. Registered before the first await,
	// while the Nuxt context is still current.
	//
	// The CSS itself is generated by `theme-tokens.ts`, loaded on demand: a
	// browser that hydrates server HTML keeps the server's element as it is
	// (the head leaves an element no entry claims alone) and loads the
	// generator only when the config changes.
	const tokensCSS = shallowRef<string>();
	const renderTokens = async (): Promise<void> => {
		const { generateTokensCSS } = await import('./theme-tokens');
		const { colorScheme, theme, tokens } = config.value;
		tokensCSS.value = generateTokensCSS(tokens, { colorScheme, theme });
	};
	useHead(
		computed(() => {
			const { colorScheme, nonce } = config.value;
			const styles: Record<string, string>[] = [];
			if (tokensCSS.value !== undefined) {
				const style: Record<string, string> = {
					id: TOKENS_STYLE_ID,
					innerHTML: tokensCSS.value,
					key: TOKENS_STYLE_ID,
				};
				if (nonce) {
					style.nonce = nonce;
				}
				styles.push(style);
			}
			const script: { innerHTML: string; key: string; nonce?: string }[] = [];
			const scriptSource = buildColorSchemeScript(colorScheme);
			if (scriptSource) {
				const tag: (typeof script)[number] = {
					innerHTML: scriptSource,
					key: COLOR_SCHEME_SCRIPT_KEY,
				};
				if (nonce) {
					tag.nonce = nonce;
				}
				script.push(tag);
			}
			return { script, style: styles };
		})
	);
	// The client keeps the class right after the first paint: it follows
	// the system setting, or a site's `dark` class, as they change.
	const releaseColorScheme =
		typeof window === 'undefined'
			? () => undefined
			: applyColorScheme(config.value.colorScheme);
	// HTML that is prerendered or cached is served to every visitor, so it
	// must carry nobody's consent, location or request headers. The server
	// decides once and the payload tells the browser, which then resolves
	// the visitor itself, as on a first visit without a server render.
	const sharedRender = useNuxtState('c15t:shared-render', () =>
		isSharedNuxtRender({
			eventContext:
				typeof window === 'undefined' ? useRequestEvent()?.context : undefined,
			prerenderedAt: nuxtApp.payload.prerenderedAt,
		})
	);
	const shared = sharedRender.value;
	const requestHeaders = useNuxtState(
		'c15t:request-headers',
		(): Record<string, string> =>
			shared
				? {}
				: pickAllowedInitHeaders(useRequestHeaders([...INIT_HEADER_NAMES]))
	);
	const headers = requestHeaders.value;
	const onServer = rendersOnServer();
	const readsRecords = !(config.value.consentSource || shared);
	// The server fills it in below from the request's cookies. The browser
	// reads the cookie itself only when the payload has none, in the engine
	// (`deferred/engine.ts`).
	const initialRecords = useNuxtState<HydrationRecords | undefined>(
		'c15t:records',
		() => undefined
	);

	// The render resolves the visitor's consent once, on the server, and the
	// payload carries the state to the browser. `import.meta.server` keeps
	// the resolver, and the translations it bundles, out of the client build.
	const prefetched = useNuxtState<RequestConsentState | undefined>(
		'c15t:consent',
		() => undefined
	);
	// The snapshot the server rendered with, when the browser may start from
	// it and load the consent engine after the page (`deferred/shell.ts`).
	const boot = useNuxtState<NuxtConsentBoot | undefined>(
		'c15t:boot',
		() => undefined
	);
	// Read before the first await, while the Nuxt context is current.
	const request: NuxtConsentRequest | undefined =
		SERVER_BUILD !== false && onServer && readsRecords
			? {
					event: useRequestEvent(),
					headers: useRequestHeaders(),
					url: useRequestURL(),
				}
			: undefined;
	if (SERVER_BUILD !== false && request) {
		const { readStoredRecordsFromCookieHeader } =
			await import('@c15t/core/modules/persistence');
		initialRecords.value = readStoredRecordsFromCookieHeader(
			request.headers.cookie,
			config.value.storageConfig,
			Date.now()
		);
		if (serverResolves) {
			const { resolveNuxtConsent } = await import('./server-consent');
			const state = await resolveNuxtConsent(
				{ ...config.value, mode, routePrefix: routePrefix ?? false },
				request
			);
			// Only a resolved policy is worth the payload bytes; without one the
			// browser runs init, and the records travel in `c15t:records`.
			if (state.initialPolicyResolution !== undefined) {
				// The cookie's records and clock already travel in `c15t:records`;
				// only a subject the backend named is new.
				const { initialRecords: records, now: _now, ...rest } = state;
				const subject = records?.subject;
				// Raw: the state holds frozen policy objects, which a reactive
				// payload proxy cannot wrap.
				prefetched.value = markRaw(
					subject ? { ...rest, initialRecords: { subject } } : rest
				);
				// Runs a granted vendor's setup and inserts its tag before the page
				// hydrates. The script loader adopts the tag. The client registers
				// no such tag, so its head leaves the element alone.
				const startHead = await serverScriptStartHead(config.value, state);
				if (startHead) {
					nuxtApp.runWithContext(() => useHead(startHead));
				}
			}
		}
	}
	const prefetch = prefetched.value ? toRaw(prefetched.value) : undefined;
	const hasPrefetch = prefetch?.initialPolicyResolution !== undefined;

	nuxtApp.vueApp.provide(consentConfigKey, config);

	const onIABUnavailable = (error: Error) => {
		// The error page alone writes nothing to the console.
		console.error(error);
		void nuxtApp.runWithContext(() => showError(error));
	};
	const engineInput = (): NuxtEngineInput => ({
		config: config.value as RuntimeConsentConfig,
		headers,
		initialRecords: initialRecords.value
			? toRaw(initialRecords.value)
			: undefined,
		mode,
		onIABUnavailable,
		prefetchState: hasPrefetch ? prefetch : undefined,
		readsRecords,
		routePrefix,
	});

	// One runtime per app. Payload state is deep-reactive; the kernel gets
	// the plain objects. An `iab` policy without `iab` throws from here when
	// the server resolved it, and Nuxt renders its error page. A policy the
	// browser resolves (`ssr: false`, a prerendered page) shows the same
	// error page from the client.
	let context: VueConsentKernelContext;
	if (SERVER_BUILD !== false && onServer) {
		await renderTokens();
		const { createNuxtEngineContext } = await import('./deferred/engine');
		context = createNuxtEngineContext({
			...engineInput(),
			readsRecords: false,
		});
		// A visitor resolved for this request, who still has to choose and
		// whose accept or reject the browser can record without the engine,
		// starts from the server's snapshot; the engine loads after the page.
		const { canDeferEngine, DEFERRED_ENGINE_MANIFEST_KEY } =
			await import('./deferred/boot');
		const snapshot = context.kernel.getSnapshot();
		if (request && hasPrefetch && canDeferEngine(snapshot, config.value)) {
			boot.value = markRaw({ s: snapshot });
		}
		markEnginePreload(
			nuxtApp as unknown as Parameters<typeof markEnginePreload>[0],
			Boolean(boot.value),
			DEFERRED_ENGINE_MANIFEST_KEY
		);
		// A visitor resolved for this request whom the page shows no banner,
		// such as a returning one: the banner's preloads can wait behind the
		// page's images (`server/banner-preload-priority.ts`).
		const event = (nuxtApp.ssrContext as NuxtSSRModules | undefined)?.event;
		if (
			event &&
			request &&
			snapshot.resolution?.status === 'matched' &&
			snapshot.activeUI !== 'banner'
		) {
			const { QUIET_BANNER_CONTEXT_KEY } =
				await import('./server/banner-preload-priority');
			event.context[QUIET_BANNER_CONTEXT_KEY] = true;
		}
	} else {
		if (!nuxtApp.payload.serverRendered) {
			// No server HTML carries the tokens: they are in the head before
			// the app mounts.
			await renderTokens();
		}
		const bootState = boot.value ? toRaw(boot.value) : undefined;
		if (bootState && nuxtApp.payload.serverRendered) {
			context = createDeferredContext({
				config: () => config.value as RuntimeConsentConfig,
				loadEngine: async () => {
					// The stock banner hydrates once the engine is in: one round
					// trip for both.
					const [{ createNuxtEngineContext }] = await Promise.all([
						import('./deferred/engine'),
						loadConsentBanner(),
					]);
					return (committed) =>
						createNuxtEngineContext({ ...engineInput(), committed });
				},
				snapshot: toRaw(bootState.s),
			});
		} else {
			const { createNuxtEngineContext } = await import('./deferred/engine');
			context = createNuxtEngineContext(engineInput());
		}
	}
	provideVueConsentContext(nuxtApp.vueApp, context);

	if (typeof window !== 'undefined') {
		if (nuxtApp.payload.serverRendered || !serverResolves) {
			// Start after hydration, so the first client render matches the
			// server's HTML. Browser resolution also starts here: its
			// manifest and resolver requests left when the runtime was built,
			// so starting earlier would only put work in front of the mount.
			nuxtApp.hook('app:mounted', () => context.start());
		} else {
			// No server markup to match (`ssr: false`): start now, so `/init`
			// overlaps the mount instead of waiting for it.
			context.start();
		}
		if ((import.meta as ImportMeta & { dev?: boolean }).dev) {
			warnUnusedInitPrefetch(context);
		}
		// App config can change at runtime (`updateAppConfig`, HMR). The
		// runtime applies what changed.
		watch(config, (next) => {
			context.update(next as RuntimeConsentConfig);
			void renderTokens();
		});
	}
	nuxtApp.vueApp.onUnmount(() => {
		context.dispose();
		releaseColorScheme();
	});
});
