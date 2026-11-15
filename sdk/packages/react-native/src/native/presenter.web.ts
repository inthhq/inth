/**
 * The presenter on web, where there are no native consent screens.
 *
 * `presenter.ts` opens the stock Swift and Kotlin screens and listens to them.
 * A web build has neither, so it behaves like a binary built without the stock
 * screens (`nativeUI: false`): nothing opens by itself, the app draws the
 * consent UI with `ConsentBanner`, `ConsentDialog` or its own components, and
 * the calls that would open a native screen reject with a message that says so.
 * The listeners are accepted and never called, because no native session can
 * exist on web. Keep the export list equal to `presenter.ts`.
 */

import type {
	ConsentPresenterOutcome,
	ConsentPresenterPresented,
	ConsentPresenterSession,
	ConsentPresenterUnavailable,
	NativeAutoPresentSettings,
} from './presenter';

export type {
	ConsentPresenterOutcome,
	ConsentPresenterPresentation,
	ConsentPresenterPresented,
	ConsentPresenterSession,
	ConsentPresenterUnavailable,
	NativeAutoPresentSettings,
} from './presenter';

/** The code `presentConsentPrompt` and `presentPreferences` reject with on web. */
const NATIVE_UI_EXCLUDED_CODE = 'C15T_NATIVE_UI_EXCLUDED';

/** An error carrying {@link NATIVE_UI_EXCLUDED_CODE}, as a native presenter rejects. */
const noNativeScreens = function noNativeScreens(call: string): Error {
	return Object.assign(
		new Error(
			`c15t: ${call}() opens the native consent screens, and a web build has none. Draw the consent UI in JavaScript: mount <ConsentBanner>, or your own components inside <ConsentPrompt>, and render <ConsentDialog open> where the app opens privacy settings.`
		),
		{ code: NATIVE_UI_EXCLUDED_CODE }
	);
};

const nothing = (): void => undefined;

/**
 * Decode a native presenter outcome, as `presenter.ts` does.
 *
 * Kept for API parity: web never receives one. It is a copy rather than an
 * import so that no web module loads the native presenter;
 * `presenter-parity.test.ts` holds the two to the same answers.
 *
 * @param payload - Native JSON event.
 * @returns The validated outcome.
 * @throws {TypeError} When the payload is not an outcome.
 */
export const parseConsentPresenterOutcome = (
	payload: string
): ConsentPresenterOutcome => {
	const value: unknown = JSON.parse(payload);
	if (
		typeof value !== 'object' ||
		value === null ||
		!('sessionId' in value) ||
		typeof value.sessionId !== 'string' ||
		!('kind' in value) ||
		(value.kind !== 'committed' &&
			value.kind !== 'acknowledged' &&
			value.kind !== 'dismissed' &&
			value.kind !== 'unavailable') ||
		!('revision' in value) ||
		typeof value.revision !== 'number' ||
		!Number.isSafeInteger(value.revision) ||
		value.revision < 0
	) {
		throw new TypeError('Invalid native consent presenter outcome');
	}
	return {
		kind: value.kind,
		revision: value.revision,
		sessionId: value.sessionId,
	};
};

/**
 * Web has no native sessions to hear about.
 *
 * @internal
 * @param listener - Never called.
 * @returns Stop listening.
 */
export const onConsentPresenterSession = (
	listener: (sessionId: string, presentation: 'prompt' | 'preferences') => void
): (() => void) => {
	void listener;
	return nothing;
};

/**
 * The privacy-policy URL of a native session. Web opens none.
 *
 * @internal
 * @param sessionId - Unused.
 * @returns `undefined`.
 */
export const sessionPrivacyPolicyURL = (
	sessionId: string
): string | undefined => {
	void sessionId;
	return undefined;
};

/**
 * Accepts the provider's hook. Nothing on web opens a native prompt to wait for.
 *
 * @internal
 * @param hook - Never called.
 * @returns Remove the hook.
 */
export const setBeforeConsentPrompt = (
	hook: () => Promise<boolean>
): (() => void) => {
	void hook;
	return nothing;
};

/**
 * Rejects on web, which has no native consent screens.
 *
 * @param privacyPolicyURL - Unused.
 * @returns Never resolves.
 * @throws {Error} With `code: 'C15T_NATIVE_UI_EXCLUDED'`.
 */
export const presentConsentPrompt = (
	privacyPolicyURL: string
): Promise<ConsentPresenterSession> => {
	void privacyPolicyURL;
	return Promise.reject(noNativeScreens('presentConsentPrompt'));
};

/**
 * Rejects on web, which has no native consent screens.
 *
 * @param privacyPolicyURL - Unused.
 * @returns Never resolves.
 * @throws {Error} With `code: 'C15T_NATIVE_UI_EXCLUDED'`.
 */
export const presentPreferences = (
	privacyPolicyURL: string
): Promise<ConsentPresenterSession> => {
	void privacyPolicyURL;
	return Promise.reject(noNativeScreens('presentPreferences'));
};

/**
 * Resolves: web never opens a native session, so there is none to close.
 *
 * @param sessionId - Unused.
 * @returns A settled promise.
 */
export const closeConsentPresenter = (sessionId: string): Promise<void> => {
	void sessionId;
	return Promise.resolve();
};

/**
 * There is no native presenter to configure on web.
 *
 * @internal
 * @param settings - Unused. The provider never asks for auto-present on web,
 *   because the web client reports a build without native screens.
 * @returns `null`, the answer for a presenter without this method.
 */
export const configureNativeAutoPresent = (
	settings: NativeAutoPresentSettings
): Promise<void> | null => {
	void settings;
	return null;
};

/**
 * Web never puts a native session on screen.
 *
 * @internal
 * @param listener - Never called.
 * @returns Stop listening.
 */
export const onConsentPresenterPresented = (
	listener: (presented: ConsentPresenterPresented) => void
): (() => void) => {
	void listener;
	return nothing;
};

/**
 * Web never owes a native prompt.
 *
 * @internal
 * @param listener - Never called.
 * @returns Stop listening.
 */
export const onConsentPresenterUnavailable = (
	listener: (unavailable: ConsentPresenterUnavailable) => void
): (() => void) => {
	void listener;
	return nothing;
};

/**
 * Web has no native sessions, so no outcome ever arrives. Read consent changes
 * from the client or the hooks instead.
 *
 * @param listener - Never called.
 * @returns Stop listening.
 */
export const onConsentPresenterOutcome = (
	listener: (outcome: ConsentPresenterOutcome) => void
): (() => void) => {
	void listener;
	return nothing;
};
