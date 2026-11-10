/**
 * The auto-present ledger as a state machine: one phase per client, one
 * transition per input, no side effects.
 *
 * The rule it keeps: if a prompt is owed, auto-present is on, and nothing of
 * ours is on screen, then a native call is in flight or the next trigger makes
 * one, unless the person already saw this owed prompt and closed it. Native
 * says what is on screen, so the ledger never records a prompt as shown on its
 * own say-so: `presented` and an `already-presented` naming a prompt session
 * mean shown, anything else means wait for that session's outcome and decide
 * again.
 *
 * | Phase        | Meaning                                                    |
 * | ------------ | ---------------------------------------------------------- |
 * | `idle`       | Nothing known for the owed prompt; the next trigger asks.  |
 * | `requesting` | A native call is in flight for `key`.                      |
 * | `showing`    | Native shows our prompt in `sessionId`, now for any key.   |
 * | `blocked`    | Another session (preferences, or one a binary did not name) is open. |
 * | `handled`    | The person saw `key` and its session closed.               |
 *
 * `ended` records that nothing was owed at some point since the phase began,
 * which ends that prompt's episode: the same requirement owed again is new.
 */

import type { ConsentPresenterOutcome } from '../native/presenter';

/** What an open native session shows. */
export type SessionPresentation = 'prompt' | 'preferences';

/** One phase of the ledger. */
export type AutoPresentPhase =
	| { readonly kind: 'idle' }
	| {
			readonly kind: 'requesting';
			readonly key: string;
			readonly recheck: boolean;
			readonly ended: boolean;
	  }
	| {
			readonly kind: 'showing';
			readonly key: string;
			readonly sessionId: string;
			readonly ended: boolean;
	  }
	| { readonly kind: 'blocked'; readonly sessionId: string }
	| { readonly kind: 'handled'; readonly key: string };

/** The ledger for one client. */
export interface AutoPresentState {
	readonly phase: AutoPresentPhase;
	/** Sessions whose outcome already arrived, newest last, so a late answer naming one is not waited on. */
	readonly closed: readonly string[];
	/** A privacy-policy URL native refused for good. That URL is not offered again; another one is. */
	readonly refusedURL: string | null;
}

/** Everything the ledger reacts to. */
export type AutoPresentInput =
	/** Snapshot change, foreground, mount, opt-in or a new URL: decide with the current key. */
	| {
			readonly type: 'trigger';
			readonly key: string | null;
			readonly url: string;
	  }
	| { readonly type: 'presented'; readonly sessionId: string }
	| {
			readonly type: 'already-presented';
			readonly sessionId: string;
			readonly presentation: SessionPresentation | undefined;
	  }
	| { readonly type: 'not-required' }
	| { readonly type: 'refused'; readonly url: string }
	| { readonly type: 'failed' }
	| {
			readonly type: 'outcome';
			readonly sessionId: string;
			readonly kind: ConsentPresenterOutcome['kind'];
			/** The owed prompt when the outcome arrived, `null` when nothing is owed. */
			readonly key: string | null;
	  };

/**
 * What the driver does after a transition. `recheck` means "trigger again with
 * the current key", which is how a decision deferred by a call or a session gets
 * made once that call or session is over.
 */
export type AutoPresentEffect =
	| 'present'
	| 'recheck'
	| 'report-refused'
	| 'warn-unavailable';

/** One transition's result. */
export interface AutoPresentStep {
	readonly state: AutoPresentState;
	readonly effects: readonly AutoPresentEffect[];
}

/** How many closed session ids are kept for late answers. */
const CLOSED_SESSIONS_KEPT = 8;

/** The ledger before anything happened. */
export const INITIAL_AUTO_PRESENT_STATE: AutoPresentState = {
	closed: [],
	phase: { kind: 'idle' },
	refusedURL: null,
};

const IDLE: AutoPresentPhase = { kind: 'idle' };

const step = function step(
	state: AutoPresentState,
	phase: AutoPresentPhase,
	...effects: AutoPresentEffect[]
): AutoPresentStep {
	return { effects, state: { ...state, phase } };
};

