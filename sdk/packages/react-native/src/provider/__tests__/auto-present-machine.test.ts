/**
 * The auto-present state machine, cell by cell, and the invariant it exists for:
 * if a prompt is owed, auto-present is on, and nothing of ours is on screen, then
 * a native call is in flight or the next trigger makes one, unless the person
 * already saw this owed prompt and closed it, or native refused the URL.
 */

import { describe, expect, test } from 'vitest';

import {
	INITIAL_AUTO_PRESENT_STATE,
	stepAutoPresent,
} from '../auto-present-machine';
import type {
	AutoPresentEffect,
	AutoPresentInput,
	AutoPresentPhase,
	AutoPresentState,
	SessionPresentation,
} from '../auto-present-machine';

const URL = 'https://example.com/privacy';

const at = (
	phase: AutoPresentPhase,
	extra: Partial<AutoPresentState> = {}
): AutoPresentState => ({
	...INITIAL_AUTO_PRESENT_STATE,
	...extra,
	phase,
});

const requesting = (
	key: string,
	ended = false,
	recheck = false
): AutoPresentPhase => ({
	ended,
	key,
	kind: 'requesting',
	recheck,
});
const showing = (
	key: string,
	sessionId = 's1',
	ended = false
): AutoPresentPhase => ({
	ended,
	key,
	kind: 'showing',
	sessionId,
});
const trigger = (key: string | null, url = URL): AutoPresentInput => ({
	key,
	type: 'trigger',
	url,
});
const outcome = (
	kind: 'committed' | 'acknowledged' | 'dismissed' | 'unavailable',
	key: string | null,
	sessionId = 's1'
): AutoPresentInput => ({ key, kind, sessionId, type: 'outcome' });
const already = (
	presentation: SessionPresentation | undefined,
	sessionId = 's1'
): AutoPresentInput => ({
	presentation,
	sessionId,
	type: 'already-presented',
});

