/**
 * The init script (`inth.js`) from source, in jsdom: what its stand-in
 * does when `/v1/consent/init` owes a banner, with a choice made before
 * the engine, and with `dispose()` before the engine arrives. The built
 * files run in Chromium in `init-script.browser.test.ts`.
 */
import {
	policyRulePresets,
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@inth/sdk-schema/types';
import { enTranslations } from '@inth/sdk-translations';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	ENGINE_TIMEOUT_MS,
	PREFETCH_WINDOW_KEY,
} from '../../../core/src/libs/page-globals';
import { PENDING_SAVES_STORAGE_KEY } from '../../../core/src/libs/storage-keys';
import type { GlobalApiBase } from '../create-global-with';
import { autoInit, createGlobal, installGlobal } from '../global';
import { releaseBoot } from '../init/adopt-boot';
import type { InitBoot } from '../init/read-boot';
import { runInitScript } from '../init/run-init-script';
import { version } from '../version';

const OWN_SRC = 'https://cdn.example/npm/@inth/sdk/lib/browser/dist/inth.js';
const BACKEND_URL = 'https://consent.example';

type StandIn = GlobalApiBase & { __inthBoot: InitBoot };

const target = window as unknown as Record<string, unknown>;

/** The `/v1/consent/init` answer: an opt-in policy for measurement and marketing. */
const initBody = () => ({
	branding: 'inth',
	location: { countryCode: 'DE', regionCode: null },
	policyResolution: writePolicyResolutionWire(
		resolvePolicyRules({
			rules: [
				{
					...policyRulePresets.europeOptIn(),
					categories: ['measurement', 'marketing'],
					match: { isDefault: true },
					scopeMode: 'strict',
				},
			],
		})
	),
	translations: { language: 'en', translations: enTranslations },
});

/** Settles the `/v1/consent/init` request the init script started. */
let answerInit: {
	resolve: (body: unknown) => void;
	reject: () => void;
};

const tag = () => {
	const script = document.createElement('script');
	script.setAttribute('src', OWN_SRC);
	script.setAttribute('data-project-url', BACKEND_URL);
	return script;
};

/** Runs the init script over `queued`, the page's `window.inth` array. */
const start = (queued: unknown[] = []): StandIn => {
	target.inth = queued;
	return runInitScript(tag()) as unknown as StandIn;
};

const loaded = (file: string) =>
	[...document.head.querySelectorAll('script')]
		.map(({ src }) => src)
		.filter((src) => src.includes(file));

const settle = () =>
	new Promise((resolve) => {
		setTimeout(resolve, 10);
	});

const queuedSaves = (): unknown[] =>
	JSON.parse(localStorage.getItem(PENDING_SAVES_STORAGE_KEY) ?? '[]');

const storedChoice = () =>
	JSON.parse(localStorage.getItem('inth') ?? 'null') as {
		categories?: Record<string, { value: boolean }>;
	} | null;

/** The calls the init script queued for the engine, without the page's config. */
const queuedForEngine = (standIn: StandIn) =>
	standIn.__inthBoot.calls.filter(([method]) => method !== 'config');

beforeEach(() => {
	// The init script runs while the page is still parsing: the engine
	// loads on input, after the priority images or on the timer, not now.
	vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
	vi.stubGlobal(
		'fetch',
		vi.fn(
			(input: RequestInfo | URL) =>
				new Promise((resolve, reject) => {
					if (!String(input).startsWith(`${BACKEND_URL}/v1/consent/init`)) {
						reject(new Error(`unexpected request: ${String(input)}`));
						return;
					}
					answerInit = {
						reject: () => reject(new Error('offline')),
						resolve: (body) =>
							resolve({
								headers: { get: () => null },
								json: () => Promise.resolve(body),
								ok: true,
								status: 200,
							}),
					};
				})
		)
	);
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	releaseBoot();
	delete target.inth;
	Reflect.deleteProperty(target, PREFETCH_WINDOW_KEY);
	localStorage.clear();
	sessionStorage.clear();
	for (const cookie of document.cookie.split(';')) {
		const name = cookie.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	}
	document.head.replaceChildren();
	document.body.replaceChildren();
});

const preloaded = (file: string) =>
	[...document.head.querySelectorAll<HTMLLinkElement>('link[rel="preload"]')]
		.filter(({ href }) => href.includes(file))
		.map((link) => ({ as: link.as, href: link.href, nonce: link.nonce }));

