import type { StorageConfig } from '@inth/sdk/engine';
import type { ConsentMode } from '@inth/sdk/modes';
import type {
	ConsentManifest,
	ConsentRequestHeaderInputs,
} from '@inth/sdk/schema/types';

import type { ConsentState } from '../server/types';

export type { ConsentRequestOptions, ConsentState } from '../server/types';

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
 * and route handlers do not re-parse headers. `mode`, `routePrefix` and
 * `snapshot` are the handle's options, for `loadConsent`.
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
	/** A manifest that replaces the one the build downloaded. */
	snapshot?: ConsentManifest;
	/**
	 * The cookie name the handle actually read, when it was given one.
	 * `loadConsent` falls back to it so a per-call geo override does not
	 * silently re-read the default `inth` key and lose persisted consent.
	 */
	cookieName?: string;
	/**
	 * @deprecated Inth no longer sets a subject cookie, so the handle never
	 * sets this. Removed in v4.
	 */
	storage?: Pick<
		StorageConfig,
		'crossSubdomain' | 'defaultDomain' | 'defaultExpiryDays'
	>;
	/**
	 * @deprecated Inth no longer sets a subject cookie, so the handle never
	 * sets this. Removed in v4.
	 */
	trustForwardedHeaders?: boolean;
	/**
	 * @deprecated Inth no longer sets a subject cookie, so the handle never
	 * sets this. Removed in v4. Read the request's own `Cookie` header.
	 */
	cookie?: string;
	/**
	 * @deprecated Inth no longer sets a subject cookie, so the handle never
	 * sets this. Removed in v4.
	 */
	subjectCookie?: false;
	/**
	 * Set while SvelteKit prerenders: the page is shared between visitors,
	 * so `loadConsent` makes no upstream call and carries no visitor state.
	 */
	shared?: true;
}

/** Normalized consent request context. Re-exported for `App.Locals` users. */
export type ConsentRequestInputs = ConsentRequestHeaderInputs;
