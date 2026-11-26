/**
 * The Cloudflare Zaraz adapter: keeps the purposes in Zaraz's Consent API
 * in step with Inth consent. Zaraz runs from Cloudflare's edge, so nothing
 * loads; on every consent change the adapter reads the live purposes from
 * `zaraz.consent.getAll()`, allows each mapped one whose category is
 * allowed, denies every other one, including purposes the mapping does not
 * name, and replays Zaraz's queued events only after a purpose was really
 * granted. While the API is not ready it waits for `zarazConsentAPIReady`.
 *
 * A manifest from the Inth server names it as
 * `adapter: { id: 'cloudflare-zaraz' }` with
 * {@link CloudflareZarazAdapterOptions}. The `cloudflareZaraz()` helper in
 * `@inth/integrations` builds its script with {@link cloudflareZarazScript}
 * and adds the site's own `onReady` and `onError` functions.
 */
import { allConsentNames } from '../../consent/consent-types';
import type { AllConsentNames } from '../../consent/consent-types';
import type { Script } from '../../libs/script-loader/types';
import { isCategoryName } from '../../modules/script-loader/category-condition';
import type { ConsentState } from '../../types';
import type { ManifestAdapter } from '../adapter';
import { signalConsents } from '../vendor-consent';

/** The Zaraz Consent API methods the adapter uses. */
export interface ZarazConsentApi {
	APIReady: boolean;
	modal?: unknown;
	getAll: () => Record<string, boolean>;
	set: (permissions: Record<string, boolean>) => void;
	sendQueuedEvents: () => void;
}

/** What a manifest's `adapter.options` holds for Cloudflare Zaraz. */
export interface CloudflareZarazAdapterOptions {
	/** Inth categories to purpose IDs from the Zaraz dashboard. */
	purposes: Partial<Record<AllConsentNames, readonly string[]>>;
	/** Hide the currently visible Zaraz modal. */
	hideBuiltInModal: boolean;
	/** Replay Zaraz's queued events after a denied purpose becomes allowed. */
	sendQueuedEvents: boolean;
}

/** What only a site's own code passes the adapter. */
export interface CloudflareZarazExtras {
	/** Called once after the first successful synchronization. */
	onReady?: () => void;
	/** Called when synchronization fails, in place of throwing. */
	onError?: (error: unknown) => void;
}

const readyEvent = 'zarazConsentAPIReady';

const isConsentApi = (api: unknown): api is ZarazConsentApi =>
	typeof api === 'object' &&
	api !== null &&
	'APIReady' in api &&
	api.APIReady === true &&
	'getAll' in api &&
	typeof api.getAll === 'function' &&
	'set' in api &&
	typeof api.set === 'function' &&
	'sendQueuedEvents' in api &&
	typeof api.sendQueuedEvents === 'function';

const getConsentApi = (): ZarazConsentApi | undefined => {
	if (typeof window === 'undefined' || !('zaraz' in window)) {
		return;
	}
	const { zaraz } = window as { zaraz?: unknown };
	if (typeof zaraz !== 'object' || zaraz === null || !('consent' in zaraz)) {
		return;
	}
	return isConsentApi(zaraz.consent) ? zaraz.consent : undefined;
};

/**
 * Each mapped purpose ID and its category.
 *
 * @throws {Error} If the mapping is empty, has a blank or padded ID, or
 * maps an ID twice.
 */
export const zarazPurposeMappings = function zarazPurposeMappings(
	purposes: CloudflareZarazAdapterOptions['purposes']
): Map<string, AllConsentNames> {
	const mappings = new Map<string, AllConsentNames>();
	for (const category of allConsentNames) {
		for (const purpose of purposes[category] ?? []) {
			if (!purpose.trim() || purpose !== purpose.trim()) {
				throw new Error(
					'Zaraz purpose IDs must be non-empty and have no surrounding whitespace.'
				);
			}
			if (mappings.has(purpose)) {
				throw new Error(`Zaraz purpose '${purpose}' is mapped more than once.`);
			}
			mappings.set(purpose, category);
		}
	}
	if (mappings.size === 0) {
		throw new Error('Map at least one Zaraz purpose to an Inth category.');
	}
	return mappings;
};

/**
 * `base`, the callback-only script built from the Zaraz manifest, with the
 * hooks that synchronize Zaraz's purposes.
 *
 * @throws {Error} As {@link zarazPurposeMappings} does.
 */
