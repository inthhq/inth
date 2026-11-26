/**
 * The Gainsight PX adapter: keeps one PX installation per page. PX runs one
 * SDK bundle for the page's lifetime and keeps its product key and startup
 * config, so the adapter refuses to start PX once another installation or
 * another product key has started, or with another config. Before a grant
 * loads the file it clears a pending queue stub that never started, so a
 * retry rebuilds the queue from the current setup. Once PX's bundle has
 * started, a later mount runs callbacks only, without a second loader.
 *
 * A manifest from the Inth server names it as
 * `adapter: { id: 'gainsight-px', options: { productKey } }`; the
 * `gainsightPx()` helper in `@inth/integrations` builds its script with the
 * same function, and passes what only a site's own code can: its PX config,
 * user and account.
 */
import type { Script } from '../../libs/script-loader/types';
import type { ManifestAdapter } from '../adapter';

/** What the Inth server may set for the adapter. */
export interface GainsightPxAdapterOptions {
	/** PX product key; the loader's `a` parameter and the stub's `p`. */
	productKey: string;
}

/**
 * The startup setup a site's own code passes, which the adapter checks
 * against the setup PX started with. The Inth server sends none.
 */
export interface GainsightPxExtras {
	config?: unknown;
	user?: unknown;
	account?: unknown;
}

// Keep the installed key across server startup and PX replacing its stub.
const productKeyGlobal = '__inthGainsightPxProductKey';
// PX may replace its stub and discard its queue before client hydration.
const setupGlobal = '__inthGainsightPxSetup';

type PageGlobals = Record<string, unknown>;

const page = (): PageGlobals => window as unknown as PageGlobals;

const hasStartedGainsightPx = (): boolean => {
	if (typeof window === 'undefined' || !('aptrinsic' in window)) {
		return false;
	}
	const { aptrinsic } = page();
	// PX sets this before initialization and checks it to reject a second bundle.
	return (
		typeof aptrinsic === 'function' &&
		'__sdkBundleStarted' in aptrinsic &&
		aptrinsic.__sdkBundleStarted === true
	);
};

const clearPendingGainsightPx = (): void => {
	if (typeof window === 'undefined' || !('aptrinsic' in window)) {
		return;
	}
	const { aptrinsic } = page();
	if (
		typeof aptrinsic === 'function' &&
		'q' in aptrinsic &&
		Array.isArray(aptrinsic.q) &&
		!(
			'__sdkBundleStarted' in aptrinsic && aptrinsic.__sdkBundleStarted === true
		)
	) {
		Reflect.deleteProperty(window, 'aptrinsic');
		Reflect.deleteProperty(window, productKeyGlobal);
	}
};

/**
 * Whether `value` equals `expected` as data: objects of one prototype
 * compare by key regardless of order, arrays also by length, and a key
 * holding `undefined` counts as missing. PX setups are JSON, so there are
 * no cycles to follow.
 */
const equalConfig = (value: unknown, expected: unknown): boolean => {
	if (Object.is(value, expected)) {
		return true;
	}
	if (
		typeof value !== 'object' ||
		typeof expected !== 'object' ||
		value === null ||
		expected === null ||
		Object.getPrototypeOf(value) !== Object.getPrototypeOf(expected) ||
		(Array.isArray(value) && value.length !== (expected as unknown[]).length)
	) {
		return false;
	}
	const own = (record: Readonly<Record<string, unknown>>) =>
		Object.entries(record).filter(([, item]) => item !== undefined);
	const left = own(value as Record<string, unknown>);
	const right = new Map(own(expected as Record<string, unknown>));
	return (
		left.length === right.size &&
		left.every(
			([key, item]) => right.has(key) && equalConfig(item, right.get(key))
		)
	);
};

/**
 * Throws when PX has started under another installation, or another
 * product key. Removing the other snippet, or reloading, is the only way to
 * switch: PX keeps one bundle for the page's lifetime.
 */
const assertProductKey = (productKey: string): void => {
	if (typeof window === 'undefined') {
		return;
	}
	const previous =
		productKeyGlobal in window ? page()[productKeyGlobal] : undefined;
	if (!hasStartedGainsightPx()) {
		return;
	}
	// Inth's bootstrap always records its product key, including server starts.
	if (typeof previous !== 'string') {
		throw new Error(
			'gainsightPx: another Gainsight PX installation is already running. Remove the other PX snippet and reload the page.'
		);
	}
	if (previous !== productKey) {
		throw new Error(
			'gainsightPx: cannot change productKey after the SDK has started. Reload the page to switch PX products.'
		);
	}
};

const assertStartupConfig = (config: unknown): void => {
	if (typeof window === 'undefined' || !hasStartedGainsightPx()) {
		return;
	}
	const previous = setupGlobal in window ? page()[setupGlobal] : undefined;
	if (
		typeof previous === 'object' &&
		previous !== null &&
		'config' in previous &&
		!equalConfig(previous.config, {
			...(config as object | undefined),
			enableTag: true,
		})
	) {
		throw new Error(
			'gainsightPx: cannot change config after the SDK has started. Reload the page to change PX configuration.'
		);
	}
};

const unadoptedServerElement = (): HTMLScriptElement | undefined => {
	const scope: object = globalThis;
	const started = '__inthStarted' in scope ? scope.__inthStarted : undefined;
	if (typeof started !== 'object' || started === null) {
		return;
	}
	// Server starts key elements by `resourceKey ?? id` and record the script id.
	const element = Object.values(started).find(
		(candidate): candidate is HTMLScriptElement =>
			candidate instanceof HTMLScriptElement &&
			'__inthScript' in candidate &&
			candidate.__inthScript === 'gainsight-px'
	);
	if (
		!element ||
		('__inthAdopted' in element && element.__inthAdopted) ||
		!(
			element.isConnected ||
			('__inthInsert' in element && element.__inthInsert) ||
			('__inthHeld' in element && element.__inthHeld)
		)
	) {
		return;
	}
	return element;
};

