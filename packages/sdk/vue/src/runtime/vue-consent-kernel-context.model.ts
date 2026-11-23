/**
 * The types of the Vue side of the consent runtime: the context
 * `createVueConsentKernelContext` builds, the config it reads and the
 * options it takes. Type-only, so the Nuxt plugin's first-load chunk and
 * `@inth/nuxt`'s options can name them without the runtime.
 */
import type {
	ConsentExperiment,
	ConsentKernel,
	ConsentSnapshot,
	HydrationRecords,
	IABUnavailableError,
	KernelConfig,
	ProviderTransportFactory,
} from '@inth/sdk/engine';
import type { IframeBlockerOptions } from '@inth/sdk/modules/iframe-blocker';
import type {
	BlockedRequestInfo,
	NetworkBlockerRule,
} from '@inth/sdk/modules/network-blocker';
import type { StorageConfig } from '@inth/sdk/modules/persistence';
import type { Script } from '@inth/sdk/modules/script-loader';
import type {
	ConsentRuntimeIABHandle,
	RuntimeGPPOptions,
} from '@inth/sdk/runtime';
import type { ConsentRuntime } from '@inth/sdk/runtime/provider';
import type { ConsentActiveUI } from '@inth/sdk/schema/config';
import type { InitOutput } from '@inth/sdk/schema/types';
import type { Ref } from 'vue';

import type { ConsentConfig } from './config';
import type { VueConsentDisplayData } from './display-data.model';
import type { RegisteredScripts } from './with-registered-scripts';

/**
 * What the stock banner reads while it waits to hydrate under the Nuxt
 * plugin's deferred context: the server's snapshot until it has hydrated,
 * then the live one. See `deferred/create-deferred-context.ts`.
 *
 * @internal
 */
export interface ConsentBannerView {
	/** The context the banner's composables read. */
	context: VueConsentKernelContext;
	snapshot: Readonly<Ref<ConsentSnapshot>>;
	init: Readonly<Ref<VueConsentDisplayData | undefined>>;
	activeUI: Ref<ConsentActiveUI>;
	storedConsent: Readonly<Ref<ConsentSnapshot['explicitChoice']>>;
	/** Resolves once the engine attached; the banner hydrates after it. */
	ready: Promise<void>;
	/** Call once the banner has hydrated. */
	hydrated: () => void;
	/**
	 * Keep the banner on the server's snapshot until the returned function
	 * runs, after {@link ConsentBannerView.hydrated}. A part of the banner
	 * whose chunk hydrates later than the banner, such as a Privacy Choices
	 * presentation, takes one while it waits, so it hydrates against the
	 * same snapshot the server rendered. Once released, it does nothing.
	 */
	hold: () => () => void;
}

export interface VueConsentKernelContext {
	/**
	 * The runtime this app renders: the one the plugin built, or the one a
	 * host handed it (`ownsKernel` is then `false`). Under the Nuxt
	 * plugin's deferred context it is `undefined` until the consent engine
	 * attaches; {@link VueConsentKernelContext.ready} settles then. Read it
	 * when you need it, not at setup.
	 */
	runtime: ConsentRuntime | undefined;
	/**
	 * Settles once {@link VueConsentKernelContext.runtime} is there: at
	 * once for an engine the app loaded with its first chunk, when the
	 * deferred engine attaches otherwise. Waiting on it does not load the
	 * engine.
	 */
	ready: Promise<void>;
	/**
	 * Mounted client CMP handle; absent before mount or outside an IAB
	 * policy. Follows the runtime; assigning replaces it until the runtime
	 * mounts another.
	 */
	iab: ConsentRuntimeIABHandle | undefined;
	/** Clears records through the runtime: storage when mounted, then memory. */
	clearRecords: () => void;
	kernel: ConsentKernel;
	snapshot: Ref<ConsentSnapshot>;
	init: Ref<VueConsentDisplayData | undefined>;
	activeUI: Ref<ConsentActiveUI>;
	storedConsent: Readonly<Ref<ConsentSnapshot['explicitChoice']>>;
	/**
	 * Whether the visitor's policy uses IAB TCF on an app without `iab`.
	 * The context reports an {@link IABUnavailableError} for it, and
	 * `InthProvider` renders no surface meanwhile.
	 */
	iabUnavailable: Readonly<Ref<boolean>>;
	ownsKernel: boolean;
	/**
	 * The experiment the runtime validates, assigns and attributes.
	 * Presentation and theme resolve against it too; a later config change
	 * is ignored.
	 */
	experimentDefinition?: ConsentExperiment;
	/**
	 * Mount the browser side of a runtime this app owns: persistence, the
	 * blockers, IAB, `window.__inthDebug`, and the first `/v1/consent/init` (or the adoption
	 * of a server-resolved prefetch). A no-op on the server, when already
	 * started, and for a borrowed runtime, whose host starts it.
	 */
	start: () => void;
	/**
	 * Change the decision-input overrides (country, region, language) and
	 * ask for the policy again once the runtime runs. Before
	 * {@link VueConsentKernelContext.start} the first `/v1/consent/init` carries them.
	 */
	setOverrides: (
		overrides: Pick<
			ConsentSnapshot['overrides'],
			'country' | 'language' | 'region'
		>
	) => void;
	/**
	 * Store the visitor's language and run `init` again, as
	 * `ConsentRuntime.setLanguage` does. Before the deferred engine has
	 * loaded, the change waits for it.
	 */
	setLanguage: (language: string) => void;
	/**
	 * Apply a new config to a runtime this app owns: scripts, network and
	 * iframe blocking, vendors, categories, callbacks and the reload rule
	 * follow it. Storage, transport and experiment options are read once.
	 */
	update: (config: RuntimeConsentConfig) => void;
	/**
	 * Add scripts a component decides at runtime to the app's script
	 * loader, next to the config's `scripts`. Returns a handle that swaps
	 * or removes them. Under the Nuxt plugin's deferred context a script
	 * that may run now loads the engine at once, and a banner choice made
	 * before the engine starts the plain entries it allows. A borrowed
	 * runtime's scripts belong to its host, so the context runs one loader
	 * of its own on that runtime's kernel for the registered scripts.
	 */
	registerScripts: (scripts: readonly Script[]) => RegisteredScripts;
	dispose: () => void;
	/**
	 * Set by the Nuxt plugin's deferred context only: what the stock banner
	 * reads until it has hydrated.
	 *
	 * @internal
	 */
	bannerView?: ConsentBannerView;
}

