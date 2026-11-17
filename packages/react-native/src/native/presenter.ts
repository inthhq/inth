import { getNativeInth, getNativeInthEvents } from './module';

/** What an open native session shows: the owed prompt or standing settings. */
export type ConsentPresenterPresentation = 'prompt' | 'preferences';

/**
 * A native presentation request. Repeated commands keep the same session.
 * Mirrors `ConsentHostSession` in the native SDKs: `not-required` alone has no
 * session ID.
 */
export type ConsentPresenterSession =
	| {
			readonly sessionId: string;
			readonly status: 'presented' | 'already-presented';
			/**
			 * What the open session shows: the owed prompt (a first layer or a
			 * notice) or standing privacy settings. A binary built before this
			 * field omits it, and it reads as `undefined`.
			 */
			readonly presentation?: ConsentPresenterPresentation;
	  }
	| { readonly sessionId: null; readonly status: 'not-required' };

/**
 * One final native outcome. Committed means durable on-device storage.
 * Mirrors `ConsentHostOutcome` in the native SDKs.
 */
export interface ConsentPresenterOutcome {
	readonly sessionId: string;
	readonly kind: 'committed' | 'acknowledged' | 'dismissed' | 'unavailable';
	readonly revision: number;
}

/**
 * A session native opened and put on screen: one it opened by itself
 * (`automatic`), or one the app asked for. Sent once it is drawn, before the
 * outcome of any session it replaced.
 */
export interface ConsentPresenterPresented {
	readonly sessionId: string;
	readonly presentation: ConsentPresenterPresentation;
	readonly automatic: boolean;
}

/**
 * Native owes a prompt but cannot put it on screen yet, such as before the
 * host has a foreground window or Activity. It keeps the prompt and shows it
 * once it can; nothing has to ask again.
 */
export interface ConsentPresenterUnavailable {
	readonly code: string;
	readonly message: string;
}

/** What the provider tells native, as `configureAutoPresent` reads it. */
export interface NativeAutoPresentSettings {
	/** Native presents an owed prompt by itself. */
	readonly autoPresent: boolean;
	/** The HTTPS privacy policy an automatic prompt links to; `null` while off. */
	readonly privacyPolicyURL: string | null;
}

/** Decode the compact native outcome without trusting a mismatched binary.
 * @param payload - Native JSON event.
 * @returns The validated outcome.
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

const parseSession = (payload: string): ConsentPresenterSession => {
	const value: unknown = JSON.parse(payload);
	if (
		typeof value === 'object' &&
		value !== null &&
		'sessionId' in value &&
		'status' in value
	) {
		const { sessionId, status } = value;
		if (status === 'not-required' && sessionId === null) {
			return { sessionId, status };
		}
		if (
			(status === 'presented' || status === 'already-presented') &&
			typeof sessionId === 'string'
		) {
			const presentation =
				'presentation' in value &&
				(value.presentation === 'prompt' ||
					value.presentation === 'preferences')
					? value.presentation
					: undefined;
			return presentation === undefined
				? { sessionId, status }
				: { presentation, sessionId, status };
		}
	}
	throw new TypeError('Invalid native consent presenter session');
};

const parsePresented = (payload: string): ConsentPresenterPresented => {
	const value: unknown = JSON.parse(payload);
	if (
		typeof value === 'object' &&
		value !== null &&
		'sessionId' in value &&
		typeof value.sessionId === 'string' &&
		'presentation' in value &&
		(value.presentation === 'prompt' || value.presentation === 'preferences')
	) {
		return {
			automatic: 'automatic' in value && value.automatic === true,
			presentation: value.presentation,
			sessionId: value.sessionId,
		};
	}
	throw new TypeError('Invalid native consent presenter presentation');
};

const parseUnavailable = (payload: string): ConsentPresenterUnavailable => {
	const value: unknown = JSON.parse(payload);
	return {
		code:
			typeof value === 'object' &&
			value !== null &&
			'code' in value &&
			typeof value.code === 'string'
				? value.code
				: 'INTH_PRESENTER_UNAVAILABLE',
		message:
			typeof value === 'object' &&
			value !== null &&
			'message' in value &&
			typeof value.message === 'string'
				? value.message
				: '',
	};
};

type SessionListener = (
	sessionId: string,
	presentation: 'prompt' | 'preferences'
) => void;

const sessionListeners = new Set<SessionListener>();

/**
 * Hear every session an app's own `presentConsentPrompt` or `presentPreferences`
 * call finds open, with what it shows. The provider mirrors them, so the ATT
 * sequence waits for them to close.
 *
 * @internal
 * @param listener - Receives the session id and what it shows.
 * @returns Stop listening.
 */
export const onConsentPresenterSession = (
	listener: SessionListener
): (() => void) => {
	sessionListeners.add(listener);
	return () => {
		sessionListeners.delete(listener);
	};
};

const announce = (
	session: ConsentPresenterSession,
	asked: 'prompt' | 'preferences'
): ConsentPresenterSession => {
	if (session.sessionId !== null) {
		// A session an older binary does not name is treated as settings.
		const shows =
			session.status === 'presented'
				? asked
				: (session.presentation ?? 'preferences');
		for (const listener of sessionListeners) {
			listener(session.sessionId, shows);
		}
	}
	return session;
};

/** The open native session and the privacy-policy URL it was opened with. */
let openSession: { readonly id: string; readonly url: string } | null = null;

