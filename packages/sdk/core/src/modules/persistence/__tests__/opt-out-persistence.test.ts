/**
 * @vitest-environment jsdom
 */
/**
 * Durable opt-out persistence: codec round trips (JSON and compact),
 * rejection of malformed values, storage hydration from cookie and
 * localStorage, writes on record, removal on lift and clear, clear-epoch
 * voiding, subject identity preservation, and reload durability.
 */
import { policyRulePresets } from '@inth/sdk-schema/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	DAY,
	explicitChoice,
	matchedResolution,
	noticeRule,
	NOW,
	optOutRule,
} from '../../../__tests__/fixtures/kernel-fixtures';
import { createConsentKernel } from '../../../index';
import {
	PENDING_OPT_OUTS_STORAGE_KEY,
	STORAGE_KEY_V2,
	resolveStorageKeys,
} from '../../../libs/storage-keys';
import { readRequestConsent } from '../../../server/request-consent';
import {
	readStoredRecords,
	readStoredRecordsFromCookieHeader,
} from '../hydrate';
import { createPersistence } from '../index';
import {
	decodeOptOutCategoriesCompact,
	decodeOptOutRecord,
	decodeOptOutRecordCompact,
	validateStoredConsentEnvelope,
} from '../record-codec';
import type { StoredOptOutRecord } from '../record-codec';
import { readStoredOptOutRecord } from '../record-storage';
import {
	encodeOptOutRecord,
	encodeOptOutRecordCompact,
	encodeStoredConsentEnvelopeCompact,
} from '../writer/encode';
import {
	legacyDecodeOptOutRecord,
	legacyDecodeOptOutRecordCompact,
} from './legacy-opt-out-codec';
import {
	clearStoredConsentRecords,
	writeStoredClearEpoch,
	writeStoredOptOutRecord,
} from './record-writes';

const clearAll = () => {
	window.localStorage.clear();
	for (const cookie of document.cookie.split(';')) {
		const name = cookie.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	}
};

beforeEach(() => {
	clearAll();
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
	clearAll();
});

const usOptOutResolution = () =>
	matchedResolution(
		optOutRule({
			privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
			prompt: 'none',
		})
	);

const flushWrites = async () => {
	await vi.advanceTimersByTimeAsync(10);
};

describe('opt-out codec', () => {
	it('round-trips JSON and compact forms across all methods and holders', () => {
		for (const method of ['button', 'gpc', 'api', 'propagated'] as const) {
			for (const heldBy of ['device', 'person', 'both'] as const) {
				const record: StoredOptOutRecord = {
					heldBy,
					method,
					recordedAt: NOW - 1,
					rights: ['sale', 'share'],
					subject: { externalId: 'u/1', subjectId: 'sub_1' },
					version: 1,
				};
				const compact = encodeOptOutRecordCompact(record);
				expect(decodeOptOutRecordCompact(compact, NOW)).toEqual({
					ok: true,
					record,
				});
				const json = encodeOptOutRecord(record);
				expect(decodeOptOutRecord(JSON.parse(json), NOW)).toEqual({
					ok: true,
					record,
				});
			}
		}
	});

	it('produces compact cookie text and canonicalizes right order', () => {
		const record: StoredOptOutRecord = {
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW - 1,
			rights: ['targeted_ads', 'sale'],
			version: 1,
		};
		expect(encodeOptOutRecordCompact(record)).toBe(
			`v=1&r=sa|ta&m=b&t=${NOW - 1}&h=d`
		);
		expect(
			decodeOptOutRecordCompact(`v=1&r=ta|sa&m=b&t=${NOW - 1}&h=d`, NOW)
		).toEqual({
			ok: true,
			record: { ...record, rights: ['sale', 'targeted_ads'] },
		});
	});

	it('round-trips an empty rights list through compact cookie, JSON and storage', () => {
		const record: StoredOptOutRecord = {
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW - 1,
			rights: [],
			subject: { subjectId: 'sub_pending' },
			version: 1,
		};
		const compact = encodeOptOutRecordCompact(record);
		expect(compact).toBe(`v=1&r=&m=b&t=${NOW - 1}&h=d&sid=sub_pending`);
		expect(decodeOptOutRecordCompact(compact, NOW)).toEqual({
			ok: true,
			record,
		});
		const json = encodeOptOutRecord(record);
		expect(decodeOptOutRecord(JSON.parse(json), NOW)).toEqual({
			ok: true,
			record,
		});

		expect(writeStoredOptOutRecord(record, undefined, NOW).ok).toBe(true);
		expect(readStoredOptOutRecord(undefined, NOW)).toEqual({
			ok: true,
			record,
		});
		expect(readStoredRecords(undefined, NOW).records.optOut).toEqual({
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW - 1,
			rights: [],
		});
		expect(
			readStoredRecordsFromCookieHeader(document.cookie, undefined, NOW).optOut
		).toEqual({
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW - 1,
			rights: [],
		});

		const kernel = createConsentKernel({
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
			initialPolicyResolution: usOptOutResolution(),
			now: NOW,
		});
		const persistence = createPersistence({ kernel });
		expect(kernel.getSnapshot().optOut).toEqual({
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW - 1,
			rights: [],
		});
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(kernel.getSnapshot().effectivePermissions.measurement).toBe(false);
		persistence.dispose();
		kernel.dispose();
	});

	it.each([
		['unknown version', `v=2&r=sa&m=b&t=${NOW - 1}&h=d`],
		['missing rights', `v=1&m=b&t=${NOW - 1}&h=d`],
		['duplicate right', `v=1&r=sa|sa&m=b&t=${NOW - 1}&h=d`],
		['raw right name instead of code', `v=1&r=sale&m=b&t=${NOW - 1}&h=d`],
		['unknown method', `v=1&r=sa&m=x&t=${NOW - 1}&h=d`],
		['raw method name', `v=1&r=sa&m=button&t=${NOW - 1}&h=d`],
		['unknown holder', `v=1&r=sa&m=b&t=${NOW - 1}&h=x`],
		['missing time', 'v=1&r=sa&m=b&h=d'],
		['unknown field', `v=1&r=sa&m=b&t=${NOW - 1}&h=d&z=1`],
		['duplicate field', `v=1&r=sa&m=b&t=${NOW - 1}&t=${NOW - 2}&h=d`],
		['bad subject encoding', `v=1&r=sa&m=b&t=${NOW - 1}&h=d&sid=%E0%A4%A`],
	])('rejects malformed compact value: %s', (_label, text) => {
		expect(decodeOptOutRecordCompact(text, NOW).ok).toBe(false);
	});

	it.each([
		['non-object', 'bad'],
		[
			'wrong version',
			{
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW,
				rights: ['sale'],
				version: 2,
			},
		],
		[
			'extra key',
			{
				extra: 1,
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW,
				rights: ['sale'],
				version: 1,
			},
		],
		[
			'invalid subject',
			{
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW,
				rights: ['sale'],
				subject: { subjectId: '' },
				version: 1,
			},
		],
	])('rejects malformed JSON value: %s', (_label, input) => {
		expect(decodeOptOutRecord(input, NOW).ok).toBe(false);
	});
	it('round-trips a record dated one day ahead of now through codec and storage', () => {
		const futureRecord: StoredOptOutRecord = {
			heldBy: 'person',
			method: 'api',
			recordedAt: NOW + DAY,
			rights: ['sale', 'share'],
			subject: { subjectId: 'sub_future' },
			version: 1,
		};
		const compact = encodeOptOutRecordCompact(futureRecord);
		expect(decodeOptOutRecordCompact(compact, NOW)).toEqual({
			ok: true,
			record: futureRecord,
		});
		const json = encodeOptOutRecord(futureRecord);
		expect(decodeOptOutRecord(JSON.parse(json), NOW)).toEqual({
			ok: true,
			record: futureRecord,
		});

		expect(writeStoredOptOutRecord(futureRecord, undefined, NOW).ok).toBe(true);
		expect(readStoredOptOutRecord(undefined, NOW)).toEqual({
			ok: true,
			record: futureRecord,
		});
		expect(readStoredRecords(undefined, NOW).records.optOut).toEqual({
			heldBy: 'person',
			method: 'api',
			recordedAt: NOW + DAY,
			rights: ['sale', 'share'],
		});
		expect(
			readStoredRecordsFromCookieHeader(document.cookie, undefined, NOW).optOut
		).toEqual({
			heldBy: 'person',
			method: 'api',
			recordedAt: NOW + DAY,
			rights: ['sale', 'share'],
		});
	});
});

