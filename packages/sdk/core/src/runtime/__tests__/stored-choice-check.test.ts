/**
 * @vitest-environment jsdom
 *
 * The stored-choice check a deferred root reads before it starts a
 * returning visitor's scripts without the engine: set only when the
 * browser holds nothing newer than what the server read.
 */
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import {
	choiceRecords,
	matchedResolution,
	NOW,
	optInRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import { transportMode } from '../../__tests__/fixtures/transport-mode';
import { PAGE_RENDER_KEY } from '../../libs/page-globals';
import type { Script } from '../../libs/script-loader/script.model';
import { encodeStoredConsentEnvelopeJson } from '../../modules/persistence/writer/record-encode.model';
import type { RuntimePrefetch } from '../consent-runtime.model';
import {
	serverScriptStartPlan,
	storedChoiceCheckScript,
} from '../script-server-start';

const mode = transportMode({ init: () => Promise.resolve({}) });

const prefetchFor = function prefetchFor(
	values?: Parameters<typeof choiceRecords>[0]
): RuntimePrefetch {
	const resolution = matchedResolution(optInRule());
	return {
		initialPolicyResolution: resolution,
		initialRecords: values
			? choiceRecords(values, {
					confirmedAt: NOW - 1000,
					fingerprint: resolution.fingerprints.choice,
				})
			: undefined,
		now: NOW,
	};
};

/** Runs the page's check now, as a root does right before it starts scripts. */
const current = (): boolean | undefined => {
	const check = (
		(window as unknown as Record<string, unknown>)[PAGE_RENDER_KEY] as
			| { current?: unknown }
			| undefined
	)?.current;
	return typeof check === 'function' ? (check as () => boolean)() : undefined;
};

afterEach(() => {
	vi.restoreAllMocks();
	Reflect.deleteProperty(window, PAGE_RENDER_KEY);
	localStorage.clear();
});

describe('storedChoiceCheckScript', () => {
	test('sets the flag for a returning visitor the server read', () => {
		vi.useFakeTimers({ now: NOW });
		const code = storedChoiceCheckScript({
			mode,
			prefetch: prefetchFor({ marketing: true, measurement: true }),
		});
		expect(code).toBeDefined();
		// oxlint-disable-next-line no-new-func -- Runs the inline script, as the page would.
		new Function(code ?? '')();
		expect(current()).toBe(true);
		vi.useRealTimers();
	});

	test('re-checks the stored records each time a root asks', () => {
		vi.useFakeTimers({ now: NOW });
		const prefetch = prefetchFor({ marketing: true, measurement: true });
		const code = storedChoiceCheckScript({ mode, prefetch });
		// oxlint-disable-next-line no-new-func -- Runs the inline script, as the page would.
		new Function(code ?? '')();
		expect(current()).toBe(true);
		// Another tab withdraws marketing after the page parsed.
		const marketing = prefetch.initialRecords?.choice?.categories.marketing;
		if (!marketing) {
			throw new Error('the fixture grants marketing');
		}
		localStorage.setItem(
			'inth',
			encodeStoredConsentEnvelopeJson({
				categories: {
					marketing: {
						...marketing,
						confirmedAt: marketing.confirmedAt + 1,
						value: false,
					},
				},
				version: 3,
			})
		);
		expect(current()).toBe(false);
		vi.useRealTimers();
	});

	test('fails once the browser holds a newer grant too', () => {
		// Any newer decision means the page no longer runs with the state the
		// server read: the engine loads and applies it.
		vi.useFakeTimers({ now: NOW });
		const prefetch = prefetchFor({ marketing: false, measurement: true });
		const code = storedChoiceCheckScript({ mode, prefetch });
		// oxlint-disable-next-line no-new-func -- Runs the inline script, as the page would.
		new Function(code ?? '')();
		expect(current()).toBe(true);
		const marketing = prefetch.initialRecords?.choice?.categories.marketing;
		if (!marketing) {
			throw new Error('the fixture decides marketing');
		}
		localStorage.setItem(
			'inth',
			encodeStoredConsentEnvelopeJson({
				categories: {
					marketing: {
						...marketing,
						confirmedAt: marketing.confirmedAt + 1,
						value: true,
					},
				},
				version: 3,
			})
		);
		expect(current()).toBe(false);
		vi.useRealTimers();
	});

	test('reports the decision stale once it expires', () => {
		vi.useFakeTimers({ now: NOW });
		const prefetch = prefetchFor({ marketing: true, measurement: true });
		const code = storedChoiceCheckScript({ mode, prefetch });
		// oxlint-disable-next-line no-new-func -- Runs the inline script, as the page would.
		new Function(code ?? '')();
		expect(current()).toBe(true);
		vi.setSystemTime(NOW + 400 * 86_400_000);
		expect(current()).toBe(false);
		vi.useRealTimers();
	});

	test('renders nothing for a visitor the policy asks to choose', () => {
		expect(
			storedChoiceCheckScript({ mode, prefetch: prefetchFor() })
		).toBeUndefined();
	});

	test('leaves the flag unset under a GPC signal the server did not read', () => {
		vi.useFakeTimers({ now: NOW });
		const code = storedChoiceCheckScript({
			mode,
			prefetch: prefetchFor({ marketing: true, measurement: true }),
		});
		Object.defineProperty(navigator, 'globalPrivacyControl', {
			configurable: true,
			value: true,
		});
		// oxlint-disable-next-line no-new-func -- Runs the inline script, as the page would.
		new Function(code ?? '')();
		expect(current()).toBeUndefined();
		Reflect.deleteProperty(navigator, 'globalPrivacyControl');
		vi.useRealTimers();
	});
});

describe('a second check in the same document', () => {
	/** A newer denial of marketing, stored under `key`. */
	const storeDenial = (prefetch: RuntimePrefetch, key: string): void => {
		const marketing = prefetch.initialRecords?.choice?.categories.marketing;
		if (!marketing) {
			throw new Error('the fixture grants marketing');
		}
		localStorage.setItem(
			key,
			encodeStoredConsentEnvelopeJson({
				categories: {
					marketing: {
						...marketing,
						confirmedAt: marketing.confirmedAt + 1,
						value: false,
					},
				},
				version: 3,
			})
		);
	};

	test('drops the earlier verifier when the new snapshot is stale', () => {
		vi.useFakeTimers({ now: NOW });
		// An earlier render, such as before a client-side navigation or a
		// root remount, left a verifier for its own storage key.
		const earlier = prefetchFor({ marketing: true, measurement: true });
		// oxlint-disable-next-line no-new-func -- Runs the inline script, as the page would.
		new Function(
			storedChoiceCheckScript({
				mode,
				prefetch: earlier,
				storageConfig: { storageKey: 'earlier' },
			}) ?? ''
		)();
		expect(current()).toBe(true);
		// The new render's records are stale in this browser.
		const next = prefetchFor({ marketing: true, measurement: true });
		storeDenial(next, 'next');
		// oxlint-disable-next-line no-new-func -- Runs the inline script, as the page would.
		new Function(
			storedChoiceCheckScript({
				mode,
				prefetch: next,
				storageConfig: { storageKey: 'next' },
			}) ?? ''
		)();
		expect(current()).toBeUndefined();
		vi.useRealTimers();
	});
});

describe('a root that needs the engine at once', () => {
	const granted = () => prefetchFor({ marketing: true, measurement: true });
	const pixel: Script = {
		category: 'marketing',
		id: 'pixel',
		src: 'https://cdn.example.com/pixel.js',
	};

	test('gets the check when the root starts its plain scripts itself', () => {
		expect(
			storedChoiceCheckScript({ mode, prefetch: granted(), scripts: [pixel] })
		).toBeDefined();
	});

	test.each([
		['an enabled network blocker', { networkBlocker: { rules: [] } }],
		['enabled: false', { enabled: false }],
		['an experiment', { experiment: { id: 'x' } }],
		// Its cleanup of denied cookies and storage runs only in the engine.
		['clearOnRevocation', { clearOnRevocation: {} }],
		[
			'a runnable script that needs the loader',
			{ scripts: [{ ...pixel, onLoad: () => undefined }] },
		],
		[
			'persistence off, with a plain script',
			{ persistence: false, scripts: [pixel] },
		],
		[
			'a serverStart the server does not emit',
			{ scripts: [{ ...pixel, serverStart: () => undefined }] },
		],
	] as [string, Record<string, unknown>][])(
		'gets no check with %s',
		(_case, extra) => {
			expect(
				storedChoiceCheckScript({ mode, prefetch: granted(), ...extra })
			).toBeUndefined();
		}
	);

	const engineFields: [string, Partial<Script>][] = [
		['onError', { onError: () => undefined }],
		['onLoad', { onLoad: () => undefined }],
		['onDispose', { onDispose: () => undefined }],
		['persistAfterDispose', { persistAfterDispose: true }],
	];
	test.each(engineFields)(
		'gets no check with a server-started script that has %s',
		(_case, extra) => {
			// The server starts the script, but only the loader hears its
			// element's load or error, and only it can keep the element or
			// call onDispose when a root that goes first would remove it.
			const started: Script = {
				...pixel,
				...extra,
				serverStart: () => ({ code: '' }),
			};
			expect(
				storedChoiceCheckScript({
					mode,
					prefetch: granted(),
					scripts: [started],
				})
			).toBeUndefined();
		}
	);

	const waitingFields: [string, Partial<Script>][] = [
		['no callbacks', {}],
		['onBeforeLoad', { onBeforeLoad: () => undefined }],
		['onConsentChange', { onConsentChange: () => undefined }],
		['persistAfterDispose: false', { persistAfterDispose: false }],
		// A revoke loads the engine, whose loader adopts the element first.
		['persistAfterConsentRevoked', { persistAfterConsentRevoked: true }],
	];
	test.each(waitingFields)(
		'gets the check with a server-started script with %s',
		(_case, extra) => {
			// The server start's code ran the setup, and a later consent
			// change takes the engine anyway.
			const started: Script = {
				...pixel,
				...extra,
				serverStart: () => ({ code: '' }),
			};
			expect(
				storedChoiceCheckScript({
					mode,
					prefetch: granted(),
					scripts: [started],
				})
			).toBeDefined();
		}
	);

	describe('a denied script', () => {
		const denied = () => prefetchFor({ marketing: false, measurement: true });
		const onConsentChange = () => undefined;

		test('gets no check when it reports the denial before it loads', () => {
			// The loader tells it about the denial at once; only the engine can.
			expect(
				storedChoiceCheckScript({
					mode,
					prefetch: denied(),
					scripts: [
						{ ...pixel, observeConsentBeforeLoad: true, onConsentChange },
					],
				})
			).toBeUndefined();
		});

		test.each([
			['plain', pixel],
			['with onConsentChange alone', { ...pixel, onConsentChange }],
		] as [string, Script][])(
			'gets the check when it is %s',
			(_case, script) => {
				// The loader calls neither before the script loads.
				expect(
					storedChoiceCheckScript({
						mode,
						prefetch: denied(),
						scripts: [script],
					})
				).toBeDefined();
			}
		);
	});
});

test("reuses the render's server-start plan instead of running serverStart again", () => {
	const serverStart = vi.fn(() => ({ code: '' }));
	const scripts: Script[] = [
		{
			category: 'marketing',
			id: 'pixel',
			serverStart,
			src: 'https://cdn.example.com/pixel.js',
		},
	];
	const options = {
		mode,
		prefetch: prefetchFor({ marketing: true, measurement: true }),
		scripts,
	};
	const plan = serverScriptStartPlan(options);
	expect(serverStart).toHaveBeenCalledTimes(1);
	expect(storedChoiceCheckScript(options, plan)).toBeDefined();
	expect(serverStart).toHaveBeenCalledTimes(1);
});
