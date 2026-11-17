import type { AllConsentNames } from '../consent/consent-types';
import type { SSRInitialData } from '../options/ssr';
import type {
	KernelConfig,
	KernelTranslations,
	KernelTransport,
} from '../types';
import type { RememberedDecisionInputs } from './decision-inputs';
import { createHostedTransport } from './hosted';
import { createHostedModeFactory } from './hosted-factory';

/** Runtime values supplied by a provider to a transport factory. */
export interface ProviderTransportContext {
	/** Categories configured on the provider. */
	consentCategories?: AllConsentNames[];
	/** Whether the provider configured IAB TCF. */
	iabEnabled?: boolean;
	/**
	 * Whether the runtime mounts IAB GPP. Its US sections read the
	 * visitor's country and state from the init answer, so a transport
	 * that could answer without a location should ask the backend instead.
	 */
	gppEnabled?: boolean;
	/** Server-prefetched kernel configuration. */
	prefetch: KernelConfig;
	/**
	 * The server's state while it still streams in; `prefetch` holds it
	 * once it arrives. A transport that warms up ahead of `init()` can wait
	 * for it: when it carries a policy, the first `init()` never reaches
	 * the transport.
	 *
	 * @internal
	 */
	pendingPrefetch?: PromiseLike<Partial<KernelConfig> | undefined>;
	/** Translations resolved from the provider's i18n configuration. */
	translations: KernelTranslations;
	/**
	 * Copy for another language from the bundled translations and the
	 * provider's `i18n.messages`, or `undefined` when neither has it. Lets a
	 * transport with no backend follow a language change.
	 */
	translationsFor?: (language: string) => KernelTranslations | undefined;
}

/** Transport kind exposed through `window.c15t.mode`. */
export type ProviderTransportKind =
	| 'hosted'
	| 'manifest'
	| 'offline'
	// The deprecated `custom()` that `@c15t/react-native` still uses.
	| 'custom';

/**
 * Creates a kernel transport from provider runtime context.
 *
 * A provider builds one from its options: `hosted()` for `backendURL`,
 * `manifest()` for `mode`, and the testing value's own for `testing`.
 * `kind` lets adapters report the selected transport through
 * `window.c15t.mode` without importing every transport implementation.
 *
 * @param context - Provider values needed to create the transport.
 * @returns A transport for the consent kernel.
 */
export interface ProviderTransportFactory {
	(context: ProviderTransportContext): KernelTransport;
	readonly kind: ProviderTransportKind;
}

/** Options for {@link hosted}. */
export interface HostedModeOptions {
	/** Backend URL. Can be relative (`/api/c15t`) or absolute. */
	backendURL: string;
	/** Domain sent when consent is saved. */
	domain?: string;
	/** Fetch implementation used for backend requests. */
	fetch?: typeof globalThis.fetch;
	/** Headers forwarded to the backend init endpoint. */
	headers?: Record<string, string>;
	/**
	 * URL used for `GET /init`. Defaults to `${backendURL}/init`.
	 *
	 * Point this at a same-origin server route that resolves init from a
	 * manifest (for example with `resolveManifestInit` from
	 * `@c15t/core/transports/manifest-cache`) while consent saves keep going
	 * to `${backendURL}/subjects`. Manifest resolution never issues a
	 * `policySnapshotToken`, so setting `initURL` also turns on
	 * `assertDecisionInputs`.
	 */
	initURL?: string;
	/**
	 * Assert the resolved policy decision on `POST /subjects` when the save
	 * carries no signed `policySnapshotToken`, so the backend can reject a
	 * save made against a stale policy instead of recording it unbound.
	 *
	 * @defaultValue `true` when `initURL` is set, otherwise `false`
	 */
	assertDecisionInputs?: boolean;
	/**
	 * An init response an inline prefetch script already requested. The
	 * first `init()` consumes it instead of calling `initURL`, keeping the
	 * decision-input assertion intact.
	 */
	initialData?: Promise<SSRInitialData | undefined>;
	/**
	 * Decision inputs a server-side prefetch already resolved, so a save
	 * made before the first client `init()` resolves still carries the
	 * decision assertion. Only used with `assertDecisionInputs`.
	 */
	decisionInputs?: RememberedDecisionInputs;
}

/**
 * What `hosted()` returns: a transport factory that also carries its
 * options as enumerable data.
 */
export type HostedModeFactory = ProviderTransportFactory &
	Readonly<HostedModeOptions> & {
		readonly kind: 'hosted';
		readonly type: 'hosted';
	};

/**
 * Builds the hosted transport factory a provider uses for its
 * `backendURL`. Apps set `backendURL` on the provider; adapters and tests
 * that need the hosted transport's other options call this.
 *
 * @param options - Hosted backend connection options.
 * @returns A hosted provider transport factory carrying its options.
 * @example
 * ```ts
 * import { hosted } from '@c15t/core/transports';
 *
 * const mode = hosted({ backendURL: '/api/c15t' });
 *
 * // Resolve init from a same-origin route, save to the backend. Saves
 * // assert the decision because `initURL` is set.
 * const sameOriginInit = hosted({
 *   backendURL: 'https://consent.example.com',
 *   initURL: '/api/consent/init',
 * });
 * ```
 */
export const hosted = function hosted(
	options: HostedModeOptions
): HostedModeFactory {
	return createHostedModeFactory(options, createHostedTransport);
};
