/**
 * The auto-present decision, cell by cell, and the invariant it exists for: if
 * a prompt is owed, auto-present is on, the props are valid and nothing is on
 * screen, then a native call is in flight or the next trigger makes one, unless
 * the person already closed this owed prompt. In a binary without the stock
 * native screens, nothing is asked of native, or only the one call that learns so.
 */

import { describe, expect, test } from 'vitest';

import { buildSnapshot } from '../../__tests__/helpers/fake-native';
import { selectOwedPromptKey } from '../auto-present';
import {
	INITIAL_AUTO_PRESENT_FACTS,
	stepAutoPresent,
} from '../auto-present-machine';
import type {
	AutoPresentContext,
	AutoPresentEffect,
	AutoPresentFacts,
	AutoPresentInput,
	SessionPresentation,
} from '../auto-present-machine';
import { isPrivacyPolicyURL } from '../privacy-policy-url';

const URL = 'https://example.com/privacy';
const LEGAL = 'https://example.com/legal';

const facts = (extra: Partial<AutoPresentFacts> = {}): AutoPresentFacts => ({
	...INITIAL_AUTO_PRESENT_FACTS,
	...extra,
});
const ctx = (
	key: string | null,
	extra: Partial<AutoPresentContext> = {}
): AutoPresentContext => ({
	active: true,
	generation: 1,
	key,
	nativeUI: true,
	url: URL,
	...extra,
});
const call = (key: string, url = URL) => ({ inFlight: { key, url } });
const screen = (
	sessionId: string,
	presentation: SessionPresentation = 'prompt'
) => ({
	onScreen: { presentation, sessionId },
});
const trigger: AutoPresentInput = { type: 'trigger' };
const outcome = (
	kind: 'committed' | 'acknowledged' | 'dismissed' | 'unavailable',
	sessionId = 's1'
): AutoPresentInput => ({ kind, sessionId, type: 'outcome' });
const answer = (
	type: 'shown' | 'already-presented',
	presentation?: SessionPresentation,
	sessionId = 's1'
): AutoPresentInput => ({ presentation, sessionId, type });

