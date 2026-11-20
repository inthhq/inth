import type { AllConsentNames } from '../consent/consent-types';
import type { SSRInitialData } from '../options/ssr';
import type {
	KernelConfig,
	KernelTranslations,
	KernelTransport,
} from '../types';
import type { RememberedDecisionInputs } from './decision-inputs';
import { createHostedModeFactory } from './hosted-factory';
import { createV1HostedTransport } from './v1/hosted';

/**
 * Where a transport sends records: the project URL as resolved (`''` for
 * this origin), the property option and the fetch it uses.
 *
 * @internal
 */
export interface TransportBackend {
	projectUrl: string;
	property?: string;
	fetch?: typeof globalThis.fetch;
}

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
	 * Hears the backend a transport sends records to, once it has resolved
	 * it: the settings `@inth/sdk/runtime/documents` sends with.
	 *
	 * @internal
	 */
	backend?: (backend: TransportBackend) => void;
	/**
	 * Copy for another language from the bundled translations and the
	 * provider's `i18n.messages`, or `undefined` when neither has it. Lets a
	 * transport with no backend follow a language change.
	 */
	translationsFor?: (language: string) => KernelTranslations | undefined;
}

/** Transport kind exposed through `window.__inthDebug.mode`. */
export type ProviderTransportKind =
	| 'hosted'
	| 'manifest'
	| 'offline'
	// A factory built around a transport of its own, such as a test fake.
	| 'custom';

/**
 * Creates a kernel transport from provider runtime context.
 *
 * A provider builds one from its options: the hosted transport for
 * `projectUrl`, or the one its `mode` carries (`manifest()`, `testing()`).
 * `kind` lets adapters report the selected transport through
 * `window.__inthDebug.mode` without importing every transport implementation.
 */
export interface ProviderTransportFactory {
	(context: ProviderTransportContext): KernelTransport;
	readonly kind: ProviderTransportKind;
}

/** Options for {@link hosted}. */
export interface HostedModeOptions {
	/** Project URL. Can be relative (`/api/inth`) or absolute. */
	projectUrl: string;
	/**
	 * Host name or app ID the consent belongs to. Defaults to the page's
	 * host name, lowercase and less one trailing dot.
	 */
	property?: string;
	/** Fetch implementation used for backend requests. */
	fetch?: typeof globalThis.fetch;
	/**
	 * Headers a server-side caller forwards to init. Only the init inputs
	 * (`accept-language`, the supported geo headers, `sec-gpc`) are sent.
	 */
	headers?: Record<string, string>;
	/**
	 * URL for init. Defaults to `${projectUrl}/v1/consent/init`.
	 *
	 * Point this at a same-origin server route that resolves init from a
	 * manifest (for example with `resolveManifestInit` from
	 * `@inth/sdk/transports/manifest-cache`) while consent saves keep going
	 * to `${projectUrl}/v1/consent/records`. Manifest resolution never
	 * issues a `policySnapshotToken`, so setting `initUrl` also turns on
	 * `assertDecisionInputs`.
	 */
	initUrl?: string;
	/**
	 * Assert the resolved policy decision on a save that carries no signed
	 * `policySnapshotToken`, so the backend can reject a save made against
	 * a stale policy instead of recording it unbound.
	 *
	 * @defaultValue `true` when `initUrl` is set, otherwise `false`
	 */
	assertDecisionInputs?: boolean;
	/**
	 * An init response an inline prefetch script already requested. The
	 * first `init()` consumes it instead of calling `initUrl`, keeping the
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
 * `projectUrl`. Apps set `projectUrl` on the provider; adapters and tests
 * that need the hosted transport's other options call this.
 *
 * @returns A hosted provider transport factory carrying its options.
 * @example
 * ```ts
 * import { hosted } from '@inth/sdk-core/transports';
 *
 * const mode = hosted({ projectUrl: '/api/inth' });
 *
 * // Resolve init from a same-origin route, save to the backend. Saves
 * // assert the decision because `initUrl` is set.
 * const sameOriginInit = hosted({
 *   projectUrl: 'https://consent.example.com',
 *   initUrl: '/api/consent/init',
 * });
 * ```
 */
export const hosted = function hosted(
	options: HostedModeOptions
): HostedModeFactory {
	return createHostedModeFactory(options, createV1HostedTransport);
};
