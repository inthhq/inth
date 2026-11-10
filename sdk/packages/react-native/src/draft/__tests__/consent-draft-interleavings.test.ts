/**
 * Random interleavings of staging, saves from other surfaces and draft saves,
 * against an in-memory core that records receipts the way both native cores do.
 * The property: a draft save never grants a category whose latest explicit
 * decision, made anywhere, is a refusal the subject had not seen when they
 * staged the grant.
 */

import { describe, expect, test } from 'vitest';

import { buildSnapshot } from '../../__tests__/helpers/fake-native';
import type { ConsentClient } from '../../native/client';
import type {
	CommitIntent,
	CommitResult,
	ConsentSnapshot,
} from '../../protocol';
import type { OptionalConsentCategory } from '../../protocol/vocabulary';
import { createConsentDraft } from '../consent-draft';

const CATEGORIES = ['measurement', 'marketing'] as const;
type Category = (typeof CATEGORIES)[number];

const MODULUS = 2_147_483_647;

/** Park and Miller's generator: deterministic, so a failing seed reproduces. */
const seeded = function seeded(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state * 48_271) % MODULUS;
		return state / MODULUS;
	};
};

interface Decision {
	readonly value: boolean;
	readonly at: number;
}

/**
 * A core that applies an explicit commit the moment it receives it and lets the
 * test choose when the reply and the change event reach JavaScript. A read
 * always sees the latest record, as the client's read after a mutation does.
 */
const createCore = function createCore() {
	let clock = 0;
	let snapshot: ConsentSnapshot = buildSnapshot({
		consentCategories: ['necessary', ...CATEGORIES],
		resolution: { fingerprint: 'fp-1', policyId: 'eu', status: 'match' },
	});
	const listeners = new Set<() => void>();
	/** Every explicit decision per category, from any surface, in order. */
	const history = new Map<Category, Decision[]>();
	let replies: (() => void)[] = [];
	let unannounced = false;

	const tick = (): number => {
		clock += 1;
		return clock;
	};

	const record = function record(
		consents: Partial<Record<OptionalConsentCategory, boolean>>
	): number {
		const at = tick();
		const categories = { ...snapshot.explicitChoice?.categories };
		const permissions = { ...snapshot.effectivePermissions };
		for (const category of CATEGORIES) {
			const value = consents[category];
			if (value !== undefined) {
				categories[category] = {
					basis: { fingerprint: 'fp-1', kind: 'choice-v1' },
					confirmedAt: at,
					value,
				};
				permissions[category] = value;
				history.set(category, [
					...(history.get(category) ?? []),
					{ at, value },
				]);
			}
		}
		snapshot = {
			...snapshot,
			effectivePermissions: permissions,
			explicitChoice: { categories, version: 3 },
			revision: snapshot.revision + 1,
		};
		unannounced = true;
		return snapshot.revision;
	};

	/** Deliver the change event for everything recorded since the last one. */
	const announce = function announce(): void {
		if (unannounced) {
			unannounced = false;
			for (const listener of [...listeners]) {
				listener();
			}
		}
	};

	const client = {
		commit: (intent: CommitIntent): Promise<CommitResult> => {
			if (intent.action !== 'explicit') {
				throw new Error(`unexpected intent ${intent.action}`);
			}
			const revision = record(intent.consents);
			return new Promise((resolve) => {
				replies.push(() =>
					resolve({
						confirmed: [],
						ok: true,
						queued: false,
						revision,
						subjectId: 'sub-1',
					})
				);
			});
		},
		getSnapshot: () => snapshot,
		subscribe: (_selector: unknown, listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	} as unknown as ConsentClient;

	return {
		announce,
		client,
		history,
		record,
		/** Deliver every reply the core still holds. */
		reply: async () => {
			const pending = replies;
			replies = [];
			for (const deliver of pending) {
				deliver();
			}
			await Promise.resolve();
			await Promise.resolve();
		},
		tick,
	};
};

const runInterleaving = async function runInterleaving(
	seed: number
): Promise<{ log: string[]; violation: string | null; saves: number }> {
	const random = seeded(seed);
	const pick = <ItemType>(items: readonly ItemType[]): ItemType =>
		items[Math.floor(random() * items.length)] as ItemType;
	const core = createCore();
	const draft = createConsentDraft(core.client);
	draft.subscribe(() => undefined);
	/** When the subject last staged a grant of each category. */
	const stagedGrantAt = new Map<Category, number>();
	const log: string[] = [];
	let saves = 0;
	let pending = false;

	/** Check a draft commit before the core records it. */
	const check = function check(
		consents: Partial<Record<OptionalConsentCategory, boolean>>
	): string | null {
		for (const category of CATEGORIES) {
			if (consents[category] !== true) {
				continue;
			}
			const latest = core.history.get(category)?.at(-1);
			if (
				latest !== undefined &&
				!latest.value &&
				(stagedGrantAt.get(category) ?? 0) < latest.at
			) {
				return `${category} granted over the refusal at ${String(latest.at)}`;
			}
		}
		return null;
	};

	const violations: string[] = [];
	const { commit } = core.client;
	(core.client as { commit: ConsentClient['commit'] }).commit = (intent) => {
		const found = intent.action === 'explicit' ? check(intent.consents) : null;
		if (found !== null) {
			violations.push(found);
		}
		return commit(intent);
	};

	const startSave = function startSave(): void {
		pending = true;
		void draft.save().then((result) => {
			saves += result.ok ? 1 : 0;
			pending = false;
		});
	};

	for (let step = 0; step < 40; step += 1) {
		if (violations.length > 0) {
			break;
		}
		const roll = random();
		if (roll < 0.35) {
			const category = pick(CATEGORIES);
			const value = random() < 0.6;
			log.push(`set ${category} ${String(value)}`);
			if (value) {
				stagedGrantAt.set(category, core.tick());
			}
			draft.set(category, value);
		} else if (roll < 0.42) {
			log.push('acceptAll');
			for (const category of CATEGORIES) {
				stagedGrantAt.set(category, core.tick());
			}
			draft.acceptAll();
		} else if (roll < 0.62) {
			const consents = Object.fromEntries(
				CATEGORIES.filter(() => random() < 0.7).map((category) => [
					category,
					random() < 0.5,
				])
			);
			log.push(`elsewhere ${JSON.stringify(consents)}`);
			core.record(consents);
		} else if (roll < 0.7) {
			log.push('announce');
			core.announce();
		} else if (roll < 0.85 && !pending) {
			log.push('save');
			startSave();
		} else if (roll < 0.95) {
			log.push('reply');
			// oxlint-disable-next-line no-await-in-loop -- each step sees the last one's outcome.
			await core.reply();
		} else {
			log.push('reset');
			draft.reset();
		}
	}
	await core.reply();
	return { log, saves, violation: violations[0] ?? null };
};

describe('consent draft interleavings', () => {
	test('a draft save never grants over a refusal made after the staging', async () => {
		let saves = 0;
		const failures: string[] = [];
		for (let seed = 1; seed <= 1500 && failures.length === 0; seed += 1) {
			// oxlint-disable-next-line no-await-in-loop -- one seed at a time keeps a failure reproducible.
			const run = await runInterleaving(seed);
			saves += run.saves;
			if (run.violation !== null) {
				failures.push(
					`seed ${String(seed)}: ${run.violation}\n${run.log.join('\n')}`
				);
			}
		}
		expect(failures).toEqual([]);
		// The property is not met by refusing everything.
		expect(saves).toBeGreaterThan(1500);
	});
});
