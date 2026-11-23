import type { UserConsent } from '@inth/sdk-schema/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createGlobal, installGlobal } from '../global';
import type { GlobalApi } from '../global';
import { testing } from '../testing';

type TestWindow = Window & {
	inth?: unknown;
};

const testWindow = window as TestWindow;
const NOW = 1_800_000_000_000;

const clearBrowserStorage = () => {
	window.localStorage.clear();
	for (const entry of document.cookie.split(';')) {
		const name = entry.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	}
};

beforeEach(() => {
	clearBrowserStorage();
	vi.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
	delete testWindow.inth;
	clearBrowserStorage();
	vi.restoreAllMocks();
});

describe('window.inth.syncUserConsent and ScriptTagClientOptions.userConsent', () => {
	it('syncs a UserConsent document directly and via queued window.inth.push', async () => {
		const rule = {
			id: 'eu-opt-in',
			match: { isDefault: true },
			model: 'opt-in' as const,
			prompt: 'choice' as const,
		};

		const api: GlobalApi = installGlobal(createGlobal({ pkg: '@inth/sdk' }));
		const client = api.init({
			consentCategories: [
				'functionality',
				'experience',
				'measurement',
				'marketing',
			],
			mode: testing({ policy: [rule] }).transport,
			ui: false,
			user: { externalId: 'user_script' },
		});
		const ready = await api.ready();
		const fp = ready.evaluationPolicy.choice.fingerprint;

		const doc: UserConsent = {
			categories: { marketing: true },
			optOut: null,
			sync: {
				checkedAt: NOW,
				choices: {
					marketing: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW - 1000,
						value: true,
					},
				},
				externalId: 'user_script',
				optOut: null,
				vendors: {},
			},
		};

		await api.syncUserConsent(doc);
		expect(api.has('marketing')).toBe(true);

		// Clearing with null via window.inth.push(['syncUserConsent', null]) drops the account layer.
		api.push(['syncUserConsent', null]);
		await vi.waitFor(() => expect(api.has('marketing')).toBe(false));
		client.dispose();
	});

	it('accepts userConsent on ScriptTagClientOptions at init()', async () => {
		const rule = {
			id: 'us-opt-out',
			match: { isDefault: true },
			model: 'opt-out' as const,
			prompt: 'choice' as const,
		};

		const api: GlobalApi = installGlobal(createGlobal({ pkg: '@inth/sdk' }));
		const client = api.init({
			consentCategories: [
				'functionality',
				'experience',
				'measurement',
				'marketing',
			],
			mode: testing({ policy: [rule] }).transport,
			ui: false,
			user: { externalId: 'user_init' },
			userConsent: {
				categories: { marketing: false },
				optOut: null,
				sync: {
					checkedAt: NOW,
					choices: {
						marketing: {
							basis: { fingerprint: 'any-fp', kind: 'choice-v1' },
							confirmedAt: NOW - 1000,
							value: false,
						},
					},
					externalId: 'user_init',
					optOut: null,
					vendors: {},
				},
			},
		});
		await api.ready();
		expect(api.has('marketing')).toBe(false);
		client.dispose();
	});
});