const onTrigger = function onTrigger(
	state: AutoPresentState,
	key: string | null,
	url: string
): AutoPresentStep {
	const { phase } = state;
	if (phase.kind === 'requesting') {
		return step(state, {
			...phase,
			ended: phase.ended || key === null,
			recheck: true,
		});
	}
	if (key === null) {
		if (phase.kind === 'showing') {
			return step(state, { ...phase, ended: true });
		}
		return step(state, phase.kind === 'handled' ? IDLE : phase);
	}
	// Something is on screen, or the person already closed this very prompt.
	if (
		phase.kind === 'showing' ||
		phase.kind === 'blocked' ||
		(phase.kind === 'handled' && phase.key === key)
	) {
		return step(state, phase);
	}
	// The URL was refused and reported; a different URL is offered.
	if (state.refusedURL === url) {
		return step(state, phase);
	}
	return step(
		state,
		{ ended: false, key, kind: 'requesting', recheck: false },
		'present'
	);
};

const settle = function settle(
	state: AutoPresentState,
	phase: AutoPresentPhase,
	recheck: boolean,
	...effects: AutoPresentEffect[]
): AutoPresentStep {
	return step(
		state,
		phase,
		...effects,
		...(recheck ? (['recheck'] as const) : [])
	);
};

const onAnswer = function onAnswer(
	state: AutoPresentState,
	input: Exclude<AutoPresentInput, { type: 'trigger' } | { type: 'outcome' }>
	// `failed` is the default branch.
): AutoPresentStep {
	const { phase } = state;
	if (phase.kind !== 'requesting') {
		return step(state, phase);
	}
	const { ended, key, recheck } = phase;
	switch (input.type) {
		case 'presented':
		case 'already-presented': {
			// The session already closed before this answer crossed the bridge.
			if (state.closed.includes(input.sessionId)) {
				return step(state, IDLE, 'recheck');
			}
			const shown =
				input.type === 'presented' || input.presentation === 'prompt';
			return settle(
				state,
				shown
					? { ended, key, kind: 'showing', sessionId: input.sessionId }
					: { kind: 'blocked', sessionId: input.sessionId },
				recheck
			);
		}
		case 'not-required':
			return settle(state, IDLE, recheck);
		case 'refused':
			return settle(
				{ ...state, refusedURL: input.url },
				IDLE,
				recheck,
				'report-refused'
			);
		default:
			return settle(state, IDLE, recheck, 'warn-unavailable');
	}
};

const onOutcome = function onOutcome(
	state: AutoPresentState,
	input: Extract<AutoPresentInput, { type: 'outcome' }>
): AutoPresentStep {
	const closed = [...state.closed, input.sessionId].slice(
		-CLOSED_SESSIONS_KEPT
	);
	const next = { ...state, closed };
	const { phase } = state;
	if (phase.kind === 'showing' && phase.sessionId === input.sessionId) {
		// A dismissal settles what was on screen when it closed. The open session reloads
		// its draft as the requirement changes, so that is the current owed prompt.
		if (input.kind === 'dismissed' || input.kind === 'unavailable') {
			return step(
				next,
				input.key === null ? IDLE : { key: input.key, kind: 'handled' },
				'recheck'
			);
		}
		// An answer settles the prompt that was shown, unless that prompt's episode ended
		// meanwhile; whatever is owed now is decided afresh.
		return step(
			next,
			phase.ended ? IDLE : { key: phase.key, kind: 'handled' },
			'recheck'
		);
	}
	if (phase.kind === 'blocked' && phase.sessionId === input.sessionId) {
		return step(next, IDLE, 'recheck');
	}
	// A call is in flight: its answer checks `closed`. Otherwise any closed session
	// is a moment worth deciding again.
	return step(
		next,
		phase,
		...(phase.kind === 'requesting' ? [] : (['recheck'] as const))
	);
};

/**
 * Apply one input to the ledger.
 *
 * @param state - The ledger before the input.
 * @param input - What happened.
 * @returns The next ledger and what the driver should do.
 */
export const stepAutoPresent = function stepAutoPresent(
	state: AutoPresentState,
	input: AutoPresentInput
): AutoPresentStep {
	switch (input.type) {
		case 'trigger':
			return onTrigger(state, input.key, input.url);
		case 'outcome':
			return onOutcome(state, input);
		default:
			return onAnswer(state, input);
	}
};