describe('opt-out storage and hydration', () => {
	it('writes under the derived key, reads from cookie and localStorage, and leaves the consent envelope untouched', () => {
		const keys = resolveStorageKeys(undefined);
		expect(keys.optOut).toBe(`${STORAGE_KEY_V2}-opt-out`);
		expect(resolveStorageKeys({ storageKey: 'custom' }).optOut).toBe(
			'custom-opt-out'
		);

		const envelope = {
			categories: explicitChoice({ marketing: true }).categories,
			version: 3 as const,
		};
		const beforeEnvelope = encodeStoredConsentEnvelopeCompact(envelope);

		const result = writeStoredOptOutRecord(
			{
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW - 1,
				rights: ['sale', 'share'],
				subject: { subjectId: 'sub_optout' },
				version: 1,
			},
			undefined,
			NOW
		);
		expect(result.ok).toBe(true);
		expect(window.localStorage.getItem(keys.optOut)).toContain('sale');
		expect(document.cookie).toContain(`${keys.optOut}=v=1`);
		expect(encodeStoredConsentEnvelopeCompact(envelope)).toBe(beforeEnvelope);
		expect(
			validateStoredConsentEnvelope({ ...envelope, optOut: {} } as unknown, NOW)
				.ok
		).toBe(false);

		const fromBoth = readStoredRecords(undefined, NOW);
		expect(fromBoth.found).toBe(true);
		expect(fromBoth.records.optOut).toEqual({
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW - 1,
			rights: ['sale', 'share'],
		});
		expect(fromBoth.records.subject).toEqual({ subjectId: 'sub_optout' });
		expect(fromBoth.subjectCarrier).toBe('opt-out');

		// Cookie header read for SSR agrees.
		const headerRecords = readStoredRecordsFromCookieHeader(
			document.cookie,
			undefined,
			NOW
		);
		expect(headerRecords.optOut).toEqual(fromBoth.records.optOut);
		expect(headerRecords.subject).toEqual({ subjectId: 'sub_optout' });

		// Server request read passes opt-out into initialRecords so first paint denies.
		const { state } = readRequestConsent({
			adapter: 'test',
			now: NOW,
			request: { cookie: document.cookie },
		});
		expect(state.initialRecords?.optOut).toEqual(fromBoth.records.optOut);

		// Remove cookie to verify localStorage fallback.
		document.cookie = `${keys.optOut}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		expect(readStoredOptOutRecord(undefined, NOW)).toEqual({
			ok: true,
			record: {
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW - 1,
				rights: ['sale', 'share'],
				subject: { subjectId: 'sub_optout' },
				version: 1,
			},
		});

		// Clear removes it.
		clearStoredConsentRecords();
		expect(readStoredOptOutRecord(undefined, NOW)).toBeNull();
	});

	it('takes a strictly newer local record as it is and unions rights only on equal times', () => {
		const keys = resolveStorageKeys(undefined);
		const older: StoredOptOutRecord = {
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW - 2000,
			rights: ['sale', 'share'],
			version: 1,
		};
		writeStoredOptOutRecord(older, undefined, NOW);

		// The cookie write for a newer answer that dropped a right failed, so
		// only the local copy is new.
		const newer: StoredOptOutRecord = {
			...older,
			recordedAt: NOW - 1000,
			rights: ['sale'],
		};
		window.localStorage.setItem(keys.optOut, encodeOptOutRecord(newer));
		expect(readStoredOptOutRecord(undefined, NOW)).toMatchObject({
			ok: true,
			record: { recordedAt: NOW - 1000, rights: ['sale'] },
		});

		// Equal times: a dropped cookie write must not lose a right.
		window.localStorage.setItem(
			keys.optOut,
			encodeOptOutRecord({ ...older, rights: ['targeted_ads'] })
		);
		expect(readStoredOptOutRecord(undefined, NOW)).toMatchObject({
			ok: true,
			record: {
				recordedAt: NOW - 2000,
				rights: ['sale', 'share', 'targeted_ads'],
			},
		});
	});

	it('voids an opt-out record written before the clear epoch', () => {
		writeStoredOptOutRecord(
			{
				heldBy: 'device',
				method: 'gpc',
				recordedAt: NOW - 2000,
				rights: ['sale', 'share'],
				version: 1,
			},
			undefined,
			NOW
		);
		writeStoredClearEpoch(NOW - 1000, undefined);
		expect(readStoredOptOutRecord(undefined, NOW)).toBeNull();
		expect(readStoredRecords(undefined, NOW).records.optOut).toBeNull();
	});
});

describe('opt-out persistence lifecycle', () => {
	it('writes on optOut(), survives a reload with no GPC signal, and preserves subject identity', async () => {
		const first = createConsentKernel({
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
			initialPolicyResolution: usOptOutResolution(),
			now: NOW,
		});
		const firstPersistence = createPersistence({ kernel: first });
		const subjectId = first.getSnapshot().subject?.subjectId;
		expect(subjectId).toBeTruthy();

		await first.commands.optOut();
		await flushWrites();
		expect(first.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(readStoredOptOutRecord(undefined, NOW)?.ok).toBe(true);

		firstPersistence.dispose();
		first.dispose();

		// Simulate reload with a brand-new kernel and no GPC signal.
		const reloaded = createConsentKernel({
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
			initialPolicyResolution: usOptOutResolution(),
			now: NOW + 1000,
		});
		const secondPersistence = createPersistence({ kernel: reloaded });

		expect(reloaded.getSnapshot().optOut).toEqual({
			categories: ['measurement', 'marketing'],
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW,
			rights: ['sale', 'share', 'targeted_ads'],
		});
		expect(reloaded.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(reloaded.getSnapshot().effectivePermissions.measurement).toBe(false);
		expect(reloaded.getSnapshot().restrictions).toEqual({
			marketing: ['opt-out'],
			measurement: ['opt-out'],
		});
		expect(reloaded.getSnapshot().subject?.subjectId).toBe(subjectId);

		secondPersistence.dispose();
		reloaded.dispose();
	});

	it('writes on live GPC detection, does not duplicate on reload, and removes on optIn(), save() and clear()', async () => {
		const first = createConsentKernel({
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
			initialPolicyResolution: usOptOutResolution(),
			initialPrivacySignals: { gpc: true },
			now: NOW,
		});
		const firstPersistence = createPersistence({ kernel: first });
		await first.commands.init();
		await flushWrites();

		expect(first.getSnapshot().optOut?.method).toBe('gpc');
		expect(readStoredOptOutRecord(undefined, NOW)?.ok).toBe(true);
		firstPersistence.dispose();
		first.dispose();

		// Reload with GPC still active: hydration reads the stored opt-out before
		// init() marks the kernel live, so no duplicate opt-out:recorded fires.
		const second = createConsentKernel({
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
			initialPolicyResolution: usOptOutResolution(),
			initialPrivacySignals: { gpc: true },
			now: NOW + 1000,
		});
		const recorded = vi.fn();
		second.events.on('opt-out:recorded', recorded);
		const secondPersistence = createPersistence({ kernel: second });
		await second.commands.init();
		expect(recorded).not.toHaveBeenCalled();

		// Turn GPC off and lift via optIn(): removes stored record.
		second.set.privacySignals({ gpc: false });
		expect(await second.commands.optIn()).toEqual({ ok: true, optOut: null });
		await flushWrites();
		expect(readStoredOptOutRecord(undefined, NOW + 1000)).toBeNull();
		expect(second.getSnapshot().effectivePermissions.marketing).toBe(true);

		// Record again via optOut() then lift via preference save({ marketing: true }).
		await second.commands.optOut();
		await flushWrites();
		expect(readStoredOptOutRecord(undefined, NOW + 1000)?.ok).toBe(true);
		await second.commands.save({ marketing: true });
		await flushWrites();
		expect(readStoredOptOutRecord(undefined, NOW + 1000)).toBeNull();

		// Record again then clear() removes it immediately.
		await second.commands.optOut();
		await flushWrites();
		expect(readStoredOptOutRecord(undefined, NOW + 1000)?.ok).toBe(true);
		secondPersistence.clear();
		expect(second.getSnapshot().optOut).toBeNull();
		expect(readStoredOptOutRecord(undefined, NOW + 1000)).toBeNull();

		secondPersistence.dispose();
		second.dispose();
	});

	it('writes the acknowledged notice alongside an opt-out made while a notice is owed', async () => {
		const kernel = createConsentKernel({
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
			initialPolicyResolution: matchedResolution(
				noticeRule({
					privacySignals: { gpc: { denyCategories: ['marketing'] } },
				})
			),
			now: NOW,
		});
		const persistence = createPersistence({ kernel });
		await kernel.commands.optOut();
		await flushWrites();

		const stored = readStoredRecords(undefined, NOW);
		expect(stored.records.optOut?.method).toBe('button');
		expect(stored.records.noticeDismissal).toEqual({
			dismissedAt: NOW,
			fingerprint: kernel.getSnapshot().evaluationPolicy.notice.fingerprint,
			version: 1,
		});

		persistence.dispose();
		kernel.dispose();
	});

	it('stores gpcReported beside the opt-out record in cookie and localStorage, keeps it out of OptOutRecord, preserves it across sync, and clears it when GPC turns off', async () => {
		const markedRecord: StoredOptOutRecord = {
			gpcReported: true,
			heldBy: 'person',
			method: 'propagated',
			recordedAt: NOW - 1000,
			rights: ['sale', 'share'],
			subject: { subjectId: 'sub_gpc_mark' },
			version: 1,
		};
		const compact = encodeOptOutRecordCompact(markedRecord);
		expect(compact).toBe(
			`v=1&r=sa|sh&m=p&t=${NOW - 1000}&h=p&sid=sub_gpc_mark&g=1`
		);
		expect(decodeOptOutRecordCompact(compact, NOW)).toEqual({
			ok: true,
			record: markedRecord,
		});
		const json = encodeOptOutRecord(markedRecord);
		expect(decodeOptOutRecord(JSON.parse(json), NOW)).toEqual({
			ok: true,
			record: markedRecord,
		});
		expect(
			decodeOptOutRecordCompact(`v=1&r=sa&m=b&t=${NOW - 1}&h=d&g=0`, NOW).ok
		).toBe(false);
		expect(
			decodeOptOutRecord(
				{
					gpcReported: 'yes',
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW - 1,
					rights: ['sale'],
					version: 1,
				},
				NOW
			).ok
		).toBe(false);

		expect(writeStoredOptOutRecord(markedRecord, undefined, NOW).ok).toBe(true);
		const read = readStoredRecords(undefined, NOW);
		expect(read.records.optOut).toEqual({
			heldBy: 'person',
			method: 'propagated',
			recordedAt: NOW - 1000,
			rights: ['sale', 'share'],
		});
		expect('gpcReported' in (read.records.optOut as object)).toBe(false);
		expect(read.records.optOutGpcReported).toBe(true);

		const fromCookie = readStoredRecordsFromCookieHeader(
			document.cookie,
			undefined,
			NOW
		);
		expect(fromCookie.optOut).toEqual(read.records.optOut);
		expect(fromCookie.optOutGpcReported).toBe(true);

		// A live kernel that sends a GPC report persists the mark, preserves it
		// across a propagated/both backend answer, and clears it when GPC turns off.
		clearAll();
		const optOut = vi.fn((payload) =>
			Promise.resolve({
				ok: true,
				optOut: {
					heldBy: 'both' as const,
					method: 'propagated' as const,
					recordedAt: NOW - 500,
					rights: ['sale' as const, 'share' as const],
				},
				subjectId: payload.subjectId,
			})
		);
		const kernel = createConsentKernel({
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
			initialPolicyResolution: usOptOutResolution(),
			initialPrivacySignals: { gpc: true },
			initialRecords: {
				now: NOW,
				optOut: {
					heldBy: 'person',
					method: 'propagated',
					recordedAt: NOW - 500,
					rights: ['sale', 'share'],
				},
				subject: { subjectId: 'sub_gpc_mark' },
			},
			now: NOW,
			transport: { optOut },
		});
		const persistence = createPersistence({ kernel, skipHydration: true });

		await kernel.commands.init();
		// The request leaves through the save queue, whose code loads on
		// demand, so wait for the answer to be stored, not for a fixed time.
		await vi.waitFor(() =>
			expect(readStoredOptOutRecord(undefined, NOW)).toMatchObject({
				ok: true,
				record: {
					gpcReported: true,
					heldBy: 'both',
					method: 'propagated',
				},
			})
		);
		expect(optOut).toHaveBeenCalledTimes(1);

		kernel.set.privacySignals({ gpc: false });
		await flushWrites();
		const clearedMark = readStoredOptOutRecord(undefined, NOW);
		expect(clearedMark).toMatchObject({ ok: true });
		expect(
			clearedMark?.ok ? clearedMark.record.gpcReported : 'invalid'
		).toBeUndefined();

		persistence.dispose();
		kernel.dispose();
	});

	it('does not write g=1 or gpcReported when the outbox refuses to queue the GPC report, and persists it once a working load reports', async () => {
		writeStoredOptOutRecord(
			{
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW - 500,
				rights: ['sale', 'share'],
				subject: { subjectId: 'sub_gpc_unstored' },
				version: 1,
			},
			undefined,
			NOW
		);

		const spy = vi.spyOn(window.localStorage, 'setItem');
		const original = spy.getMockImplementation();
		spy.mockImplementation((key: string, value: string) => {
			if (key === PENDING_OPT_OUTS_STORAGE_KEY) {
				throw new DOMException('full', 'QuotaExceededError');
			}
			original?.(key, value);
		});
		try {
			const pending = Promise.withResolvers<never>();
			const inFlight = vi.fn(() => pending.promise);
			const first = createConsentKernel({
				initialLocation: { countryCode: 'US', regionCode: 'CA' },
				initialPolicyResolution: usOptOutResolution(),
				initialPrivacySignals: { gpc: true },
				now: NOW,
				transport: { optOut: inFlight },
			});
			const firstPersistence = createPersistence({ kernel: first });
			await first.commands.init();
			await flushWrites();

			expect(inFlight).toHaveBeenCalledTimes(1);
			const storedAfterRefusal = readStoredOptOutRecord(undefined, NOW);
			expect(storedAfterRefusal).toMatchObject({
				ok: true,
				record: { method: 'button' },
			});
			expect(
				storedAfterRefusal?.ok
					? storedAfterRefusal.record.gpcReported
					: 'invalid'
			).toBeUndefined();
			expect(
				readStoredRecordsFromCookieHeader(document.cookie, undefined, NOW)
					.optOutGpcReported
			).toBeUndefined();
			firstPersistence.dispose();
			first.dispose();
		} finally {
			if (original) {
				spy.mockImplementation(original);
			} else {
				spy.mockRestore();
			}
		}

		const working = vi.fn((payload) =>
			Promise.resolve({
				ok: true,
				optOut: {
					heldBy: 'device' as const,
					method: 'button' as const,
					recordedAt: NOW - 500,
					rights: ['sale' as const, 'share' as const],
				},
				subjectId: payload.subjectId,
			})
		);
		const second = createConsentKernel({
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
			initialPolicyResolution: usOptOutResolution(),
			initialPrivacySignals: { gpc: true },
			now: NOW,
			transport: { optOut: working },
		});
		const secondPersistence = createPersistence({ kernel: second });
		await second.commands.init();
		await flushWrites();

		expect(working).toHaveBeenCalledTimes(1);
		expect(readStoredOptOutRecord(undefined, NOW)).toMatchObject({
			ok: true,
			record: { gpcReported: true, method: 'button' },
		});
		expect(
			readStoredRecordsFromCookieHeader(document.cookie, undefined, NOW)
				.optOutGpcReported
		).toBe(true);
		secondPersistence.dispose();
		second.dispose();

		const third = createConsentKernel({
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
			initialPolicyResolution: usOptOutResolution(),
			initialPrivacySignals: { gpc: true },
			now: NOW,
			transport: { optOut: working },
		});
		const thirdPersistence = createPersistence({ kernel: third });
		await third.commands.init();
		await flushWrites();
		expect(working).toHaveBeenCalledTimes(1);
		thirdPersistence.dispose();
		third.dispose();
	});

	it('does not copy a stored gpcReported mark onto a different seeded opt-out when skipHydration is true', async () => {
		const storedRecord: StoredOptOutRecord = {
			gpcReported: true,
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW - 2000,
			rights: ['sale', 'share'],
			subject: { subjectId: 'sub_gpc_seed' },
			version: 1,
		};

		const runSeeded = async (seededOptOut: {
			heldBy: 'device' | 'person' | 'both';
			method: 'button' | 'gpc' | 'api' | 'propagated';
			recordedAt: number;
			rights: ('sale' | 'share' | 'targeted_ads')[];
		}) => {
			clearAll();
			expect(writeStoredOptOutRecord(storedRecord, undefined, NOW).ok).toBe(
				true
			);
			const optOut = vi.fn((payload: { method: string; subjectId: string }) =>
				Promise.resolve({
					ok: true,
					optOut: seededOptOut,
					subjectId: payload.subjectId,
				})
			);
			const kernel = createConsentKernel({
				initialLocation: { countryCode: 'US', regionCode: 'CA' },
				initialPolicyResolution: usOptOutResolution(),
				initialPrivacySignals: { gpc: true },
				initialRecords: {
					now: NOW,
					optOut: seededOptOut,
					subject: { subjectId: 'sub_gpc_seed' },
				},
				now: NOW,
				transport: { optOut },
			});
			const persistence = createPersistence({ kernel, skipHydration: true });
			await kernel.commands.init();
			await flushWrites();
			return {
				dispose: () => {
					persistence.dispose();
					kernel.dispose();
				},
				kernel,
				optOut,
			};
		};

		// Newer seeded record must not inherit the older stored record's mark.
		const newer = await runSeeded({
			heldBy: 'person',
			method: 'api',
			recordedAt: NOW - 500,
			rights: ['sale', 'share'],
		});
		expect(newer.optOut).toHaveBeenCalledTimes(1);
		expect(newer.optOut.mock.calls[0]?.[0].method).toBe('gpc');
		newer.dispose();

		// Same timestamp but different record fields must not inherit the mark.
		const sameTimeDifferent = await runSeeded({
			heldBy: 'person',
			method: 'propagated',
			recordedAt: NOW - 2000,
			rights: ['sale', 'share'],
		});
		expect(sameTimeDifferent.optOut).toHaveBeenCalledTimes(1);
		expect(sameTimeDifferent.optOut.mock.calls[0]?.[0].method).toBe('gpc');
		sameTimeDifferent.dispose();

		// Identical seeded record keeps the stored mark and sends no duplicate report.
		const identical = await runSeeded({
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW - 2000,
			rights: ['sale', 'share'],
		});
		expect(identical.optOut).not.toHaveBeenCalled();
		identical.dispose();
	});

	it('stops reporting when two tabs hold opposite GPC overrides over shared storage', async () => {
		const keys = resolveStorageKeys(undefined);
		const held: StoredOptOutRecord = {
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW - 1000,
			rights: ['sale', 'share'],
			subject: { subjectId: 'sub_two_tabs' },
			version: 1,
		};
		expect(writeStoredOptOutRecord(held, undefined, NOW).ok).toBe(true);

		let optOutWrites = 0;
		const spy = vi.spyOn(window.localStorage, 'setItem');
		const original = spy.getMockImplementation();
		spy.mockImplementation((key: string, value: string) => {
			const previous = window.localStorage.getItem(key);
			original?.(key, value);
			if (key === keys.optOut) {
				optOutWrites += 1;
				if (value !== previous) {
					setTimeout(() => {
						window.dispatchEvent(new StorageEvent('storage', { key }));
					}, 0);
				}
			}
		});

		const optOut = vi.fn((payload: { subjectId: string }) =>
			Promise.resolve({
				ok: true,
				optOut: {
					heldBy: 'device' as const,
					method: 'button' as const,
					recordedAt: NOW - 1000,
					rights: ['sale' as const, 'share' as const],
				},
				subjectId: payload.subjectId,
			})
		);
		const tabGpcOff = createConsentKernel({
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
			initialOverrides: { gpc: false },
			initialPolicyResolution: usOptOutResolution(),
			now: NOW,
			transport: { optOut },
		});
		const tabGpcOn = createConsentKernel({
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
			initialOverrides: { gpc: true },
			initialPolicyResolution: usOptOutResolution(),
			now: NOW,
			transport: { optOut },
		});
		const offPersistence = createPersistence({ kernel: tabGpcOff });
		const onPersistence = createPersistence({ kernel: tabGpcOn });

		try {
			await tabGpcOff.commands.init();
			await tabGpcOn.commands.init();

			await vi.advanceTimersByTimeAsync(100);
			expect(optOut).toHaveBeenCalledTimes(1);

			const writesAfterSettle = optOutWrites;
			await vi.advanceTimersByTimeAsync(100);
			expect(optOut).toHaveBeenCalledTimes(1);
			expect(optOutWrites).toBe(writesAfterSettle);
		} finally {
			offPersistence.dispose();
			onPersistence.dispose();
			tabGpcOff.dispose();
			tabGpcOn.dispose();
			if (original) {
				spy.mockImplementation(original);
			} else {
				spy.mockRestore();
			}
		}
	});

	it('reconciles a true mark from another tab for the same record and clears the mark when storage replaces the record', async () => {
		const held: StoredOptOutRecord = {
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW - 2000,
			rights: ['sale', 'share'],
			subject: { subjectId: 'sub_mark_sync' },
			version: 1,
		};
		expect(writeStoredOptOutRecord(held, undefined, NOW).ok).toBe(true);

		const optOut = vi.fn((payload: { subjectId: string }) =>
			Promise.resolve({
				ok: true,
				optOut: {
					heldBy: 'device' as const,
					method: 'button' as const,
					recordedAt: NOW - 500,
					rights: ['sale' as const, 'share' as const],
				},
				subjectId: payload.subjectId,
			})
		);
		const kernel = createConsentKernel({
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
			initialOverrides: { gpc: true },
			initialPolicyResolution: usOptOutResolution(),
			now: NOW,
			transport: { optOut },
		});
		const persistence = createPersistence({ kernel });

		// Another tab reports GPC for the same record before this tab goes live.
		expect(
			writeStoredOptOutRecord({ ...held, gpcReported: true }, undefined, NOW).ok
		).toBe(true);
		persistence.reconcile();

		await kernel.commands.init();
		await flushWrites();
		expect(optOut).not.toHaveBeenCalled();

		// Another tab replaces the record with a newer unmarked opt-out.
		expect(
			writeStoredOptOutRecord(
				{ ...held, recordedAt: NOW - 500 },
				undefined,
				NOW
			).ok
		).toBe(true);
		persistence.reconcile();
		await flushWrites();

		expect(optOut).toHaveBeenCalledTimes(1);
		persistence.dispose();
		kernel.dispose();
	});

	it('retries a failed opt-out write on pagehide once storage works again so it survives reload', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const cookieDescriptor = Object.getOwnPropertyDescriptor(
			Document.prototype,
			'cookie'
		);
		let storageBlocked = true;
		const setItemSpy = vi.spyOn(window.localStorage, 'setItem');
		const originalSetItem = setItemSpy.getMockImplementation();
		setItemSpy.mockImplementation((key: string, value: string) => {
			if (storageBlocked) {
				throw new DOMException('full', 'QuotaExceededError');
			}
			originalSetItem?.(key, value);
		});
		Object.defineProperty(document, 'cookie', {
			configurable: true,
			get: () => (cookieDescriptor?.get?.call(document) as string) ?? '',
			set: (value: string) => {
				if (!storageBlocked) {
					cookieDescriptor?.set?.call(document, value);
				}
			},
		});

		const first = createConsentKernel({
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
			initialPolicyResolution: usOptOutResolution(),
			now: NOW,
		});
		const firstPersistence = createPersistence({ kernel: first });
		try {
			await first.commands.optOut();
			await flushWrites();
			expect(readStoredOptOutRecord(undefined, NOW)).toBeNull();

			storageBlocked = false;
			window.dispatchEvent(new Event('pagehide'));
			expect(readStoredOptOutRecord(undefined, NOW)).toMatchObject({
				ok: true,
				record: { method: 'button', recordedAt: NOW },
			});
			firstPersistence.dispose();
			first.dispose();

			const reloaded = createConsentKernel({
				initialLocation: { countryCode: 'US', regionCode: 'CA' },
				initialPolicyResolution: usOptOutResolution(),
				now: NOW + 1000,
			});
			const secondPersistence = createPersistence({ kernel: reloaded });
			expect(reloaded.getSnapshot().optOut).toMatchObject({
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW,
			});
			secondPersistence.dispose();
			reloaded.dispose();
		} finally {
			if (cookieDescriptor) {
				Object.defineProperty(document, 'cookie', cookieDescriptor);
			} else {
				delete (document as { cookie?: string }).cookie;
			}
			if (originalSetItem) {
				setItemSpy.mockImplementation(originalSetItem);
			} else {
				setItemSpy.mockRestore();
			}
		}
	});

	it('stores reference in localStorage only, keeps localAct and rightsConfirmed in cookie and localStorage, and restores them on hydration', () => {
		const record: StoredOptOutRecord = {
			heldBy: 'both',
			localAct: 'button',
			method: 'propagated',
			recordedAt: NOW - 500,
			reference: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
			rights: ['sale', 'share'],
			rightsConfirmed: true,
			subject: { subjectId: 'sub_receipt' },
			version: 1,
		};
		const compact = encodeOptOutRecordCompact(record);
		expect(compact).not.toContain('0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c');
		expect(decodeOptOutRecordCompact(compact, NOW)).toEqual({
			ok: true,
			record: {
				heldBy: 'both',
				localAct: 'button',
				method: 'propagated',
				recordedAt: NOW - 500,
				rights: ['sale', 'share'],
				rightsConfirmed: true,
				subject: { subjectId: 'sub_receipt' },
				version: 1,
			},
		});
		const json = encodeOptOutRecord(record);
		expect(decodeOptOutRecord(JSON.parse(json), NOW)).toEqual({
			ok: true,
			record,
		});

		expect(writeStoredOptOutRecord(record, undefined, NOW).ok).toBe(true);
		const read = readStoredRecords(undefined, NOW);
		expect(read.records.optOutReference).toBe(record.reference);
		expect(read.records.optOutLocalAct).toBe('button');
		expect(read.records.optOutRightsConfirmed).toBe(true);
		expect('reference' in (read.records.optOut as object)).toBe(false);
		expect('localAct' in (read.records.optOut as object)).toBe(false);
		expect('rightsConfirmed' in (read.records.optOut as object)).toBe(false);

		// When localStorage is cleared/blocked, cookie still restores localAct and rightsConfirmed.
		window.localStorage.clear();
		const cookieOnly = readStoredRecords(undefined, NOW);
		expect(cookieOnly.records.optOutReference).toBeUndefined();
		expect(cookieOnly.records.optOutLocalAct).toBe('button');
		expect(cookieOnly.records.optOutRightsConfirmed).toBe(true);
	});
});

describe('opt-out categories (DEF-09)', () => {
	const withCategories = (
		categories: StoredOptOutRecord['categories']
	): StoredOptOutRecord => ({
		categories,
		heldBy: 'device',
		method: 'gpc',
		recordedAt: NOW - 1,
		rights: ['sale', 'share', 'targeted_ads'],
		version: 1,
	});

	const companionOf = (key: string): string | null => {
		const cookie = document.cookie
			.split(/;\s*/u)
			.find((entry) => entry.startsWith(`${key}=`));
		return cookie === undefined
			? null
			: decodeURIComponent(cookie.slice(key.length + 1));
	};

	it('[GPC-05] stores the withheld categories beside the record, which keeps its old form', () => {
		const keys = resolveStorageKeys(undefined);
		for (const [categories, code] of [
			[['marketing'], 'mk'],
			[['measurement', 'marketing'], 'me|mk'],
			// An empty list is kept apart from a missing one: it withholds
			// nothing of its own, where a missing one is a legacy record.
			[[], ''],
		] as const) {
			clearAll();
			const record = withCategories([...categories]);
			expect(writeStoredOptOutRecord(record, undefined, NOW).ok).toBe(true);

			const companion = `v=1&t=${NOW - 1}&m=g&k=${code}`;
			expect(companionOf(keys.optOutCategories)).toBe(companion);
			expect(window.localStorage.getItem(keys.optOutCategories)).toBe(
				companion
			);
			expect(companionOf(keys.optOut)).toBe(
				`v=1&r=sa|sh|ta&m=g&t=${NOW - 1}&h=d`
			);
			expect(window.localStorage.getItem(keys.optOut)).not.toContain(
				'categories'
			);
			expect(readStoredOptOutRecord(undefined, NOW)).toEqual({
				ok: true,
				record,
			});
			expect(
				readStoredRecordsFromCookieHeader(document.cookie, undefined, NOW)
					.optOut
			).toMatchObject({ categories: [...categories] });
		}

		// A legacy record has no companion; writing one removes a stale one.
		const { categories: _categories, ...legacy } = withCategories([]);
		expect(writeStoredOptOutRecord(legacy, undefined, NOW).ok).toBe(true);
		expect(companionOf(keys.optOutCategories)).toBeNull();
		expect(window.localStorage.getItem(keys.optOutCategories)).toBeNull();
		expect(readStoredOptOutRecord(undefined, NOW)).toEqual({
			ok: true,
			record: legacy,
		});
	});

	it('[GPC-05] an SDK from before stored categories still reads the opt-out this one stores', async () => {
		const keys = resolveStorageKeys(undefined);
		const record = {
			...withCategories(['experience', 'marketing']),
			gpcReported: true,
			subject: { subjectId: 'sub_rollback' },
		};
		expect(writeStoredOptOutRecord(record, undefined, NOW).ok).toBe(true);
		const { categories: _categories, ...withoutCategories } = record;
		const cookie = companionOf(keys.optOut);
		const local = window.localStorage.getItem(keys.optOut);
		expect.assert(cookie !== null && local !== null);
		expect(legacyDecodeOptOutRecordCompact(cookie, NOW)).toEqual({
			ok: true,
			record: withoutCategories,
		});
		expect(legacyDecodeOptOutRecord(JSON.parse(local), NOW)).toEqual({
			ok: true,
			record: withoutCategories,
		});
		// What the record itself carrying the list would have done to it.
		expect(legacyDecodeOptOutRecordCompact(`${cookie}&k=ex|mk`, NOW).ok).toBe(
			false
		);
		expect(
			legacyDecodeOptOutRecord(
				{ ...JSON.parse(local), categories: ['experience', 'marketing'] },
				NOW
			).ok
		).toBe(false);

		// The same holds for what a kernel stores on its own GPC opt-out.
		clearAll();
		const kernel = createConsentKernel({
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
			initialPolicyResolution: matchedResolution(
				policyRulePresets.californiaOptOut()
			),
			initialPrivacySignals: { gpc: true },
			now: NOW,
		});
		const persistence = createPersistence({ kernel });
		await kernel.commands.init();
		await flushWrites();
		const stored = [
			legacyDecodeOptOutRecordCompact(companionOf(keys.optOut) ?? '', NOW),
			legacyDecodeOptOutRecord(
				JSON.parse(window.localStorage.getItem(keys.optOut) ?? 'null'),
				NOW
			),
		];
		for (const read of stored) {
			expect(read).toMatchObject({
				ok: true,
				record: { method: 'gpc', recordedAt: NOW },
			});
		}
		persistence.dispose();
		kernel.dispose();
	});

	it('[GPC-05] a record an older SDK rewrites keeps its categories only while it is the same act', () => {
		const keys = resolveStorageKeys(undefined);
		expect(
			writeStoredOptOutRecord(withCategories(['marketing']), undefined, NOW).ok
		).toBe(true);
		// An older SDK rewrites the record in its own form and leaves the
		// companion alone: the act is the same, so its list still applies.
		const answered = encodeOptOutRecordCompact({
			heldBy: 'both',
			method: 'gpc',
			recordedAt: NOW - 1,
			rights: ['sale', 'share'],
			version: 1,
		});
		document.cookie = `${keys.optOut}=${encodeURIComponent(answered)}; path=/`;
		window.localStorage.removeItem(keys.optOut);
		expect(readStoredOptOutRecord(undefined, NOW)).toMatchObject({
			ok: true,
			record: { categories: ['marketing'], heldBy: 'both' },
		});

		// A later act it records is legacy, whatever the companion says.
		const later = encodeOptOutRecordCompact({
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW,
			rights: [],
			version: 1,
		});
		document.cookie = `${keys.optOut}=${encodeURIComponent(later)}; path=/`;
		const read = readStoredOptOutRecord(undefined, NOW);
		expect(read).toMatchObject({ ok: true, record: { recordedAt: NOW } });
		expect(read).not.toHaveProperty('record.categories');
	});

	it.each([
		['missing list', `v=1&t=${NOW - 1}&m=g`],
		['unknown category code', `v=1&t=${NOW - 1}&m=g&k=zz`],
		['repeated category', `v=1&t=${NOW - 1}&m=g&k=mk|mk`],
		['unknown field', `v=1&t=${NOW - 1}&m=g&k=mk&r=sa`],
		['unknown method', `v=1&t=${NOW - 1}&m=x&k=mk`],
		['missing time', 'v=1&m=g&k=mk'],
		['unknown version', `v=2&t=${NOW - 1}&m=g&k=mk`],
	])('rejects a malformed categories companion: %s', (_label, text) => {
		expect(decodeOptOutCategoriesCompact(text).ok).toBe(false);
	});

	it('canonicalizes the companion category order', () => {
		expect(
			decodeOptOutCategoriesCompact(`v=1&t=${NOW - 1}&m=b&k=mk|me`)
		).toEqual({
			ok: true,
			record: {
				categories: ['measurement', 'marketing'],
				method: 'button',
				recordedAt: NOW - 1,
			},
		});
	});

	it('[GPC-05] equal-time copies withhold what either does, reading a copy without a list as legacy', () => {
		const keys = resolveStorageKeys(undefined);
		// The cookie holds a GPC act with its list; localStorage holds a
		// button act from the same millisecond with none.
		document.cookie = `${keys.optOut}=${encodeURIComponent(
			encodeOptOutRecordCompact(withCategories(['experience', 'marketing']))
		)}; path=/`;
		document.cookie = `${keys.optOutCategories}=${encodeURIComponent(
			`v=1&t=${NOW - 1}&m=g&k=ex|mk`
		)}; path=/`;
		window.localStorage.setItem(
			keys.optOut,
			encodeOptOutRecord({
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW - 1,
				rights: ['sale'],
				version: 1,
			})
		);
		expect(readStoredOptOutRecord(undefined, NOW)).toMatchObject({
			ok: true,
			record: {
				categories: ['experience', 'measurement', 'marketing'],
				rights: ['sale', 'share', 'targeted_ads'],
			},
		});
	});

	it('[GPC-05] a seed from the cookies takes the categories only localStorage holds for the same act', async () => {
		const keys = resolveStorageKeys(undefined);
		const record = withCategories(['marketing']);
		expect(writeStoredOptOutRecord(record, undefined, NOW).ok).toBe(true);
		// localStorage holds a wider list for the act than the cookie does.
		window.localStorage.setItem(
			keys.optOutCategories,
			`v=1&t=${NOW - 1}&m=g&k=ex|mk`
		);
		const seeded = readStoredRecordsFromCookieHeader(
			document.cookie,
			undefined,
			NOW
		).optOut;
		expect(seeded?.categories).toEqual(['marketing']);
		const kernel = createConsentKernel({
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
			initialPolicyResolution: matchedResolution(
				policyRulePresets.californiaOptOut()
			),
			initialRecords: { now: NOW, optOut: seeded ?? null },
			now: NOW,
		});
		const persistence = createPersistence({ kernel, skipHydration: true });
		await kernel.commands.init();
		await flushWrites();
		expect(kernel.getSnapshot().optOut?.categories).toEqual([
			'experience',
			'marketing',
		]);
		expect(kernel.getSnapshot().effectivePermissions.experience).toBe(false);
		persistence.dispose();
		kernel.dispose();
	});

	it('[GPC-05] a record stored before categories existed keeps denying marketing and measurement after the preset narrows', async () => {
		// Written by an SDK that predates the field: no `categories`, in both
		// the cookie and localStorage.
		writeStoredOptOutRecord(
			{
				heldBy: 'device',
				method: 'gpc',
				recordedAt: NOW - DAY,
				rights: ['sale', 'share', 'targeted_ads'],
				version: 1,
			},
			undefined,
			NOW
		);
		const keys = resolveStorageKeys(undefined);
		expect(document.cookie).not.toContain(keys.optOutCategories);
		expect(window.localStorage.getItem(keys.optOutCategories)).toBeNull();

		const kernel = createConsentKernel({
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
			initialPolicyResolution: matchedResolution(
				policyRulePresets.californiaOptOut()
			),
			now: NOW,
		});
		const persistence = createPersistence({ kernel });
		await kernel.commands.init();
		await flushWrites();

		const snapshot = kernel.getSnapshot();
		expect(snapshot.optOut).not.toHaveProperty('categories');
		expect(snapshot.restrictions).toEqual({
			marketing: ['opt-out'],
			measurement: ['opt-out'],
		});
		// Nothing rewrites the old record with the narrower mapping.
		const stored = readStoredOptOutRecord(undefined, NOW);
		expect(stored).toMatchObject({
			ok: true,
			record: { method: 'gpc', recordedAt: NOW - DAY },
		});
		expect(stored).not.toHaveProperty('record.categories');
		persistence.dispose();
		kernel.dispose();
	});

	it('[GPC-01] a new GPC opt-out under the US preset stores marketing only and spares measurement on reload', async () => {
		const resolution = () =>
			matchedResolution(policyRulePresets.californiaOptOut());
		const first = createConsentKernel({
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
			initialPolicyResolution: resolution(),
			initialPrivacySignals: { gpc: true },
			now: NOW,
		});
		const firstPersistence = createPersistence({ kernel: first });
		await first.commands.init();
		await flushWrites();
		expect(document.cookie).toContain(
			`${resolveStorageKeys(undefined).optOutCategories}=`
		);
		firstPersistence.dispose();
		first.dispose();

		const reloaded = createConsentKernel({
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
			initialPolicyResolution: resolution(),
			now: NOW + 1000,
		});
		const secondPersistence = createPersistence({ kernel: reloaded });
		expect(reloaded.getSnapshot().optOut?.categories).toEqual(['marketing']);
		expect(reloaded.getSnapshot().restrictions).toEqual({
			marketing: ['opt-out'],
		});
		expect(reloaded.getSnapshot().effectivePermissions.measurement).toBe(true);
		secondPersistence.dispose();
		reloaded.dispose();
	});
});
