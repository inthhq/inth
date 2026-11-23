/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
	explicitChoice,
	NOW,
} from '../../../__tests__/fixtures/kernel-fixtures';
import { encodeV2Cookie } from '../../../__tests__/fixtures/v2-cookie';
import { createKernel as createConsentKernel } from '../../../kernel';
import { setCookie } from '../../../libs/cookie';
import { C15T_STORAGE_KEY, STORAGE_KEY_V2 } from '../../../libs/storage-keys';
import type { HydrationRecords } from '../../../consent-kernel.model';
import {
	hydrateFromStorage,
	readStoredRecords,
	readStoredRecordsFromCookieHeader,
} from '../persistence-hydrate.store';
import {
	encodeNoticeDismissalCompact,
	encodeStoredConsentEnvelopeCompact,
	encodeVendorChoiceCompact,
} from '../writer/record-encode.model';
import {
	clearStoredConsentRecords,
	writeStoredConsentEnvelope,
} from './record-writes';

beforeEach(() => {
	localStorage.clear();
	clearStoredConsentRecords();
	document.cookie = '';
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('readStoredRecords', () => {
	test('reports nothing found when storage is empty', () => {
		const stored = readStoredRecords(undefined, NOW);
		expect(stored.found).toBe(false);
		expect(stored.records).toEqual({
			choice: null,
			noticeDismissal: null,
			now: NOW,
			optOut: null,
			subject: null,
			vendorChoice: null,
		});
	});

	test('ignores a privacy record an earlier v3 alpha stored', () => {
		const legacy = {
			directives: [
				{ categories: ['marketing'], recordedAt: NOW - 2000, source: 'gpc' },
			],
			version: 1,
		};
		localStorage.setItem(`${STORAGE_KEY_V2}-privacy`, JSON.stringify(legacy));
		document.cookie = `${STORAGE_KEY_V2}-privacy=v=1&d=gpc.${NOW - 2000}.mk; path=/`;
		writeStoredConsentEnvelope(
			{
				categories: explicitChoice({ marketing: true }).categories,
				version: 3,
			},
			{ now: NOW }
		);
		const stored = readStoredRecords(undefined, NOW);
		expect(stored.records).toEqual({
			choice: explicitChoice({ marketing: true }),
			noticeDismissal: null,
			now: NOW,
			optOut: null,
			subject: null,
			vendorChoice: null,
		});
	});

	test('reads a v3 envelope with its subject and IAB metadata intact', () => {
		writeStoredConsentEnvelope(
			{
				categories: explicitChoice({ marketing: true }).categories,
				iab: { customVendorConsents: { acme: true } },
				subject: { externalId: '12345', subjectId: 'user%2F1' },
				version: 3,
			},
			{ now: NOW }
		);
		const stored = readStoredRecords(undefined, NOW);
		expect(stored.found).toBe(true);
		expect(stored.records.choice).toEqual(explicitChoice({ marketing: true }));
		expect(stored.records.subject).toEqual({
			externalId: '12345',
			subjectId: 'user%2F1',
		});
		expect(stored.iab).toEqual({ customVendorConsents: { acme: true } });
	});

	test('reads a legacy JSON record as legacy receipts with the original time', () => {
		localStorage.setItem(
			STORAGE_KEY_V2,
			JSON.stringify({
				consentInfo: {
					materialPolicyFingerprint: 'fp-old',
					subjectId: 'legacy-1',
					time: NOW - 5000,
				},
				consents: { marketing: true, necessary: true },
			})
		);
		const { records } = readStoredRecords(undefined, NOW);
		expect(records.choice).toEqual({
			categories: {
				marketing: {
					basis: { kind: 'legacy-v2', materialFingerprint: 'fp-old' },
					confirmedAt: NOW - 5000,
					value: true,
				},
			},
			version: 3,
		});
		expect(records.subject).toEqual({ subjectId: 'legacy-1' });
	});
});

describe('readStoredRecordsFromCookieHeader', () => {
	test('reads choice and notice projections with one clock and ignores an alpha privacy cookie', () => {
		const choice = encodeStoredConsentEnvelopeCompact({
			categories: explicitChoice({ marketing: false }).categories,
			version: 3,
		});
		const notice = encodeNoticeDismissalCompact({
			dismissedAt: NOW - 1000,
			fingerprint: 'notice-fp',
			version: 1,
		});
		// The compact form an earlier v3 alpha wrote for a standing directive.
		const privacy = `v=1&d=gpc.${NOW - 2000}.mk`;
		const header = `${STORAGE_KEY_V2}=${choice}; ${STORAGE_KEY_V2}-notice=${notice}; ${STORAGE_KEY_V2}-privacy=${privacy}`;
		const records = readStoredRecordsFromCookieHeader(header, undefined, NOW);
		expect(records).toEqual({
			choice: explicitChoice({ marketing: false }),
			noticeDismissal: {
				dismissedAt: NOW - 1000,
				fingerprint: 'notice-fp',
				version: 1,
			},
			now: NOW,
			optOut: null,
			subject: null,
			vendorChoice: null,
		});
	});

	test('a malformed projection is ignored without touching the choice', () => {
		const choice = encodeStoredConsentEnvelopeCompact({
			categories: explicitChoice({ marketing: false }).categories,
			version: 3,
		});
		const header = `${STORAGE_KEY_V2}=${choice}; ${STORAGE_KEY_V2}-notice=v=9&t=x; ${STORAGE_KEY_V2}-privacy=garbage`;
		const records = readStoredRecordsFromCookieHeader(header, undefined, NOW);
		expect(records.choice).toEqual(explicitChoice({ marketing: false }));
		expect(records.noticeDismissal).toBeNull();
	});
});

describe("a legacy family's own clear epoch", () => {
	const grant = () =>
		encodeStoredConsentEnvelopeCompact({
			categories: explicitChoice({ marketing: true }).categories,
			subject: { subjectId: 'sub_old' },
			version: 3,
		});
	const notice = encodeNoticeDismissalCompact({
		dismissedAt: NOW - 1000,
		fingerprint: 'notice-fp',
		version: 1,
	});
	const vendors = encodeVendorChoiceCompact({
		confirmedAt: NOW - 1000,
		denied: ['acme'],
		version: 1,
	});
	// c15t cleared after the grant; an older c15t tab then wrote it back.
	const c15tEpoch = `${C15T_STORAGE_KEY}-epoch=${NOW - 500}`;

	afterEach(() => {
		for (const name of [C15T_STORAGE_KEY, `${C15T_STORAGE_KEY}-epoch`]) {
			document.cookie = `${name}=; path=/; max-age=0`;
		}
	});

	test('voids c15t records from before c15t-epoch on the server', () => {
		const header = `${C15T_STORAGE_KEY}=${grant()}; ${C15T_STORAGE_KEY}-notice=${notice}; ${C15T_STORAGE_KEY}-vendors=${vendors}; ${c15tEpoch}`;
		expect(readStoredRecordsFromCookieHeader(header, undefined, NOW)).toEqual({
			choice: null,
			noticeDismissal: null,
			now: NOW,
			optOut: null,
			subject: null,
			vendorChoice: null,
		});
	});

	test('voids c15t records from before c15t-epoch in the browser', () => {
		document.cookie = `${C15T_STORAGE_KEY}=${grant()}; path=/`;
		document.cookie = `${C15T_STORAGE_KEY}-notice=${notice}; path=/`;
		document.cookie = `${C15T_STORAGE_KEY}-vendors=${vendors}; path=/`;
		localStorage.setItem(`${C15T_STORAGE_KEY}-epoch`, String(NOW - 500));
		const stored = readStoredRecords(undefined, NOW);
		expect(stored.found).toBe(false);
		expect(stored.records.choice).toBeNull();
		expect(stored.records.subject).toBeNull();
	});

	test('keeps a c15t record written after c15t-epoch', () => {
		const header = `${C15T_STORAGE_KEY}=${grant()}; ${C15T_STORAGE_KEY}-epoch=${NOW - 2000}`;
		expect(
			readStoredRecordsFromCookieHeader(header, undefined, NOW).choice
		).toEqual(explicitChoice({ marketing: true }));
	});

	test('never voids an Inth record', () => {
		const header = `${STORAGE_KEY_V2}=${grant()}; ${STORAGE_KEY_V2}-notice=${notice}; ${c15tEpoch}`;
		const records = readStoredRecordsFromCookieHeader(header, undefined, NOW);
		expect(records.choice).toEqual(explicitChoice({ marketing: true }));
		expect(records.noticeDismissal?.dismissedAt).toBe(NOW - 1000);
	});
});

describe('hydrateFromStorage', () => {
	const same = (records: HydrationRecords) => records;

	test('returns null without storage APIs', () => {
		const originalDocument = globalThis.document;
		vi.stubGlobal('document', undefined);
		try {
			expect(
				hydrateFromStorage(createConsentKernel(), undefined, NOW, same)
			).toBeNull();
		} finally {
			vi.stubGlobal('document', originalDocument);
		}
	});

	test('applies stored records through kernel.hydrate without a choice event', () => {
		setCookie(
			STORAGE_KEY_V2,
			encodeV2Cookie({
				consentInfo: { subjectId: 'legacy-cookie', time: NOW - 5000 },
				consents: { marketing: true, necessary: true },
			})
		);
		const kernel = createConsentKernel({ now: NOW });
		const choiceRecorded = vi.fn();
		const permissions = vi.fn();
		kernel.events.on('choice:recorded', choiceRecorded);
		kernel.events.on('permissions:changed', permissions);

		const stored = hydrateFromStorage(kernel, undefined, NOW, same);
		expect(stored?.found).toBe(true);
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(kernel.getSnapshot().subject?.subjectId ?? null).toBe(
			'legacy-cookie'
		);
		expect(
			Object.keys(kernel.getSnapshot().explicitChoice?.categories ?? {})
		).not.toHaveLength(0);
		expect(choiceRecorded).not.toHaveBeenCalled();
		expect(permissions).toHaveBeenCalledTimes(1);
	});
});
