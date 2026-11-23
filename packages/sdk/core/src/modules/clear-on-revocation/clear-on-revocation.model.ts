import type { OptionalConsentCategory } from '../../consent-record/types';
import type { cookieDomainsOf } from '../../libs/cookie/domain-utils';
import type { StorageConfig } from '../../libs/cookie/types';
import type { ConsentKernel } from '../../types';
import type { getEffectiveGateState } from '../has';

/** A cookie name or nonempty prefix ending in `*`, with optional scope. */
export interface ClearOnRevocationCookie {
	/** Exact raw cookie name or prefix such as `_ga*`. */
	name: string;
	/** Explicit domain. An empty string selects host-only cookies. */
	domain?: string;
	/** Explicit path. Defaults to the current path and its ancestors. */
	path?: string;
	/** Clear the cookie in the current partition. Requires HTTPS. */
	partitioned?: boolean;
}

/** Browser data owned by one optional consent category. */
export interface ClearOnRevocationTargets {
	/** Cookie names or scoped targets. Only a trailing prefix `*` is supported. */
	cookies?: readonly (string | ClearOnRevocationCookie)[];
	/** Exact localStorage keys or nonempty prefixes ending in `*`. */
	localStorage?: readonly string[];
	/** Exact sessionStorage keys or nonempty prefixes ending in `*`. */
	sessionStorage?: readonly string[];
}

/** Explicit browser-data targets to remove when their category is denied. */
export type ClearOnRevocationConfig = Partial<
	Record<OptionalConsentCategory, ClearOnRevocationTargets>
>;

/** Options for subscribing browser-data cleanup to a consent kernel. */
export interface ClearOnRevocationOptions {
	kernel: ConsentKernel;
	config: ClearOnRevocationConfig;
	/** The persistence configuration, used to protect custom consent keys. */
	storageConfig?: StorageConfig;
}

/** Owns the cleanup subscription. */
export interface ClearOnRevocationHandle {
	/** Stop observing consent. Does not delete browser data. */
	dispose: () => void;
}

/**
 * What data clearing calls but does not import, so it can load on demand
 * as one self-contained chunk. The public entry passes the shared
 * implementations.
 * @internal
 */
export interface ClearOnRevocationTools {
	/** `cookieDomainsOf`: the domains a cookie may be scoped to. */
	cookieDomainsOf: typeof cookieDomainsOf;
	gateState: typeof getEffectiveGateState;
	optionalConsentCategories: readonly OptionalConsentCategory[];
	/** `ownedStorageKeys`: the names cleanup never deletes. */
	ownedStorageKeys: (config?: StorageConfig) => string[];
	/**
	 * The sessionStorage names cleanup never deletes. Inth keeps no consent
	 * record there, only a `journey: 'tab'` journey id.
	 */
	ownedSessionStorageKeys: readonly string[];
}
