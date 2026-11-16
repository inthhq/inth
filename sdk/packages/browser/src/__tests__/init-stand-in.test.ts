/**
 * The init script (`c15t.js`) from source, in jsdom: what its stand-in
 * does with a tap whose save the outbox cannot keep, and with `dispose()`
 * before the engine arrives. The built files run in Chromium in
 * `init-script.browser.test.ts`.
 */
import type { SaveResult } from '@c15t/core';
import {
	planEarlyCommit,
	storeEarlyCommit,
} from '@c15t/core/surface-actions/early-commit';
import {
	policyRulePresets,
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@c15t/schema/types';
import { enTranslations } from '@c15t/translations';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PREFETCH_WINDOW_KEY } from '../../../core/src/libs/prefetch/window-key';
import { PENDING_SAVES_STORAGE_KEY } from '../../../core/src/libs/storage-keys';
import { autoInit, createGlobal, installGlobal } from '../global';
import type { C15tGlobalBase } from '../global-base';
import { releaseBoot } from '../init/adopt';
import type { InitBoot } from '../init/boot';
import { runInitScript } from '../init/run';
import { ENGINE_TIMEOUT_MS } from '../init/schedule';
import { version } from '../version';

const OWN_SRC = 'https://cdn.example/npm/@c15t/browser/dist/c15t.js';
const BACKEND_URL = 'https://consent.example';

type StandIn = C15tGlobalBase & { __c15tBoot: InitBoot };

const target = window as unknown as Record<string, unknown>;

