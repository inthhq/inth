/**
 * Random interleavings of staging, decisions made on other surfaces and draft
 * saves, run through the real `ConsentClient` against a fake native core that
 * behaves like the real ones: it applies a commit the moment the bridge hands
 * it over, honours a commit's `revision`, and replies and announces changes
 * only when the test lets it. The client serves reads from its cache in
 * between, exactly as it does on a device.
 *
 * The property: a draft save never grants a category whose latest explicit
 * decision, made anywhere, is a refusal the subject had not seen when they
 * staged the grant.
 */

import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import {
	buildSnapshot,
	createFakeNativeModule,
	FAKE_BOOTSTRAP,
} from '../../__tests__/helpers/fake-native';
import {
	emitNativeEvent,
	resetNativeStub,
} from '../../__tests__/helpers/react-native-stub';
import { createConsentClient } from '../../native/create-consent-client';
import type { ConsentClient } from '../../native/create-consent-client';
import { getNativeInthEvents } from '../../native/get-native-inth';
import type { CommitResult, ConsentSnapshot } from '../../protocol';
import type { OptionalConsentCategory } from '../../protocol/consent-vocabulary.model';
import { createConsentDraft } from '../create-consent-draft';

const CATEGORIES = ['measurement', 'marketing'] as const;
type Category = (typeof CATEGORIES)[number];
type Consents = Partial<Record<OptionalConsentCategory, boolean>>;

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

/** Who handed the core a commit: the draft, or another JavaScript surface. */
type Source = 'draft' | 'elsewhere';

/**
 * A native core behind a fake TurboModule. A commit is applied when `commit`
 * is called and refused if it names a revision that is not current; its reply
 * and the change event wait for the test.
 */
const createCore = function createCore(bootstrap: Record<string, unknown>) {
	let clock = 0;
	let snapshot: ConsentSnapshot = buildSnapshot({
		consentCategories: ['necessary', ...CATEGORIES],
		resolution: { fingerprint: 'fp-1', policyId: 'eu', status: 'match' },
	});
	/** Every explicit decision per category, from any surface, in order. */
	const history = new Map<Category, Decision[]>();
	const replies: (() => void)[] = [];
	/** Every intent the bridge handed over, in order. */
	const intents: string[] = [];
	let announced = snapshot.revision;
	let source: Source = 'draft';
	let onDraftCommit: (consents: Consents) => void = () => undefined;

	const tick = (): number => {
		clock += 1;
		return clock;
	};

	/** Apply an explicit decision, as any surface's save does. */
	const record = function record(consents: Consents): number {
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
		return snapshot.revision;
	};

	const fake = createFakeNativeModule({ bootstrap, snapshot });
	const module = fake as unknown as {
		commit: (raw: string) => Promise<string>;
		getSnapshot: () => string;
	};
	module.getSnapshot = () => JSON.stringify(snapshot);
	module.commit = (raw: string) => {
		intents.push(raw);
		const intent = JSON.parse(raw) as {
			action: string;
			consents?: Consents;
			revision?: number;
		};
		let result: CommitResult;
		if (
			intent.revision !== undefined &&
			intent.revision !== snapshot.revision
		) {
			result = {
				confirmed: [],
				ok: false,
				queued: false,
				reason: 'concurrent-change',
				revision: null,
				subjectId: 'sub-1',
			};
		} else {
			const consents = intent.consents ?? {};
			if (source === 'draft') {
				onDraftCommit(consents);
			}
			result = {
				confirmed: [],
				ok: true,
				queued: true,
				revision: record(consents),
				subjectId: 'sub-1',
			};
		}
		return new Promise((resolve) => {
			replies.push(() => resolve(JSON.stringify(result)));
		});
	};

	const client = createConsentClient(fake, getNativeInthEvents());

	return {
		/** Emit the change event for the latest revision, if one is owed. */
		announce: () => {
			if (announced !== snapshot.revision) {
				announced = snapshot.revision;
				emitNativeEvent(
					'snapshot',
					JSON.stringify({ revision: snapshot.revision })
				);
			}
		},
		client,
		/** Another JavaScript surface commits through the same client. */
		commitElsewhere: (consents: Consents): void => {
			source = 'elsewhere';
			void client.commit({ action: 'explicit', consents });
			source = 'draft';
		},
		history,
		intents,
		onDraftCommit: (check: (consents: Consents) => void) => {
			onDraftCommit = check;
		},
		pendingReplies: () => replies.length,
		record,
		/** Deliver the oldest reply, then let its continuations run. */
		reply: async () => {
			replies.shift()?.();
			for (let turn = 0; turn < 8; turn += 1) {
				// oxlint-disable-next-line no-await-in-loop -- each turn drains one microtask hop.
				await Promise.resolve();
			}
		},
		tick,
	};
};

