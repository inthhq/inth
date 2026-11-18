// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { PREFETCH_WINDOW_KEY } from '../page-globals';
import {
	buildStaticBannerScript,
	STATIC_BANNER_ATTR,
	staticBannerCopyHash,
} from '../static-banner';
import { storedChoiceNames } from '../storage-keys';

const COPY = {
	common: {
		acceptAll: 'Accept All',
		customize: 'Customize',
		rejectAll: 'Reject All',
		securedBy: 'Secured by',
	},
	cookieBanner: {
		description: 'This site uses cookies.',
		title: 'We value your privacy',
	},
};

const KEY = {
	branding: 'inth',
	copy: staticBannerCopyHash(COPY),
	language: 'en',
	policy: 'policy-fingerprint',
};

const answer = (changes: Record<string, unknown> = {}) => ({
	init: {
		branding: 'inth',
		policyResolution: {
			fingerprints: { policy: 'policy-fingerprint' },
			status: 'matched',
		},
		translations: { language: 'en', translations: COPY },
		...changes,
	},
	producerPolicyContract: '1',
});

const names = storedChoiceNames();
const stored = [...names.choice, ...names.notice];

/**
 * Puts the static banner and its script in the page and runs the script as
 * the parser would, with `document.currentScript` set.
 */
const mount = (prefetch: Promise<unknown> | undefined) => {
	const win = window as unknown as Record<string, unknown>;
	win[PREFETCH_WINDOW_KEY] = prefetch
		? { 'https://consent.example.com/init|same-origin': { promise: prefetch } }
		: undefined;
	const banner = document.createElement('div');
	banner.setAttribute(STATIC_BANNER_ATTR, '');
	banner.hidden = true;
	banner.innerHTML = '<div data-testid="consent-banner-root"></div>';
	const script = document.createElement('script');
	// jsdom would run a classic script on insertion, in its own window;
	// this test runs it below, with `currentScript` set.
	script.type = 'text/x-static-banner';
	script.textContent = buildStaticBannerScript(KEY, stored);
	document.body.append(banner, script);
	const parsing = new Proxy(document, {
		get: (target, key) => {
			if (key === 'currentScript') {
				return script;
			}
			const value = (target as unknown as Record<PropertyKey, unknown>)[key];
			return typeof value === 'function' ? value.bind(target) : value;
		},
	});
	// oxlint-disable-next-line no-new-func -- Runs the inline script's text.
	new Function('window', 'document', script.textContent)(window, parsing);
	return banner;
};

const settle = () =>
	new Promise((resolve) => {
		setTimeout(resolve, 0);
	});

beforeEach(() => {
	// The package setup's storage mock loses its implementation between
	// tests; the script needs `getItem` to answer `null` for a missing key.
	const store = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => store.set(key, value),
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
	document.body.innerHTML = '';
	document.cookie = 'inth=; max-age=0';
});

describe('static banner script', () => {
	test('shows the banner when /init answers with its policy and copy', async () => {
		const banner = mount(Promise.resolve(answer()));
		expect(banner.hidden).toBe(true);
		await settle();
		expect(banner.isConnected).toBe(true);
		expect(banner.hidden).toBe(false);
	});

	test('a returning visitor with a consent cookie never sees it', async () => {
		document.cookie = 'inth=stored-record';
		let answered: (value: unknown) => void = () => undefined;
		const banner = mount(
			new Promise((resolve) => {
				answered = resolve;
			})
		);
		// Gone before /init answers, so no frame shows it.
		expect(banner.isConnected).toBe(false);
		answered(answer());
		await settle();
		expect(banner.hidden).toBe(true);
	});

	test('a stored notice dismissal counts as a returning visitor', () => {
		localStorage.setItem('inth-notice', '1');
		expect(mount(Promise.resolve(answer())).isConnected).toBe(false);
	});

	test('a choice c15t stored counts as a returning visitor', () => {
		document.cookie = 'c15t=stored-record';
		try {
			expect(mount(Promise.resolve(answer())).isConnected).toBe(false);
		} finally {
			document.cookie = 'c15t=; max-age=0';
		}
	});

	test.each([
		[
			'another policy',
			{
				policyResolution: {
					fingerprints: { policy: 'other' },
					status: 'matched',
				},
			},
		],
		[
			'another language',
			{ translations: { language: 'de', translations: COPY } },
		],
		[
			'other copy',
			{
				translations: {
					language: 'en',
					translations: {
						...COPY,
						cookieBanner: { ...COPY.cookieBanner, title: 'Cookies' },
					},
				},
			},
		],
		['other branding', { branding: 'c15t' }],
		['vendors', { vendors: [{ id: 'x' }] }],
	])('removes the banner when /init answers with %s', async (_, changes) => {
		const banner = mount(Promise.resolve(answer(changes)));
		await settle();
		expect(banner.isConnected).toBe(false);
	});

	test('removes the banner when /init fails or the page has no prefetch', async () => {
		// The prefetch script's own promise never rejects; this one does.
		const rejected = Promise.reject(new Error('offline'));
		rejected.catch(() => undefined);
		const failed = mount(rejected);
		await settle();
		expect(failed.isConnected).toBe(false);
		expect(mount(undefined).isConnected).toBe(false);
	});

	test('a choice stored while /init was in flight keeps it hidden', async () => {
		const banner = mount(
			Promise.resolve().then(() => {
				document.cookie = 'inth=stored-in-another-tab';
				return answer();
			})
		);
		await settle();
		expect(banner.isConnected).toBe(false);
	});
});
