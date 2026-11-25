/** @vitest-environment jsdom */
/**
 * The snapshot a deferred root commits in the tap's own task must be the
 * one `planEarlyCommit` (and so `commands.save`) commits for the same tap,
 * and it must decline whatever `planEarlyCommit` declines.
 */
import type { PolicyRule } from '@inth/sdk-schema/types';
import { describe, expect, test } from 'vite-plus/test';

import {
	DAY,
	explicitChoice,
	matchedResolution,
	NOW,
	noticeRule,
	optInRule,
	optOutRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import type { ConsentSnapshot, KernelConfig } from '../../consent-kernel.model';
import { createKernel } from '../../kernel/index';
import { createMemoryOutboxStore } from '../../kernel/save-outbox/save-outbox.store';
import { planEarlyCommit } from '../early-commit';
import { planInstantCommit } from '../instant-commit';

const TAP_AT = NOW + 4000;
const CLOCK = NOW + 5000;

const snapshotFor = function snapshotFor(
	rule: PolicyRule,
	overrides: Partial<KernelConfig> = {}
): ConsentSnapshot {
	return createKernel(
		{
			consentCategories: ['necessary', 'measurement', 'marketing'],
			initialPolicyResolution: matchedResolution(rule),
			now: NOW,
			...overrides,
		},
		{ outboxStore: createMemoryOutboxStore() }
	).getSnapshot();
};

const RULES: [string, PolicyRule][] = [
	['opt-in', optInRule({ categories: ['measurement', 'marketing'] })],
	[
		'opt-in, every category',
		optInRule({
			categories: ['functionality', 'experience', 'measurement', 'marketing'],
		}),
	],
	[
		'opt-in, strict scope',
		optInRule({
			categories: ['measurement', 'marketing'],
			scopeMode: 'strict',
		}),
	],
	['opt-out', optOutRule({ categories: ['measurement', 'marketing'] })],
	[
		'opt-in, one-day choices',
		optInRule({
			categories: ['measurement', 'marketing'],
			validity: { choiceDays: 1 },
		} as Partial<PolicyRule>),
	],
];

const CHOICES: unknown[] = [
	'all',
	'none',
	{ marketing: false, measurement: true },
	{ measurement: true },
	{ marketing: false, measurement: false, necessary: true },
	{ marketing: true },
	// A refusal answers the prompt without covering the scope.
	{ marketing: false },
	// Rejected by the record helper.
	{ necessary: false },
	{ functionality: true },
	{ unknown: true },
	{},
];

const CONFIGS: [string, Partial<KernelConfig>][] = [
	['fresh visitor', {}],
	[
		'known subject',
		{ initialRecords: { subject: { subjectId: 'subject-1' } } },
	],
	['no displayed categories', { consentCategories: undefined }],
	[
		'signed-in user',
		{ initialUser: { externalId: 'user-7', identityProvider: 'clerk' } },
	],
];

describe.each(RULES)('%s', (_name, rule) => {
	describe.each(CONFIGS)('%s', (_config, overrides) => {
		test.each(CHOICES.map((choice) => [JSON.stringify(choice), choice]))(
			'save(%s) commits what planEarlyCommit commits',
			(_label, choice) => {
				for (const activeUI of ['banner', 'dialog', 'none'] as const) {
					const before = { ...snapshotFor(rule, overrides), activeUI };
					const instant = planInstantCommit({
						actionAt: TAP_AT,
						choice,
						now: CLOCK,
						snapshot: before,
					});
					const plan = planEarlyCommit({
						actionAt: TAP_AT,
						choice: choice as 'all',
						now: CLOCK,
						snapshot: before,
						subjectId: instant?.subjectId,
					});
					// Both decline, or both commit the same snapshot.
					expect(instant?.snapshot ?? null).toStrictEqual(
						plan?.snapshot ?? null
					);
					expect(instant === null || instant.previous === before).toBe(true);
					// Unchanged derived fields keep their reference, as the
					// kernel's do.
					for (const key of [
						'effectivePermissions',
						'restrictions',
						'promptRequirement',
					] as const) {
						expect(instant?.snapshot[key] === before[key]).toBe(
							plan?.snapshot[key] === before[key]
						);
					}
				}
			}
		);
	});
});

describe('planInstantCommit declines', () => {
	const rule = optInRule({ categories: ['measurement', 'marketing'] });

	test('nothing a fresh visitor accepts', () => {
		const instant = planInstantCommit({
			actionAt: TAP_AT,
			choice: 'all',
			now: CLOCK,
			snapshot: snapshotFor(rule),
		});
		expect(instant?.snapshot.effectivePermissions).toMatchObject({
			marketing: true,
			measurement: true,
		});
		expect(instant?.snapshot.activeUI).toBe('none');
	});

	test('a visitor with a stored choice', () => {
		const before = snapshotFor(rule, {
			initialRecords: {
				choice: explicitChoice(
					{ measurement: false },
					{ confirmedAt: NOW - DAY }
				),
			},
		});
		expect(
			planInstantCommit({
				actionAt: TAP_AT,
				choice: 'all',
				now: CLOCK,
				snapshot: before,
			})
		).toBeNull();
	});

	test('a notice prompt', () => {
		expect(
			planInstantCommit({
				actionAt: TAP_AT,
				choice: 'all',
				now: CLOCK,
				snapshot: snapshotFor(noticeRule()),
			})
		).toBeNull();
	});

	test('an active privacy signal', () => {
		expect(
			planInstantCommit({
				actionAt: TAP_AT,
				choice: 'all',
				now: CLOCK,
				snapshot: snapshotFor(rule, { initialOverrides: { gpc: true } }),
			})
		).toBeNull();
	});

	test('declared vendors', () => {
		const before = snapshotFor(rule);
		expect(
			planInstantCommit({
				actionAt: TAP_AT,
				choice: 'all',
				now: CLOCK,
				snapshot: {
					...before,
					vendors: { declared: [{ id: 'v' }] },
				} as unknown as ConsentSnapshot,
			})
		).toBeNull();
	});

	test('a tap after the clock', () => {
		expect(
			planInstantCommit({
				actionAt: CLOCK + 1,
				choice: 'all',
				now: CLOCK,
				snapshot: snapshotFor(rule),
			})
		).toBeNull();
	});
});