const runInterleaving = async function runInterleaving(
	seed: number,
	bootstrap: Record<string, unknown>
): Promise<{ log: string[]; violation: string | null; saves: number }> {
	const random = seeded(seed);
	const pick = <ItemType>(items: readonly ItemType[]): ItemType =>
		items[Math.floor(random() * items.length)] as ItemType;
	const randomConsents = (): Consents =>
		Object.fromEntries(
			CATEGORIES.filter(() => random() < 0.7).map((category) => [
				category,
				random() < 0.5,
			])
		);
	const core = createCore(bootstrap);
	const draft = createConsentDraft(core.client as ConsentClient);
	const unsubscribe = draft.subscribe(() => undefined);
	/** When the subject last staged a grant of each category. */
	const stagedGrantAt = new Map<Category, number>();
	const log: string[] = [];
	const violations: string[] = [];
	let saves = 0;
	let saving = false;

	core.onDraftCommit((consents) => {
		for (const category of CATEGORIES) {
			const latest = core.history.get(category)?.at(-1);
			if (
				consents[category] === true &&
				latest !== undefined &&
				!latest.value &&
				(stagedGrantAt.get(category) ?? 0) < latest.at
			) {
				violations.push(
					`${category} granted over the refusal at ${String(latest.at)}`
				);
			}
		}
	});

	const startSave = function startSave(): void {
		saving = true;
		void draft.save().then((result) => {
			saves += result.ok ? 1 : 0;
			saving = false;
		});
	};

	for (let step = 0; step < 40; step += 1) {
		if (violations.length > 0) {
			break;
		}
		const roll = random();
		if (roll < 0.3) {
			const category = pick(CATEGORIES);
			const value = random() < 0.6;
			log.push(`set ${category} ${String(value)}`);
			if (value) {
				stagedGrantAt.set(category, core.tick());
			}
			draft.set(category, value);
		} else if (roll < 0.36) {
			log.push('acceptAll');
			for (const category of CATEGORIES) {
				stagedGrantAt.set(category, core.tick());
			}
			draft.acceptAll();
		} else if (roll < 0.48) {
			const consents = randomConsents();
			log.push(`js elsewhere ${JSON.stringify(consents)}`);
			core.commitElsewhere(consents);
		} else if (roll < 0.6) {
			const consents = randomConsents();
			log.push(`native elsewhere ${JSON.stringify(consents)}`);
			core.record(consents);
		} else if (roll < 0.68) {
			log.push('announce');
			core.announce();
		} else if (roll < 0.8 && !saving) {
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
	while (core.pendingReplies() > 0) {
		// oxlint-disable-next-line no-await-in-loop -- a retry can queue another reply.
		await core.reply();
	}
	unsubscribe();
	core.client.dispose();
	resetNativeStub();
	return { log, saves, violation: violations[0] ?? null };
};

const property = async function property(
	bootstrap: Record<string, unknown>
): Promise<{ failures: string[]; saves: number }> {
	let saves = 0;
	const failures: string[] = [];
	for (let seed = 1; seed <= 1500 && failures.length === 0; seed += 1) {
		// oxlint-disable-next-line no-await-in-loop -- one seed at a time keeps a failure reproducible.
		const run = await runInterleaving(seed, bootstrap);
		saves += run.saves;
		if (run.violation !== null) {
			failures.push(
				`seed ${String(seed)}: ${run.violation}\n${run.log.join('\n')}`
			);
		}
	}
	return { failures, saves };
};

afterEach(() => {
	resetNativeStub();
});

describe('consent draft interleavings', () => {
	test('a refusal already in native is not overwritten by a save from the cached record', async () => {
		const core = createCore({ ...FAKE_BOOTSTRAP, commitRevision: true });
		const draft = createConsentDraft(core.client);
		draft.subscribe(() => undefined);

		draft.set('marketing', true);
		// Another screen refuses marketing; native has applied it, the reply is pending.
		core.commitElsewhere({ marketing: false });
		const saving = draft.save();
		while (core.pendingReplies() > 0) {
			// oxlint-disable-next-line no-await-in-loop -- replies arrive one at a time.
			await core.reply();
		}

		expect(await saving).toMatchObject({
			ok: false,
			reason: 'concurrent-change',
		});
		expect(JSON.parse(core.intents[1] ?? '{}')).toMatchObject({
			action: 'explicit',
			revision: 0,
		});
		expect(core.history.get('marketing')?.at(-1)?.value).toBe(false);
		expect(draft.getState().staleCategories).toEqual(['marketing']);
		core.client.dispose();
	});

	test('an edit made while a save is pending survives the save landing', async () => {
		const core = createCore({ ...FAKE_BOOTSTRAP, commitRevision: true });
		const draft = createConsentDraft(core.client);
		draft.subscribe(() => undefined);

		draft.set('marketing', true);
		const saving = draft.save();
		draft.set('measurement', true);
		await core.reply();
		await saving;

		// The save's own write is not a decision made elsewhere.
		expect(draft.getState()).toMatchObject({
			isDirty: true,
			isStale: false,
			values: { marketing: true, measurement: true },
		});
		core.client.dispose();
	});

	test('an edit made while a save is pending turns stale when another decision lands after it', async () => {
		const core = createCore({ ...FAKE_BOOTSTRAP, commitRevision: true });
		const draft = createConsentDraft(core.client);
		draft.subscribe(() => undefined);

		const saving = draft.save();
		draft.set('measurement', true);
		core.record({ measurement: false });
		await core.reply();
		await saving;

		expect(draft.getState().staleCategories).toEqual(['measurement']);
		core.client.dispose();
	});

	test('new defaults do not clear a category another surface overtook', () => {
		const core = createCore({ ...FAKE_BOOTSTRAP, commitRevision: true });
		const draft = createConsentDraft(core.client);
		draft.subscribe(() => undefined);

		draft.set('marketing', true);
		core.record({ marketing: false });
		core.announce();
		expect(draft.getState().staleCategories).toEqual(['marketing']);
		// A provider rerenders with a fresh `initial` object.
		draft.setDefaults({ experience: true });

		expect(draft.getState()).toMatchObject({
			isStale: true,
			staleCategories: ['marketing'],
		});
		core.client.dispose();
	});

	test('an older binary saves unpinned and says so once in development', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const core = createCore({ ...FAKE_BOOTSTRAP, commitRevision: false });
		const draft = createConsentDraft(core.client);
		draft.subscribe(() => undefined);

		draft.set('marketing', true);
		const first = draft.save();
		await core.reply();
		await first;
		draft.set('measurement', true);
		const second = draft.save();
		await core.reply();
		await second;

		expect(core.intents.map((raw) => 'revision' in JSON.parse(raw))).toEqual([
			false,
			false,
		]);
		expect(
			warn.mock.calls.filter((call) =>
				String(call[0]).includes('commitRevision is false')
			)
		).toHaveLength(1);
		core.client.dispose();
		warn.mockRestore();
	});

	test('a draft save never grants over a refusal made after the staging', async () => {
		const { failures, saves } = await property({
			...FAKE_BOOTSTRAP,
			commitRevision: true,
		});
		expect(failures).toEqual([]);
		// The property is not met by refusing everything.
		expect(saves).toBeGreaterThan(1500);
	});
});
