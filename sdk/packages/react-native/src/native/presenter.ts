import { getNativeC15t, getNativeC15tEvents } from './module';

/** A native presentation request. Repeated commands keep the same session. */
export interface ConsentPresenterSession {
	readonly sessionId: string | null;
	readonly status: 'presented' | 'already-presented' | 'not-required';
	/**
	 * What the open session shows: the owed prompt (a first layer or a notice) or
	 * standing privacy settings. A binary built before this field omits it, and it
	 * reads as `undefined`.
	 */
	readonly presentation?: 'prompt' | 'preferences';
}

/** One final native outcome. Committed means durable on-device storage. */
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
		typeof value !== 'object' ||
		value === null ||
		!('sessionId' in value) ||
		!('status' in value) ||
		(value.status !== 'presented' &&
			value.status !== 'already-presented' &&
			value.status !== 'not-required') ||
		(value.status === 'not-required'
			? value.sessionId !== null
			: typeof value.sessionId !== 'string')
	) {
		throw new TypeError('Invalid native consent presenter session');
	}
	const presentation =
		'presentation' in value &&
		(value.presentation === 'prompt' || value.presentation === 'preferences')
			? value.presentation
			: undefined;
	const sessionId =
		typeof value.sessionId === 'string' ? value.sessionId : null;
	if (presentation === undefined) {
		return { sessionId, status: value.status };
	}
	return { presentation, sessionId, status: value.status };
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

/**
 * Ask native for the owed prompt without announcing the answer: the
 * auto-present ledger's own call, which records its answer itself.
 *
 * @internal
 * @param privacyPolicyURL - The app's HTTPS privacy-policy URL.
 * @returns Presentation identity.
 */
export const requestConsentPrompt = async (
	privacyPolicyURL: string
): Promise<ConsentPresenterSession> =>
	parseSession(await getNativeC15t().presentConsentPrompt(privacyPolicyURL));

/** Open an owed native prompt on the installed engine.
 * @param privacyPolicyURL - The app's HTTPS privacy-policy URL.
 * @returns Presentation identity. Decisions arrive through onConsentPresenterOutcome.
 */
export const presentConsentPrompt = async (
	privacyPolicyURL: string
): Promise<ConsentPresenterSession> =>
	announce(await requestConsentPrompt(privacyPolicyURL), 'prompt');

/** Open native standing preferences, including when no prompt is owed.
 * @param privacyPolicyURL - The app's HTTPS privacy-policy URL.
 * @returns The existing or newly opened session.
 */
export const presentPreferences = async (
	privacyPolicyURL: string
): Promise<ConsentPresenterSession> =>
	announce(
		parseSession(await getNativeC15t().presentPreferences(privacyPolicyURL)),
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
