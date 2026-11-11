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
 *   opens by itself or from `presentConsentPrompt`. A launch that owes no
 *   prompt asks at launch. Settings the person opens are not delayed.
 * - `manual`: nothing automatic. Call {@link useTrackingRequest} yourself.
 */
export type ConsentTrackingRequest =
	| 'afterConsent'
	| 'beforeConsent'
	| 'manual';

/**
 * Whether the provider asks Apple again after the person has answered.
 *
 * - `never`: only while Apple's answer is `not-determined`. The default.
 * - `yearly`: also call the request once per launch when the answer is
 *   `authorized` or `denied`, marketing is granted, and a year has passed since
 *   the SDK last saw an answer. In the European Union Apple then shows its
 *   prompt again if the person is eligible; otherwise, and outside the EU, it
 *   returns the stored answer without showing anything. Apple decides.
 */
export type ConsentTrackingReprompt = 'never' | 'yearly';

/** Where in the prompt flow a request would run. */
export type ConsentTrackingStage = 'beforePrompt' | 'afterPrompt';

/** The year the yearly re-ask waits, as Apple counts it for the EU: 365 days. */
export const TRACKING_REPROMPT_INTERVAL_MS = 365 * 24 * 60 * 60 * 1000;

/** Everything the tracking rule reads, gathered at the moment it decides. */
export interface TrackingInputs {
	/** Apple's current answer. `unsupported` without ATT or the prompt string. */
	readonly authorization: TrackingAuthorization;
	/**
	 * The marketing decision. Under an IAB TCF policy it is `granted` only while
	 * the committed TC String also grants `marketing`.
	 */
	readonly marketing: ConsentDecision;
	/**
	 * A stored choice refuses marketing, or a stored TC String does not grant
	 * it. Apple asks apps not to show its alert to people who opted out in a
	 * separate control, so no order asks then.
	 */
	readonly marketingRefused: boolean;
	/** `yearly` is on, a year has passed, and this launch has not asked for it. */
	readonly repromptDue: boolean;
}

/**
 * Whether to call Apple's request now.
 *
 * @param timing - The provider's `trackingRequest`.
 * @param stage - Where the flow is.
 * @param inputs - What the rule reads.
 * @returns `true` when the request should be made.
 */
export const shouldRequestTracking = function shouldRequestTracking(
	timing: ConsentTrackingRequest,
	stage: ConsentTrackingStage,
	inputs: TrackingInputs
): boolean {
	if (timing === 'manual' || inputs.marketingRefused) {
		return false;
	}
	if (inputs.authorization === 'not-determined') {
		if (timing === 'beforeConsent') {
			return stage === 'beforePrompt';
		}
		return stage === 'afterPrompt' && inputs.marketing === 'granted';
	}
	if (
		inputs.authorization === 'authorized' ||
		inputs.authorization === 'denied'
	) {
		// Apple decides whether the person is eligible again; outside the EU nothing shows.
		return inputs.repromptDue && inputs.marketing === 'granted';
	}
	return false;
};

/**
 * Whether a year has passed since `answeredAt`. With no answer on file it is
 * never due: native stamps an older answer the first time it is read, so the
 * year starts then.
 *
 * @param reprompt - The provider's `trackingReprompt`.
 * @param answeredAt - When the SDK last saw an answer, epoch milliseconds.
 * @param now - The current time, epoch milliseconds.
 * @returns `true` when the yearly re-ask is due.
 */
export const isRepromptDue = function isRepromptDue(
	reprompt: ConsentTrackingReprompt,
	answeredAt: number | null,
	now: number
): boolean {
	return (
		reprompt === 'yearly' &&
		answeredAt !== null &&
		now - answeredAt >= TRACKING_REPROMPT_INTERVAL_MS
	);
};

const reprompts = new WeakMap<ConsentClient, ConsentTrackingReprompt>();
const repromptCalled = new WeakSet<ConsentClient>();
const afterInformation = new WeakSet<ConsentClient>();

/**
 * Record the outermost provider's `trackingReprompt`, while it renders.
 *
 * @param client - The provider's client.
 * @param reprompt - Its setting.
 */
export const setTrackingReprompt = function setTrackingReprompt(
	client: ConsentClient,
	reprompt: ConsentTrackingReprompt
): void {
	reprompts.set(client, reprompt);
};

/**
 * Note that Apple paused on Additional Information and c15t's settings opened:
 * closing them applies the after-consent rule in either order.
 *
 * @param client - The provider's client.
 */
export const markAfterInformation = function markAfterInformation(
	client: ConsentClient
): void {
	afterInformation.add(client);
};

/**
 * What the rule reads, now.
 *
 * @param client - The client to read.
 * @returns The inputs.
 */
export const trackingInputs = function trackingInputs(
	client: ConsentClient
): TrackingInputs {
	const snapshot = client.getSnapshot();
	let marketing = client.decision('marketing');
	let marketingRefused =
		snapshot.explicitChoice?.categories.marketing?.value === false;
	// TCF records the legal consent and ATT is Apple's own gate: tracking needs
	// both, so under an IAB policy the TC String has to grant marketing too.
	if (snapshot.model === 'iab') {
		const consented = snapshot.iabMarketingPurposes;
		if (consented !== true && marketing === 'granted') {
			marketing = 'denied';
		}
		if (consented === false) {
			marketingRefused = true;
		}
	}
	return {
		authorization: client.refreshTrackingAuthorization(),
		marketing,
		marketingRefused,
		repromptDue:
			!repromptCalled.has(client) &&
			isRepromptDue(
				reprompts.get(client) ?? 'never',
				client.getTrackingAnsweredAt(),
				Date.now()
			),
	};
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
	// Back from Additional Information: the after-consent rule applies in either order.
	const order =
		stage === 'afterPrompt' &&
		timing === 'beforeConsent' &&
		afterInformation.delete(client)
			? 'afterConsent'
			: timing;
	const inputs = trackingInputs(client);
	if (!shouldRequestTracking(order, stage, inputs)) {
		return 'skipped';
	}
	if (
		inputs.authorization === 'authorized' ||
		inputs.authorization === 'denied'
	) {
		repromptCalled.add(client);
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
 * Ask once per launch when the core first has an answer and no prompt is owed.
 * With `afterConsent` that is a stored choice that grants marketing; with
 * `beforeConsent`, any stored choice that does not refuse it. Either asks only
 * while Apple has not answered, or for a due yearly re-ask. A cancelled ask
 * stays owed for the next effect.
 *
 * @param client - The client to check.
 * @param token - The calling effect's claim.
 * @param timing - The provider's `trackingRequest`.
 * @param onPaused - Opens privacy settings after Additional Information.
 * @returns Whether the launch decision is made, so the caller can stop listening.
 */
export const checkTrackingAtLaunch = function checkTrackingAtLaunch(
	client: ConsentClient,
	token: SequenceToken,
	timing: ConsentTrackingRequest,
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
	const before = timing === 'beforeConsent';
	const ask = async (): Promise<void> => {
		const result = await requestSequencedTracking(
			client,
			timing,
			before ? 'beforePrompt' : 'afterPrompt',
			token
		);
		if (result !== 'cancelled') {
			launchAsk.set(client, false);
		}
		// One beforeConsent ask per launch, as the prompt path counts it.
		if (before && (result === 'answered' || result === 'paused')) {
			beforeConsentDone.add(client);
		}
		if (result === 'paused') {
			onPaused();
		}
	};
	if (owed && !(before && beforeConsentDone.has(client))) {
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