describe('a banner owed before the engine', () => {
	it('renders nothing, and fetches the engine and the consent UI side by side', async () => {
		const standIn = start([['config', { nonce: 'n0nce' }]]);
		expect(loaded('inth.hosted.js')).toEqual([]);

		answerInit.resolve(initBody());
		await vi.waitFor(() => {
			expect(loaded('inth.hosted.js')).toHaveLength(1);
		});

		expect(document.querySelector('[data-inth-ui]')).toBeNull();
		// Next to `inth.hosted.js`, where the engine looks for it.
		expect(preloaded('inth.choices.js')).toEqual([
			{
				as: 'script',
				href: new URL(`inth.choices.js?v=${version}`, OWN_SRC).href,
				nonce: 'n0nce',
			},
		]);
		expect(standIn.getSnapshot().activeUI).toBe('banner');
		// The engine stamps the impression when it renders the banner.
		expect(standIn.getSnapshot().surfaceShownAt.banner).toBeNull();
		standIn.dispose();
	});

	it('fetches no consent UI when the page turns the banner off', async () => {
		const standIn = start([['config', { ui: { banner: false } }]]);
		answerInit.resolve(initBody());
		await vi.waitFor(() => {
			expect(loaded('inth.hosted.js')).toHaveLength(1);
		});
		expect(preloaded('inth.choices.js')).toEqual([]);
		standIn.dispose();
	});

	it.each(['acceptAll', 'rejectAll'] as const)(
		'leaves %s to the engine, which records it once it has loaded',
		async (method) => {
			const onChoiceRecorded = vi.fn();
			const standIn = start([['config', { callbacks: { onChoiceRecorded } }]]);
			answerInit.resolve(initBody());
			await vi.waitFor(() => {
				expect(loaded('inth.hosted.js')).toHaveLength(1);
			});

			const saved = standIn[method]() as Promise<unknown>;

			// Nothing commits before the engine is ready.
			expect(queuedForEngine(standIn).map(([name]) => name)).toEqual([method]);
			expect(storedChoice()).toBeNull();
			expect(queuedSaves()).toEqual([]);
			expect(onChoiceRecorded).not.toHaveBeenCalled();
			standIn.dispose();
			// What waits for the engine is rejected when the page disposes first.
			await expect(saved).rejects.toThrow(/dispose\(\) ran before/u);
		}
	);
});

describe('options the stand-in cannot serve', () => {
	it('loads the engine at once for a network blocker, unless it is turned off', () => {
		const blocking = start([['config', { networkBlocker: { rules: [] } }]]);
		expect(loaded('inth.hosted.js')).toHaveLength(1);
		blocking.dispose();
		document.head.replaceChildren();

		const off = start([
			['config', { networkBlocker: { enabled: false, rules: [] } }],
		]);
		expect(loaded('inth.hosted.js')).toEqual([]);
		off.dispose();
	});
});

describe('dispose() before the engine', () => {
	it('loads the engine at the first input until then', () => {
		start();
		window.dispatchEvent(new Event('pointerdown'));
		expect(loaded('inth.hosted.js')).toHaveLength(1);
	});

	it('stops input, scrolling and the timer from loading the engine', () => {
		vi.useFakeTimers();
		const standIn = start();

		standIn.dispose();
		window.dispatchEvent(new Event('pointerdown'));
		window.dispatchEvent(new Event('keydown'));
		window.dispatchEvent(new Event('scroll'));
		vi.advanceTimersByTime(ENGINE_TIMEOUT_MS + 1);

		expect(loaded('inth.hosted.js')).toEqual([]);
		expect(standIn.__inthBoot.disposed).toBe(true);
	});

	it('reads nothing from a /init answer that lands after it', async () => {
		const standIn = start();

		standIn.dispose();
		answerInit.resolve(initBody());
		await settle();

		expect(document.querySelector('[data-inth-ui]')).toBeNull();
		expect(() => standIn.getSnapshot()).toThrow(/init/u);
		expect(standIn.__inthBoot.prefetch).toBeNull();
		expect(loaded('inth.hosted.js')).toEqual([]);
	});

	it('loads the engine for a later init(), which starts from the queued call', () => {
		const standIn = start();
		standIn.dispose();
		expect(loaded('inth.hosted.js')).toEqual([]);

		standIn.init();

		expect(loaded('inth.hosted.js')).toHaveLength(1);
		expect(standIn.__inthBoot.calls).toEqual([['init']]);
		expect(standIn.__inthBoot.disposed).toBe(false);
	});

	it('leaves an engine that still arrives without a client', async () => {
		const standIn = start();
		standIn.dispose();

		const api = installGlobal(createGlobal({ pkg: '@inth/sdk' }));
		// Waits for the init script's `/v1/consent/init` to settle, as the engine does.
		expect(autoInit(api)).toBeNull();
		answerInit.reject();
		await vi.waitFor(() => {
			expect(target.inth).toBe(api);
		});
		await settle();

		expect(api.client).toBeNull();
		expect(document.querySelector('[data-inth-ui]')).toBeNull();
		expect(standIn.__inthBoot.disposed).toBe(true);
		api.dispose();
	});
});

describe('an opt-out page action before the engine loads', () => {
	it('queues optOut and loads the engine for a data-inth-action="opt-out" link before the engine loads', () => {
		const standIn = start();
		const link = document.createElement('a');
		link.href = '#';
		link.setAttribute('data-inth-action', 'opt-out');
		document.body.append(link);

		link.click();

		expect(queuedForEngine(standIn).map(([method]) => method)).toEqual([
			'optOut',
		]);
		expect(loaded('inth.hosted.js')).toHaveLength(1);
		standIn.dispose();
	});
});
