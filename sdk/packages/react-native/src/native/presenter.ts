import { getNativeC15t, getNativeC15tEvents } from './module';

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

type SessionListener = (
	sessionId: string,
	presentation: 'prompt' | 'preferences'
) => void;

const sessionListeners = new Set<SessionListener>();

/**
 * Hear every session an app's own `presentConsentPrompt` or `presentPreferences`
 * call finds open, with what it shows. The auto-present ledger records them, so
 * what the person dismissed there counts whether or not auto-present was on.
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
 * The privacy-policy URL a session was opened with. Every native outcome comes
 * from a session JavaScript opened with a URL, so a step that follows the
 * outcome, such as opening settings, always has one.
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
 * Run `hook` before every native prompt request, so a provider with
 * `trackingRequest="beforeConsent"` asks Apple first, whoever opens the
 * prompt: the app, or the ledger on a trigger or after a session closes.
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

/**
 * Ask native for the owed prompt without announcing the answer: the
 * auto-present ledger's own call, which records its answer itself.
 *
 * @internal
 * @param privacyPolicyURL - The app's HTTPS privacy-policy URL.
 * @returns Presentation identity.
 */
const callNativePrompt = async (
	privacyPolicyURL: string
): Promise<ConsentPresenterSession> =>
	remember(
		parseSession(await getNativeC15t().presentConsentPrompt(privacyPolicyURL)),
		privacyPolicyURL
	);

export const requestConsentPrompt = async (
	privacyPolicyURL: string
): Promise<ConsentPresenterSession> => {
	// Only with a hook: an `await` on nothing would still yield, and let a racing
	// call reach native first. A provider that left while it waited asks for
	// nothing now; the ledger asks again on its next trigger.
	if (beforeConsentPrompt !== null && !(await beforeConsentPrompt())) {
		return { sessionId: null, status: 'not-required' };
	}
	return callNativePrompt(privacyPolicyURL);
};

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
			parseSession(await getNativeC15t().presentPreferences(privacyPolicyURL)),
			privacyPolicyURL
		),
		'preferences'
	);

/** Request closing one native session. Dirty drafts require native confirmation.
 * @param sessionId - Identity returned when the session opened. Obsolete IDs do nothing.
 * @returns Once the request reaches the native host. Pending saves cannot be closed.
 */
export const closeConsentPresenter = (sessionId: string): Promise<void> =>
	getNativeC15t().closeConsentPresenter(sessionId);

/** Subscribe before presenting. Native interaction continues while JS is busy.
 * @param listener - Receives one final outcome per session, no draft toggle events.
 * @returns Remove the subscription. Runtime teardown does not undo native commits.
 */
export const onConsentPresenterOutcome = (
	listener: (outcome: ConsentPresenterOutcome) => void
): (() => void) => {
	const subscription = getNativeC15tEvents().addListener(
		'onConsentPresenterOutcome',
		(payload) => listener(parseConsentPresenterOutcome(payload))
	);
	return () => subscription.remove();
};