const isGainsightPxCallbackOnly = (): boolean =>
	hasStartedGainsightPx() && !unadoptedServerElement();

const matchesPendingServerSetup = (
	productKey: string,
	extras: GainsightPxExtras
): boolean => {
	const pending = 'aptrinsic' in window ? page().aptrinsic : undefined;
	if (
		typeof pending !== 'function' ||
		!('q' in pending) ||
		!Array.isArray(pending.q)
	) {
		return false;
	}
	const identities = pending.q
		.filter(
			(entry: unknown): entry is { 0: 'identify'; 1?: unknown; 2?: unknown } =>
				typeof entry === 'object' &&
				entry !== null &&
				'0' in entry &&
				entry[0] === 'identify'
		)
		.map((entry) => ({
			account: entry[2],
			user: entry[1],
		}));
	return (
		'p' in pending &&
		pending.p === productKey &&
		'c' in pending &&
		equalConfig(pending.c, {
			...(extras.config as object | undefined),
			enableTag: true,
		}) &&
		equalConfig(
			identities,
			extras.user ? [{ account: extras.account, user: extras.user }] : []
		)
	);
};

const assertServerSetup = (
	productKey: string,
	extras: GainsightPxExtras,
	script: Script
): void => {
	if (typeof window === 'undefined') {
		return;
	}
	const element = unadoptedServerElement();
	if (!element) {
		return;
	}
	const matches = hasStartedGainsightPx()
		? equalConfig(page()[setupGlobal], {
				account: extras.account,
				config: { ...(extras.config as object | undefined), enableTag: true },
				productKey,
				user: extras.user,
			})
		: matchesPendingServerSetup(productKey, extras);
	if (
		!matches ||
		element.src !== new URL(script.src ?? '', document.baseURI).href
	) {
		throw new Error(
			'gainsightPx: server and client options must match when hydrating a server-started SDK. Render the same productKey, config, user, account and scriptUrl on both sides, or reload the page with the current options.'
		);
	}
};

/**
 * Checks, before a script is built, that PX has not started under another
 * installation, product key or config, and forgets a product key recorded
 * by a PX that is gone.
 *
 * @throws {Error} When it has.
 */
export const assertGainsightPxSetup = function assertGainsightPxSetup(
	productKey: string,
	extras: GainsightPxExtras = {}
): void {
	if (typeof window !== 'undefined' && !('aptrinsic' in window)) {
		Reflect.deleteProperty(window, productKeyGlobal);
	}
	assertProductKey(productKey);
	assertStartupConfig(extras.config);
};

/**
 * `base`, the script the PX manifest builds, with the checks that keep one
 * PX installation per page. A server render cannot start it from the HTML:
 * the script has no `serverStart`.
 */
export const gainsightPxScript = function gainsightPxScript(
	base: Script,
	{ productKey }: GainsightPxAdapterOptions,
	extras: GainsightPxExtras = {}
): Script {
	const {
		onBeforeLoad: manifestBeforeLoad,
		onConsentChange: manifestConsentChange,
		serverStart: _serverStart,
		...rest
	} = base;
	return {
		...rest,
		// Let core adopt and own the server element before later API-only mounts.
		callbackOnly: isGainsightPxCallbackOnly,
		observeConsentBeforeLoad: true,
		onBeforeLoad: (info) => {
			assertProductKey(productKey);
			if (info.hasConsent) {
				assertStartupConfig(extras.config);
			}
			if (info.hasConsent && !info.startedOnServer) {
				clearPendingGainsightPx();
			}
			manifestBeforeLoad?.(info);
		},
		onConsentChange: (info) => {
			if (info.hasConsent) {
				assertProductKey(productKey);
				assertStartupConfig(extras.config);
			}
			manifestConsentChange?.(info);
		},
		validate: (resolved) => {
			assertProductKey(productKey);
			assertServerSetup(productKey, extras, resolved);
			assertStartupConfig(extras.config);
		},
	};
};

const PRODUCT_KEY = /^[A-Za-z0-9-]{1,64}$/u;

/**
 * Why `options` are not {@link GainsightPxAdapterOptions}, or `undefined`.
 * It refuses any name it does not know.
 */
export const gainsightPxOptionsProblem = function gainsightPxOptionsProblem(
	options: Readonly<Record<string, unknown>>
): string | undefined {
	const extra = Object.keys(options).find((name) => name !== 'productKey');
	if (extra !== undefined) {
		return `it has the unknown option ${extra}`;
	}
	return typeof options.productKey === 'string' &&
		PRODUCT_KEY.test(options.productKey)
		? undefined
		: 'its productKey is not a product key';
};

/** The Gainsight PX adapter, as `adapter: { id: 'gainsight-px' }` runs it. */
export const gainsightPxAdapter: ManifestAdapter<GainsightPxAdapterOptions> = {
	id: 'gainsight-px',
	problem: gainsightPxOptionsProblem,
	script: (base, options) => {
		// The script tag builds the script once per list, as the npm helper
		// does when it is called.
		if (typeof window !== 'undefined' && !('aptrinsic' in window)) {
			Reflect.deleteProperty(window, productKeyGlobal);
		}
		return gainsightPxScript(base, options);
	},
};
