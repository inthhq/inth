/**
 * Read consent that an Inth mobile app injected into its WebView.
 *
 * The Swift, Kotlin and React Native WebView helpers add a script that runs
 * at document start, in the main frame, on origins the app lists. It defines
 * `window.__c15tNativeConsent` as a frozen, non-writable, non-configurable
 * object before any page script runs. This module reads that object and
 * returns it as an {@link ExternalConsentSource}, so the native app stays the
 * consent authority while the page runs inside the app. The contract is
 * "WebView consent" in `packages/native-protocol/CONTRACT.md`.
 */
import type { ConsentState, Unsubscribe } from '../types';
import type { ExternalConsentSource } from './types';

/** The global the native document-start script defines. */
export const WEBVIEW_CONSENT_GLOBAL = '__c15tNativeConsent';

/** Consent state a native app injected into its WebView. */
export interface WebViewConsentState {
	/** Payload version. Only `1` is read. */
	readonly version: 1;
	/**
	 * `true` once the native core has stored consent hydrated and a policy
	 * resolved. While `false`, every optional category reads denied.
	 */
	readonly ready: boolean;
	/** Native snapshot revision this state came from. */
	readonly revision: number;
	/** Consent model the native core applies, such as `opt-in` or `iab`. */
	readonly model: string | null;
	/** The native core's effective permissions. */
	readonly permissions: Readonly<ConsentState>;
	/** The committed IAB TC string, when the app runs IAB TCF natively. */
	readonly tcString: string | null;
	/** The GPP string, when the native app has one. */
	readonly gppString: string | null;
}

/** An {@link ExternalConsentSource} backed by native WebView consent. */
export interface WebViewConsentSource extends ExternalConsentSource {
	/** The current injected state, including the TC and GPP strings. */
	getState: () => WebViewConsentState | null;
}

interface InjectedConsent {
	readonly version: number;
	readonly getState: () => unknown;
	readonly subscribe: (listener: () => void) => unknown;
	readonly openPreferences: () => unknown;
}

const OPTIONAL_CATEGORIES = [
	'experience',
	'functionality',
	'marketing',
	'measurement',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const text = (value: unknown): string | null =>
	typeof value === 'string' && value.length > 0 ? value : null;

/**
 * Validate an injected state. Anything other than a well-formed version 1
 * state reads as `null`, which grants nothing.
 */
const readState = (value: unknown): WebViewConsentState | null => {
	if (!isRecord(value) || value.version !== 1) {
		return null;
	}
	const granted = isRecord(value.permissions) ? value.permissions : {};
	const permissions = { necessary: true } as ConsentState;
	for (const category of OPTIONAL_CATEGORIES) {
		permissions[category] = granted[category] === true;
	}
	return Object.freeze({
		gppString: text(value.gppString),
		model: text(value.model),
		permissions: Object.freeze(permissions),
		ready: value.ready === true,
		revision:
			typeof value.revision === 'number' && Number.isFinite(value.revision)
				? value.revision
				: 0,
		tcString: text(value.tcString),
		version: 1,
	});
};

/**
 * The injected object, when it has the shape and the locks the native
 * script gives it. A plain assignment to the global, or an object that can
 * still be changed, is not the native one and is ignored.
 */
const readInjected = (): InjectedConsent | null => {
	if (typeof window === 'undefined') {
		return null;
	}
	let descriptor: PropertyDescriptor | undefined;
	try {
		descriptor = Object.getOwnPropertyDescriptor(
			window,
			WEBVIEW_CONSENT_GLOBAL
		);
	} catch {
		return null;
	}
	if (
		!descriptor ||
		descriptor.configurable !== false ||
		descriptor.writable !== false ||
		!isRecord(descriptor.value)
	) {
		return null;
	}
	const injected = descriptor.value;
	if (
		!Object.isFrozen(injected) ||
		injected.version !== 1 ||
		typeof injected.getState !== 'function' ||
		typeof injected.subscribe !== 'function' ||
		typeof injected.openPreferences !== 'function'
	) {
		return null;
	}
	return injected as unknown as InjectedConsent;
};

/**
 * Use the consent an Inth mobile app injected into its WebView.
 *
 * Pass the result as `consentSource`. Inside a WebView that an Inth mobile
 * app configured for this origin, it returns a source that reads the
 * native app's decision: no banner shows, nothing is stored or sent from
 * the page, and the page follows the app's choice as it changes. A request
 * to open preferences, such as a "Cookie settings" link, asks the app to
 * show its own preferences.
 *
 * Everywhere else, including a normal browser and server rendering, it
 * returns `undefined`, so Inth behaves as if `consentSource` were not set.
 *
 * Call it once, when you build the options. The native script runs before
 * any page script, so the injected state is already there.
 *
 * @returns A source when the page runs inside a configured WebView, else
 * `undefined`.
 *
 * @example
 * ```ts
 * import { webViewConsentSource } from '@inth/sdk/engine';
 *
 * const options = {
 * 	mode: hosted({ projectUrl: '/api/inth' }),
 * 	consentSource: webViewConsentSource(),
 * };
 * ```
 */
export const webViewConsentSource = function webViewConsentSource():
	| WebViewConsentSource
	| undefined {
	const injected = readInjected();
	if (!injected) {
		return undefined;
	}
	const getState = (): WebViewConsentState | null => {
		try {
			return readState(injected.getState());
		} catch {
			return null;
		}
	};
	return {
		getPermissions: () => {
			const state = getState();
			return state?.ready ? state.permissions : null;
		},
		getState,
		openPreferences: () => {
			injected.openPreferences();
		},
		subscribe: (listener: () => void): Unsubscribe => {
			const unsubscribe = injected.subscribe(() => {
				listener();
			});
			return () => {
				if (typeof unsubscribe === 'function') {
					unsubscribe();
				}
			};
		},
	};
};
