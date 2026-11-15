/**
 * Auto-present belongs to native. The native `ConsentPrompt` on each platform
 * decides when a prompt is owed and presents it, exactly as it does for a
 * Swift or Kotlin app. This file only tells native the provider's settings and
 * mirrors what native reports on screen, so the ATT sequence can wait for a
 * c15t screen to close.
 *
 * There is one mirror per client, so React strict mode, a remounted provider
 * and a nested provider all see the same record.
 */

import { isProduction } from '../native/client';
import type { ConsentClient } from '../native/client';
import {
	configureNativeAutoPresent,
	onConsentPresenterOutcome,
	onConsentPresenterPresented,
	onConsentPresenterSession,
	onConsentPresenterUnavailable,
} from '../native/presenter';
import type {
	ConsentPresenterPresentation,
	NativeAutoPresentSettings,
} from '../native/presenter';
import { isPrivacyPolicyURL } from './privacy-policy-url';

/**
 * The code a native presenter rejects with when it refuses the privacy-policy URL.
 *
 * Permanent: the same URL fails the same way on every attempt.
 */
export const PRESENTER_INVALID_URL_CODE = 'C15T_PRESENTER_INVALID_URL';

/**
 * The code presenters reject with in a binary built without the stock native screens
 * (`c15t.nativeUI=false`, the Expo plugin's `nativeUI: false`). Permanent: the binary
 * cannot gain them, so it is reported once.
 */
export const NATIVE_UI_EXCLUDED_CODE = 'C15T_NATIVE_UI_EXCLUDED';

/**
 * Whether the running binary links the stock native consent screens.
 *
 * Reads `bootstrap.nativeUI` without depending on it being declared: only an explicit
 * `false` means the screens are absent. A binary that predates the flag always links them.
 *
 * @param client - The client whose handshake to read.
 * @returns `false` only for a build without the stock native screens.
 */
export const linksNativeUI = function linksNativeUI(
	client: ConsentClient
): boolean {
	const bootstrap: unknown = client.bootstrap;
	return !(
		typeof bootstrap === 'object' &&
		bootstrap !== null &&
		'nativeUI' in bootstrap &&
		bootstrap.nativeUI === false
	);
};

/** What one client knows of native's consent screens. */
interface PresenterMirror {
	/** The session native last reported on screen, until its outcome arrives. */
	onScreen: {
		readonly sessionId: string;
		readonly presentation: ConsentPresenterPresentation;
	} | null;
	/** The settings native was last sent, so an unchanged render sends nothing. */
	sent: string | null;
	/** Reported once each: an old binary, a binary without screens, a refused URL. */
	readonly reported: Set<string>;
	/** Told after every change, for steps that wait until no c15t screen is up. */
	readonly watchers: Set<() => void>;
	/** Detaches the native listeners, for a client that is thrown away. */
	readonly listeners: (() => void)[];
}

const mirrors = new WeakMap<ConsentClient, PresenterMirror>();

const changed = function changed(mirror: PresenterMirror): void {
	for (const watcher of [...mirror.watchers]) {
		watcher();
	}
};

const report = function report(
	mirror: PresenterMirror,
	key: string,
	log: () => void
): void {
	if (!mirror.reported.has(key)) {
		mirror.reported.add(key);
		log();
	}
};

const mirrorFor = function mirrorFor(client: ConsentClient): PresenterMirror {
	const existing = mirrors.get(client);
	if (existing !== undefined) {
		return existing;
	}
	const mirror: PresenterMirror = {
		listeners: [],
		onScreen: null,
		reported: new Set(),
		sent: null,
		watchers: new Set(),
	};
	mirrors.set(client, mirror);
	const show = (
		sessionId: string,
		presentation: ConsentPresenterPresentation
	): void => {
		mirror.onScreen = { presentation, sessionId };
		changed(mirror);
	};
	// The app's own calls answer with the session they find open.
	mirror.listeners.push(onConsentPresenterSession(show));
	// For the client's lifetime, so a session reported open is always heard closing.
	try {
		mirror.listeners.push(
			onConsentPresenterPresented(({ presentation, sessionId }) => {
				show(sessionId, presentation);
			})
		);
		mirror.listeners.push(
			onConsentPresenterOutcome(({ sessionId }) => {
				if (mirror.onScreen?.sessionId === sessionId) {
					mirror.onScreen = null;
					changed(mirror);
				}
			})
		);
		mirror.listeners.push(
			onConsentPresenterUnavailable((unavailable) => {
				if (isProduction()) {
					return;
				}
				// Native keeps the owed prompt and shows it once it can. Said once
				// per launch: it is a note for the developer, not an error.
				report(mirror, 'unavailable', () => {
					console.warn(
						`c15t ConsentProvider: the native presenter could not show the owed consent prompt yet (${unavailable.code}). It shows it once the app has a foreground window or Activity.`,
						unavailable.message
					);
				});
			})
		);
	} catch {
		// No native event emitter: nothing can be presented either.
	}
	return mirror;
};

/**
 * Stop mirroring for a client that is thrown away, detaching its native
 * listeners. An app's client lives as long as the app and never needs this;
 * `@c15t/react-native/testing` calls it when a test client is disposed.
 *
 * @internal
 * @param client - The client to forget.
 */
export const releaseConsentPresenter = function releaseConsentPresenter(
	client: ConsentClient
): void {
	const mirror = mirrors.get(client);
	if (mirror === undefined) {
		return;
	}
	mirrors.delete(client);
	for (const release of mirror.listeners.splice(0)) {
		release();
	}
	mirror.watchers.clear();
};