/**
 * Network-blocker options, mirroring `UseNetworkBlockerOptions` in
 * `@inth/react` (v3 provider) and `@inth/svelte`.
 */
export interface UseNetworkBlockerOptions {
	rules: NetworkBlockerRule[];
	enabled?: boolean;
	logBlockedRequests?: boolean;
	onRequestBlocked?: (info: BlockedRequestInfo) => void;
}

export type RuntimeConsentConfig = ConsentConfig & {
	scripts?: Script[];
	/**
	 * Content Security Policy nonce stamped on every `<script>` the script
	 * loader creates. A per-script `nonce` takes precedence.
	 */
	nonce?: string;
	storageConfig?: StorageConfig;
	/**
	 * `serverStart: false` starts every `scripts` entry after hydration. By
	 * default a server render starts the entries the visitor's consent
	 * already allows from its HTML, before the app hydrates.
	 */
	scriptLoader?: { serverStart?: boolean };
	/**
	 * Block matching network requests until the mapped consent category is
	 * granted. Same shape as the react/svelte `networkBlocker` option;
	 * omitted/`false` disables the module.
	 */
	networkBlocker?: UseNetworkBlockerOptions | false;
	/**
	 * Consent-gate iframes (YouTube, maps, social embeds). Enabled by default
	 * to match `@inth/svelte`; pass `false` to opt out or an options object to
	 * tune automatic blocking.
	 */
	iframeBlocker?: Omit<IframeBlockerOptions, 'kernel'> | false;
	/**
	 * IAB Global Privacy Platform: install `window.__gpp` once the app
	 * mounts and keep its GPP string in step with the visitor's choices.
	 * `true` or `{}` uses the defaults; omitted or `false` leaves GPP off.
	 * The GPP code loads as its own chunk, only when this is set. A load
	 * failure, or another CMP that already owns `__gpp`, is reported to
	 * `callbacks.onError`. Ignored with `consentSource`, and when the plugin
	 * renders a `runtime` it did not create: set `gpp` on that runtime.
	 *
	 * @example
	 * ```ts
	 * gpp: { usApproach: 'national' }
	 * ```
	 */
	gpp?: RuntimeGPPOptions | boolean;
};

/** Where an app sets `iab`, for the fix an {@link IABUnavailableError} names. */
export type VueIABHost = 'nuxt' | 'vue';

/** What `createVueConsentKernelContext` builds a context from. */
export interface VueConsentContextOptions {
	config: RuntimeConsentConfig;
	/**
	 * Where the policy comes from: a transport factory such as `manifest()`
	 * or `hosted()` from `@inth/vue/vue-plugin`, or the one the Nuxt plugin
	 * builds from its `mode` data. Required unless `runtime` or a test
	 * `transport` is given.
	 */
	mode?: ProviderTransportFactory;
	/** The request's consent headers (Nuxt), for init and the manifest inputs. */
	headers?: Record<string, string | undefined>;
	/** A resolved `/v1/consent/init` answer to start from (`config.prefetch` otherwise). */
	prefetch?: InitOutput;
	/**
	 * The state a server render resolved for this request (Nuxt), used in
	 * place of `prefetch`: the init is already folded in.
	 */
	prefetchState?: KernelConfig;
	/**
	 * Records the server read from the request cookie. They seed the kernel,
	 * and persistence applies only newer stored denials over them.
	 */
	initialRecords?: HydrationRecords;
	/** The evaluation clock the records were read at. */
	now?: number;
	/**
	 * Kernel configuration merged over the prefetch; a `transport` replaces
	 * the `mode`. A test seam.
	 *
	 * @internal
	 */
	kernelConfig?: KernelConfig;
	/** A runtime the host owns. The context renders it and starts nothing. */
	runtime?: ConsentRuntime;
	/**
	 * Where the app sets `iab`, named in the fix of an
	 * {@link IABUnavailableError}. Defaults to `'vue'`.
	 */
	host?: VueIABHost;
	/**
	 * Receives the {@link IABUnavailableError} when a policy that resolves
	 * after construction (`/v1/consent/init` in the browser) uses IAB TCF on an app
	 * without `iab`. Called once, in a microtask. Defaults to throwing it
	 * as an uncaught error; the Nuxt plugin shows Nuxt's error page.
	 */
	onIABUnavailable?: (error: IABUnavailableError) => void;
}
