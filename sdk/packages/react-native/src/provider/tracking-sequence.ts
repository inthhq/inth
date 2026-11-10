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
import type { TrackingAuthorization } from '../protocol';

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

/** Resolves once the app is active. Apple shows nothing while it is not. */
const whenActive = (): Promise<void> =>
	new Promise((resolve) => {
		if (AppState.currentState === 'active') {
			resolve();
			return;
		}
		const subscription = AppState.addEventListener('change', (state) => {
			if (state === 'active') {
				subscription.remove();
				resolve();
			}
		});
	});

const inFlight = new WeakSet<ConsentClient>();

/**
 * Ask Apple at `stage` if the rule says so, once at a time per client.
 *
 * @param client - The client whose snapshot and tracking answer decide.
 * @param timing - The provider's `trackingRequest`.
 * @param stage - Where the flow is.
 * @returns `true` when Apple paused on Additional Information after a
 *   prompt, so the caller should open privacy settings.
 */
export const requestSequencedTracking = async function requestSequencedTracking(
	client: ConsentClient,
	timing: ConsentTrackingRequest,
	stage: ConsentTrackingStage
): Promise<boolean> {
	if (inFlight.has(client)) {
		return false;
	}
	inFlight.add(client);
	try {
		await whenActive();
		if (
			!shouldRequestTracking(
				timing,
				stage,
				client.refreshTrackingAuthorization(),
				client.decision('marketing')
			)
		) {
			return false;
		}
		const answer = await client.requestTracking();
		return stage === 'afterPrompt' && answer.stage === 'additional-information';
	} catch {
		// A build without the prompt string, or no ATT at all. Consent is unaffected.
		return false;
	} finally {
		inFlight.delete(client);
	}
};

const beforeConsent = new WeakMap<ConsentClient, Promise<unknown>>();

/**
 * Ask Apple once before the first prompt this launch, for `beforeConsent`.
 *
 * @param client - The client to ask for.
 * @returns Settles when the prompt may present.
 */
export const requestTrackingBeforeConsent =
	function requestTrackingBeforeConsent(
		client: ConsentClient
	): Promise<unknown> {
		let pending = beforeConsent.get(client);
		if (pending === undefined) {
			pending = requestSequencedTracking(
				client,
				'beforeConsent',
				'beforePrompt'
			);
			beforeConsent.set(client, pending);
		}
		return pending;
	};

const launchChecked = new WeakSet<ConsentClient>();

/**
 * For `afterConsent`, ask once per launch when the core first has an answer
 * and no prompt is owed: a stored choice that grants marketing, from a launch
 * where Apple was never asked.
 *
 * @param client - The client to check.
 * @returns Whether a launch check ran, so the caller can stop listening.
 */
export const checkTrackingAtLaunch = function checkTrackingAtLaunch(
	client: ConsentClient
): boolean {
	const snapshot = client.getSnapshot();
	if (launchChecked.has(client) || !isSnapshotReady(snapshot)) {
		return launchChecked.has(client);
	}
	launchChecked.add(client);
	if (snapshot.promptRequirement.kind === 'none') {
		void requestSequencedTracking(client, 'afterConsent', 'afterPrompt');
	}
	return true;
};
