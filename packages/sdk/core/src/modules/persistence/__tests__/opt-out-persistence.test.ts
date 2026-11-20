/**
 * @vitest-environment jsdom
 */
/**
 * Durable opt-out persistence: codec round trips (JSON and compact),
 * rejection of malformed values, storage hydration from cookie and
 * localStorage, writes on record, removal on lift and clear, clear-epoch
 * voiding, subject identity preservation, and reload durability.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	explicitChoice,
	matchedResolution,
	noticeRule,
	NOW,
	optOutRule,
} from '../../../__tests__/fixtures/kernel-fixtures';
import { createConsentKernel } from '../../../index';
import { STORAGE_KEY_V2, resolveStorageKeys } from '../../../libs/storage-keys';
import { readRequestConsent } from '../../../server/request-consent';
import {
	readStoredRecords,
	readStoredRecordsFromCookieHeader,
} from '../hydrate';
import { createPersistence } from '../index';
import {
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

	it.each([
		['unknown version', `v=2&r=sa&m=b&t=${NOW - 1}&h=d`],
		['missing rights', `v=1&m=b&t=${NOW - 1}&h=d`],
		['empty rights', `v=1&r=&m=b&t=${NOW - 1}&h=d`],
		['duplicate right', `v=1&r=sa|sa&m=b&t=${NOW - 1}&h=d`],
		['raw right name instead of code', `v=1&r=sale&m=b&t=${NOW - 1}&h=d`],
		['unknown method', `v=1&r=sa&m=x&t=${NOW - 1}&h=d`],
		['raw method name', `v=1&r=sa&m=button&t=${NOW - 1}&h=d`],
		['unknown holder', `v=1&r=sa&m=b&t=${NOW - 1}&h=x`],
		['future time', `v=1&r=sa&m=b&t=${NOW + 1}&h=d`],
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
			'empty rights',
			{
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW,
				rights: [],
				version: 1,
			},
		],
		[
			'future time',
			{
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW + 1,
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
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW,
			rights: ['sale', 'share'],
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
});
