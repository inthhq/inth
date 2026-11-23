/**
 * What a GPC signal and a durable opt-out withhold (DEF-09).
 *
 * GPC is a sale and sharing opt-out signal and says nothing about analytics,
 * so the US presets map it to `marketing` only (GPC-01). The policy's mapping
 * decides what any new opt-out withholds; a held opt-out keeps what it was
 * recorded with, so neither a policy change nor this change lifts a right a
 * visitor already holds (GPC-05).
 */
import type { OptOutRecord, PolicyRule } from '@inth/sdk-schema/types';
import { policyRulePresets } from '@inth/sdk-schema/types';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
	matchedResolution,
	NOW,
	optOutRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import type { KernelConfig } from '../../types';
import { createKernel as assembleKernel } from '../index';

const createKernel = function createKernel(
	rule: PolicyRule,
	overrides: KernelConfig = {}
) {
	return assembleKernel({
		initialLocation: { countryCode: 'US', regionCode: 'CA' },
		initialPolicyResolution: matchedResolution(rule, 'region'),
		now: NOW,
		...overrides,
	});
};

const permissions = function permissions(
	kernel: ReturnType<typeof createKernel>
) {
	const { marketing, measurement } = kernel.getSnapshot().effectivePermissions;
	return { marketing, measurement };
};

/** An opt-out stored before records carried their categories. */
const legacyRecord: OptOutRecord = {
	heldBy: 'device',
	method: 'gpc',
	recordedAt: NOW - 1000,
	rights: ['sale', 'share', 'targeted_ads'],
};

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('the US preset default', () => {
	test.each([
		['californiaOptOut', () => policyRulePresets.californiaOptOut()],
		['usPrivacyStatesOptOut', () => policyRulePresets.usPrivacyStatesOptOut()],
	] as const)(
		'[GPC-01] under %s, GPC opts out of marketing and measurement stays granted',
		async (_name, preset) => {
			const kernel = createKernel(preset(), {
				initialPrivacySignals: { gpc: true },
			});
			await kernel.commands.init();

			const snapshot = kernel.getSnapshot();
			expect(snapshot.optOut).toMatchObject({
				categories: ['marketing'],
				method: 'gpc',
			});
			expect(permissions(kernel)).toEqual({
				marketing: false,
				measurement: true,
			});
			expect(snapshot.restrictions.marketing).toEqual(['gpc', 'opt-out']);
			expect(snapshot.restrictions.measurement).toBeUndefined();
			kernel.dispose();
		}
	);

	test('[GPC-01] a visitor opt-out under the US preset withholds marketing only', async () => {
		const kernel = createKernel(policyRulePresets.californiaOptOut());
		await kernel.commands.init();
		await kernel.commands.optOut();

		expect(kernel.getSnapshot().optOut).toMatchObject({
			categories: ['marketing'],
			method: 'button',
		});
		expect(permissions(kernel)).toEqual({
			marketing: false,
			measurement: true,
		});
		kernel.dispose();
	});

	test('[GPC-05] a GPC opt-out persists after the signal goes away, still sparing measurement', async () => {
		const kernel = createKernel(policyRulePresets.californiaOptOut(), {
			initialPrivacySignals: { gpc: true },
		});
		await kernel.commands.init();
		const recorded = kernel.getSnapshot().optOut;
		expect(recorded).not.toBeNull();

		kernel.set.privacySignals({ gpc: false });

		const snapshot = kernel.getSnapshot();
		expect(snapshot.optOut).toBe(recorded);
		expect(snapshot.restrictions.marketing).toEqual(['opt-out']);
		expect(permissions(kernel)).toEqual({
			marketing: false,
			measurement: true,
		});
		kernel.dispose();
	});
});

describe('records made before the mapping was configurable', () => {
	test('[GPC-05] an old record keeps denying marketing and measurement under the narrowed preset', async () => {
		const kernel = createKernel(policyRulePresets.californiaOptOut(), {
			initialRecords: { now: NOW, optOut: legacyRecord },
		});
		await kernel.commands.init();

		const snapshot = kernel.getSnapshot();
		expect(snapshot.optOut).toEqual(legacyRecord);
		expect(permissions(kernel)).toEqual({
			marketing: false,
			measurement: false,
		});
		expect(snapshot.restrictions.measurement).toEqual(['opt-out']);
		kernel.dispose();
	});

	test('[GPC-05] an old record stays held for both while GPC is still on', async () => {
		const kernel = createKernel(policyRulePresets.californiaOptOut(), {
			initialPrivacySignals: { gpc: true },
			initialRecords: { now: NOW, optOut: legacyRecord },
		});
		await kernel.commands.init();

		const snapshot = kernel.getSnapshot();
		// GPC itself no longer reaches measurement; the held record does.
		expect(snapshot.restrictions.marketing).toEqual(['gpc', 'opt-out']);
		expect(snapshot.restrictions.measurement).toEqual(['opt-out']);
		expect(snapshot.optOut).toEqual(legacyRecord);
		kernel.dispose();
	});
});

