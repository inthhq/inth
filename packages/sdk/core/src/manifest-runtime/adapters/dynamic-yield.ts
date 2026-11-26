/**
 * The Dynamic Yield adapter: loads `api_static.js` after `api_dynamic.js`,
 * and keeps Dynamic Yield's page-wide Active Cookie Consent signal granted
 * while any registration on the page is granted.
 *
 * A manifest from the Inth server names it as
 * `adapter: { id: 'dynamic-yield' }` with {@link DynamicYieldAdapterOptions};
 * the `dynamicYield()` helper in `@inth/integrations` builds its script with
 * the same function, and adds a site's CSP nonce and the registrations of
 * several loaders that share one script.
 */
import type {
	Script,
	ScriptCallbackInfo,
} from '../../libs/script-loader/types';
import type { ManifestAdapter } from '../adapter';

/** The section and data center whose `api_static.js` the adapter loads. */
export interface DynamicYieldAdapterOptions {
	/** Public section ID from the Dynamic Yield installation snippet. */
	sectionId: string;
	region: 'us' | 'eu';
}

/** What only a site's own code passes the adapter. */
export interface DynamicYieldExtras {
	/** CSP nonce for `api_static.js` when the loader's element has none. */
	nonce?: string;
	/**
	 * Every registration's state for `info`, when several registrations
	 * share this script. One granted registration keeps it running.
	 */
	registrations?: (info: ScriptCallbackInfo) => readonly ScriptCallbackInfo[];
}

interface DynamicYieldStaticLoader {
	consentOwners: Set<symbol>;
	element?: HTMLScriptElement;
	owners: Set<symbol>;
}

// Active Cookie Consent is page-global across section and region resources.
const consentOwners = new WeakMap<Document, Set<symbol>>();

// Core can share one dynamic loader across independent registrations.
const staticLoaders = new WeakMap<
	HTMLScriptElement,
	DynamicYieldStaticLoader
>();

/** The section's directory on Dynamic Yield's CDN for `options`. */
export const dynamicYieldBase = (options: DynamicYieldAdapterOptions): string =>
	`https://${options.region === 'eu' ? 'cdn-eu' : 'cdn'}.dynamicyield.com/api/${encodeURIComponent(options.sectionId)}`;

/**
 * `base`, the script whose steps set `DY` and its consent signal and load
 * `api_dynamic.js`, with the hooks that insert `api_static.js` (not async,
 * with no id) once the first file loads, and that read the consent signal
 * from every owner on the page. When a registration is disposed, as the
 * outgoing one of a replacement is, the signal stays granted while another
 * owner, such as the incoming registration, still holds it. It drops
 * `base`'s server start, as for every adapter.
 */
export const dynamicYieldScript = function dynamicYieldScript(
	base: Script,
	options: DynamicYieldAdapterOptions,
	extras: DynamicYieldExtras = {}
): Script {
	const { serverStart: _serverStart, ...script } = base;
	const { nonce } = extras;
	const sectionBase = dynamicYieldBase(options);
	// Equal configurations share a lifecycle; any granted registration retains it.
	const owner = Symbol('dynamic-yield');
	let shared: DynamicYieldStaticLoader | undefined;
	const retainStatic = (info: ScriptCallbackInfo) => {
		if (!info.element) {
			return;
		}
		shared = staticLoaders.get(info.element);
		if (!shared) {
			const { ownerDocument } = info.element;
			const grantedOwners =
				consentOwners.get(ownerDocument) ?? new Set<symbol>();
			consentOwners.set(ownerDocument, grantedOwners);
			shared = { consentOwners: grantedOwners, owners: new Set() };
			staticLoaders.set(info.element, shared);
		}
		shared.owners.add(owner);
		shared.consentOwners.add(owner);
		return shared;
	};
	const removeStatic = () => {
		const removed = shared?.owners.delete(owner) ?? false;
		if (removed && shared) {
			shared.consentOwners.delete(owner);
			if (shared.owners.size === 0) {
				shared.element?.remove();
			}
		}
		return removed;
	};
	const grantedRegistration = (info: ScriptCallbackInfo) =>
		(
			extras.registrations?.(info) ??
			// The registrations a shared remote script's info carries.
			info.registrations ?? [info]
		).find((state) => state.hasConsent);
	const updateConsent = (info: ScriptCallbackInfo) => {
		const granted = grantedRegistration(info);
		if (granted) {
			retainStatic(granted);
		} else if (!removeStatic() && shared) {
			// A revoked lifecycle must not change a later loader's consent.
			return;
		}
		base.onConsentChange?.({
			...info,
			hasConsent: !!granted || !!shared?.consentOwners.size,
		});
	};

	return {
		...script,
		onBeforeLoad(info) {
			const granted = grantedRegistration(info);
			if (granted) {
				retainStatic(granted);
				base.onBeforeLoad?.({ ...info, hasConsent: true });
			}
		},
		onConsentChange: updateConsent,
		onDispose(info) {
			if (removeStatic() && shared) {
				base.onConsentChange?.({
					...info,
					hasConsent: shared.consentOwners.size > 0,
				});
			}
		},
		onLoad(info) {
			const granted = grantedRegistration(info);
			if (!granted?.element?.isConnected) {
				return;
			}
			const staticLoader = retainStatic(granted);
			if (!staticLoader || staticLoader.element?.isConnected) {
				return;
			}
			const element = document.createElement('script');
			element.async = false;
			element.src = `${sectionBase}/api_static.js`;
			const loaderNonce = granted.element.nonce || nonce;
			if (loaderNonce) {
				element.nonce = loaderNonce;
			}
			staticLoader.element = element;
			document.head.appendChild(element);
		},
	};
};

/** A section ID: one path segment of the CDN URL. */
const SECTION_ID = /^[A-Za-z0-9_-]{1,64}$/u;

/**
 * Why `options` are not {@link DynamicYieldAdapterOptions} the Inth server
 * may send, or `undefined`. The adapter builds `api_static.js`'s URL on
 * Dynamic Yield's own CDN from them.
 */
export const dynamicYieldOptionsProblem = function dynamicYieldOptionsProblem(
	options: Readonly<Record<string, unknown>>
): string | undefined {
	const extra = Object.keys(options).find(
		(name) => name !== 'region' && name !== 'sectionId'
	);
	if (extra !== undefined) {
		return `it has the unknown option ${extra}`;
	}
	if (
		!(
			typeof options.sectionId === 'string' &&
			SECTION_ID.test(options.sectionId)
		)
	) {
		return 'its sectionId is not a section ID';
	}
	return options.region === 'us' || options.region === 'eu'
		? undefined
		: 'its region is not us or eu';
};

/**
 * The Dynamic Yield adapter, as a manifest's
 * `adapter: { id: 'dynamic-yield' }` runs it.
 */
export const dynamicYieldAdapter: ManifestAdapter<DynamicYieldAdapterOptions> =
	{
		id: 'dynamic-yield',
		problem: dynamicYieldOptionsProblem,
		script: (base, options) => dynamicYieldScript(base, options),
	};
