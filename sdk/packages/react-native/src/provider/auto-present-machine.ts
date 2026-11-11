/**
 * Whether to present the native consent prompt, recomputed on every input from
 * a few stored facts and the current inputs. No decision is remembered.
 *
 * The current inputs ({@link AutoPresentContext}) are what is owed now, named by
 * the key native stamps (`promptOwedSince`), the URL the app passes now, whether
 * a provider presents, and whether the binary links the stock native screens.
 * The stored facts are each keyed by what they were decided for, so changing any
 * input invalidates them by itself:
 *
 * | Fact        | Keyed by        | Meaning                                               |
 * | ----------- | --------------- | ----------------------------------------------------- |
 * | `inFlight`  | key and URL     | A present call is in flight.                          |
 * | `onScreen`  | session id      | Native reported this session open, and what it shows. |
 * | `dismissed` | owed key        | The person saw this owed prompt and closed it.        |
 * | `refused`   | URL             | Native refused this URL for good.                     |
 * | `declined`  | key, URL, trigger | Native said not now (nothing owed, or no window yet). |
 * | `closed`    | session id      | Sessions whose outcome arrived, so a late answer cannot revive one. |
 * | `excluded`  | the binary      | Native has no stock screens (`C15T_NATIVE_UI_EXCLUDED`). |
 * | `withdrawn` | session id      | A prompt this ledger opened after every presenting provider left. |
 *
 * The facts hold whether or not a provider presents: a session the app opened
 * itself is on screen, and a prompt the person dismissed there is dismissed,
 * whatever `autoPresent` was. A prompt the ledger's own call opens after every
 * presenting provider has gone is closed again, and its outcome is not the
 * person's, so a remount with `autoPresent={false}` never inherits it.
 *
 * Present now exactly when: a provider presents, the binary links the stock
 * screens and never said otherwise, a prompt is owed, no call is in flight,
 * nothing is on screen, the person has not closed this owed prompt, native has
 * not refused this URL, and native has not declined these same inputs since the
 * last trigger. That predicate is the invariant; the property
 * test asserts it after every input.
 */

import type { ConsentPresenterOutcome } from '../native/presenter';

/** What an open native session shows. */
export type SessionPresentation = 'prompt' | 'preferences';

/** The current inputs, read fresh for every input. */
export interface AutoPresentContext {
	/** The owed prompt, or `null` while the core is not ready or nothing is owed. */
	readonly key: string | null;
	/** The privacy-policy URL the provider passes now. */
	readonly url: string;
	/** A provider currently presents through this client. */
	readonly active: boolean;
	/**
	 * The binary links the stock native screens: `false` only when the bootstrap
	 * says `nativeUI: false` (a `c15t.nativeUI=false` build). Absent means linked.
	 */
	readonly nativeUI: boolean;
	/** Counts triggers (snapshot change, foreground, mount, a new prop), so a decline waits for the next. */
	readonly generation: number;
}

/** A session outcome that arrived before the answer naming its session. */
interface ClosedSession {
	readonly sessionId: string;
	/** The owed prompt a dismissal of it would settle, `null` for an answer or nothing owed. */
	readonly dismissedKey: string | null;
}

/** Everything the ledger stores. */
export interface AutoPresentFacts {
	readonly inFlight: { readonly key: string; readonly url: string } | null;
	readonly onScreen: {
		readonly sessionId: string;
		readonly presentation: SessionPresentation;
	} | null;
	readonly dismissed: string | null;
	readonly refused: string | null;
	readonly declined: {
		readonly key: string;
		readonly url: string;
		readonly generation: number;
	} | null;
	readonly closed: readonly ClosedSession[];
	/** Native rejected with `C15T_NATIVE_UI_EXCLUDED`. A binary cannot gain its screens, so this lasts. */
	readonly excluded: boolean;
	/** The session this ledger asked native to close, because no provider presented when it opened. */
	readonly withdrawn: string | null;
}

/** What happened. The current inputs travel beside it as the context. */
export type AutoPresentInput =
	/** A snapshot change, foreground, mount, or a change of URL or `autoPresent`. */
	| { readonly type: 'trigger' }
	| {
			readonly type: 'shown' | 'already-presented';
			readonly sessionId: string;
			/** Absent from a binary that predates naming its sessions. */
			readonly presentation: SessionPresentation | undefined;
	  }
	/** A session the app's own present call found open. */
	| {
			readonly type: 'seen';
			readonly sessionId: string;
			readonly presentation: SessionPresentation;
	  }
	| { readonly type: 'not-required' }
	| { readonly type: 'refused' }
	/** Rejected with `C15T_NATIVE_UI_EXCLUDED`: the binary has no stock screens. */
	| { readonly type: 'excluded' }
	| { readonly type: 'failed' }
	| {
			readonly type: 'outcome';
			readonly sessionId: string;
			readonly kind: ConsentPresenterOutcome['kind'];
	  };

/** What the driver does after an input. */
export type AutoPresentEffect =
	| 'present'
	| 'report-refused'
	| 'report-excluded'
	| 'withdraw'
	| 'warn-unavailable';

/** One input's result. */
export interface AutoPresentStep {
	readonly facts: AutoPresentFacts;
	readonly effects: readonly AutoPresentEffect[];
}

/** How many early outcomes are kept for answers that arrive after them. */
const CLOSED_SESSIONS_KEPT = 8;

/** Nothing known yet. */
export const INITIAL_AUTO_PRESENT_FACTS: AutoPresentFacts = {
	closed: [],
	declined: null,
	dismissed: null,
	excluded: false,
	inFlight: null,
	onScreen: null,
	refused: null,
	withdrawn: null,
};

/**
 * Whether to hand the owed prompt to native now.
 *
 * @param facts - What the ledger stores.
 * @param context - The current inputs.
 * @returns `true` when a present call should start.
 */
