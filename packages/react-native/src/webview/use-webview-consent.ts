/**
 * Sync native consent into a `react-native-webview` `WebView`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useConsentSelector } from '../hooks/use-consent-selector';
import type { ConsentSnapshot } from '../protocol';
import { useConsentClient } from '../provider/consent-context';
import {
	normalizeWebViewOrigins,
	originOfUrl,
	preferencesRequest,
} from './payload';
import { DOCUMENT_START_SCRIPT, UPDATE_SCRIPT } from './scripts.generated';

/** The part of a `react-native-webview` instance the hook drives. */
export interface WebViewConsentTarget {
	injectJavaScript: (script: string) => void;
}

/** The part of a `react-native-webview` message event the hook reads. */
export interface WebViewConsentMessageEvent {
	readonly nativeEvent: {
		readonly data: string;
		readonly url?: string;
		readonly isTopFrame?: boolean;
	};
}

/** Options for {@link useWebViewConsent}. */
export interface UseWebViewConsentOptions {
	/**
	 * Origins that may receive consent: `https://host[:port]`, or `http://` on
	 * `localhost`, `127.0.0.1` or `[::1]`. No paths or wildcards. Pages on
	 * any other origin get nothing.
	 */
	readonly allowedOrigins: readonly string[];
	/**
	 * Called when a listed page asks for preferences, such as from a "Cookie
	 * settings" link. Open your preferences screen here.
	 */
	readonly onPreferencesRequested?: () => void;
}

/** Props to spread onto a `react-native-webview` `WebView`. */
export interface WebViewConsentProps {
	/** Lets the hook push consent changes into the loaded page. */
	readonly ref: (webView: WebViewConsentTarget | null) => void;
	/** Runs before the page's own scripts, on listed origins only. */
	readonly injectedJavaScriptBeforeContentLoaded: string;
	readonly injectedJavaScriptBeforeContentLoadedForMainFrameOnly: true;
	/**
	 * Handles the page's request to open preferences. If your `WebView` has
	 * its own `onMessage`, call this one from it.
	 */
	readonly onMessage: (event: WebViewConsentMessageEvent) => void;
}

/** Preference requests closer together than this are dropped. */
const PREFERENCES_REQUEST_INTERVAL_MS = 1000;

const selectRevision = (snapshot: ConsentSnapshot): number => snapshot.revision;

/**
 * What a page receives when it must stop following the app: no state, every
 * optional category denied. Keeps the revision and model the page already saw.
 */
const revokedState = (previous: Readonly<Record<string, unknown>> | null) => ({
	gppString: null,
	model: previous?.model ?? null,
	permissions: {
		experience: false,
		functionality: false,
		marketing: false,
		measurement: false,
		necessary: true,
	},
	ready: false,
	revision: previous?.revision ?? 0,
	tcString: null,
	version: 1,
});

/** `<script>(<arguments as JSON>);`, the call shape every platform uses. */
const call = (script: string, ...args: readonly unknown[]): string =>
	`${script}(${args.map((arg) => JSON.stringify(arg)).join(',')});`;

/**
 * Keep the pages a `WebView` loads in step with native consent, so a site
 * that runs web Inth with `consentSource: webViewConsentSource()` shows no
 * second banner and follows the app's choice.
 *
 * Only pages on `allowedOrigins` receive anything, and only in the main
 * frame. The state carries permissions, the model, the IAB TC string and the
 * GPP string; it never carries the subject id. Consent flows one way, from the
 * app to the page.
 *
 * @param options - The allowed origins and the preferences callback.
 * @returns Props to spread onto the `WebView`.
 * @throws {Error} When `allowedOrigins` is empty or holds an entry that is not
 *   an accepted origin.
 *
 * @example
 * ```tsx
 * import { WebView } from 'react-native-webview';
 * import { useWebViewConsent } from '@inth/react-native';
 *
 * function Site() {
 *     const consent = useWebViewConsent({
 *         allowedOrigins: ['https://www.example.com'],
 *         onPreferencesRequested: () => navigation.navigate('Privacy'),
 *     });
 *
 *     return <WebView {...consent} source={{ uri: 'https://www.example.com/' }} />;
 * }
 * ```
 */
