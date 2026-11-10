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
import type {
	TrackingAuthorization,
	TrackingRequestPayload,
} from '../protocol';

/**
 * When the provider asks for App Tracking Transparency.
 *
 * - `afterConsent`: the consent prompt first, then Apple's alert once the
 *   prompt has closed, and only while marketing is granted. The default.
 * - `beforeConsent`: Apple's alert first, then the consent prompt.
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
 * @returns `true` when the alert should be asked for.
 */
export const shouldRequestTracking = function shouldRequestTracking(
	timing: ConsentTrackingRequest,
	stage: ConsentTrackingStage,
	authorization: TrackingAuthorization,
	marketing: ConsentDecision
): boolean {
	if (authorization !== 'not-determined') {
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
	if (!(await whenActive(token))) {
		return 'cancelled';
	}
	if (
		!shouldRequestTracking(
			timing,
			stage,
			client.refreshTrackingAuthorization(),
			client.decision('marketing')
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
 * Ask Apple once before the first prompt this launch, for `beforeConsent`.
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
		beforeConsentDone.add(client);
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