export const shouldPresent = function shouldPresent(
	facts: AutoPresentFacts,
	context: AutoPresentContext
): boolean {
	return (
		context.active &&
		context.nativeUI &&
		!facts.excluded &&
		context.key !== null &&
		facts.inFlight === null &&
		facts.onScreen === null &&
		facts.dismissed !== context.key &&
		facts.refused !== context.url &&
		!(
			facts.declined?.key === context.key &&
			facts.declined.url === context.url &&
			facts.declined.generation === context.generation
		)
	);
};

const closes = (kind: ConsentPresenterOutcome['kind']): boolean =>
	kind === 'dismissed' || kind === 'unavailable';

/** A session native reported open, unless its outcome already arrived. */
const opened = function opened(
	facts: AutoPresentFacts,
	sessionId: string,
	presentation: SessionPresentation
): AutoPresentFacts {
	const early = facts.closed.find((entry) => entry.sessionId === sessionId);
	if (early === undefined) {
		return { ...facts, onScreen: { presentation, sessionId } };
	}
	return presentation === 'prompt' && early.dismissedKey !== null
		? { ...facts, dismissed: early.dismissedKey }
		: facts;
};

/** The outcome of `sessionId`: forget it as on screen, remembering a dismissed prompt. */
const closedSession = function closedSession(
	facts: AutoPresentFacts,
	sessionId: string,
	dismissedKey: string | null
): AutoPresentFacts {
	// Every closed session is remembered, so an answer naming it that was sent
	// before it closed cannot put it back on screen.
	const closed = [...facts.closed, { dismissedKey, sessionId }].slice(
		-CLOSED_SESSIONS_KEPT
	);
	if (facts.onScreen?.sessionId !== sessionId) {
		return { ...facts, closed };
	}
	if (facts.withdrawn === sessionId) {
		// This ledger closed it; the person dismissed nothing.
		return {
			...facts,
			closed: [...facts.closed, { dismissedKey: null, sessionId }].slice(
				-CLOSED_SESSIONS_KEPT
			),
			onScreen: null,
			withdrawn: null,
		};
	}
	// A dismissal settles what was on screen, which follows the current requirement.
	const settled =
		facts.onScreen.presentation === 'prompt' && dismissedKey !== null;
	return {
		...facts,
		closed,
		dismissed: settled ? dismissedKey : facts.dismissed,
		onScreen: null,
	};
};

/** Native said not now to the call in flight; the next trigger asks again. */
const declined = function declined(
	facts: AutoPresentFacts,
	context: AutoPresentContext
): AutoPresentFacts {
	const call = facts.inFlight;
	return {
		...facts,
		declined:
			call === null ? null : { ...call, generation: context.generation },
		inFlight: null,
	};
};

const record = function record(
	facts: AutoPresentFacts,
	input: AutoPresentInput,
	context: AutoPresentContext
): {
	readonly facts: AutoPresentFacts;
	readonly effects: readonly AutoPresentEffect[];
} {
	switch (input.type) {
		case 'trigger':
			return { effects: [], facts };
		case 'seen':
			return {
				effects: [],
				facts: opened(facts, input.sessionId, input.presentation),
			};
		case 'shown': {
			const next = opened(
				{ ...facts, inFlight: null },
				input.sessionId,
				'prompt'
			);
			// Opened for a provider that has gone or opted out since: not its to keep.
			if (!context.active && next.onScreen?.sessionId === input.sessionId) {
				return {
					effects: ['withdraw'],
					facts: { ...next, withdrawn: input.sessionId },
				};
			}
			return { effects: [], facts: next };
		}
		case 'already-presented': {
			// A session an older binary does not name keeps what is already known of
			// it, and is otherwise waited on like settings.
			const known =
				facts.onScreen?.sessionId === input.sessionId
					? facts.onScreen.presentation
					: 'preferences';
			return {
				effects: [],
				facts: opened(
					{ ...facts, inFlight: null },
					input.sessionId,
					input.presentation ?? known
				),
			};
		}
		case 'not-required':
			return { effects: [], facts: declined(facts, context) };
		case 'refused':
			// Tied to the URL the call carried, so a corrected URL retries.
			return {
				effects: ['report-refused'],
				facts: {
					...facts,
					inFlight: null,
					refused: facts.inFlight?.url ?? context.url,
				},
			};
		case 'excluded':
			// Permanent for the process: reported once, never retried.
			return {
				effects: facts.excluded ? [] : ['report-excluded'],
				facts: { ...facts, excluded: true, inFlight: null },
			};
		case 'failed':
			return { effects: ['warn-unavailable'], facts: declined(facts, context) };
		default:
			return {
				effects: [],
				facts: closedSession(
					facts,
					input.sessionId,
					closes(input.kind) ? context.key : null
				),
			};
	}
};

/**
 * Apply one input, then decide afresh with the current inputs.
 *
 * @param facts - What the ledger stores.
 * @param input - What happened.
 * @param context - The current inputs.
 * @returns The next facts and what the driver should do.
 */
export const stepAutoPresent = function stepAutoPresent(
	facts: AutoPresentFacts,
	input: AutoPresentInput,
	context: AutoPresentContext
): AutoPresentStep {
	const recorded = record(facts, input, context);
	// Nothing owed ends the episode, so a dismissal no longer applies.
	const next =
		context.key === null && recorded.facts.dismissed !== null
			? { ...recorded.facts, dismissed: null }
			: recorded.facts;
	if (context.key === null || !shouldPresent(next, context)) {
		return { effects: recorded.effects, facts: next };
	}
	return {
		effects: [...recorded.effects, 'present'],
		facts: { ...next, inFlight: { key: context.key, url: context.url } },
	};
};