describe('a policy that narrows its mapping', () => {
	test('[GPC-05] never lifts a category a held record was made with', async () => {
		const broad = optOutRule({
			privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
			prompt: 'none',
		});
		const first = createKernel(broad, {
			initialPrivacySignals: { gpc: true },
		});
		await first.commands.init();
		const held = first.getSnapshot().optOut;
		expect(held).toMatchObject({
			categories: ['measurement', 'marketing'],
		});
		first.dispose();
		expect.assert(held);

		// The next visit runs under a narrowed rule, with the signal gone.
		const narrowed = optOutRule({
			privacySignals: { gpc: { denyCategories: ['marketing'] } },
			prompt: 'none',
		});
		const second = createKernel(narrowed, {
			initialRecords: { now: NOW, optOut: held },
		});
		await second.commands.init();
		expect(permissions(second)).toEqual({
			marketing: false,
			measurement: false,
		});
		second.dispose();
	});

	test('a policy that widens its mapping applies to a record already held', async () => {
		const kernel = createKernel(
			optOutRule({
				privacySignals: {
					gpc: { denyCategories: ['experience', 'marketing'] },
				},
				prompt: 'none',
			}),
			{
				initialRecords: {
					now: NOW,
					optOut: { ...legacyRecord, categories: ['marketing'] },
				},
			}
		);
		await kernel.commands.init();
		expect(kernel.getSnapshot().effectivePermissions).toMatchObject({
			experience: false,
			marketing: false,
			measurement: true,
		});
		kernel.dispose();
	});
});

describe('a custom mapping', () => {
	test('[GPC-01] a rule that still maps measurement is honored for GPC and the record', async () => {
		const kernel = createKernel(
			optOutRule({
				privacySignals: {
					gpc: { denyCategories: ['marketing', 'measurement'] },
				},
				prompt: 'none',
			}),
			{ initialPrivacySignals: { gpc: true } }
		);
		await kernel.commands.init();

		const snapshot = kernel.getSnapshot();
		expect(snapshot.optOut?.categories).toEqual(['measurement', 'marketing']);
		expect(snapshot.restrictions.measurement).toEqual(['gpc', 'opt-out']);
		expect(permissions(kernel)).toEqual({
			marketing: false,
			measurement: false,
		});
		kernel.dispose();
	});

	test('a measurement-only mapping makes measurement the deciding category', async () => {
		const kernel = createKernel(
			optOutRule({
				privacySignals: { gpc: { denyCategories: ['measurement'] } },
			})
		);
		await kernel.commands.init();
		// Refusing marketing records nothing: it is not what an opt-out covers.
		await kernel.commands.save({ marketing: false });
		expect(kernel.getSnapshot().optOut).toBeNull();

		await kernel.commands.save({ measurement: false });
		expect(kernel.getSnapshot().optOut).toMatchObject({
			categories: ['measurement'],
			method: 'button',
		});
		expect(kernel.getSnapshot().effectivePermissions.measurement).toBe(false);

		// Granting the deciding category lifts the opt-out.
		await kernel.commands.save({ measurement: true });
		expect(kernel.getSnapshot().optOut).toBeNull();
		kernel.dispose();
	});

	test('a rule that maps no GPC categories still withholds marketing and measurement on opt-out', async () => {
		const kernel = createKernel(optOutRule({ prompt: 'none' }));
		await kernel.commands.init();
		await kernel.commands.optOut();
		expect(kernel.getSnapshot().optOut?.categories).toEqual([
			'measurement',
			'marketing',
		]);
		expect(permissions(kernel)).toEqual({
			marketing: false,
			measurement: false,
		});
		kernel.dispose();
	});
});