const remember = (
	session: ConsentPresenterSession,
	url: string
): ConsentPresenterSession => {
	if (session.status === 'presented' && session.sessionId !== null) {
		openSession = { id: session.sessionId, url };
	}
	return session;
};

/**
 * The privacy-policy URL a session the app opened was opened with, so a step
 * that follows the outcome, such as opening settings, has one. A session
 * native opened by itself used the provider's URL.
 *
 * @internal
 * @param sessionId - The outcome's session.
 * @returns The URL, or `undefined` for a session this bundle did not open.
 */
export const sessionPrivacyPolicyURL = (
	sessionId: string
): string | undefined =>
	openSession?.id === sessionId ? openSession.url : undefined;

/**
 * Runs before every native prompt request, or `null`. Resolves `false` when
 * the provider that installed it has gone while it waited.
 */
let beforeConsentPrompt: (() => Promise<boolean>) | null = null;

/**
 * Run `hook` before every prompt the app asks for, so a provider with
 * `trackingRequest="beforeConsent"` asks Apple first. A prompt native opens
 * by itself waits too: the provider keeps auto-present off until Apple was
 * asked.
 *
 * @internal
 * @param hook - Resolves when the prompt may open; `false` if its provider left.
 * @returns Remove the hook, if it is still this one.
 */
export const setBeforeConsentPrompt = (
	hook: () => Promise<boolean>
): (() => void) => {
	beforeConsentPrompt = hook;
	return () => {
		if (beforeConsentPrompt === hook) {
			beforeConsentPrompt = null;
		}
	};
};

const callNativePrompt = async (
	privacyPolicyURL: string
): Promise<ConsentPresenterSession> =>
	remember(
		parseSession(await getNativeInth().presentConsentPrompt(privacyPolicyURL)),
		privacyPolicyURL
	);

/** Open an owed native prompt on the installed engine. With a provider set to
 * `trackingRequest="beforeConsent"`, Apple's tracking alert comes first.
 * @param privacyPolicyURL - The app's HTTPS privacy-policy URL.
 * @returns Presentation identity. Decisions arrive through onConsentPresenterOutcome.
 */
export const presentConsentPrompt = async (
	privacyPolicyURL: string
): Promise<ConsentPresenterSession> => {
	// The app asked, so the prompt opens even if the provider left meanwhile.
	if (beforeConsentPrompt !== null) {
		await beforeConsentPrompt();
	}
	return announce(await callNativePrompt(privacyPolicyURL), 'prompt');
};

/** Open native standing preferences, including when no prompt is owed.
 * @param privacyPolicyURL - The app's HTTPS privacy-policy URL.
 * @returns The existing or newly opened session.
 */
export const presentPreferences = async (
	privacyPolicyURL: string
): Promise<ConsentPresenterSession> =>
	announce(
		remember(
			parseSession(await getNativeInth().presentPreferences(privacyPolicyURL)),
			privacyPolicyURL
		),
		'preferences'
	);

/** Request closing one native session. Dirty drafts require native confirmation.
 * @param sessionId - Identity returned when the session opened. Obsolete IDs do nothing.
 * @returns Once the request reaches the native host. Pending saves cannot be closed.
 */
export const closeConsentPresenter = (sessionId: string): Promise<void> =>
	getNativeInth().closeConsentPresenter(sessionId);

/**
 * Hand native the provider's auto-present settings.
 *
 * @internal
 * @param settings - Whether native presents by itself, and the URL it links to.
 * @returns Once native applied them, or `null` from a binary that predates
 *   native auto-present and has no such method.
 */
export const configureNativeAutoPresent = (
	settings: NativeAutoPresentSettings
): Promise<void> | null => {
	const nativeModule = getNativeInth();
	return typeof nativeModule.configureAutoPresent === 'function'
		? nativeModule.configureAutoPresent(JSON.stringify(settings))
		: null;
};

/**
 * Hear each session native puts on screen.
 *
 * @internal
 * @param listener - Receives the session, what it shows, and whether native
 *   opened it by itself.
 * @returns Stop listening.
 */
export const onConsentPresenterPresented = (
	listener: (presented: ConsentPresenterPresented) => void
): (() => void) => {
	const subscription = getNativeInthEvents().addListener(
		'onConsentPresenterPresented',
		(payload) => listener(parsePresented(payload))
	);
	return () => subscription.remove();
};

/**
 * Hear each time native owes a prompt it cannot put on screen yet.
 *
 * @internal
 * @param listener - Receives the code and a message for the log.
 * @returns Stop listening.
 */
export const onConsentPresenterUnavailable = (
	listener: (unavailable: ConsentPresenterUnavailable) => void
): (() => void) => {
	const subscription = getNativeInthEvents().addListener(
		'onConsentPresenterUnavailable',
		(payload) => listener(parseUnavailable(payload))
	);
	return () => subscription.remove();
};

/** Subscribe before presenting. Native interaction continues while JS is busy.
 * @param listener - Receives one final outcome per session, no draft toggle events.
 * @returns Remove the subscription. Runtime teardown does not undo native commits.
 */
export const onConsentPresenterOutcome = (
	listener: (outcome: ConsentPresenterOutcome) => void
): (() => void) => {
	const subscription = getNativeInthEvents().addListener(
		'onConsentPresenterOutcome',
		(payload) => listener(parseConsentPresenterOutcome(payload))
	);
	return () => subscription.remove();
};
