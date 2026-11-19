/** @vitest-environment jsdom */
/**
 * A banner accept or reject recorded before the kernel loaded: it must
 * commit, store and send what the kernel's own save does for the same tap,
 * so the kernel that loads afterwards takes it over without saving again.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
	matchedResolution,
	NOW,
	noticeRule,
	optInRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import { displayedCategories } from '../../consent/consent-types';
import { createKernel } from '../../kernel/index';
import { createMemoryOutboxStore } from '../../kernel/save-outbox/store';
import { EARLY_TAPS_WINDOW_KEY } from '../../libs/page-globals';
import type { EarlyConsentTapQueue } from '../../libs/page-globals';
import { clearStoredConsentRecords } from '../../modules/persistence/__tests__/record-writes';
import { readStoredRecords } from '../../modules/persistence/hydrate';
import { createStandInKernel } from '../../runtime/stand-in-kernel';
import type { KernelConfig, KernelEvent, SavePayload } from '../../types';
import {
	completeCommit,
	hasStoredClearEpoch,
	planEarlyCommit,
	storeEarlyCommit,
} from '../early-commit';
import { EARLY_CONSENT_TAP_SCRIPT } from '../early-tap-script';

const TAP_AT = NOW + 4000;
const CLOCK = NOW + 5000;

const config = function config(
	overrides: Partial<KernelConfig> = {}
): KernelConfig {
	return {
		consentCategories: ['necessary', 'measurement', 'marketing'],
		initialPolicyResolution: matchedResolution(
			optInRule({ categories: ['measurement', 'marketing'] })
		),
		initialRecords: { subject: { subjectId: 'subject-1' } },
		now: NOW,
		...overrides,
	};
};

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(CLOCK);
	localStorage.clear();
	clearStoredConsentRecords();
});

afterEach(() => {
	vi.useRealTimers();
	localStorage.clear();
	clearStoredConsentRecords();
	Reflect.deleteProperty(window, EARLY_TAPS_WINDOW_KEY);
	document.body.innerHTML = '';
});

describe.each([
	'all',
	'none',
	{ marketing: false, measurement: true },
] as const)('planEarlyCommit(%j)', (choice) => {
	test('commits, announces and sends what commands.save does', async () => {
		const sent: SavePayload[] = [];
		const kernel = createKernel(
			{
				...config(),
				transport: {
					save: (payload) => {
						sent.push(payload);
						return Promise.resolve({ ok: true });
					},
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		const before = kernel.getSnapshot();
		const plan = planEarlyCommit({
			actionAt: TAP_AT,
			choice,
			snapshot: before,
		});
		expect(plan).not.toBeNull();

		const events: KernelEvent[] = [];
		kernel.events.on('permissions:changed', (event) => events.push(event));
		kernel.events.on('choice:recorded', (event) => events.push(event));
		const scope =
			before.evaluationPolicy.choiceScope ?? before.policyRule.scope;
		await kernel.commands.save(choice, {
			actionAt: TAP_AT,
			// What the stock banner's replay passes.
			categories: displayedCategories(scope),
			uiSource: 'banner',
		});
		const after = kernel.getSnapshot();

		const committed = plan?.snapshot;
		expect(committed?.explicitChoice).toEqual(after.explicitChoice);
		expect(committed?.effectivePermissions).toEqual(after.effectivePermissions);
		expect(committed?.promptRequirement).toEqual(after.promptRequirement);
		expect(committed?.activeUI).toBe(after.activeUI);
		expect(committed?.subject).toEqual(after.subject);
		expect(plan?.records).toEqual({
			choice: after.explicitChoice,
			subject: after.subject,
		});
		expect(sent).toHaveLength(1);
		// Each build of an action makes its own idempotency key, and dates
		// the save after the one built before it.
		expect(plan?.payload).toEqual({
			...sent[0],
			givenAt: expect.any(Number),
			idempotencyKey: expect.any(String),
		});
		expect(plan?.events.map((event) => event.type)).toEqual(
			events.map((event) => event.type)
		);
		const recorded = plan?.events.find(
			(event) => event.type === 'choice:recorded'
		);
		const kernelRecorded = events.find(
			(event) => event.type === 'choice:recorded'
		);
		expect(recorded && { ...recorded, snapshot: undefined }).toEqual(
			kernelRecorded && { ...kernelRecorded, snapshot: undefined }
		);
	});
});

describe('planEarlyCommit declines what only the kernel records', () => {
	const kernelSnapshot = (overrides: Partial<KernelConfig>) =>
		createKernel(config(overrides), {
			outboxStore: createMemoryOutboxStore(),
		}).getSnapshot();

	test('a notice prompt', () => {
		const snapshot = kernelSnapshot({
			initialPolicyResolution: matchedResolution(noticeRule()),
		});
		expect(
			planEarlyCommit({ actionAt: TAP_AT, choice: 'all', snapshot })
		).toBeNull();
	});

	test('declared vendors', () => {
		const snapshot = kernelSnapshot({
			initialVendors: {
				declared: [
					{
						category: 'marketing',
						id: 'vendor-a',
						presentable: false,
						source: 'config',
					},
				],
				listVersion: null,
			},
		});
		expect(snapshot.vendors?.declared.length).toBe(1);
		expect(
			planEarlyCommit({ actionAt: TAP_AT, choice: 'all', snapshot })
		).toBeNull();
	});

	test('a pending policy', () => {
		const snapshot = kernelSnapshot({
			initialPolicyPending: true,
			initialPolicyResolution: undefined,
		});
		expect(
			planEarlyCommit({ actionAt: TAP_AT, choice: 'all', snapshot })
		).toBeNull();
	});

	test('a tap time in the future', () => {
		const snapshot = kernelSnapshot({});
		expect(
			planEarlyCommit({ actionAt: CLOCK + 1, choice: 'all', snapshot })
		).toBeNull();
	});
});

describe('storeEarlyCommit', () => {
	test('stores a record persistence reads back, and a save the next kernel sends once', async () => {
		const outbox = createMemoryOutboxStore();
		const plan = planEarlyCommit({
			actionAt: TAP_AT,
			choice: 'all',
			snapshot: createKernel(config(), { outboxStore: outbox }).getSnapshot(),
		});
		if (!plan) {
			throw new Error('expected a commit');
		}
		await expect(storeEarlyCommit(plan, { outbox })).resolves.toBe(true);

		const stored = readStoredRecords(undefined, CLOCK);
		expect(stored.records.choice).toEqual(plan.records.choice);
		expect(stored.records.subject?.subjectId).toBe('subject-1');

		// The kernel that loads next starts from the records and sends the
		// queued save once, without recording anything again.
		const save = vi.fn(() => Promise.resolve({ ok: true as const }));
		const events: KernelEvent[] = [];
		const next = createKernel(
			{
				...config({ initialRecords: plan.records, now: CLOCK }),
				transport: { save },
			},
			{ outboxStore: outbox }
		);
		next.events.on('choice:recorded', (event) => events.push(event));
		next.events.on('permissions:changed', (event) => events.push(event));
		expect(next.getSnapshot().explicitChoice).toEqual(plan.records.choice);
		expect(next.getSnapshot().activeUI).toBe('none');
		next.replaySaves();
		await vi.waitFor(() => {
			expect(save).toHaveBeenCalledTimes(1);
		});
		expect(save).toHaveBeenCalledWith(plan.payload, { replay: true });
		expect(events).toEqual([]);
		next.replaySaves();
		await Promise.resolve();
		expect(save).toHaveBeenCalledTimes(1);
	});

	test('a kernel save after the clock moved back is dated after the queued commit', async () => {
		const plan = planEarlyCommit({
			actionAt: TAP_AT,
			choice: 'all',
			snapshot: createKernel(config()).getSnapshot(),
		});
		if (!plan) {
			throw new Error('expected a commit');
		}
		await storeEarlyCommit(plan);
		vi.setSystemTime(TAP_AT - 3_600_000);

		const sent: SavePayload[] = [];
		const next = createKernel({
			...config({ initialRecords: plan.records, now: CLOCK }),
			transport: {
				save: (payload) => {
					sent.push(payload);
					return Promise.resolve({ ok: true });
				},
			},
		});
		await next.commands.save({ marketing: false });

		const withdrawal = sent.find(
			(payload) => payload.confirmed.categories.marketing === false
		);
		expect(withdrawal?.givenAt).toBe(TAP_AT + 1);
		next.dispose();
	});

	test('a stored clear epoch is reported, so the kernel records the choice', () => {
		expect(hasStoredClearEpoch()).toBe(false);
		localStorage.setItem('inth-epoch', String(NOW));
		expect(hasStoredClearEpoch()).toBe(true);
	});
});

test('the early-tap script tells a deferred root about each tap', () => {
	document.body.innerHTML =
		'<div data-testid="consent-banner-root" data-model="opt-in" data-prompt="choice"><button data-action="accept">Accept</button><button data-action="customize">Customize</button></div>';
	// oxlint-disable-next-line no-new-func -- The script is shipped as text.
	new Function(EARLY_CONSENT_TAP_SCRIPT)();
	const queue = (window as unknown as Record<string, EarlyConsentTapQueue>)[
		EARLY_TAPS_WINDOW_KEY
	];
	const notify = vi.fn(() => {
		// Called after the tap is queued.
		expect(queue?.taps?.length).toBeGreaterThan(0);
	});
	if (queue) {
		queue.n = notify;
	}
	for (const action of ['accept', 'customize']) {
		document
			.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)
			?.click();
	}
	expect(notify).toHaveBeenCalledTimes(2);
	expect(queue?.taps?.map((tap) => tap.action)).toEqual([
		'accept',
		'customize',
	]);
	queue?.stop?.();
});

describe('completeCommit', () => {
	test('stores the record where persistence keeps it, as the engine reads it', async () => {
		const handle = createStandInKernel({
			requestEngine: () => undefined,
			snapshot: createKernel(config(), {
				outboxStore: createMemoryOutboxStore(),
			}).getSnapshot(),
		});
		const storageConfig = { storageKey: 'site-consent' };
		const done = await completeCommit({
			actionAt: TAP_AT,
			choice: 'all',
			config: {
				// The raw option the engine ignores when persistence names one.
				persistence: { storageConfig },
				storageConfig: { storageKey: 'ignored' },
			},
			handle,
			instant: null,
		});
		expect(done?.result.ok).toBe(true);
		expect(readStoredRecords(storageConfig, CLOCK).records.choice).toEqual(
			done?.committed.records.choice
		);
		expect(localStorage.getItem('ignored')).toBeNull();
		expect(handle.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			true
		);
	});
});