describe('backend copies of a held opt-out', () => {
	const narrow = () =>
		optOutRule({
			privacySignals: { gpc: { denyCategories: ['marketing'] } },
			prompt: 'none',
		});
	const local: OptOutRecord = {
		categories: ['experience', 'marketing'],
		heldBy: 'device',
		method: 'button',
		recordedAt: NOW - 1000,
		rights: ['sale'],
	};
	/** A kernel holding `held` locally whose init answer carries `server`. */
	const withServerRecord = (held: OptOutRecord, server: OptOutRecord) =>
		createKernel(narrow(), {
			initialRecords: { now: NOW, optOut: held },
			transport: {
				init: () =>
					Promise.resolve({
						policyResolution: {
							...matchedResolution(narrow(), 'region'),
							version: 1,
						},
						records: { optOut: server },
					}),
			},
		});
	const permissionsWithExperience = (
		kernel: ReturnType<typeof createKernel>
	) => {
		const { experience, marketing, measurement } =
			kernel.getSnapshot().effectivePermissions;
		return { experience, marketing, measurement };
	};

	test('[GPC-05] a newer server record of another act never lifts a category the local opt-out held', async () => {
		const kernel = withServerRecord(local, {
			heldBy: 'person',
			method: 'api',
			recordedAt: NOW - 10,
			rights: ['sale', 'share'],
		});
		await kernel.commands.init();
		// The account's record is legacy, so it adds measurement; nothing
		// the browser held is lost.
		expect(kernel.getSnapshot().optOut).toMatchObject({
			categories: ['experience', 'measurement', 'marketing'],
			heldBy: 'person',
			recordedAt: NOW - 10,
		});
		expect(permissionsWithExperience(kernel)).toEqual({
			experience: false,
			marketing: false,
			measurement: false,
		});
		kernel.dispose();
	});

	test('[GPC-05] the server copy of the same act keeps the local categories as they are', async () => {
		const { categories: _categories, ...answer } = local;
		const kernel = withServerRecord(local, { ...answer, heldBy: 'both' });
		await kernel.commands.init();
		expect(kernel.getSnapshot().optOut?.categories).toEqual([
			'experience',
			'marketing',
		]);
		expect(permissionsWithExperience(kernel)).toEqual({
			experience: false,
			marketing: false,
			measurement: true,
		});
		kernel.dispose();
	});

	test('[GPC-05] an older server record joins the categories of the newer local opt-out it loses to', async () => {
		const kernel = withServerRecord(
			{ ...local, categories: ['marketing'] },
			{
				heldBy: 'person',
				method: 'api',
				recordedAt: NOW - 5000,
				rights: ['sale'],
			}
		);
		await kernel.commands.init();
		const held = kernel.getSnapshot().optOut;
		expect(held).toMatchObject({ method: 'button', recordedAt: NOW - 1000 });
		// Joined with a legacy record, which withholds measurement too.
		expect(held).not.toHaveProperty('categories');
		expect(permissionsWithExperience(kernel).measurement).toBe(false);
		kernel.dispose();
	});

	test.each([
		[
			'an account-held record does not take the local list',
			{ heldBy: 'person', method: 'api' } as const,
			{ categories: undefined, measurement: false },
		],
		[
			'a record this device alone holds takes the local list',
			{ heldBy: 'device', method: 'api' } as const,
			{ categories: ['marketing'], measurement: true },
		],
	])('[GPC-05] identify(): %s', async (_label, answer, expected) => {
		const kernel = createKernel(narrow(), {
			initialRecords: {
				now: NOW,
				optOut: { ...local, categories: ['marketing'] },
				subject: { subjectId: 'sub_gpc_scope' },
			},
			transport: {
				identify: () =>
					Promise.resolve({
						optOut: {
							...answer,
							recordedAt: NOW - 10,
							rights: ['sale', 'share'],
						},
						subjectId: 'sub_gpc_scope',
					}),
			},
		});
		await kernel.commands.init();
		await kernel.commands.identify({
			externalId: 'user_1',
			identityToken: 'tok_1',
		});
		const held = kernel.getSnapshot().optOut;
		expect(held).toMatchObject({ recordedAt: NOW - 10 });
		expect(held?.categories).toEqual(expected.categories);
		expect(permissions(kernel).measurement).toBe(expected.measurement);
		kernel.dispose();
	});
});