describe('cells', () => {
	test.each<
		[
			string,
			AutoPresentFacts,
			AutoPresentInput,
			AutoPresentContext,
			Partial<AutoPresentFacts>,
			AutoPresentEffect[],
		]
	>([
		// What is owed, what is on screen, what is in flight, the props.
		[
			'owed, nothing else: ask',
			facts(),
			trigger,
			ctx('A'),
			call('A'),
			['present'],
		],
		['nothing owed: nothing', facts(), trigger, ctx(null), {}, []],
		[
			'opted out: nothing',
			facts(),
			trigger,
			ctx('A', { active: false }),
			{},
			[],
		],
		[
			'a call in flight: wait for it',
			facts(call('A')),
			trigger,
			ctx('B'),
			call('A'),
			[],
		],
		[
			'something on screen: nothing',
			facts(screen('s1')),
			trigger,
			ctx('A'),
			screen('s1'),
			[],
		],
		[
			'the person closed this prompt: nothing',
			facts({ dismissed: 'A' }),
			trigger,
			ctx('A'),
			{ dismissed: 'A' },
			[],
		],
		[
			'closed another prompt: ask',
			facts({ dismissed: 'A' }),
			trigger,
			ctx('B'),
			{ ...call('B'), dismissed: 'A' },
			['present'],
		],
		[
			'nothing owed ends the dismissal',
			facts({ dismissed: 'A' }),
			trigger,
			ctx(null),
			{ dismissed: null },
			[],
		],
		[
			'this URL refused: nothing',
			facts({ refused: URL }),
			trigger,
			ctx('A'),
			{ refused: URL },
			[],
		],
		[
			'another URL: ask',
			facts({ refused: URL }),
			trigger,
			ctx('A', { url: LEGAL }),
			{ ...call('A', LEGAL), refused: URL },
			['present'],
		],
		// Native answers.
		[
			'shown: on screen',
			facts(call('A')),
			answer('shown'),
			ctx('A'),
			{ ...screen('s1'), inFlight: null },
			[],
		],
		[
			'already presented, the prompt: on screen',
			facts(call('A')),
			answer('already-presented', 'prompt'),
			ctx('A'),
			{ ...screen('s1'), inFlight: null },
			[],
		],
		[
			'already presented, settings: on screen as settings',
			facts(call('A')),
			answer('already-presented', 'preferences'),
			ctx('A'),
			{ ...screen('s1', 'preferences'), inFlight: null },
			[],
		],
		[
			'already presented, unnamed: waited on as settings',
			facts(call('A')),
			answer('already-presented'),
			ctx('A'),
			{ ...screen('s1', 'preferences'), inFlight: null },
			[],
		],
		[
			'answer for a session already closed: decide again',
			facts({
				...call('A'),
				closed: [{ dismissedKey: null, sessionId: 's1' }],
			}),
			answer('already-presented', 'preferences'),
			ctx('A'),
			call('A'),
			['present'],
		],
		[
			'answer for a prompt the person already dismissed',
			facts({ ...call('A'), closed: [{ dismissedKey: 'A', sessionId: 's1' }] }),
			answer('shown'),
			ctx('A'),
			{ dismissed: 'A', inFlight: null },
			[],
		],
		[
			'not required: wait for the next trigger',
			facts(call('A')),
			{ type: 'not-required' },
			ctx('A'),
			{ declined: { generation: 1, key: 'A', url: URL }, inFlight: null },
			[],
		],
		[
			'not required, then a trigger: ask',
			facts({ declined: { generation: 1, key: 'A', url: URL } }),
			trigger,
			ctx('A', { generation: 2 }),
			call('A'),
			['present'],
		],
		[
			'failed: warn, wait for the next trigger',
			facts(call('A')),
			{ type: 'failed' },
			ctx('A'),
			{ declined: { generation: 1, key: 'A', url: URL }, inFlight: null },
			['warn-unavailable'],
		],
		[
			'failed, but the prompt changed meanwhile: ask for it',
			facts(call('A')),
			{ type: 'failed' },
			ctx('B'),
			{ ...call('B'), declined: { generation: 1, key: 'A', url: URL } },
			['warn-unavailable', 'present'],
		],
		[
			'refused: the URL the call carried',
			facts(call('A', LEGAL)),
			{ type: 'refused' },
			ctx('A'),
			{ ...call('A'), refused: LEGAL },
			['report-refused', 'present'],
		],
		// The build: a binary without the stock native screens.
		[
			'built without the stock screens: nothing, whatever the URL',
			facts(),
			trigger,
			ctx('A', { nativeUI: false, url: 'not a url' }),
			{},
			[],
		],
		[
			'native says it has no stock screens: reported, never asked again',
			facts(call('A')),
			{ type: 'excluded' },
			ctx('A'),
			{ excluded: true, inFlight: null },
			['report-excluded'],
		],
		[
			'no stock screens: a new prompt and a new URL ask nothing',
			facts({ excluded: true }),
			trigger,
			ctx('B', { url: LEGAL }),
			{},
			[],
		],
		// Session outcomes.
		[
			'prompt dismissed: closed for this prompt',
			facts(screen('s1')),
			outcome('dismissed'),
			ctx('A'),
			{ dismissed: 'A', onScreen: null },
			[],
		],
		[
			'prompt answered: nothing owed, nothing to remember',
			facts(screen('s1')),
			outcome('committed'),
			ctx(null),
			{ onScreen: null },
			[],
		],
		[
			'prompt answered, still owed: ask',
			facts(screen('s1')),
			outcome('committed'),
			ctx('A'),
			{ ...call('A'), onScreen: null },
			['present'],
		],
		[
			'settings closed: the owed prompt is asked for',
			facts(screen('s1', 'preferences')),
			outcome('dismissed'),
			ctx('A'),
			{ ...call('A'), onScreen: null },
			['present'],
		],
		[
			'another session closed: still on screen',
			facts(screen('s1')),
			outcome('dismissed', 's9'),
			ctx('A'),
			{ ...screen('s1'), closed: [{ dismissedKey: 'A', sessionId: 's9' }] },
			[],
		],
		[
			'outcome before its answer: remembered',
			facts(call('A')),
			outcome('dismissed', 's4'),
			ctx('A'),
			{ ...call('A'), closed: [{ dismissedKey: 'A', sessionId: 's4' }] },
			[],
		],
	])('%s', (_name, before, input, context, expected, effects) => {
		const result = stepAutoPresent(before, input, context);
		expect(result.facts).toEqual({ ...before, ...expected });
		expect(result.effects).toEqual(effects);
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
	/** The owed prompt was a notice, which an external dismissal clears. */
	readonly notice: boolean;
}

interface Owed {
	readonly fingerprint: string;
	readonly kind: 'choice' | 'notice';
	/** What `promptOwedSince` stamps: a new value each time a prompt becomes owed again. */
	readonly since: number;
}

/**
 * A well-formed URL native refuses anyway, as a stricter binary might. The provider
 * accepts it, native reports the refusal, and the owed prompt cannot show while it is
 * the URL in use: the one exemption from property (a).
 */
const REFUSED_BY_NATIVE = 'https://refused.example/privacy';

/** URLs the provider may be given. Native accepts only the first two. */
const URLS = [
	URL,
	LEGAL,
	REFUSED_BY_NATIVE,
	'https://example.com:bad/privacy',
	'https://[',
	'http://example.com/privacy',
	'https://example.com/privacy ',
] as const;
const NATIVE_ACCEPTS: ReadonlySet<string> = new Set([URL, LEGAL]);

const EVENTS = [
	'unrelated',
	'policy',
	'none',
	'again',
	'coalesced',
	'foreground',
	'remount',
	'answer',
	'answer',
	'answer',
	'late',
	'close',
	'preferences',
	'manual-prompt',
	'external-dismiss',
	'opt',
	'url',
] as const;

/**
 * The binary under test: one that links the stock screens, one built without them
 * that says so in its bootstrap, and one without them whose bootstrap predates the
 * flag, so only its rejection tells.
 */
type Build = 'linked' | 'flagged' | 'unflagged';

/** The machine driven against a model of native, the host and the app. */
class Simulation {
	facts = INITIAL_AUTO_PRESENT_FACTS;
	owed: Owed | null = { fingerprint: 'f0', kind: 'choice', since: 1 };
	session: NativeSession | null = null;
	calls = 0;
	/** Every present call made, answered or not. */
	asked = 0;
	active = true;
	url: string = URL;
	generation = 0;
	/** The owed episode the person closed without answering, which stays closed by design. */
	dismissed: string | null = null;
	readonly trace: string[] = [];
	private counter = 1;
	private readonly next: () => number;
	private readonly namesSessions: boolean;
	private readonly build: Build;

	constructor(seed: number, namesSessions: boolean, build: Build) {
		this.next = random(seed);
		this.namesSessions = namesSessions;
		this.build = build;
	}

	pick<Item>(items: readonly Item[]): Item {
		return items[Math.floor(this.next() * items.length)] as Item;
	}

	/** The episode identity, whatever the binary reports. */
	episode(): string | null {
		return this.owed === null
			? null
			: `${this.owed.fingerprint}/${this.owed.since}`;
	}

	/** The key the ledger sees: the real selector over a snapshot like native's. */
	key(): string | null {
		if (this.owed === null) {
			return null;
		}
		return selectOwedPromptKey(
			buildSnapshot({
				promptOwedSince: this.namesSessions ? this.owed.since : null,
				promptRequirement: { kind: this.owed.kind, reason: 'missing' },
				resolution: {
					fingerprint: this.owed.fingerprint,
					policyId: 'p',
					status: 'matched',
				},
			})
		);
	}

	/** The provider renders only with a URL it accepts; otherwise it throws and presents nothing. */
	presenting(): boolean {
		return this.active && isPrivacyPolicyURL(this.url);
	}

	context(generation = this.generation): AutoPresentContext {
		return {
			active: this.presenting(),
			generation,
			key: this.key(),
			nativeUI: this.build !== 'flagged',
			url: this.url,
		};
	}

	apply(input: AutoPresentInput): void {
		if (input.type === 'trigger') {
			this.generation += 1;
		}
		this.trace.push(JSON.stringify(input));
		const result = stepAutoPresent(this.facts, input, this.context());
		this.facts = result.facts;
		if (result.effects.includes('present')) {
			this.calls += 1;
			this.asked += 1;
		}
	}

	trigger(): void {
		this.apply({ type: 'trigger' });
	}

	owe(
		kind: 'choice' | 'notice',
		fingerprint = this.owed?.fingerprint ?? 'f0'
	): void {
		this.counter += 1;
		this.owed = { fingerprint, kind, since: this.counter };
	}

	open(presentation: SessionPresentation): NativeSession {
		this.counter += 1;
		this.session = {
			id: `s${this.counter}`,
			notice: presentation === 'prompt' && this.owed?.kind === 'notice',
			presentation,
		};
		return this.session;
	}

	/** The person closes what is open. */
	close(): void {
		const closed = this.session;
		if (closed === null) {
			return;
		}
		const answered = this.next() < 0.3;
		this.session = null;
		if (answered) {
			this.owed = null;
		} else if (closed.presentation === 'prompt' && this.owed !== null) {
			this.dismissed = this.episode();
		}
		this.apply({
			kind: answered ? 'committed' : 'dismissed',
			sessionId: closed.id,
			type: 'outcome',
		});
	}

	/** `dismissNotice()` or a save through the core, not the card. The host ends a notice session it empties. */
	externalDismiss(): void {
		if (this.owed === null) {
			return;
		}
		const wasNotice = this.owed.kind === 'notice';
		this.owed = null;
		const open = this.session;
		if (open !== null && open.notice && wasNotice) {
			this.session = null;
			this.apply({ kind: 'dismissed', sessionId: open.id, type: 'outcome' });
		}
		this.trigger();
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
		const url = this.facts.inFlight?.url ?? this.url;
		if (this.build !== 'linked') {
			this.apply({ type: 'excluded' });
		} else if (!NATIVE_ACCEPTS.has(url)) {
			this.apply({ type: 'refused' });
		} else if (this.next() < 0.1) {
			this.apply({ type: 'failed' });
		} else if (this.session !== null) {
			this.answerWith(this.session);
		} else if (this.owed === null) {
			this.apply({ type: 'not-required' });
		} else {
			const opened = this.open('prompt');
			this.apply({
				presentation: 'prompt',
				sessionId: opened.id,
				type: 'shown',
			});
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

	/** Change what is owed; `true` when the step should end in a trigger. */
	private changeOwed(event: (typeof EVENTS)[number]): void {
		switch (event) {
			case 'policy':
				if (this.owed !== null || this.next() < 0.5) {
					this.owe(
						this.pick(['choice', 'notice'] as const),
						`f${this.counter}`
					);
				}
				break;
			case 'none':
				this.owed = null;
				break;
			case 'again':
				if (this.owed === null) {
					this.owe(this.pick(['choice', 'notice'] as const));
				}
				break;
			case 'coalesced':
				// Answered elsewhere and owed again, delivered as one update. Only a binary
				// that stamps the episode can tell; an older one is known not to.
				if (this.namesSessions && this.owed !== null) {
					this.owe(this.owed.kind);
				}
				break;
			case 'opt':
				this.active = !this.active;
				break;
			case 'url':
				this.url = this.pick(URLS);
				break;
			default:
				// unrelated revision, foreground, remount
				break;
		}
		this.trigger();
	}

	step(): void {
		const event = this.pick(EVENTS);
		this.trace.push(event);
		switch (event) {
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
				// A binary without the stock screens opens nothing.
				if (this.session === null && this.build === 'linked') {
					this.open('preferences');
				}
				break;
			case 'manual-prompt':
				if (
					this.session === null &&
					this.owed !== null &&
					this.build === 'linked'
				) {
					this.open('prompt');
				}
				break;
			case 'external-dismiss':
				this.externalDismiss();
				break;
			default:
				this.changeOwed(event);
		}
	}

	/** Property (a), and in a binary without the stock screens, no retries. */
	check(seed: number): void {
		const allowed = { flagged: 0, linked: Infinity, unflagged: 1 }[this.build];
		if (this.asked > allowed) {
			throw new Error(
				`seed ${seed}: a ${this.build} binary without the stock screens was asked ${this.asked} times.\n${this.trace.join('\n')}`
			);
		}
		const mustShow =
			this.build === 'linked' &&
			this.presenting() &&
			this.owed !== null &&
			this.session === null &&
			this.dismissed !== this.episode() &&
			this.url !== REFUSED_BY_NATIVE;
		if (!mustShow || this.calls > 0) {
			return;
		}
		const probe = stepAutoPresent(
			this.facts,
			{ type: 'trigger' },
			this.context(this.generation + 1)
		);
		if (!probe.effects.includes('present')) {
			throw new Error(
				`seed ${seed}: ${this.episode()} owed, nothing on screen, no call in flight, and the next trigger asks nothing. Facts ${JSON.stringify(this.facts)}.\n${this.trace.join('\n')}`
			);
		}
	}
}

/** Fixed seeds, so the run is the same everywhere. */
const SEEDS = Array.from({ length: 4000 }, (_unused, index) => index + 1);
const STEPS = 100;

/** Run every seed; the first violation, or `null`. */
const firstViolation = function firstViolation(
	namesSessions: boolean,
	build: Build = 'linked'
): string | null {
	for (const seed of SEEDS) {
		const simulation = new Simulation(seed, namesSessions, build);
		try {
			for (let index = 0; index < STEPS; index += 1) {
				simulation.step();
				simulation.check(seed);
			}
		} catch (error: unknown) {
			return String(error).slice(0, 4000);
		}
	}
	return null;
};

describe('property (a), over fixed random sequences', () => {
	test('a binary that names its sessions and stamps each owed prompt', () => {
		expect(firstViolation(true)).toBeNull();
	});

	test('an older binary that does neither', () => {
		expect(firstViolation(false)).toBeNull();
	});

	test('a binary built without the stock screens that says so: never asked', () => {
		expect(firstViolation(true, 'flagged')).toBeNull();
	});

	test('one whose bootstrap predates the flag: asked once, then never', () => {
		expect(firstViolation(false, 'unflagged')).toBeNull();
	});
});