describe('cells', () => {
	test.each<
		[
			string,
			AutoPresentState,
			AutoPresentInput,
			AutoPresentPhase,
			AutoPresentEffect[],
		]
	>([
		// trigger
		[
			'idle, owed: ask',
			at({ kind: 'idle' }),
			trigger('A'),
			requesting('A'),
			['present'],
		],
		[
			'idle, nothing owed: wait',
			at({ kind: 'idle' }),
			trigger(null),
			{ kind: 'idle' },
			[],
		],
		[
			'requesting, change: recheck later',
			at(requesting('A')),
			trigger('B'),
			requesting('A', false, true),
			[],
		],
		[
			'requesting, nothing owed: the episode ends',
			at(requesting('A')),
			trigger(null),
			requesting('A', true, true),
			[],
		],
		[
			'showing, anything owed: the session shows it',
			at(showing('A')),
			trigger('B'),
			showing('A'),
			[],
		],
		[
			'showing, nothing owed: the episode ends',
			at(showing('A')),
			trigger(null),
			showing('A', 's1', true),
			[],
		],
		[
			'blocked: wait for the session',
			at({ kind: 'blocked', sessionId: 's1' }),
			trigger('A'),
			{ kind: 'blocked', sessionId: 's1' },
			[],
		],
		[
			'handled, same prompt: stays closed',
			at({ key: 'A', kind: 'handled' }),
			trigger('A'),
			{ key: 'A', kind: 'handled' },
			[],
		],
		[
			'handled, another prompt: ask',
			at({ key: 'A', kind: 'handled' }),
			trigger('B'),
			requesting('B'),
			['present'],
		],
		[
			'handled, nothing owed: forget it',
			at({ key: 'A', kind: 'handled' }),
			trigger(null),
			{ kind: 'idle' },
			[],
		],
		[
			'refused URL: not offered again',
			at({ kind: 'idle' }, { refusedURL: URL }),
			trigger('A'),
			{ kind: 'idle' },
			[],
		],
		[
			'refused URL, a new URL: ask',
			at({ kind: 'idle' }, { refusedURL: URL }),
			trigger('A', 'https://example.com/legal'),
			requesting('A'),
			['present'],
		],
		// native answers
		[
			'presented: shown',
			at(requesting('A')),
			{ sessionId: 's1', type: 'presented' },
			showing('A'),
			[],
		],
		[
			'presented after a change: shown, then decide again',
			at(requesting('A', false, true)),
			{ sessionId: 's1', type: 'presented' },
			showing('A'),
			['recheck'],
		],
		[
			'already presented, a prompt: shown',
			at(requesting('A')),
			already('prompt'),
			showing('A'),
			[],
		],
		[
			'already presented, preferences: blocked, not shown',
			at(requesting('A')),
			already('preferences'),
			{ kind: 'blocked', sessionId: 's1' },
			[],
		],
		[
			'already presented, unnamed by an older binary: blocked',
			at(requesting('A')),
			already(undefined),
			{ kind: 'blocked', sessionId: 's1' },
			[],
		],
		[
			'already presented, that session already closed: decide again',
			at(requesting('A'), { closed: ['s1'] }),
			already('preferences'),
			{ kind: 'idle' },
			['recheck'],
		],
		[
			'not required: wait for the next trigger',
			at(requesting('A')),
			{ type: 'not-required' },
			{ kind: 'idle' },
			[],
		],
		[
			'refused: reported, URL remembered',
			at(requesting('A')),
			{ type: 'refused', url: URL },
			{ kind: 'idle' },
			['report-refused'],
		],
		[
			'failed: warned, the next trigger retries',
			at(requesting('A')),
			{ type: 'failed' },
			{ kind: 'idle' },
			['warn-unavailable'],
		],
		// session outcomes
		[
			'showing, dismissed: handled as on screen',
			at(showing('A')),
			outcome('dismissed', 'A'),
			{ key: 'A', kind: 'handled' },
			['recheck'],
		],
		[
			'showing, dismissed after the requirement changed: the new one was on screen',
			at(showing('A')),
			outcome('dismissed', 'B'),
			{ key: 'B', kind: 'handled' },
			['recheck'],
		],
		[
			'showing, unavailable, nothing owed: idle',
			at(showing('A')),
			outcome('unavailable', null),
			{ kind: 'idle' },
			['recheck'],
		],
		[
			'showing, committed: the shown prompt is answered',
			at(showing('A')),
			outcome('committed', null),
			{ key: 'A', kind: 'handled' },
			['recheck'],
		],
		[
			'showing, committed after its episode ended: decide afresh',
			at(showing('A', 's1', true)),
			outcome('committed', 'C'),
			{ kind: 'idle' },
			['recheck'],
		],
		[
			'showing, another session closed: still showing',
			at(showing('A')),
			outcome('dismissed', 'A', 's9'),
			showing('A'),
			['recheck'],
		],
		[
			'blocked, its session closed: decide again',
			at({ kind: 'blocked', sessionId: 's1' }),
			outcome('dismissed', 'A'),
			{ kind: 'idle' },
			['recheck'],
		],
		[
			'requesting, a session closed: the answer checks it',
			at(requesting('A')),
			outcome('dismissed', 'A'),
			requesting('A'),
			[],
		],
		[
			'handled, a session closed: decide again',
			at({ key: 'A', kind: 'handled' }),
			outcome('dismissed', 'A', 's9'),
			{ key: 'A', kind: 'handled' },
			['recheck'],
		],
	])('%s', (_name, state, input, phase, effects) => {
		const result = stepAutoPresent(state, input);
		expect(result.state.phase).toEqual(phase);
		expect(result.effects).toEqual(effects);
	});

	test('a closed session is remembered for a late answer', () => {
		const result = stepAutoPresent(
			at(requesting('A')),
			outcome('dismissed', 'A', 's4')
		);
		expect(result.state.closed).toEqual(['s4']);
	});
});

/** A small seeded generator (Park–Miller), so a failing sequence reproduces. */
const random = function random(seed: number): () => number {
	const modulus = 2_147_483_647;
	let value = (seed % (modulus - 1)) + 1;
	return () => {
		value = (value * 48_271) % modulus;
		return value / modulus;
	};
};

interface NativeSession {
	readonly id: string;
	readonly presentation: SessionPresentation;
}

const GOOD_URLS: ReadonlySet<string> = new Set([
	URL,
	'https://example.com/legal',
]);
const EVENTS = [
	'snapshot',
	'snapshot',
	'foreground',
	'answer',
	'answer',
	'answer',
	'close',
	'preferences',
	'manual-prompt',
	'opt',
	'url',
	'none',
	'again',
	'late',
] as const;

/**
 * The machine driven against a model of native and the app. `namesSessions: false`
 * models a binary that predates `presentation`.
 */
class Simulation {
	state = INITIAL_AUTO_PRESENT_STATE;
	owed: string | null = 'k0';
	session: NativeSession | null = null;
	calls = 0;
	active = true;
	url = URL;
	/** What the person closed without answering, which stays closed by design. */
	dismissed: string | null = null;
	readonly trace: string[] = [];
	private keys = 0;
	private sessions = 0;
	private readonly next: () => number;
	private readonly namesSessions: boolean;

	constructor(seed: number, namesSessions: boolean) {
		this.next = random(seed);
		this.namesSessions = namesSessions;
	}

	pick<Item>(items: readonly Item[]): Item {
		return items[Math.floor(this.next() * items.length)] as Item;
	}

