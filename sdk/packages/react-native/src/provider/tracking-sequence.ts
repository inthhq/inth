/**
 * Ask for App Tracking Transparency in step with the consent prompt.
 *
 * The provider runs this. Asking is gated on Apple's answer being
 * `not-determined`, which is only true on iOS with
 * `NSUserTrackingUsageDescription` in the binary and the subject never asked:
 * Android and an iOS build without the prompt string read `unsupported`, so
 * nothing here runs there. Apple's answer never changes stored consent.
 */

import { AppState } from 'react-native';

import { isSnapshotReady } from '../lib/selectors';
import type { ConsentDecision } from '../lib/selectors';
import type { ConsentClient } from '../native/client';
import { setBeforeConsentPrompt } from '../native/presenter';
import type {
	TrackingAuthorization,
	TrackingRequestPayload,
} from '../protocol';
import {
	isConsentScreenBusy,
	onConsentScreenChange,
	selectOwedPromptKey,
} from './auto-present';

/**
 * When the provider asks for App Tracking Transparency.
 *
 * - `afterConsent`: the consent prompt first, then Apple's alert once the
 *   prompt has closed, and only while marketing is granted. The default.
 * - `beforeConsent`: Apple's alert first, then the consent prompt, whether it
 *   opens by itself or from `presentConsentPrompt`. Settings the person opens
 *   are not delayed.
 * - `manual`: nothing automatic. Call {@link useTrackingRequest} yourself.
 */
export type ConsentTrackingRequest =
	| 'afterConsent'
	| 'beforeConsent'
	| 'manual';

/** Where in the prompt flow a request would run. */
export type ConsentTrackingStage = 'beforePrompt' | 'afterPrompt';

/**
 * Whether to show Apple's alert now.
 *
 * @param timing - The provider's `trackingRequest`.
 * @param stage - Where the flow is.
 * @param authorization - Apple's current answer.
 * @param marketing - The marketing decision from the current snapshot.
 * @param marketingRefused - The person's stored choice refuses marketing.
 *   Apple asks apps not to show its alert to people who opted out in a
 *   separate control, so no order asks then.
 * @returns `true` when the alert should be asked for.
 */
export const shouldRequestTracking = function shouldRequestTracking(
	timing: ConsentTrackingRequest,
	stage: ConsentTrackingStage,
	authorization: TrackingAuthorization,
	marketing: ConsentDecision,
	marketingRefused: boolean
): boolean {
	if (authorization !== 'not-determined' || marketingRefused) {
		return false;
	}
	if (timing === 'beforeConsent') {
		return stage === 'beforePrompt';
	}
	return (
		timing === 'afterConsent' &&
		stage === 'afterPrompt' &&
		marketing === 'granted'
	);
};

/**
 * One effect's claim on the sequence. Cleanup cancels it, and every step
 * checks it after each wait, so a provider that unmounted or switched to
 * `manual` never asks Apple or presents anything later.
 */
export interface SequenceToken {
	cancelled: boolean;
	/** Undo work still waiting, such as an `AppState` listener. */
	readonly cleanups: Set<() => void>;
}

/** @returns A live token. */
export const createSequenceToken = (): SequenceToken => ({
	cancelled: false,
	cleanups: new Set(),
});

/** Cancel `token` and release whatever it is waiting on. */
export const cancelSequence = function cancelSequence(
	token: SequenceToken
): void {
	token.cancelled = true;
	for (const cleanup of token.cleanups) {
		cleanup();
	}
	token.cleanups.clear();
};

/**
 * Wait for the app to be active. Apple shows nothing while it is not.
 *
 * @returns `false` when `token` was cancelled first.
 */
const whenActive = (token: SequenceToken): Promise<boolean> =>
	new Promise((resolve) => {
		if (token.cancelled || AppState.currentState === 'active') {
			resolve(!token.cancelled);
			return;
		}
		const listener: { subscription?: { remove: () => void } } = {};
		// Called with `true` on activation and with nothing on cancellation.
		const settle = function settle(active = false): void {
			listener.subscription?.remove();
			token.cleanups.delete(settle);
			resolve(active && !token.cancelled);
		};
		token.cleanups.add(settle);
		listener.subscription = AppState.addEventListener('change', (state) => {
			if (state === 'active') {
				settle(true);
			}
		});
	});

/**
 * Wait until no c15t screen is open or being asked for. Apple will not show
 * its alert over a presentation, and the person should finish one screen first.
 *
 * @returns `false` when `token` was cancelled first.
 */