/** The `/init` answer: an opt-in policy for measurement and marketing. */
const initBody = () => ({
	branding: 'c15t',
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

/** Settles the `/init` request the init script started. */
let answerInit: {
	resolve: (body: unknown) => void;
	reject: () => void;
};

const tag = () => {
	const script = document.createElement('script');
	script.setAttribute('src', OWN_SRC);
	script.setAttribute('data-backend-url', BACKEND_URL);
	return script;
};

/** Runs the init script over `queued`, the page's `window.c15t` array. */
const start = (queued: unknown[] = []): StandIn => {
	target.c15t = queued;
	return runInitScript(tag()) as unknown as StandIn;
};

const loaded = (file: string) =>
	[...document.head.querySelectorAll('script')]
		.map(({ src }) => src)
		.filter((src) => src.includes(file));

const banner = () =>
	document
		.querySelector('[data-c15t-ui]')
		?.shadowRoot?.querySelector('[data-testid="consent-banner-root"]') ?? null;

const settle = () =>
	new Promise((resolve) => {
		setTimeout(resolve, 10);
	});

/** Answers `/init` and waits for the init script's banner. */
const showBanner = async () => {
	answerInit.resolve(initBody());
	await vi.waitFor(() => {
		expect(banner()).not.toBeNull();
	});
};

/** Hands the init script `c15t.commit.js`, as the file does when it runs. */
const provideCommit = (standIn: StandIn) => {
	standIn.__c15tBoot.provide({
		name: 'commit',
		planEarlyCommit,
		storeEarlyCommit,
		version,
	});
	document.head
		.querySelector('script[src*="c15t.commit.js"]')
		?.dispatchEvent(new Event('load'));
};

/** Blocked or full storage for the outbox's key only. */
const refuseOutboxWrites = () => {
	const { setItem } = Storage.prototype;
	vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function refuse(
		this: Storage,
		key: string,
		value: string
	) {
		if (key === PENDING_SAVES_STORAGE_KEY) {
			throw new DOMException(
				'The quota has been exceeded.',
				'QuotaExceededError'
			);
		}
		setItem.call(this, key, value);
	});
};

const queuedSaves = (): unknown[] =>
	JSON.parse(localStorage.getItem(PENDING_SAVES_STORAGE_KEY) ?? '[]');

const storedChoice = () =>
	JSON.parse(localStorage.getItem('c15t') ?? 'null') as {
		categories?: Record<string, { value: boolean }>;
	} | null;

/** The calls the init script queued for the engine, without the page's config. */
const queuedForEngine = (standIn: StandIn) =>
	standIn.__c15tBoot.calls.filter(([method]) => method !== 'config');

beforeEach(() => {
	// The init script runs while the page is still parsing: the engine
	// loads on input, after the priority images or on the timer, not now.
	vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
	vi.stubGlobal(
		'fetch',
		vi.fn(
			(input: RequestInfo | URL) =>
				new Promise((resolve, reject) => {
					if (!String(input).startsWith(`${BACKEND_URL}/init`)) {
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
	delete target.c15t;
	Reflect.deleteProperty(target, PREFETCH_WINDOW_KEY);
	localStorage.clear();
	for (const cookie of document.cookie.split(';')) {
		const name = cookie.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	}
	document.head.replaceChildren();
	document.body.replaceChildren();
});

describe('the banner before the engine', () => {
	it('announces its impression once, and hands the stamp to the engine', async () => {
		const onSurfaceShown = vi.fn();
		const standIn = start([['config', { callbacks: { onSurfaceShown } }]]);
		await showBanner();

		expect(onSurfaceShown).toHaveBeenCalledTimes(1);
		const [impression] = onSurfaceShown.mock.calls[0] as [
			{ shownAt: number; surface: string },
		];
		expect(impression.surface).toBe('banner');
		const shownAt = standIn.getSnapshot().surfaceShownAt.banner;
		expect(shownAt).toBe(impression.shownAt);
		// The engine starts from the stamp instead of stamping its own.
		expect(standIn.__c15tBoot.prefetch?.config.initialSurfaceShownAt).toEqual({
			banner: shownAt,
			dialog: null,
		});
		// Nothing loaded the engine: stop the input listener that would.
		standIn.dispose();
	});
});

describe('a tap recorded before the engine', () => {
	it('times the choice from the banner impression', async () => {
		const standIn = start();
		await showBanner();
		const shownAt = standIn.getSnapshot().surfaceShownAt.banner as number;

		const saved = standIn.acceptAll() as Promise<SaveResult>;
		provideCommit(standIn);
		await expect(saved).resolves.toMatchObject({ ok: true });

		const [queued] = queuedSaves() as [
			{ payload: { timeToDecisionMs?: number; uiSource?: string } },
		];
		const save = queued.payload;
		expect(save.uiSource).toBe('banner');
		expect(save.timeToDecisionMs).toBeTypeOf('number');
		expect(save.timeToDecisionMs).toBeGreaterThanOrEqual(0);
		expect(save.timeToDecisionMs).toBeLessThanOrEqual(Date.now() - shownAt);
	});

	it('announces the choice once its save is queued, then loads the engine', async () => {
		let queuedWhenHeard: unknown[] | undefined;
		const onChoiceRecorded = vi.fn(() => {
			queuedWhenHeard = queuedSaves();
		});
		const onPermissionsChanged = vi.fn();
		const standIn = start([
			['config', { callbacks: { onChoiceRecorded, onPermissionsChanged } }],
		]);
		await showBanner();
		expect(loaded('c15t.hosted.js')).toEqual([]);

		const saved = standIn.acceptAll() as Promise<SaveResult>;
		provideCommit(standIn);

		await expect(saved).resolves.toMatchObject({ ok: true });
		expect(onChoiceRecorded).toHaveBeenCalledTimes(1);
		expect(onPermissionsChanged).toHaveBeenCalledTimes(1);
		// Heard after the write, not before it.
		expect(queuedWhenHeard).toHaveLength(1);
		expect(queuedSaves()).toHaveLength(1);
		expect(storedChoice()?.categories).toMatchObject({
			marketing: { value: true },
		});
		// Nothing for the engine to record again.
		expect(queuedForEngine(standIn)).toEqual([]);
		expect(loaded('c15t.hosted.js')).toHaveLength(1);
	});

	it.each([
		['acceptAll', true],
		['rejectAll', false],
	] as const)(
		'hands %s to the engine when the outbox cannot keep its save',
		async (method, granted) => {
			const onChoiceRecorded = vi.fn();
			const onPermissionsChanged = vi.fn();
			const standIn = start([
				['config', { callbacks: { onChoiceRecorded, onPermissionsChanged } }],
			]);
			await showBanner();
			refuseOutboxWrites();

			const saved = standIn[method]() as Promise<SaveResult>;
			provideCommit(standIn);

			// The tap resolves and the record is stored, but no save is queued.
			await expect(saved).resolves.toMatchObject({ ok: true });
			expect(storedChoice()?.categories).toMatchObject({
				marketing: { value: granted },
			});
			expect(queuedSaves()).toEqual([]);
			// The engine records the tap itself and announces it once.
			expect(queuedForEngine(standIn)).toEqual([[method]]);
			expect(onChoiceRecorded).not.toHaveBeenCalled();
			expect(onPermissionsChanged).not.toHaveBeenCalled();
			expect(loaded('c15t.hosted.js')).toHaveLength(1);
		}
	);
});

describe('options the stand-in cannot serve', () => {
	it('loads the engine at once for a network blocker, unless it is turned off', () => {
		const blocking = start([['config', { networkBlocker: { rules: [] } }]]);
		expect(loaded('c15t.hosted.js')).toHaveLength(1);
		blocking.dispose();
		document.head.replaceChildren();

		const off = start([
			['config', { networkBlocker: { enabled: false, rules: [] } }],
		]);
		expect(loaded('c15t.hosted.js')).toEqual([]);
		off.dispose();
	});
});

describe('dispose() before the engine', () => {
	it('loads the engine at the first input until then', () => {
		start();
		window.dispatchEvent(new Event('pointerdown'));
		expect(loaded('c15t.hosted.js')).toHaveLength(1);
	});

	it('stops input, scrolling and the timer from loading the engine', () => {
		vi.useFakeTimers();
		const standIn = start();

		standIn.dispose();
		window.dispatchEvent(new Event('pointerdown'));
		window.dispatchEvent(new Event('keydown'));
		window.dispatchEvent(new Event('scroll'));
		vi.advanceTimersByTime(ENGINE_TIMEOUT_MS + 1);

		expect(loaded('c15t.hosted.js')).toEqual([]);
		expect(standIn.__c15tBoot.disposed).toBe(true);
	});

	it('reads nothing from a /init answer that lands after it', async () => {
		const standIn = start();

		standIn.dispose();
		answerInit.resolve(initBody());
		await settle();

		expect(banner()).toBeNull();
		expect(document.querySelector('[data-c15t-ui]')).toBeNull();
		expect(() => standIn.getSnapshot()).toThrow(/init/u);
		expect(standIn.__c15tBoot.prefetch).toBeNull();
		expect(loaded('c15t.hosted.js')).toEqual([]);
	});

	it('loads the engine for a later init(), which starts from the queued call', () => {
		const standIn = start();
		standIn.dispose();
		expect(loaded('c15t.hosted.js')).toEqual([]);

		standIn.init();

		expect(loaded('c15t.hosted.js')).toHaveLength(1);
		expect(standIn.__c15tBoot.calls).toEqual([['init']]);
		expect(standIn.__c15tBoot.disposed).toBe(false);
	});

	it('leaves an engine that still arrives without a client', async () => {
		const standIn = start();
		standIn.dispose();

		const api = installGlobal(createGlobal({ pkg: '@c15t/browser' }));
		// Waits for the init script's `/init` to settle, as the engine does.
		expect(autoInit(api)).toBeNull();
		answerInit.reject();
		await vi.waitFor(() => {
			expect(target.c15t).toBe(api);
		});
		await settle();

		expect(api.client).toBeNull();
		expect(banner()).toBeNull();
		expect(standIn.__c15tBoot.disposed).toBe(true);
		api.dispose();
	});
});
