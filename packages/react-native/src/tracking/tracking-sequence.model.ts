/**
 * The rule that decides when to ask for App Tracking Transparency: the
 * provider's settings, what the rule reads, and the pure checks over them.
 * The sequencer that runs it around the consent prompt is
 * `request-sequenced-tracking.ts`.
 */

import type { ConsentDecision } from '../lib/consent-selectors.model';
import type { TrackingAuthorization } from '../protocol';

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