const whenScreensClosed = (
	client: ConsentClient,
	token: SequenceToken,
	includeInFlight: boolean
): Promise<boolean> =>
	new Promise((resolve) => {
		if (token.cancelled || !isConsentScreenBusy(client, includeInFlight)) {
			resolve(!token.cancelled);
			return;
		}
		const listener: { stop?: () => void } = {};
		const settle = function settle(clear = false): void {
			listener.stop?.();
			token.cleanups.delete(settle);
			resolve(clear && !token.cancelled);
		};
		token.cleanups.add(settle);
		listener.stop = onConsentScreenChange(client, () => {
			if (!isConsentScreenBusy(client, includeInFlight)) {
				settle(true);
			}
		});
	});

/** Both waits, again until they hold at once. */
const whenClear = async function whenClear(
	client: ConsentClient,
	token: SequenceToken,
	stage: ConsentTrackingStage
): Promise<boolean> {
	// Before a prompt, the present call in flight is the one this wait gates.
	const includeInFlight = stage === 'afterPrompt';
	if (
		!(await whenActive(token)) ||
		!(await whenScreensClosed(client, token, includeInFlight))
	) {
		return false;
	}
	return AppState.currentState === 'active' &&
		!isConsentScreenBusy(client, includeInFlight)
		? true
		: whenClear(client, token, stage);
};

/** Apple's request in flight per client, shared so two effects ask once. */
const requests = new WeakMap<ConsentClient, Promise<TrackingRequestPayload>>();

const askApple = function askApple(
	client: ConsentClient
): Promise<TrackingRequestPayload> {
	let request = requests.get(client);
	if (request === undefined) {
		request = (async (): Promise<TrackingRequestPayload> => {
			try {
				return await client.requestTracking();
			} finally {
				requests.delete(client);
			}
		})();
		requests.set(client, request);
	}
	return request;
};

/**
 * How one sequenced step ended. `paused` means Apple's EU sheet was closed
 * with Additional Information, so the caller opens privacy settings.
 */
export type SequenceResult = 'answered' | 'cancelled' | 'paused' | 'skipped';

/**
 * Ask Apple at `stage` if the rule says so.
 *
 * @param client - The client whose snapshot and tracking answer decide.
 * @param timing - The provider's `trackingRequest`.
 * @param stage - Where the flow is.
 * @param token - The calling effect's claim. Checked after every wait.
 * @returns How the step ended.
 */
export const requestSequencedTracking = async function requestSequencedTracking(
	client: ConsentClient,
	timing: ConsentTrackingRequest,
	stage: ConsentTrackingStage,
	token: SequenceToken
): Promise<SequenceResult> {
	if (!(await whenClear(client, token, stage))) {
		return 'cancelled';
	}
	if (
		!shouldRequestTracking(
			timing,
			stage,
			client.refreshTrackingAuthorization(),
			client.decision('marketing'),
			client.getSnapshot().explicitChoice?.categories.marketing?.value === false
		)
	) {
		return 'skipped';
	}
	let answer: TrackingRequestPayload;
	try {
		answer = await askApple(client);
	} catch {
		// A build without the prompt string, or no ATT at all. Consent is unaffected.
		answer = { stage: 'final', status: 'denied' };
	}
	if (token.cancelled) {
		return 'cancelled';
	}
	return answer.stage === 'additional-information' ? 'paused' : 'answered';
};

const beforeConsentDone = new WeakSet<ConsentClient>();

/**
 * Ask Apple before a prompt opens, for `beforeConsent`, until Apple has
 * answered once this launch. A skip (a stored refusal, ATT already answered or
 * not enabled) is not an answer, so the next prompt checks again: a refusal
 * that a reset cleared no longer holds the ask back.
 *
 * @param client - The client to ask for.
 * @param token - The calling effect's claim.
 * @returns `false` when `token` was cancelled, so the caller presents nothing.
 */
export const requestTrackingBeforeConsent =
	async function requestTrackingBeforeConsent(
		client: ConsentClient,
		token: SequenceToken
	): Promise<boolean> {
		if (beforeConsentDone.has(client)) {
			return !token.cancelled;
		}
		const result = await requestSequencedTracking(
			client,
			'beforeConsent',
			'beforePrompt',
			token
		);
		if (result === 'cancelled') {
			return false;
		}
		if (result !== 'skipped') {
			beforeConsentDone.add(client);
		}
		return true;
	};

/** Whether the first ready snapshot owed no prompt, so launch still asks. */
const launchAsk = new WeakMap<ConsentClient, boolean>();