describe('adopting a server copy of a held opt-out', () => {
	const narrow = () =>
		optOutRule({
			privacySignals: { gpc: { denyCategories: ['marketing'] } },
			prompt: 'none',
		});
	const local: OptOutRecord = {
		categories: ['experience', 'marketing'],
		heldBy: 'device',
		method: 'button',
		recordedAt: NOW - 1000,
		rights: ['sale'],
	};
	/** A kernel holding `local` with this browser's receipt for it. */
	const withServerRecord = (server: OptOutRecord) =>
		createKernel(narrow(), {
			initialRecords: {
				now: NOW,
				optOut: local,
				optOutLocalAct: 'button',
				optOutReference: 'ref_local_act',
				optOutRightsConfirmed: false,
			},
			transport: {
				init: () =>
					Promise.resolve({
						policyResolution: {
							...matchedResolution(narrow(), 'region'),
							version: 1,
						},
						records: { optOut: server },
					}),
			},
		});

	test('[GPC-05] the server confirming this browser’s act confirms its rights, though it sends no categories', async () => {
		const { categories: _categories, ...answer } = local;
		const kernel = withServerRecord(answer);
		await kernel.commands.init();
		expect(kernel.getSnapshot().optOut?.categories).toEqual([
			'experience',
			'marketing',
		]);
		expect(kernel.getOptOutReceiptData()).toEqual({
			localAct: 'button',
			reference: 'ref_local_act',
			rightsConfirmed: true,
		});
		kernel.dispose();
	});

	test('[GPC-05] a newer account record adopted with the held categories does not inherit this browser’s receipt', async () => {
		const kernel = withServerRecord({
			heldBy: 'person',
			method: 'api',
			recordedAt: NOW - 10,
			rights: ['sale', 'share'],
		});
		await kernel.commands.init();
		// The fold copies the record to carry the held categories.
		expect(kernel.getSnapshot().optOut).toMatchObject({
			categories: ['experience', 'measurement', 'marketing'],
			heldBy: 'person',
		});
		expect(kernel.getOptOutReceiptData()).toEqual({
			localAct: null,
			reference: null,
			rightsConfirmed: true,
		});
		kernel.dispose();
	});

	test('[GPC-05] a stored record this device holds is another act unless it has the same time and method', async () => {
		const kernel = withServerRecord({
			heldBy: 'device',
			method: 'gpc',
			recordedAt: NOW - 10,
			rights: ['sale', 'share'],
		});
		await kernel.commands.init();
		// A legacy record of another act: the lists join, so measurement
		// is withheld too and experience stays withheld.
		expect(kernel.getSnapshot().optOut).toMatchObject({
			categories: ['experience', 'measurement', 'marketing'],
			method: 'gpc',
			recordedAt: NOW - 10,
		});
		kernel.dispose();
	});
});

describe('an account opt-out returned by identify()', () => {
	const narrow = () =>
		optOutRule({
			privacySignals: { gpc: { denyCategories: ['marketing'] } },
			prompt: 'none',
		});
	const local: OptOutRecord = {
		categories: ['marketing'],
		heldBy: 'device',
		method: 'button',
		recordedAt: NOW - 1000,
		rights: ['sale'],
	};
	/** A kernel holding `local` with this browser's receipt for it. */
	const identifiedWith = async (answer: OptOutRecord) => {
		const kernel = createKernel(narrow(), {
			initialRecords: {
				now: NOW,
				optOut: local,
				optOutLocalAct: 'button',
				optOutReference: 'ref_local_act',
				optOutRightsConfirmed: false,
				subject: { subjectId: 'sub_gpc_scope' },
			},
			transport: {
				identify: () =>
					Promise.resolve({ optOut: answer, subjectId: 'sub_gpc_scope' }),
			},
		});
		await kernel.commands.init();
		await kernel.commands.identify({
			externalId: 'user_1',
			identityToken: 'tok_1',
		});
		return kernel;
	};

	test('[GPC-05] a newer account act does not inherit this browser’s act or reference', async () => {
		const kernel = await identifiedWith({
			heldBy: 'person',
			method: 'api',
			recordedAt: NOW - 10,
			rights: ['sale', 'share'],
		});
		expect(kernel.getSnapshot().optOut).toMatchObject({
			heldBy: 'person',
			recordedAt: NOW - 10,
		});
		expect(kernel.getOptOutReceiptData()).toEqual({
			localAct: null,
			reference: null,
			rightsConfirmed: true,
		});
		kernel.dispose();
	});

	test('[GPC-05] an account act with the same method but another time is still another act', async () => {
		const kernel = await identifiedWith({
			heldBy: 'person',
			method: 'button',
			recordedAt: NOW - 10,
			rights: ['sale', 'share'],
		});
		expect(kernel.getOptOutReceiptData()).toMatchObject({
			localAct: null,
			reference: null,
		});
		kernel.dispose();
	});

	test('[GPC-05] the account’s copy of this browser’s act keeps its act and reference', async () => {
		const kernel = await identifiedWith({
			heldBy: 'person',
			method: 'button',
			recordedAt: NOW - 1000,
			rights: ['sale', 'share'],
		});
		expect(kernel.getSnapshot().optOut).toMatchObject({
			heldBy: 'person',
			rights: ['sale', 'share'],
		});
		expect(kernel.getOptOutReceiptData()).toEqual({
			localAct: 'button',
			reference: 'ref_local_act',
			rightsConfirmed: true,
		});
		kernel.dispose();
	});
});