export const cloudflareZarazScript = function cloudflareZarazScript(
	base: Script,
	options: CloudflareZarazAdapterOptions,
	extras: CloudflareZarazExtras = {}
): Script {
	const mappings = zarazPurposeMappings(options.purposes);
	let latest: ConsentState | undefined;
	let listeningDocument: Document | undefined;
	let initialized = false;
	const pendingReplay = new Set<string>();
	const synchronize = (): boolean => {
		const api = getConsentApi();
		if (!latest || !api) {
			return false;
		}
		const previous = api.getAll();
		const permissions: Record<string, boolean> = {};
		let changed = false;
		for (const purpose of Object.keys(previous)) {
			const category = mappings.get(purpose);
			const allowed = category !== undefined && latest[category] === true;
			// Purpose IDs are external keys, including names such as __proto__.
			Object.defineProperty(permissions, purpose, {
				enumerable: true,
				value: allowed,
			});
			changed ||= previous[purpose] !== allowed;
			if (allowed && previous[purpose] !== true) {
				pendingReplay.add(purpose);
			}
		}
		for (const purpose of pendingReplay) {
			if (permissions[purpose] !== true) {
				pendingReplay.delete(purpose);
			}
		}
		if (options.hideBuiltInModal && api.modal === true) {
			api.modal = false;
		}
		if (changed) {
			api.set(permissions);
		}
		if (pendingReplay.size > 0 && options.sendQueuedEvents) {
			api.sendQueuedEvents();
		}
		pendingReplay.clear();
		return true;
	};
	const apply = (): boolean => {
		try {
			if (!synchronize()) {
				return false;
			}
		} catch (error) {
			if (!extras.onError) {
				throw error;
			}
			extras.onError(error);
			return false;
		}
		listeningDocument?.removeEventListener(readyEvent, apply);
		listeningDocument = undefined;
		if (!initialized) {
			initialized = true;
			extras.onReady?.();
		}
		return true;
	};
	const update: NonNullable<Script['onConsentChange']> = (info) => {
		latest = signalConsents(info);
		if (typeof document === 'undefined') {
			return;
		}
		let applied = false;
		try {
			applied = apply();
		} finally {
			// Preserve retries even when errors propagate to the loader's debug hook.
			if (!applied && !listeningDocument) {
				listeningDocument = document;
				document.addEventListener(readyEvent, apply);
			}
		}
	};
	// Nothing loads, so a server render has nothing to start.
	const { serverStart: _serverStart, ...rest } = base;
	return {
		...rest,
		onConsentChange: (info) => {
			// Removing a configuration invokes onConsentChange with false before
			// onDispose. Do not start a synchronization during that teardown.
			// A vendor the visitor turned off also arrives without consent and
			// still needs its purposes denied.
			if (info.hasConsent || info.vendor?.granted === false) {
				update(info);
			}
		},
		onDispose: () => {
			listeningDocument?.removeEventListener(readyEvent, apply);
			listeningDocument = undefined;
			latest = undefined;
			initialized = false;
			pendingReplay.clear();
		},
		onLoad: update,
	};
};

const OPTION_NAMES: ReadonlySet<string> = new Set([
	'hideBuiltInModal',
	'purposes',
	'sendQueuedEvents',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Why `options` are not {@link CloudflareZarazAdapterOptions} the Inth
 * server may send, or `undefined`. It refuses any name it does not know, a
 * category it does not know, and a mapping the helper would refuse.
 */
export const cloudflareZarazOptionsProblem =
	function cloudflareZarazOptionsProblem(
		options: Readonly<Record<string, unknown>>
	): string | undefined {
		const extra = Object.keys(options).find((name) => !OPTION_NAMES.has(name));
		if (extra !== undefined) {
			return `it has the unknown option ${extra}`;
		}
		if (
			typeof options.hideBuiltInModal !== 'boolean' ||
			typeof options.sendQueuedEvents !== 'boolean'
		) {
			return 'its hideBuiltInModal or sendQueuedEvents is not a boolean';
		}
		const { purposes } = options;
		if (
			!isRecord(purposes) ||
			Object.entries(purposes).some(
				([category, ids]) =>
					!isCategoryName(category) ||
					!Array.isArray(ids) ||
					ids.some((id) => typeof id !== 'string')
			)
		) {
			return 'its purposes is not a list of purpose IDs per category';
		}
		try {
			zarazPurposeMappings(purposes);
		} catch (error) {
			return (error as Error).message;
		}
		return undefined;
	};

/** The Zaraz adapter, as `adapter: { id: 'cloudflare-zaraz' }` runs it. */
export const cloudflareZarazAdapter: ManifestAdapter<CloudflareZarazAdapterOptions> =
	{
		id: 'cloudflare-zaraz',
		problem: cloudflareZarazOptionsProblem,
		script: (base, options) => cloudflareZarazScript(base, options),
	};