/**
 * For `afterConsent`, ask once per launch when the core first has an answer
 * and no prompt is owed: a stored choice that grants marketing, from a launch
 * where Apple was never asked. A cancelled ask stays owed for the next effect.
 *
 * @param client - The client to check.
 * @param token - The calling effect's claim.
 * @param onPaused - Opens privacy settings after Additional Information.
 * @returns Whether the launch decision is made, so the caller can stop listening.
 */
export const checkTrackingAtLaunch = function checkTrackingAtLaunch(
	client: ConsentClient,
	token: SequenceToken,
	onPaused: () => void
): boolean {
	let owed = launchAsk.get(client);
	if (owed === undefined) {
		const snapshot = client.getSnapshot();
		if (!isSnapshotReady(snapshot)) {
			return false;
		}
		owed = snapshot.promptRequirement.kind === 'none';
		launchAsk.set(client, owed);
	}
	const ask = async (): Promise<void> => {
		const result = await requestSequencedTracking(
			client,
			'afterConsent',
			'afterPrompt',
			token
		);
		if (result !== 'cancelled') {
			launchAsk.set(client, false);
		}
		if (result === 'paused') {
			onPaused();
		}
	};
	if (owed) {
		void ask();
	}
	return true;
};

/** The before-consent wait one client's provider installed. */
interface BeforeConsentRegistration {
	readonly token: SequenceToken;
	readonly remove: () => void;
	/** Removed because the provider stopped asking for it: a waiting request opens. */
	proceed: boolean;
	/** A cleanup asked for removal; a remount in the same commit takes it back. */
	releasing: boolean;
}

const beforeConsentRegistrations = new WeakMap<
	ConsentClient,
	BeforeConsentRegistration
>();

const removeBeforeConsentPrompt = function removeBeforeConsentPrompt(
	client: ConsentClient,
	proceed: boolean
): void {
	const registration = beforeConsentRegistrations.get(client);
	if (registration !== undefined) {
		registration.proceed = proceed;
		beforeConsentRegistrations.delete(client);
		cancelSequence(registration.token);
		registration.remove();
	}
};

/**
 * Install or remove the wait that holds every native prompt request until
 * Apple has been asked, for `beforeConsent`: the app's own, and the ledger's on
 * a trigger or after a session closes.
 *
 * The provider calls this while it renders, before any descendant effect can
 * call `presentConsentPrompt`: React runs child effects, layout and passive,
 * before the parent's. It is idempotent, so strict mode's second render changes
 * nothing.
 *
 * @param client - The provider's client.
 * @param on - Whether the outermost provider says `beforeConsent`.
 */
export const syncBeforeConsentPrompt = function syncBeforeConsentPrompt(
	client: ConsentClient,
	on: boolean
): void {
	const current = beforeConsentRegistrations.get(client);
	if (!on) {
		// The provider now says another order: a request waiting on this one opens.
		removeBeforeConsentPrompt(client, true);
		return;
	}
	if (current !== undefined) {
		current.releasing = false;
		return;
	}
	const token = createSequenceToken();
	const holder: { registration?: BeforeConsentRegistration } = {};
	const wait = async function wait(): Promise<boolean> {
		const asked = await requestTrackingBeforeConsent(client, token);
		return asked || holder.registration?.proceed === true;
	};
	const remove = setBeforeConsentPrompt((): Promise<boolean> =>
		selectOwedPromptKey(client.getSnapshot()) === null
			? Promise.resolve(true)
			: wait()
	);
	holder.registration = {
		proceed: false,
		releasing: false,
		remove,
		token,
	};
	beforeConsentRegistrations.set(client, holder.registration);
};

/**
 * Remove the wait once the provider has really gone.
 *
 * Strict mode runs every cleanup and then every mount effect again, children
 * first, in the same commit. Removing at once would leave that second child
 * effect without the wait, so removal waits for a microtask and a remount in
 * between keeps it.
 *
 * @param client - The provider's client.
 */
export const releaseBeforeConsentPrompt = function releaseBeforeConsentPrompt(
	client: ConsentClient
): void {
	const registration = beforeConsentRegistrations.get(client);
	if (registration === undefined) {
		return;
	}
	registration.releasing = true;
	queueMicrotask(() => {
		if (
			registration.releasing &&
			beforeConsentRegistrations.get(client) === registration
		) {
			// The provider has gone: the ledger's waiting request asks for nothing.
			removeBeforeConsentPrompt(client, false);
		}
	});
};
