import { canonicalizePolicySurface } from '@inth/sdk-schema/types';
import type { PolicySurface } from '@inth/sdk-schema/types';
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { PREFETCH_WINDOW_KEY } from '../page-globals';
import {
	buildStaticBannerScript,
	STATIC_BANNER_ATTR,
	staticBannerCopyHash,
	SURFACE_LAYOUT_CHECK,
} from '../static-banner';
import type { StaticBannerKey } from '../static-banner';
import { storedChoiceNames } from '../storage-keys';

const COPY = {
	common: {
		acceptAll: 'Accept All',
		customize: 'Customize',
		rejectAll: 'Reject All',
		securedBy: 'Consent by',
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
});

const names = storedChoiceNames();
const stored = [...names.choice, ...names.notice];

/**
 * Puts the static banner and its script in the page and runs the script as
 * the parser would, with `document.currentScript` set.
 */
const mount = (
	prefetch: Promise<unknown> | undefined,
	bannerKey: StaticBannerKey = KEY
) => {
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
	script.textContent = buildStaticBannerScript(bannerKey, stored);
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
		[
			'a policy whose surface asks for another layout',
			{
				policyResolution: {
					fingerprints: {
						policy: 'policy-fingerprint',
						presentation: 'drawer-layout',
					},
					status: 'matched',
				},
			},
		],
		[
			'a policy surface without its presentation fingerprint',
			{
				policyResolution: {
					fingerprints: { policy: 'policy-fingerprint' },
					policy: { surface: { container: { type: 'drawer' } } },
					status: 'matched',
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

	test('shows the banner when /init answers with its policy and layout', async () => {
		const banner = mount(
			Promise.resolve(
				answer({
					policyResolution: {
						fingerprints: {
							policy: 'policy-fingerprint',
							presentation: 'drawer-layout',
						},
						status: 'matched',
					},
				})
			),
			{ ...KEY, presentation: 'drawer-layout' }
		);
		await settle();
		expect(banner.hidden).toBe(false);
	});

	test('removes a banner rendered for a layout when /init answers without one', async () => {
		const banner = mount(Promise.resolve(answer()), {
			...KEY,
			presentation: 'drawer-layout',
		});
		await settle();
		expect(banner.isConnected).toBe(false);
	});

	test('shows the banner when /init answers with an empty surface and no layout', async () => {
		const banner = mount(
			Promise.resolve(
				answer({
					policyResolution: {
						fingerprints: { policy: 'policy-fingerprint' },
						policy: { surface: {} },
						status: 'matched',
					},
				})
			)
		);
		await settle();
		expect(banner.hidden).toBe(false);
	});

	test.each([
		['opt-out', 'choice', { blocking: 'forbidden' }],
		['opt-in', 'choice', { blocking: 'allowed' }],
		['opt-in', 'notice', { blocking: 'forbidden' }],
	] as const)(
		'shows the banner when an %s %s policy has only the implied surface %j',
		async (model, prompt, surface) => {
			const banner = mount(
				Promise.resolve(
					answer({
						policyResolution: {
							fingerprints: { policy: 'policy-fingerprint' },
							policy: { model, prompt, surface },
							status: 'matched',
						},
					})
				)
			);
			await settle();
			expect(banner.hidden).toBe(false);
		}
	);

	test('removes the banner when a policy asks for blocking it does not imply, without a layout fingerprint', async () => {
		const banner = mount(
			Promise.resolve(
				answer({
					policyResolution: {
						fingerprints: { policy: 'policy-fingerprint' },
						policy: {
							model: 'opt-in',
							prompt: 'choice',
							surface: { blocking: 'required' },
						},
						status: 'matched',
					},
				})
			)
		);
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

describe('SURFACE_LAYOUT_CHECK', () => {
	// oxlint-disable-next-line no-new-func -- Evaluates the inline source.
	const check = new Function(`return ${SURFACE_LAYOUT_CHECK}`)() as (
		policy: unknown
	) => boolean;
	const rules = [
		{ model: 'opt-in', prompt: 'choice' },
		{ model: 'opt-out', prompt: 'choice' },
		{ model: 'opt-in', prompt: 'notice' },
		{ model: 'opt-out', prompt: 'none' },
	] as const;
	const surfaces: PolicySurface[] = [
		{},
		{ blocking: 'allowed' },
		{ blocking: 'forbidden' },
		{ blocking: 'required' },
		{ edgeStyle: 'flush' },
		{ container: { type: 'card' } },
		{ container: { position: 'end', type: 'card' }, edgeStyle: 'flush' },
		{ blocking: 'forbidden', container: { edge: 'top', type: 'banner' } },
		{ container: { side: 'start', type: 'drawer' }, edgeStyle: 'inset' },
	];

	test.each(
		rules.flatMap((rule) => surfaces.map((surface) => [rule, surface] as const))
	)('matches the canonical surface for %j with %j', (rule, surface) => {
		expect(check({ ...rule, surface })).toBe(
			canonicalizePolicySurface(surface, rule) !== undefined
		);
	});

	test('a policy without a surface asks for no layout', () => {
		expect(check(undefined)).toBe(false);
		expect(check({ model: 'opt-in', prompt: 'choice' })).toBe(false);
	});
});
