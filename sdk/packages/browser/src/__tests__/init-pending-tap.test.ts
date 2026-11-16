/**
 * The init script's pieces that decide what the engine does next: the
 * marker for a tap that was never stored, and whether `/init` sent enough
 * copy for the init script's banner.
 */
import type { ConsentSnapshot } from '@c15t/core';
import { enTranslations } from '@c15t/translations';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { hasBannerCopy, resolveCopy } from '../init/copy';
import {
	PENDING_TAP_KEY,
	readPendingTap,
	recordPendingTap,
	writePendingTap,
} from '../init/pending-tap';
import type { ConsentClient } from '../types';

const snapshotWith = (
	overrides: {
		activeUI?: string;
		fingerprint?: string;
		maxAgeMs?: number | null;
		translations?: unknown;
	} = {}
) =>
	({
		activeUI: overrides.activeUI ?? 'banner',
		evaluationPolicy: {
			choice: {
				fingerprint: overrides.fingerprint ?? 'fp-1',
				maxAgeMs: overrides.maxAgeMs ?? null,
			},
		},
		translations:
			overrides.translations === undefined
				? { language: 'en', translations: enTranslations }
				: overrides.translations,
	}) as unknown as ConsentSnapshot;

const clientWith = (snapshot: ConsentSnapshot) => {
	const client = {
		acceptAll: vi.fn(() => Promise.resolve({ ok: true })),
		ready: vi.fn(() => Promise.resolve(snapshot)),
		rejectAll: vi.fn(() => Promise.resolve({ ok: true })),
	};
	return client as typeof client & ConsentClient;
};

const settle = () =>
	new Promise((resolve) => {
		setTimeout(resolve, 0);
	});

afterEach(() => {
	localStorage.clear();
});

describe('recordPendingTap', () => {
	it('records a tap once while the banner is due under the same policy', async () => {
		writePendingTap('none', snapshotWith(), Date.now());
		const client = clientWith(snapshotWith());

		recordPendingTap(client);
		await settle();

		expect(client.rejectAll).toHaveBeenCalledTimes(1);
		expect(client.acceptAll).not.toHaveBeenCalled();
		expect(localStorage.getItem(PENDING_TAP_KEY)).toBeNull();
		recordPendingTap(client);
		await settle();
		expect(client.rejectAll).toHaveBeenCalledTimes(1);
	});

	it('drops a tap made under another policy, or once no banner is due', async () => {
		const check = async (snapshot: ConsentSnapshot): Promise<void> => {
			writePendingTap('all', snapshotWith(), Date.now());
			const client = clientWith(snapshot);
			recordPendingTap(client);
			await settle();
			expect(client.acceptAll).not.toHaveBeenCalled();
			expect(readPendingTap()).toBeNull();
		};
		await check(snapshotWith({ fingerprint: 'fp-2' }));
		await check(snapshotWith({ activeUI: 'none' }));
	});

	it('drops a tap older than the policy’s choice lifetime', async () => {
		writePendingTap('all', snapshotWith(), Date.now() - 2000);
		const client = clientWith(snapshotWith({ maxAgeMs: 1000 }));
		recordPendingTap(client);
		await settle();
		expect(client.acceptAll).not.toHaveBeenCalled();
		expect(readPendingTap()).toBeNull();
	});

	it('does nothing without a marker, or with one it cannot read', async () => {
		localStorage.setItem(PENDING_TAP_KEY, '{"c":"maybe"}');
		const client = clientWith(snapshotWith());
		recordPendingTap(client);
		await settle();
		expect(client.ready).not.toHaveBeenCalled();
	});
});

describe('init script copy', () => {
	it('renders from /init copy that holds every banner string', () => {
		const snapshot = snapshotWith();
		expect(hasBannerCopy(snapshot)).toBe(true);
		expect(resolveCopy(snapshot).t.cookieBanner.title).toBe(
			enTranslations.cookieBanner.title
		);
	});

	it('leaves the banner to the engine when /init copy lacks a string', () => {
		const { securedBy: _securedBy, ...common } = enTranslations.common;
		expect(
			hasBannerCopy(
				snapshotWith({
					translations: {
						language: 'en',
						translations: { ...enTranslations, common },
					},
				})
			)
		).toBe(false);
		expect(hasBannerCopy(snapshotWith({ translations: null }))).toBe(false);
	});
});