/**
 * Start mirroring what native shows for `client`, whether or not anything
 * auto-presents. The outermost provider calls it while it renders, before any
 * child effect can open a session. Idempotent.
 *
 * @param client - The client.
 */
export const recordConsentPresenter = function recordConsentPresenter(
	client: ConsentClient
): void {
	mirrorFor(client);
};

const failed = function failed(
	mirror: PresenterMirror,
	settings: NativeAutoPresentSettings,
	error: unknown
): void {
	const code =
		typeof error === 'object' && error !== null && 'code' in error
			? String(error.code)
			: undefined;
	// Sent again on the next change, so a corrected URL is tried.
	mirror.sent = null;
	if (code === PRESENTER_INVALID_URL_CODE) {
		report(mirror, `url:${String(settings.privacyPolicyURL)}`, () => {
			// oxlint-disable-next-line no-console -- An owed consent prompt that can never show must be visible in every build.
			console.error(
				`c15t ConsentProvider: the native presenter refused privacyPolicyURL ${JSON.stringify(settings.privacyPolicyURL)}, so the owed consent prompt cannot show. Pass an absolute HTTPS URL with a DNS host.`,
				error
			);
		});
	} else if (code === NATIVE_UI_EXCLUDED_CODE) {
		report(mirror, 'excluded', () => {
			// oxlint-disable-next-line no-console -- An owed consent prompt that can never show must be visible in every build.
			console.error(
				'c15t ConsentProvider: this binary was built without the stock native consent screens (c15t.nativeUI=false), so the owed consent prompt cannot be presented natively. Pass autoPresent={false} and draw the consent UI in JavaScript.',
				error
			);
		});
	} else if (!isProduction()) {
		console.warn(
			'c15t ConsentProvider: native refused the auto-present settings.',
			error
		);
	}
};

/** Report a refusal of `call`, once it settles. */
const settle = async function settle(
	mirror: PresenterMirror,
	settings: NativeAutoPresentSettings,
	call: Promise<void>
): Promise<void> {
	try {
		await call;
	} catch (error: unknown) {
		failed(mirror, settings, error);
	}
};

/**
 * Tell native whether to present an owed prompt by itself, and with which URL.
 *
 * Native decides when a prompt is owed; this only hands it the provider's
 * settings. Unchanged settings are not sent again. A binary that predates
 * native auto-present cannot take them: an app that asked for auto-present is
 * told once, with `console.error` in every build, and nothing presents by
 * itself until the app is rebuilt. `presentConsentPrompt` still works there.
 *
 * @param client - The client to configure.
 * @param settings - Whether native presents by itself, and the URL it links to.
 */
export const configureAutoPresent = function configureAutoPresent(
	client: ConsentClient,
	settings: NativeAutoPresentSettings
): void {
	const mirror = mirrorFor(client);
	const encoded = JSON.stringify(settings);
	if (mirror.sent === encoded) {
		return;
	}
	mirror.sent = encoded;
	let call: Promise<void> | null;
	try {
		call = configureNativeAutoPresent(settings);
	} catch (error: unknown) {
		failed(mirror, settings, error);
		return;
	}
	if (call === null) {
		if (settings.autoPresent) {
			report(mirror, 'old-binary', () => {
				// oxlint-disable-next-line no-console -- An owed consent prompt that never shows must be visible in every build.
				console.error(
					'c15t ConsentProvider: this native build predates native auto-present (no configureAutoPresent), so the consent prompt does not present by itself. Rebuild the app with this version of @c15t/react-native, or call presentConsentPrompt yourself until then.'
				);
			});
		}
		return;
	}
	void settle(mirror, settings, call);
};

/**
 * Whether native reports a c15t screen on screen.
 *
 * @internal
 * @param client - The client to read.
 * @returns `true` from a session's presentation until its outcome.
 */
export const isConsentScreenBusy = function isConsentScreenBusy(
	client: ConsentClient
): boolean {
	return mirrorFor(client).onScreen !== null;
};

/**
 * Hear every change to {@link isConsentScreenBusy}.
 *
 * @internal
 * @param client - The client to follow.
 * @param listener - Called after each change.
 * @returns Stop listening.
 */
export const onConsentScreenChange = function onConsentScreenChange(
	client: ConsentClient,
	listener: () => void
): () => void {
	const { watchers } = mirrorFor(client);
	watchers.add(listener);
	return () => {
		watchers.delete(listener);
	};
};

/**
 * Refuse a privacy-policy URL the native host would reject, at render time.
 *
 * @param privacyPolicyURL - The value the app passed.
 * @throws {TypeError} When it is missing or is a URL a native presenter would
 *   refuse. See {@link isPrivacyPolicyURL} for the exact rules.
 */
export const assertPrivacyPolicyURL: (
	privacyPolicyURL: string | undefined
) => asserts privacyPolicyURL is string = function assertPrivacyPolicyURL(
	privacyPolicyURL
) {
	if (privacyPolicyURL === undefined || !isPrivacyPolicyURL(privacyPolicyURL)) {
		throw new TypeError(
			`<ConsentProvider> presents the consent prompt and needs an absolute HTTPS privacyPolicyURL with a DNS host, such as "https://example.com/privacy". Got ${JSON.stringify(privacyPolicyURL)}. Pass a valid URL, or autoPresent={false} to present the prompt yourself.`
		);
	}
};
