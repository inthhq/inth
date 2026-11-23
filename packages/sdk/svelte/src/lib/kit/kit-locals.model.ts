import type { ExperimentState, KernelConfig } from '@inth/sdk/engine';
import type { ConsentMode } from '@inth/sdk/modes';
import type {
	ConsentManifest,
	ConsentRequestHeaderInputs,
} from '@inth/sdk/schema/types';

/**
 * How the request is read: the consent cookie name and explicit
 * geo/language overrides. Shared by `inthHandle` and `loadConsent`.
 */
export interface ConsentRequestOptions {
	/**
	 * Cookie name holding persisted consent. Defaults to `inth`, the
	 * persistence module's storage key. Set this only if you customized
	 * `storageConfig.storageKey` client-side; it must match.
	 */
	cookieName?: string;
	/** Force the resolved country, ignoring geo headers. */
	country?: string;
	/** Force the resolved region, ignoring geo headers. */
	region?: string;
	/** Force the resolved language, ignoring `Accept-Language`. */
	language?: string;
}

/**
 * The visitor's resolved consent state: the JSON-serializable subset of
 * `KernelConfig` the server helpers return and the provider's `prefetch`
 * prop accepts. `transport` is omitted because it holds functions, which a
 * SvelteKit `load` cannot serialize.
 */
export type ConsentState = Omit<KernelConfig, 'transport'> & ExperimentState;

/**
 * How a visitor is resolved: `manifest()` (a handle with no mode),
 * `hosted()` or `testing()`. @internal
 */
export type KitMode = ConsentMode;

/**
 * What {@link inthHandle} stores on `event.locals.inth`.
 *
 * `config` is the serializable {@link ConsentState} read from the cookie
 * and the request alone; `inputs` is the normalized geo/language/GPC
 * context the handle derived from the request, kept so downstream loads
 * and route handlers do not re-parse headers. `mode`, `projectUrl`,
 * `proxy`, `routePrefix` and `snapshot` are the handle's options, for
 * `loadConsent` and `createConsentRoute`.
 */
export interface InthLocals {
	/** Consent state seeded from the consent cookie and request inputs. */
	config: ConsentState;
	/** Normalized country / region / language / GPC for this request. */
	inputs: ConsentRequestInputs;
	/** How `loadConsent` resolves the visitor. */
	mode: KitMode;
	/** The Inth backend, when the handle was given one. */
	projectUrl?: string;
	/** Prefix of the app's consent route, such as `/api/inth`. */
	routePrefix?: string;
	/** The browser saves consent through the consent route. */
	proxy?: true;
	/** A manifest that replaces the one the build downloaded. */
	snapshot?: ConsentManifest;
	/**
	 * The cookie name the handle actually read, when it was given one.
	 * `loadConsent` falls back to it so a per-call geo override does not
	 * silently re-read the default `inth` key and lose persisted consent.
	 */
	cookieName?: string;
	/**
	 * Set while SvelteKit prerenders: the page is shared between visitors,
	 * so `loadConsent` makes no upstream call and carries no visitor state.
	 */
	shared?: true;
}

/** Normalized consent request context. Re-exported for `App.Locals` users. */
export type ConsentRequestInputs = ConsentRequestHeaderInputs;
