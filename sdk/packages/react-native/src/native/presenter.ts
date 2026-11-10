import { getNativeC15t, getNativeC15tEvents } from './module';

/** A native presentation request. Repeated commands keep the same session. */
export interface ConsentPresenterSession {
	readonly sessionId: string | null;
	readonly status: 'presented' | 'already-presented' | 'not-required';
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
	return {
		sessionId: typeof value.sessionId === 'string' ? value.sessionId : null,
		status: value.status,
	};
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

/** Open an owed native prompt on the installed engine.
 * @param privacyPolicyURL - The app's HTTPS privacy-policy URL.
 * @returns Presentation identity. Decisions arrive through onConsentPresenterOutcome.
 */
export const presentConsentPrompt = async (
	privacyPolicyURL: string
): Promise<ConsentPresenterSession> =>
	remember(
		parseSession(await getNativeC15t().presentConsentPrompt(privacyPolicyURL)),
		privacyPolicyURL
	);

/** Open native standing preferences, including when no prompt is owed.
 * @param privacyPolicyURL - The app's HTTPS privacy-policy URL.
 * @returns The existing or newly opened session.
 */
export const presentPreferences = async (
	privacyPolicyURL: string
): Promise<ConsentPresenterSession> =>
	remember(
		parseSession(await getNativeC15t().presentPreferences(privacyPolicyURL)),
		privacyPolicyURL
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