export const useWebViewConsent = function useWebViewConsent(
	options: UseWebViewConsentOptions
): WebViewConsentProps {
	const client = useConsentClient();
	const revision = useConsentSelector(selectRevision);
	// Keyed on the list's content, so an inline array does not re-run it. JSON
	// keeps every entry intact; a joined string would let one entry that holds
	// the separator turn into several origins.
	const originsKey = JSON.stringify(options.allowedOrigins);
	const origins = useMemo(
		() => normalizeWebViewOrigins(JSON.parse(originsKey) as string[]),
		[originsKey]
	);
	// One token and request key for the life of this WebView.
	// oxlint-disable-next-line react/hook-use-state -- Drawn once, at mount.
	const [secrets] = useState(() => {
		const consent = client.getWebViewConsent();
		return consent ? { key: consent.key, token: consent.token } : null;
	});
	// Read again whenever the native snapshot moves.
	const state = useMemo(
		() => (revision >= 0 ? (client.getWebViewConsent()?.state ?? null) : null),
		[client, revision]
	);

	const webView = useRef<WebViewConsentTarget | null>(null);
	const pushed = useRef<string | null>(null);
	const listed = useRef<readonly string[] | null>(null);
	const onPreferencesRequested = useRef(options.onPreferencesRequested);
	useEffect(() => {
		onPreferencesRequested.current = options.onPreferencesRequested;
	}, [options.onPreferencesRequested]);

	const documentStart =
		secrets && state
			? call(DOCUMENT_START_SCRIPT, origins, secrets.token, secrets.key, state)
			: '';
	const update =
		secrets && state
			? call(UPDATE_SCRIPT, origins, secrets.token, state)
			: null;

	// An origin that leaves the list is revoked: a page loaded from it gets a
	// "no state" update it still accepts, instead of keeping its last state,
	// grants included, once updates stop reaching it.
	useEffect(() => {
		const before = listed.current;
		listed.current = origins;
		const dropped = before?.filter((origin) => !origins.includes(origin)) ?? [];
		if (secrets && dropped.length > 0) {
			webView.current?.injectJavaScript(
				call(UPDATE_SCRIPT, dropped, secrets.token, revokedState(state))
			);
		}
	}, [origins, secrets, state]);

	useEffect(() => {
		if (update === null) {
			return;
		}
		if (pushed.current === null) {
			// The first state reaches the page through the document-start script.
			pushed.current = update;
			return;
		}
		if (pushed.current !== update) {
			pushed.current = update;
			webView.current?.injectJavaScript(update);
		}
	}, [update]);

	const ref = useCallback((instance: WebViewConsentTarget | null) => {
		webView.current = instance;
	}, []);

	const lastRequest = useRef(Number.NEGATIVE_INFINITY);
	// `react-native-webview` reports the top page's URL and, on some Android
	// WebViews, no frame at all, so the frame and origin checks cannot tell an
	// iframe from the page. The request key can: only the top frame's
	// document-start closure holds it. Repeats are dropped as well.
	const expectedRequest = secrets ? preferencesRequest(secrets.key) : null;
	const onMessage = useCallback(
		(event: WebViewConsentMessageEvent) => {
			const { data, isTopFrame, url } = event.nativeEvent;
			const origin = originOfUrl(url);
			const now = Date.now();
			if (
				expectedRequest !== null &&
				data === expectedRequest &&
				isTopFrame !== false &&
				origin !== null &&
				origins.includes(origin) &&
				now - lastRequest.current >= PREFERENCES_REQUEST_INTERVAL_MS
			) {
				lastRequest.current = now;
				onPreferencesRequested.current?.();
			}
		},
		[expectedRequest, origins]
	);

	return useMemo(
		() => ({
			injectedJavaScriptBeforeContentLoaded: documentStart,
			injectedJavaScriptBeforeContentLoadedForMainFrameOnly: true as const,
			onMessage,
			ref,
		}),
		[documentStart, onMessage, ref]
	);
};