	apply(input: AutoPresentInput): void {
		this.trace.push(JSON.stringify(input));
		const result = stepAutoPresent(this.state, input);
		this.state = result.state;
		for (const effect of result.effects) {
			if (effect === 'present') {
				this.calls += 1;
			}
			if (effect === 'recheck') {
				this.trigger();
			}
		}
	}

	trigger(): void {
		if (this.active) {
			this.apply({ key: this.owed, type: 'trigger', url: this.url });
		}
	}

	owe(key: string | null): void {
		this.owed = key;
		this.trigger();
	}

	newKey(): string {
		this.keys += 1;
		return `k${this.keys}`;
	}

	open(presentation: SessionPresentation): NativeSession {
		this.sessions += 1;
		this.session = { id: `s${this.sessions}`, presentation };
		return this.session;
	}

	close(): void {
		const closed = this.session;
		if (closed === null) {
			return;
		}
		const kind = this.next() < 0.7 ? 'dismissed' : 'committed';
		this.session = null;
		if (kind === 'committed') {
			this.owed = null;
		} else if (closed.presentation === 'prompt') {
			this.dismissed = this.owed;
		}
		this.apply({ key: this.owed, kind, sessionId: closed.id, type: 'outcome' });
	}

	answerWith(session: NativeSession): void {
		this.apply({
			presentation: this.namesSessions ? session.presentation : undefined,
			sessionId: session.id,
			type: 'already-presented',
		});
	}

	answer(): void {
		this.calls -= 1;
		if (!GOOD_URLS.has(this.url)) {
			this.apply({ type: 'refused', url: this.url });
		} else if (this.next() < 0.1) {
			this.apply({ type: 'failed' });
		} else if (this.session !== null) {
			this.answerWith(this.session);
		} else if (this.owed === null) {
			this.apply({ type: 'not-required' });
		} else {
			this.apply({ sessionId: this.open('prompt').id, type: 'presented' });
		}
	}

	/** The session's outcome crosses the bridge before the answer that names it. */
	late(): void {
		const pending = this.session;
		if (this.calls === 0 || pending === null) {
			return;
		}
		this.close();
		this.calls -= 1;
		this.answerWith(pending);
	}

	step(): void {
		const event = this.pick(EVENTS);
		this.trace.push(event);
		switch (event) {
			case 'snapshot':
				// An unrelated revision keeps the key; a policy change names a new prompt.
				this.owe(
					this.owed !== null && this.next() < 0.5 ? this.newKey() : this.owed
				);
				break;
			case 'none':
				this.owe(null);
				break;
			case 'again':
				// Owed again: native names it anew, as promptOwedSince does.
				this.owe(this.newKey());
				break;
			case 'answer':
				if (this.calls > 0) {
					this.answer();
				}
				break;
			case 'late':
				this.late();
				break;
			case 'close':
				this.close();
				break;
			case 'preferences':
				if (this.session === null) {
					this.open('preferences');
				}
				break;
			case 'manual-prompt':
				if (this.session === null && this.owed !== null) {
					this.open('prompt');
				}
				break;
			case 'opt':
				this.active = !this.active;
				this.trigger();
				break;
			case 'url':
				this.url = this.pick([
					URL,
					'https://example.com/legal',
					'https://bad.example/refused',
				]);
				this.trigger();
				break;
			default:
				this.trigger();
		}
	}

	/** The invariant: owed, auto on, nothing on screen, not dismissed, a usable URL: asked or about to be. */
	check(seed: number): void {
		const { owed } = this;
		const mustShow =
			this.active &&
			owed !== null &&
			this.session === null &&
			this.dismissed !== owed &&
			GOOD_URLS.has(this.url);
		if (!mustShow || this.calls > 0) {
			return;
		}
		const probe = stepAutoPresent(this.state, {
			key: owed,
			type: 'trigger',
			url: this.url,
		});
		if (!probe.effects.includes('present')) {
			throw new Error(
				`seed ${seed}: prompt ${owed} owed, nothing on screen, no call in flight, and the next trigger asks nothing. Phase ${JSON.stringify(this.state.phase)}.\n${this.trace.join('\n')}`
			);
		}
	}
}

const run = function run(
	seed: number,
	options: { readonly namesSessions: boolean }
): void {
	const simulation = new Simulation(seed, options.namesSessions);
	for (let index = 0; index < 80; index += 1) {
		simulation.step();
		simulation.check(seed);
	}
};

describe('the invariant, over random sequences', () => {
	test('a binary that names its sessions', () => {
		for (let seed = 1; seed <= 3000; seed += 1) {
			expect(() => run(seed, { namesSessions: true })).not.toThrow();
		}
	});

	test('an older binary that does not', () => {
		for (let seed = 1; seed <= 3000; seed += 1) {
			expect(() => run(seed, { namesSessions: false })).not.toThrow();
		}
	});
});
