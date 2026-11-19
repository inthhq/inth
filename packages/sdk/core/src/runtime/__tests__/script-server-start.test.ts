/**
 * @vitest-environment jsdom
 *
 * When the consent the server read grants a script, the server render runs
 * its setup and inserts its element before hydration, unless the browser
 * holds a newer decision than the one the server read.
 */
import type { PolicyRule } from '@inth/sdk-schema/types';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
	choiceRecords,
	matchedResolution,
	NOW,
	optInRule,
	optOutRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import { transportMode } from '../../__tests__/fixtures/transport-mode';
import { SERVER_START_FAILED_EVENT } from '../../libs/page-globals';
import type { Script } from '../../libs/script-loader/types';
import { STORAGE_KEY } from '../../libs/storage-keys';
import { validateStoredConsentEnvelope } from '../../modules/persistence/record-codec';
import {
	encodeStoredConsentEnvelopeCompact,
	encodeStoredConsentEnvelopeJson,
	encodeVendorChoice,
} from '../../modules/persistence/writer/encode';
import { releaseServerStartedScripts } from '../../surface-actions/plain-scripts';
import {
	serverScriptStart,
	serverScriptStartPlan,
	storedChoiceCheckScript,
} from '../script-server-start';
import type { ConsentRuntimeOptions, RuntimePrefetch } from '../types';

type StartedWindow = Window & {
	__inthRender?: {
		current?: () => boolean;
		failed?: number;
		id: string;
		starts: Record<string, number>;
	};
	__inthLoaderRan?: boolean;
	__inthSetup?: number;
	__inthStarted?: Record<string, HTMLScriptElement>;
};

const CONFIRMED_AT = NOW - 1000;

const pixel: Script = {
	category: 'marketing',
	id: 'pixel',
	serverStart: () => ({
		code: 'window.__inthSetup=(window.__inthSetup||0)+1',
	}),
	src: 'https://cdn.example.com/pixel.js',
};

const mode = transportMode({ init: () => Promise.resolve({}) });

/** A prefetch under an opt-in policy, with the visitor's stored choice. */
const prefetchFor = function prefetchFor(
	values?: Parameters<typeof choiceRecords>[0],
	rule: Partial<PolicyRule> = {},
	extra: Partial<RuntimePrefetch> = {}
): RuntimePrefetch {
	const resolution = matchedResolution(optInRule(rule));
	return {
		initialPolicyResolution: resolution,
		initialRecords: values
			? choiceRecords(values, {
					confirmedAt: CONFIRMED_AT,
					fingerprint: resolution.fingerprints.choice,
				})
			: undefined,
		now: NOW,
		...extra,
	};
};

/**
 * Runs the generated inline script, as the page would. The page is hidden
 * unless `visible`, so the work runs at once rather than after a frame.
 */
const run = function run(
	code: string | undefined,
	{ visible = false }: { visible?: boolean } = {}
): void {
	expect(code).toBeDefined();
	vi.spyOn(document, 'hidden', 'get').mockReturnValue(!visible);
	// oxlint-disable-next-line no-new-func -- Runs the generated inline script, as the page would.
	new Function(code ?? '')();
};

const clearCookies = function clearCookies(): void {
	for (const cookie of document.cookie.split(';')) {
		// oxlint-disable-next-line unicorn/no-document-cookie -- Clears the consent cookies between tests.
		document.cookie = `${cookie.split('=')[0]?.trim()}=; max-age=0; path=/`;
	}
};

afterEach(() => {
	vi.restoreAllMocks();
	const started = window as StartedWindow;
	delete started.__inthLoaderRan;
	delete started.__inthSetup;
	delete started.__inthStarted;
	delete started.__inthRender;
	localStorage.clear();
	clearCookies();
	document.head.innerHTML = '';
	document.body.innerHTML = '';
	vi.useRealTimers();
});

describe('serverScriptStart', () => {
	test.each([undefined, false, () => false])(
		'starts element scripts when callbackOnly=%s',
		(callbackOnly) => {
			run(
				serverScriptStart({
					mode,
					prefetch: prefetchFor({ marketing: true }),
					scripts: [{ ...pixel, callbackOnly }],
				})
			);
			expect((window as StartedWindow).__inthSetup).toBe(1);
			expect(document.head.querySelector('script')?.src).toBe(pixel.src);
		}
	);

	test.each([true, () => true])(
		'skips server startup when callbackOnly=%s',
		(callbackOnly) => {
			expect(
				serverScriptStart({
					mode,
					prefetch: prefetchFor({ marketing: true }),
					scripts: [{ ...pixel, callbackOnly }],
				})
			).toBeUndefined();
			expect((window as StartedWindow).__inthSetup).toBeUndefined();
		}
	);

	test('starts a script from its scriptLoader.sources entry with integrity', () => {
		run(
			serverScriptStart({
				mode,
				prefetch: prefetchFor({ marketing: true }),
				scriptLoader: {
					sources: {
						pixel: {
							integrity: 'sha384-registry',
							src: 'https://acme.example/scripts/pixel.js',
						},
					},
				},
				scripts: [pixel],
			})
		);
		const element = document.head.querySelector('script');
		expect((window as StartedWindow).__inthSetup).toBe(1);
		expect(element?.getAttribute('src')).toBe(
			'https://acme.example/scripts/pixel.js'
		);
		expect(element?.getAttribute('integrity')).toBe('sha384-registry');
		expect(element?.getAttribute('crossorigin')).toBe('anonymous');
	});

	test("starts an integration from the prefetched registry list's hash URL", () => {
		const listed = (
			sources: Record<string, unknown>,
			scriptLoader?: ConsentRuntimeOptions['scriptLoader']
		) =>
			serverScriptStart({
				experimentalScriptRegistry: true,
				mode,
				prefetch: {
					...prefetchFor({ marketing: true }),
					initialScriptRegistry: { sources: sources as never },
				},
				scriptLoader,
				scripts: [{ ...pixel, integration: 'pixel' }],
			});
		const started = () => {
			const element = document.head.querySelector('script');
			return {
				integrity: element?.getAttribute('integrity'),
				src: element?.getAttribute('src'),
			};
		};

		run(
			listed({
				pixel: {
					integrity: 'sha384-registry',
					src: 'https://acme.inth.app/scripts/pixel@0123456789abcdef.js',
				},
			})
		);
		expect(started()).toEqual({
			integrity: 'sha384-registry',
			src: 'https://acme.inth.app/scripts/pixel@0123456789abcdef.js',
		});
		expect((window as StartedWindow).__inthSetup).toBe(1);
		document.head.innerHTML = '';

		// An entry it cannot check starts nothing, here or from its own URL.
		expect(listed({ pixel: { src: 'https://acme.inth.app/x.js' } })).toBe(
			undefined
		);

		// The page's own source wins over the list's.
		run(
			listed(
				{
					pixel: {
						integrity: 'sha384-registry',
						src: 'https://acme.inth.app/scripts/pixel@0123456789abcdef.js',
					},
				},
				{
					sources: {
						[pixel.id]: {
							integrity: 'sha384-pinned',
							src: 'https://cdn.example.com/pinned/pixel.js',
						},
					},
				}
			)
		);
		expect(started()).toEqual({
			integrity: 'sha384-pinned',
			src: 'https://cdn.example.com/pinned/pixel.js',
		});
	});

	test('leaves an integration to the client when the prefetch has not resolved init', () => {
		expect(
			serverScriptStart({
				experimentalScriptRegistry: true,
				mode,
				prefetch: {
					...prefetchFor({ marketing: true }),
					initialPolicyPending: true,
				},
				scripts: [{ ...pixel, integration: 'pixel' }],
			})
		).toBeUndefined();
	});

	test('leaves integrations to the client when the prefetched list names files, and starts the rest', () => {
		// The loader pins the files an integration's loader downloads only
		// once it runs, so an integration started from the HTML would fetch
		// them unpinned. A script the registry does not manage is not held.
		run(
			serverScriptStart({
				experimentalScriptRegistry: true,
				mode,
				prefetch: {
					...prefetchFor({ marketing: true }),
					initialScriptRegistry: {
						files: {
							'https://cdn.pixel.example/runtime.js': {
								integrity: 'sha384-registry',
								src: 'https://acme.inth.app/scripts/pixel/runtime@0123456789abcdef.js',
							},
						},
						sources: {
							pixel: {
								integrity: 'sha384-registry',
								src: 'https://acme.inth.app/scripts/pixel@0123456789abcdef.js',
							},
						},
					},
				},
				scripts: [
					{ ...pixel, integration: 'pixel' },
					{ ...pixel, id: 'plain', src: 'https://cdn.plain.example/plain.js' },
				],
			})
		);
		expect(
			Array.from(document.head.querySelectorAll('script'), (script) =>
				script.getAttribute('src')
			)
		).toEqual(['https://cdn.plain.example/plain.js']);
	});

	test('starts a plain script while the registry list is pending', () => {
		run(
			serverScriptStart({
				experimentalScriptRegistry: true,
				mode,
				prefetch: {
					...prefetchFor({ marketing: true }),
					initialPolicyPending: true,
				},
				scripts: [pixel],
			})
		);
		expect(document.head.querySelector('script')?.getAttribute('src')).toBe(
			pixel.src
		);
	});

	test('starts an integration from its own URL when the prefetch carries no registry list', () => {
		run(
			serverScriptStart({
				experimentalScriptRegistry: true,
				mode,
				prefetch: prefetchFor({ marketing: true }),
				scripts: [{ ...pixel, integration: 'pixel' }],
			})
		);
		expect(document.head.querySelector('script')?.getAttribute('src')).toBe(
			pixel.src
		);
	});

	test('does not evaluate predicates when no script can start on the server', () => {
		const callbackOnly = vi.fn(() => {
			throw new Error('browser runtime is unavailable');
		});
		expect(
			serverScriptStart({
				mode,
				prefetch: prefetchFor({ marketing: true }),
				scripts: [{ ...pixel, callbackOnly, serverStart: undefined }],
			})
		).toBeUndefined();
		expect(callbackOnly).not.toHaveBeenCalled();
	});

	test.each([false, true])(
		'a throwing predicate leaves unrelated server starts intact, serverStart=%s',
		(hasServerStart) => {
			const serverStart = vi.fn(() => ({ code: 'window.failedSetup=true' }));
			run(
				serverScriptStart({
					mode,
					prefetch: prefetchFor({ marketing: true }),
					scripts: [
						{
							...pixel,
							callbackOnly: () => {
								throw new Error('browser runtime is unavailable');
							},
							id: 'failed-predicate',
							serverStart: hasServerStart ? serverStart : undefined,
							src: 'https://cdn.example.com/failed.js',
						},
						pixel,
					],
				})
			);
			expect(serverStart).not.toHaveBeenCalled();
			expect((window as StartedWindow).__inthSetup).toBe(1);
			expect(document.head.querySelectorAll('script')).toHaveLength(1);
			expect(document.head.querySelector('script')?.src).toBe(pixel.src);
		}
	);

	test.each([false, true])(
		'a failing predicate preserves shared-resource ownership, serverStart=%s',
		(hasServerStart) => {
			const serverStart = vi.fn(pixel.serverStart);
			expect(
				serverScriptStart({
					mode,
					prefetch: prefetchFor({ marketing: true }),
					scripts: [
						{ ...pixel, resourceKey: 'shared', serverStart },
						{
							...pixel,
							callbackOnly: () => {
								throw new Error('browser runtime is unavailable');
							},
							id: 'failed-predicate',
							resourceKey: 'shared',
							serverStart: hasServerStart ? serverStart : undefined,
						},
					],
				})
			).toBeUndefined();
			expect(serverStart).not.toHaveBeenCalled();
			expect(document.head.querySelector('script')).toBeNull();
		}
	);

	test('runs setup, then inserts the element for the loader to adopt', () => {
		run(
			serverScriptStart({
				mode,
				prefetch: prefetchFor({ marketing: true }),
				scripts: [{ ...pixel, attributes: { 'data-x': '1' } }],
			})
		);

		const started = window as StartedWindow;
		const element = started.__inthStarted?.pixel;
		expect(started.__inthSetup).toBe(1);
		expect(document.head.querySelectorAll('script')).toHaveLength(1);
		expect(element?.getAttribute('src')).toBe(pixel.src);
		expect(element?.getAttribute('data-x')).toBe('1');
		expect(element?.id).toBe('');
	});

	test('a later render takes over the element an earlier one inserted, and only its root releases it', () => {
		const options = {
			mode,
			prefetch: prefetchFor({ marketing: true }),
			scripts: [pixel],
		};
		run(serverScriptStart(options, 'render-a'));
		const element = (window as StartedWindow).__inthStarted?.pixel as
			| (HTMLScriptElement & { __inthStartRender?: string })
			| undefined;
		expect(element?.__inthStartRender).toBe('render-a');

		run(serverScriptStart(options, 'render-b'));
		expect((window as StartedWindow).__inthStarted?.pixel).toBe(element);
		expect(element?.__inthStartRender).toBe('render-b');
		expect(document.head.querySelectorAll('script')).toHaveLength(1);

		// Render A's root goes: the element is render B's now.
		releaseServerStartedScripts(['pixel'], 'render-a');
		expect(element?.isConnected).toBe(true);
		releaseServerStartedScripts(['pixel'], 'render-b');
		expect(element?.isConnected).toBe(false);
	});

	test('a later render takes over an element declared the same way with a callbackOnly predicate another server process made', () => {
		// Each render's predicate is a new function, as in another request or
		// server worker: its identity is only that process's.
		const declared = (): Script => ({ ...pixel, callbackOnly: () => false });
		run(
			serverScriptStart(
				{
					mode,
					prefetch: prefetchFor({ marketing: true }),
					scripts: [declared()],
				},
				'render-a'
			)
		);
		const earlier = (window as StartedWindow).__inthStarted?.pixel;
		expect(earlier).toBeDefined();
		run(
			serverScriptStart(
				{
					mode,
					prefetch: prefetchFor({ marketing: true }),
					scripts: [declared()],
				},
				'render-b'
			)
		);
		expect((window as StartedWindow).__inthStarted?.pixel).toBe(earlier);
		expect((window as StartedWindow).__inthSetup).toBe(1);
	});

	test('a render whose start finds an element a root started early reports a failure, and leaves the element to its owners', () => {
		// A deferred root or hook inserted the plain script before this render's
		// start, which has a setup that element never ran.
		const early = document.createElement('script');
		early.src = pixel.src as string;
		Object.assign(early, { __inthEarly: true, __inthOwners: 1 });
		document.head.append(early);
		const started = window as StartedWindow;
		started.__inthStarted = { pixel: early };
		const failed = vi.fn();
		window.addEventListener(SERVER_START_FAILED_EVENT, failed);
		try {
			run(
				serverScriptStart(
					{
						mode,
						prefetch: prefetchFor({ marketing: true }),
						scripts: [pixel],
					},
					'render-b'
				)
			);
			expect(started.__inthSetup).toBeUndefined();
			expect(started.__inthRender?.starts).not.toHaveProperty('pixel');
			expect(started.__inthRender?.failed).toBe(1);
			expect(failed).toHaveBeenCalled();
			expect(started.__inthStarted?.pixel).toBe(early);
			expect(early.isConnected).toBe(true);
		} finally {
			window.removeEventListener(SERVER_START_FAILED_EVENT, failed);
		}
	});

	test("a later render that declares the key otherwise replaces the earlier render's element and runs its own setup", () => {
		const options = {
			mode,
			prefetch: prefetchFor({ marketing: true }),
			scripts: [pixel],
		};
		run(serverScriptStart(options, 'render-a'));
		const earlier = (window as StartedWindow).__inthStarted?.pixel;
		expect(earlier?.isConnected).toBe(true);
		expect((window as StartedWindow).__inthSetup).toBe(1);

		const moved = 'https://cdn.example.com/moved-pixel.js';
		run(
			serverScriptStart(
				{ ...options, scripts: [{ ...pixel, src: moved }] },
				'render-b'
			)
		);
		const later = (window as StartedWindow).__inthStarted?.pixel;
		expect(later).not.toBe(earlier);
		expect(later?.getAttribute('src')).toBe(moved);
		expect(later?.isConnected).toBe(true);
		expect(earlier?.isConnected).toBe(false);
		expect((window as StartedWindow).__inthSetup).toBe(2);
		expect(document.head.querySelectorAll('script')).toHaveLength(1);
	});

	test("a later render that resolves other consent replaces the earlier render's element and runs its own setup", () => {
		const consentPixel: Script = {
			...pixel,
			alwaysLoad: true,
			serverStart: ({ hasConsent }) => ({
				code: `window.__inthGranted=${hasConsent}`,
			}),
		};
		const granted = window as StartedWindow & { __inthGranted?: boolean };
		run(
			serverScriptStart(
				{
					mode,
					prefetch: prefetchFor({ marketing: true }),
					scripts: [consentPixel],
				},
				'render-a'
			)
		);
		const earlier = granted.__inthStarted?.pixel;
		expect(granted.__inthGranted).toBe(true);

		run(
			serverScriptStart(
				{
					mode,
					prefetch: prefetchFor({ marketing: false }),
					scripts: [consentPixel],
				},
				'render-b'
			)
		);
		const later = granted.__inthStarted?.pixel as
			| (HTMLScriptElement & { __inthConsent?: boolean })
			| undefined;
		expect(granted.__inthGranted).toBe(false);
		expect(later).not.toBe(earlier);
		expect(later?.__inthConsent).toBe(false);
		expect(earlier?.isConnected).toBe(false);
		expect(document.head.querySelectorAll('script')).toHaveLength(1);
		delete granted.__inthGranted;
	});

	describe('with a priority image still loading', () => {
		const startWithHero = function startWithHero(): {
			element: HTMLScriptElement | undefined;
			hero: HTMLImageElement;
		} {
			const hero = document.createElement('img');
			hero.setAttribute('fetchpriority', 'high');
			hero.src = 'https://cdn.example.com/hero.jpg';
			document.body.append(hero);
			run(
				serverScriptStart({
					mode,
					prefetch: prefetchFor({ marketing: true }),
					scripts: [pixel],
				})
			);
			return { element: (window as StartedWindow).__inthStarted?.pixel, hero };
		};

		test('runs setup and registers the element, but inserts it after the image loads', () => {
			const { element, hero } = startWithHero();

			expect((window as StartedWindow).__inthSetup).toBe(1);
			expect(element?.isConnected).toBe(false);

			hero.dispatchEvent(new Event('load'));

			expect(element?.isConnected).toBe(true);
		});

		test('inserts the element when the image takes too long', () => {
			vi.useFakeTimers();
			const { element } = startWithHero();

			vi.advanceTimersByTime(2999);
			expect(element?.isConnected).toBe(false);
			vi.advanceTimersByTime(1);
			expect(element?.isConnected).toBe(true);
		});

		test('holds the element when a denial is stored before the image loads', () => {
			const { element, hero } = startWithHero();
			const { choice } = choiceRecords(
				{ marketing: false },
				{ confirmedAt: CONFIRMED_AT + 1 }
			);
			localStorage.setItem(
				'inth',
				encodeStoredConsentEnvelopeJson({
					categories: choice?.categories ?? {},
					version: 3,
				})
			);

			hero.dispatchEvent(new Event('load'));

			expect(element?.isConnected).toBe(false);
			expect(element).toHaveProperty('__inthHeld', true);
		});

		test('inserts the element under a later render that takes it over before the image loads', () => {
			const { element, hero } = startWithHero();
			run(
				serverScriptStart(
					{
						mode,
						prefetch: prefetchFor({ marketing: true }),
						scripts: [pixel],
					},
					'render-b'
				)
			);
			expect((window as StartedWindow).__inthStarted?.pixel).toBe(element);

			hero.dispatchEvent(new Event('load'));

			expect(element?.isConnected).toBe(true);
			expect(element).not.toHaveProperty('__inthHeld');
			expect((window as StartedWindow).__inthSetup).toBe(1);
		});

		test('inserts the element a later render takes over after it was held for that render', () => {
			const { element, hero } = startWithHero();
			// Render B's page object replaces render A's before the image loads,
			// so render A's insert holds the element.
			Object.assign(window, { __inthRender: { id: 'render-b', starts: {} } });
			hero.dispatchEvent(new Event('load'));
			expect(element).toHaveProperty('__inthHeld', true);
			// The image is done, as `complete` would say in a browser.
			hero.remove();

			run(
				serverScriptStart(
					{
						mode,
						prefetch: prefetchFor({ marketing: true }),
						scripts: [pixel],
					},
					'render-b'
				)
			);

			expect(element?.isConnected).toBe(true);
			expect(element).not.toHaveProperty('__inthHeld');
			expect((window as StartedWindow).__inthSetup).toBe(1);
		});

		test('inserts the element a loader adopted, which owns the consent check', () => {
			const { element, hero } = startWithHero();
			Object.assign(element ?? {}, { __inthAdopted: true });
			const { choice } = choiceRecords(
				{ marketing: false },
				{ confirmedAt: CONFIRMED_AT + 1 }
			);
			localStorage.setItem(
				'inth',
				encodeStoredConsentEnvelopeJson({
					categories: choice?.categories ?? {},
					version: 3,
				})
			);

			hero.dispatchEvent(new Event('load'));

			expect(element?.isConnected).toBe(true);
		});
	});

	test('starts a repeated script once', () => {
		run(
			serverScriptStart({
				mode,
				prefetch: prefetchFor({ marketing: true }),
				scripts: [pixel, pixel],
			})
		);

		const started = window as StartedWindow;
		expect(started.__inthSetup).toBe(1);
		expect(document.head.querySelectorAll('script')).toHaveLength(1);
		expect(Object.keys(started.__inthStarted ?? {})).toEqual(['pixel']);
	});

	// The loader runs only the first script's `onBeforeLoad` on an element
	// it adopts, so the second would miss its setup.
	test('leaves a resource two scripts share to the loader', () => {
		expect(
			serverScriptStart({
				mode,
				prefetch: prefetchFor({ marketing: true }),
				scripts: [
					{ ...pixel, resourceKey: 'shared' },
					{ ...pixel, id: 'b', resourceKey: 'shared' },
				],
			})
		).toBeUndefined();
	});

	test('leaves a resource to its first script when that one has no serverStart', () => {
		const { serverStart: _, ...plain } = pixel;

		expect(
			serverScriptStart({
				mode,
				prefetch: prefetchFor({ marketing: true }),
				scripts: [
					{ ...plain, resourceKey: 'shared' },
					{ ...pixel, id: 'b', resourceKey: 'shared' },
				],
			})
		).toBeUndefined();
	});

	test('does nothing when the browser sends a GPC signal the server did not read', () => {
		const code = serverScriptStart({
			mode,
			prefetch: prefetchFor(
				{ marketing: true },
				{ privacySignals: { gpc: { denyCategories: ['marketing'] } } }
			),
			scripts: [pixel],
		});
		Object.defineProperty(navigator, 'globalPrivacyControl', {
			configurable: true,
			value: true,
		});
		try {
			run(code);
		} finally {
			Reflect.deleteProperty(navigator, 'globalPrivacyControl');
		}

		expect((window as StartedWindow).__inthSetup).toBeUndefined();
		expect(document.head.querySelector('script')).toBeNull();
	});

	test('does nothing once the decision the server read has expired', () => {
		vi.useFakeTimers({ now: NOW });
		const code = serverScriptStart({
			mode,
			prefetch: prefetchFor(
				{ marketing: true },
				{ validity: { choiceDays: 1 } }
			),
			scripts: [pixel],
		});
		vi.setSystemTime(CONFIRMED_AT + 86_400_000);

		run(code);

		expect((window as StartedWindow).__inthSetup).toBeUndefined();
		expect(document.head.querySelector('script')).toBeNull();
	});

	test('runs the shared prelude once', () => {
		const prelude = 'window.__inthSetup=(window.__inthSetup||0)+10';
		const withPrelude = (id: string): Script => ({
			...pixel,
			id,
			serverStart: () => ({ code: '', prelude }),
			src: `https://cdn.example.com/${id}.js`,
		});

		run(
			serverScriptStart({
				mode,
				prefetch: prefetchFor({ marketing: true }),
				scripts: [withPrelude('a'), withPrelude('b')],
			})
		);

		expect((window as StartedWindow).__inthSetup).toBe(10);
		expect(document.head.querySelectorAll('script')).toHaveLength(2);
	});

	describe('with a localStorage copy', () => {
		// The browser reads the records at the time the server rendered, so
		// the client's decoder takes the fixtures' decisions as past ones.
		beforeEach(() => {
			vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
		});
		afterEach(() => {
			vi.useRealTimers();
		});

		/** The visitor's choice as the client writes it to localStorage. */
		const storeLocally = function storeLocally(
			values: Parameters<typeof choiceRecords>[0],
			confirmedAt: number,
			key = 'inth'
		): void {
			const { choice } = choiceRecords(values, { confirmedAt });
			localStorage.setItem(
				key,
				encodeStoredConsentEnvelopeJson({
					categories: choice?.categories ?? {},
					version: 3,
				})
			);
		};

		const startPixel = function startPixel(
			prefetch = prefetchFor({ marketing: true }),
			extra: Partial<Parameters<typeof serverScriptStart>[0]> = {}
		): void {
			run(serverScriptStart({ mode, prefetch, scripts: [pixel], ...extra }));
		};

		test('starts when it holds the decision the server read', () => {
			storeLocally({ marketing: true }, CONFIRMED_AT);

			startPixel();

			expect(document.head.querySelectorAll('script')).toHaveLength(1);
		});

		test('starts when it holds only an older denial', () => {
			storeLocally({ marketing: false }, CONFIRMED_AT - 1);

			startPixel();

			expect(document.head.querySelectorAll('script')).toHaveLength(1);
		});

		test('does nothing when it holds a newer denial', () => {
			storeLocally({ marketing: false }, CONFIRMED_AT + 1);

			startPixel();

			expect((window as StartedWindow).__inthSetup).toBeUndefined();
			expect(document.head.querySelector('script')).toBeNull();
		});

		test('does nothing for a denial from the same millisecond as the grant', () => {
			storeLocally({ marketing: false }, CONFIRMED_AT);

			startPixel();

			expect(document.head.querySelector('script')).toBeNull();
		});

		test("does nothing for a denial newer than its category's seed but older than another's", () => {
			const prefetch = prefetchFor({ marketing: true, measurement: true });
			const measurement =
				prefetch.initialRecords?.choice?.categories.measurement;
			if (measurement) {
				measurement.confirmedAt = CONFIRMED_AT + 10;
			}
			storeLocally({ marketing: false }, CONFIRMED_AT + 5);

			startPixel(prefetch);

			expect(document.head.querySelector('script')).toBeNull();
		});

		test('does nothing for a record in a format it does not read', () => {
			localStorage.setItem(
				'inth',
				JSON.stringify({ consents: { marketing: false } })
			);

			startPixel();

			expect(document.head.querySelector('script')).toBeNull();
		});

		describe('and a legacy record', () => {
			const legacyDenial = JSON.stringify({
				consentInfo: { time: CONFIRMED_AT + 1 },
				consents: { marketing: false },
			});

			test('does nothing when the configured copy is one the client rejects', () => {
				// The client then reads the legacy record, and its denial.
				const rejected = { categories: {}, unknown: true, version: 3 };
				expect(validateStoredConsentEnvelope(rejected, NOW).ok).toBe(false);
				localStorage.setItem('inth', JSON.stringify(rejected));
				localStorage.setItem(STORAGE_KEY, legacyDenial);

				startPixel();

				expect(document.head.querySelector('script')).toBeNull();
			});

			test('starts when the cookie holds the decision the server read', () => {
				const { choice } = choiceRecords(
					{ marketing: true },
					{ confirmedAt: CONFIRMED_AT }
				);
				// oxlint-disable-next-line unicorn/no-document-cookie -- Stores the record under test.
				document.cookie = `inth=${encodeStoredConsentEnvelopeCompact({
					categories: choice?.categories ?? {},
					version: 3,
				})}; path=/`;
				localStorage.setItem(STORAGE_KEY, legacyDenial);

				startPixel();

				expect(document.head.querySelectorAll('script')).toHaveLength(1);
			});

			test('starts for the c15t record the server read, with no Inth record', () => {
				const { choice } = choiceRecords(
					{ marketing: true },
					{ confirmedAt: CONFIRMED_AT }
				);
				// oxlint-disable-next-line unicorn/no-document-cookie -- Stores the record under test.
				document.cookie = `c15t=${encodeStoredConsentEnvelopeCompact({
					categories: choice?.categories ?? {},
					version: 3,
				})}; path=/`;

				startPixel();

				expect(document.head.querySelectorAll('script')).toHaveLength(1);
			});

			test('does nothing for a choice c15t stored, with no Inth cookie', () => {
				const { choice } = choiceRecords(
					{ marketing: false },
					{ confirmedAt: CONFIRMED_AT + 1 }
				);
				// oxlint-disable-next-line unicorn/no-document-cookie -- Stores the record under test.
				document.cookie = `c15t=${encodeStoredConsentEnvelopeCompact({
					categories: choice?.categories ?? {},
					version: 3,
				})}; path=/`;

				startPixel();

				expect(document.head.querySelector('script')).toBeNull();
			});

			test('does nothing for an older Inth vendor denial only localStorage holds, under the c15t cookie the server read', () => {
				// The client's reader takes the configured family whatever the
				// timestamps, so it applies the denial over the server's list.
				const { choice } = choiceRecords(
					{ marketing: true },
					{ confirmedAt: CONFIRMED_AT }
				);
				// oxlint-disable-next-line unicorn/no-document-cookie -- Stores the record under test.
				document.cookie = `inth=${encodeStoredConsentEnvelopeCompact({
					categories: choice?.categories ?? {},
					version: 3,
				})}; path=/`;
				// oxlint-disable-next-line unicorn/no-document-cookie -- Stores the record under test.
				document.cookie = `c15t-vendors=v=1&t=${CONFIRMED_AT}&d=; path=/`;
				localStorage.setItem(
					'inth-vendors',
					JSON.stringify({
						confirmedAt: CONFIRMED_AT - 1,
						denied: ['pixel'],
						version: 1,
					})
				);
				const prefetch = prefetchFor({ marketing: true });

				startPixel({
					...prefetch,
					initialRecords: {
						...prefetch.initialRecords,
						vendorChoice: { confirmedAt: CONFIRMED_AT, denied: [], version: 1 },
					},
				});

				expect(document.head.querySelector('script')).toBeNull();
			});

			test('does nothing for c15t vendor denials while Inth stores none', () => {
				const { choice } = choiceRecords(
					{ marketing: true },
					{ confirmedAt: CONFIRMED_AT }
				);
				// oxlint-disable-next-line unicorn/no-document-cookie -- Stores the record under test.
				document.cookie = `inth=${encodeStoredConsentEnvelopeCompact({
					categories: choice?.categories ?? {},
					version: 3,
				})}; path=/`;
				localStorage.setItem(
					'c15t-vendors',
					JSON.stringify({ confirmedAt: NOW, denied: ['pixel'], version: 1 })
				);

				startPixel();

				expect(document.head.querySelector('script')).toBeNull();
			});
		});

		test.each([
			['storageConfig', { storageConfig: { storageKey: 'site-consent' } }],
			[
				'persistence.storageConfig',
				{
					persistence: { storageConfig: { storageKey: 'site-consent' } },
					storageConfig: { storageKey: 'ignored' },
				},
			],
		] as const)('reads the keys %s names', (_, extra) => {
			localStorage.setItem(
				'site-consent-vendors',
				encodeVendorChoice({
					confirmedAt: CONFIRMED_AT + 1,
					denied: ['pixel'],
					version: 1,
				})
			);

			startPixel(undefined, extra);

			expect(document.head.querySelector('script')).toBeNull();
		});
	});

	describe('with consent cookies', () => {
		// The browser reads the records at the time the server rendered, so
		// the client's decoder takes the fixtures' decisions as past ones.
		beforeEach(() => {
			vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
		});
		afterEach(() => {
			vi.useRealTimers();
		});

		const startPixel = function startPixel(): void {
			run(
				serverScriptStart({
					mode,
					prefetch: prefetchFor({ marketing: true }),
					scripts: [pixel],
				})
			);
		};

		test('does nothing when only the cookies hold a newer decision', () => {
			const { choice } = choiceRecords(
				{ marketing: false },
				{ confirmedAt: CONFIRMED_AT + 1 }
			);
			const consent = encodeStoredConsentEnvelopeCompact({
				categories: choice?.categories ?? {},
				version: 3,
			});
			// oxlint-disable-next-line unicorn/no-document-cookie -- Stores the record under test.
			document.cookie = `inth=${consent}; path=/`;

			startPixel();

			expect(consent).toContain(`mk=0.${CONFIRMED_AT + 1}`);
			expect(document.head.querySelector('script')).toBeNull();
		});

		test.each([
			['a newer clear epoch', `inth-epoch=${CONFIRMED_AT + 1}`],
			// The server read c15t's cookie, which a c15t tab then cleared.
			['a newer c15t clear epoch', `c15t-epoch=${CONFIRMED_AT + 1}`],
			[
				'a newer, URI-encoded vendor choice',
				`inth-vendors=${encodeURIComponent(`v=1&t=${CONFIRMED_AT + 1}&d=pixel`)}`,
			],
		])('does nothing for %s', (_, cookie) => {
			// oxlint-disable-next-line unicorn/no-document-cookie -- Stores the record under test.
			document.cookie = `${cookie}; path=/`;

			startPixel();

			expect(document.head.querySelector('script')).toBeNull();
		});

		test('starts after a newer c15t clear when the Inth cookie holds the decision the server read', () => {
			const { choice } = choiceRecords(
				{ marketing: true },
				{ confirmedAt: CONFIRMED_AT }
			);
			// oxlint-disable-next-line unicorn/no-document-cookie -- Stores the record under test.
			document.cookie = `inth=${encodeStoredConsentEnvelopeCompact({
				categories: choice?.categories ?? {},
				version: 3,
			})}; path=/`;
			// oxlint-disable-next-line unicorn/no-document-cookie -- Stores the record under test.
			document.cookie = `c15t-epoch=${CONFIRMED_AT + 1}; path=/`;

			startPixel();

			expect(document.head.querySelectorAll('script')).toHaveLength(1);
		});

		// The client's decoder rejects the whole record, then falls back to
		// another copy, which may hold a denial.
		test.each([
			['an unknown field', `inth=v=3&mk=1.${CONFIRMED_AT}.0&x=1`],
			['a field without a value', `inth=v=3&mk`],
			[
				'a repeated field',
				`inth=v=3&mk=1.${CONFIRMED_AT}.0&mk=1.${CONFIRMED_AT}.0`,
			],
			['a malformed decision', `inth=v=3&mk=1.${CONFIRMED_AT}`],
			['an unknown vendor field', 'inth-vendors=v=1&d=&x=1'],
		])('does nothing for a compact record with %s', (_, cookie) => {
			// oxlint-disable-next-line unicorn/no-document-cookie -- Stores the record under test.
			document.cookie = `${cookie}; path=/`;

			startPixel();

			expect(document.head.querySelector('script')).toBeNull();
		});

		describe('and a vendor choice the server read', () => {
			/** A visitor who chose, with vendors decided at CONFIRMED_AT. */
			const startWithVendors = function startWithVendors(): void {
				const prefetch = prefetchFor({ marketing: true });
				run(
					serverScriptStart({
						mode,
						prefetch: {
							...prefetch,
							initialRecords: {
								...prefetch.initialRecords,
								vendorChoice: {
									confirmedAt: CONFIRMED_AT,
									denied: ['pixel-co'],
									version: 1,
								},
							},
						},
						scripts: [pixel],
					})
				);
			};

			test('starts for the vendor cookie the server read', () => {
				// oxlint-disable-next-line unicorn/no-document-cookie -- Stores the record under test.
				document.cookie = `inth-vendors=v=1&t=${CONFIRMED_AT}&d=pixel-co; path=/`;

				startWithVendors();

				expect(document.head.querySelectorAll('script')).toHaveLength(1);
			});

			// The client's decoder rejects each, so it reads no vendor choice.
			test.each([
				['an empty time', 'v=1&t=&d=pixel-co'],
				['no time', 'v=1&d=pixel-co'],
				['a time that is not a number', `v=1&t=${CONFIRMED_AT}x&d=pixel-co`],
				[
					'a vendor id outside the slug shape',
					`v=1&t=${CONFIRMED_AT}&d=Pixel%20Co`,
				],
				['a repeated vendor', `v=1&t=${CONFIRMED_AT}&d=pixel-co|pixel-co`],
				['a malformed vendor encoding', `v=1&t=${CONFIRMED_AT}&d=pixel%E0`],
				['an empty subject id', `v=1&t=${CONFIRMED_AT}&d=pixel-co&sid=`],
			])('does nothing for a vendor cookie with %s', (_, value) => {
				// oxlint-disable-next-line unicorn/no-document-cookie -- Stores the record under test.
				document.cookie = `inth-vendors=${value}; path=/`;

				startWithVendors();

				expect(document.head.querySelector('script')).toBeNull();
			});

			// The client adds a local copy's denials to the cookie's when the
			// local copy is at least as new (`readStoredVendorChoice`).
			const localAtSameTime = (denied: string[]): void => {
				// oxlint-disable-next-line unicorn/no-document-cookie -- Stores the record under test.
				document.cookie = `inth-vendors=v=1&t=${CONFIRMED_AT}&d=pixel-co; path=/`;
				localStorage.setItem(
					'inth-vendors',
					JSON.stringify({ confirmedAt: CONFIRMED_AT, denied, version: 1 })
				);
			};

			test('does nothing when a local copy from the same time denies another vendor', () => {
				localAtSameTime(['other-co', 'pixel-co']);

				startWithVendors();

				expect(document.head.querySelector('script')).toBeNull();
			});

			test.each([
				['the same vendors', ['pixel-co']],
				['no vendor the cookie does not', []],
			])(
				'starts when a local copy from the same time denies %s',
				(_, denied) => {
					localAtSameTime(denied);

					startWithVendors();

					expect(document.head.querySelectorAll('script')).toHaveLength(1);
				}
			);
		});

		// Each holds the grant the server read, so only the decoder's
		// structural rules tell it apart from a record that starts.
		const granted = `mk=1.${CONFIRMED_AT}.0`;
		test('starts for a compact record that holds the grant the server read', () => {
			// oxlint-disable-next-line unicorn/no-document-cookie -- Stores the record under test.
			document.cookie = `inth=v=3&b=cX&${granted}&sid=subject; path=/`;

			startPixel();

			expect(document.head.querySelectorAll('script')).toHaveLength(1);
		});

		test.each([
			['a basis index it lacks', `inth=v=3&b=cX&mk=1.${CONFIRMED_AT}.9`],
			['no basis list', `inth=v=3&${granted}`],
			['an empty basis list', `inth=v=3&b=&${granted}`],
			['an unknown basis kind', `inth=v=3&b=xX&${granted}`],
			['a choice basis without a fingerprint', `inth=v=3&b=c&${granted}`],
			['a malformed basis encoding', `inth=v=3&b=c%E0&${granted}`],
			['an empty subject id', `inth=v=3&b=cX&${granted}&sid=`],
			['a malformed subject id', `inth=v=3&b=cX&${granted}&sid=%E0`],
			['a grant from the future', 'inth=v=3&b=cX&mk=1.9999999999999.0'],
		])('does nothing for a compact record with %s', (_, cookie) => {
			// oxlint-disable-next-line unicorn/no-document-cookie -- Stores the record under test.
			document.cookie = `${cookie}; path=/`;

			startPixel();

			expect(document.head.querySelector('script')).toBeNull();
		});

		test('starts when the cookies hold only older decisions', () => {
			// oxlint-disable-next-line unicorn/no-document-cookie -- Stores the record under test.
			document.cookie = `inth-epoch=${CONFIRMED_AT - 1}; path=/`;
			// oxlint-disable-next-line unicorn/no-document-cookie -- An unrelated cookie with a newer time.
			document.cookie = `other=${CONFIRMED_AT + 1}; path=/`;

			startPixel();

			expect(document.head.querySelectorAll('script')).toHaveLength(1);
		});
	});

	describe('in a visible page', () => {
		const startVisible = function startVisible(): void {
			vi.useFakeTimers();
			run(
				serverScriptStart({
					mode,
					prefetch: prefetchFor({ marketing: true }),
					scripts: [pixel],
				}),
				{ visible: true }
			);
		};

		test('waits for the task after the next frame', () => {
			startVisible();
			expect((window as StartedWindow).__inthSetup).toBeUndefined();

			vi.advanceTimersToNextFrame();
			expect((window as StartedWindow).__inthSetup).toBeUndefined();

			vi.runOnlyPendingTimers();
			expect((window as StartedWindow).__inthSetup).toBe(1);
			expect((window as StartedWindow).__inthStarted?.pixel?.isConnected).toBe(
				true
			);
		});

		test('a render that replaced the page object before the start ran cancels it', () => {
			// A client navigation's render took the page over: its consent
			// state, not this render's, decides what runs.
			startVisible();
			(window as StartedWindow).__inthRender = { id: 'later', starts: {} };

			vi.advanceTimersToNextFrame();
			vi.runOnlyPendingTimers();

			expect((window as StartedWindow).__inthSetup).toBeUndefined();
			expect(document.head.querySelector('script')).toBeNull();
		});

		test('a render that replaced the page object while the insert waited inserts nothing', () => {
			// The setup ran; the insert waits for a priority image.
			const hero = document.createElement('img');
			hero.setAttribute('fetchpriority', 'high');
			vi.spyOn(hero, 'complete', 'get').mockReturnValue(false);
			document.body.append(hero);
			startVisible();
			vi.advanceTimersToNextFrame();
			vi.runOnlyPendingTimers();
			expect((window as StartedWindow).__inthSetup).toBe(1);

			(window as StartedWindow).__inthRender = { id: 'later', starts: {} };
			hero.dispatchEvent(new Event('load'));

			expect(document.head.querySelector('script')).toBeNull();
		});

		test('leaves the scripts to a loader that mounted first', () => {
			startVisible();
			(window as StartedWindow).__inthLoaderRan = true;

			vi.advanceTimersToNextFrame();
			vi.runOnlyPendingTimers();

			expect((window as StartedWindow).__inthSetup).toBeUndefined();
			expect((window as StartedWindow).__inthStarted).toBeUndefined();
		});

		test("keeps the inline script's nonce after it ran", () => {
			const currentScript = vi
				.spyOn(document, 'currentScript', 'get')
				.mockReturnValue(
					Object.assign(document.createElement('script'), {
						nonce: 'page-nonce',
					})
				);
			startVisible();
			currentScript.mockReturnValue(null);

			vi.advanceTimersToNextFrame();
			vi.runOnlyPendingTimers();

			expect((window as StartedWindow).__inthStarted?.pixel?.nonce).toBe(
				'page-nonce'
			);
		});
	});

	test.each([
		["the inline script's nonce", undefined, 'page-nonce'],
		["its own nonce over the inline script's", 'script-nonce', 'script-nonce'],
	])('gives the element %s', (_, nonce, expected) => {
		vi.spyOn(document, 'currentScript', 'get').mockReturnValue(
			Object.assign(document.createElement('script'), { nonce: 'page-nonce' })
		);

		run(
			serverScriptStart({
				mode,
				prefetch: prefetchFor({ marketing: true }),
				scripts: [{ ...pixel, nonce }],
			})
		);

		expect((window as StartedWindow).__inthStarted?.pixel?.nonce).toBe(
			expected
		);
	});

	test('starts an alwaysLoad script without consent after a denial', () => {
		const serverStart = vi.fn(() => ({ code: '' }));

		run(
			serverScriptStart({
				mode,
				prefetch: prefetchFor({ marketing: false }),
				scripts: [{ ...pixel, alwaysLoad: true, serverStart }],
			})
		);

		expect(serverStart).toHaveBeenCalledWith(
			expect.objectContaining({ hasConsent: false }),
			expect.objectContaining({ id: 'pixel' })
		);
		expect(
			(
				(window as StartedWindow).__inthStarted?.pixel as
					| (HTMLScriptElement & { __inthConsent?: boolean })
					| undefined
			)?.__inthConsent
		).toBe(false);
	});

	test('skips a script whose setup throws and starts the rest', () => {
		run(
			serverScriptStart({
				mode,
				prefetch: prefetchFor({ marketing: true }),
				scripts: [
					{ ...pixel, id: 'broken', serverStart: () => ({ code: 'throw 1' }) },
					pixel,
				],
			})
		);

		expect(Object.keys((window as StartedWindow).__inthStarted ?? {})).toEqual([
			'pixel',
		]);
	});

	test('keeps a src from closing the inline script', () => {
		const code = serverScriptStart({
			mode,
			prefetch: prefetchFor({ marketing: true }),
			scripts: [{ ...pixel, src: 'https://x.test/</script><b>.js' }],
		});

		expect(code).not.toContain('</script>');
	});

	describe('returns nothing', () => {
		test('before the visitor chooses', () => {
			expect(
				serverScriptStart({ mode, prefetch: prefetchFor(), scripts: [pixel] })
			).toBeUndefined();
		});

		// The banner is waiting for its first tap then; a script's first run
		// would hold the main thread and delay it.
		test('for an alwaysLoad script while the banner asks for a choice', () => {
			const serverStart = vi.fn(() => ({ code: '' }));

			expect(
				serverScriptStart({
					mode,
					prefetch: prefetchFor(),
					scripts: [{ ...pixel, alwaysLoad: true, serverStart }],
				})
			).toBeUndefined();
			expect(serverStart).not.toHaveBeenCalled();
		});

		test('when the visitor denied the category', () => {
			expect(
				serverScriptStart({
					mode,
					prefetch: prefetchFor({ marketing: false }),
					scripts: [pixel],
				})
			).toBeUndefined();
		});

		test('when the GPC signal the server read denies the grant', () => {
			expect(
				serverScriptStart({
					mode,
					prefetch: prefetchFor(
						{ marketing: true },
						{ privacySignals: { gpc: { denyCategories: ['marketing'] } } },
						{ initialPrivacySignals: { gpc: true } }
					),
					scripts: [pixel],
				})
			).toBeUndefined();
		});

		test('when the app turns the server start off', () => {
			expect(
				serverScriptStart({
					mode,
					prefetch: prefetchFor({ marketing: true }),
					scriptLoader: { serverStart: false },
					scripts: [pixel],
				})
			).toBeUndefined();
		});

		test('without a server-resolved policy', () => {
			expect(
				serverScriptStart({ mode, prefetch: { now: NOW }, scripts: [pixel] })
			).toBeUndefined();
		});

		test('for a shared render, which carries no request clock', () => {
			// Prerendered HTML goes to every visitor; an opt-out policy that
			// needs no prompt still grants nobody in particular.
			const shared: RuntimePrefetch = {
				initialPolicyResolution: matchedResolution(
					optOutRule({ categories: ['marketing'], prompt: 'none' })
				),
			};
			const options = { mode, scripts: [pixel] };
			expect(
				serverScriptStart({ ...options, prefetch: { ...shared, now: NOW } })
			).toBeDefined();

			expect(
				serverScriptStart({ ...options, prefetch: shared })
			).toBeUndefined();
		});

		// The client then reads storage back over the seed, so an older
		// stored denial, which the inline check lets through, wins.
		test('when the client rereads storage over the seed', () => {
			expect(
				serverScriptStart({
					mode,
					persistence: { skipHydration: false },
					prefetch: prefetchFor({ marketing: true }),
					scripts: [pixel],
				})
			).toBeUndefined();
		});

		test('when an external consent source owns consent', () => {
			expect(
				serverScriptStart({
					consentSource: {
						getPermissions: () => null,
						openPreferences: () => undefined,
						subscribe: () => () => undefined,
					},
					mode,
					prefetch: prefetchFor({ marketing: true }),
					scripts: [pixel],
				})
			).toBeUndefined();
		});

		test('for a script without serverStart', () => {
			expect(
				serverScriptStart({
					mode,
					prefetch: prefetchFor({ marketing: true }),
					scripts: [{ ...pixel, serverStart: undefined }],
				})
			).toBeUndefined();
		});

		test('when serverStart has no inline form', () => {
			expect(
				serverScriptStart({
					mode,
					prefetch: prefetchFor({ marketing: true }),
					scripts: [{ ...pixel, serverStart: () => undefined }],
				})
			).toBeUndefined();
		});
	});
});

describe('the scripts a root can count as started', () => {
	/**
	 * The keys the page's start marks as it parses, before any insert: a
	 * deferred root reads them to tell which `serverStart` entries the server
	 * really starts.
	 */
	const marked = (code: string | undefined): string[] => {
		vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
		// oxlint-disable-next-line no-new-func -- Runs the generated inline script, as the page would.
		new Function(code ?? '')();
		return Object.keys((window as StartedWindow).__inthRender?.starts ?? {});
	};
	const other: Script = {
		...pixel,
		id: 'other',
		src: 'https://cdn.example.com/other.js',
	};

	test('marks a script whose setup the server starts', () => {
		expect(
			marked(
				serverScriptStart({
					mode,
					prefetch: prefetchFor({ marketing: true }),
					scripts: [pixel],
				})
			)
		).toEqual(['pixel']);
	});

	test.each([
		['returns undefined', { ...pixel, serverStart: () => undefined }],
		[
			'throws',
			{
				...pixel,
				serverStart: () => {
					throw new Error('setup failed');
				},
			},
		],
		[
			'shares a resourceKey with another script',
			{ ...pixel, resourceKey: 'shared' },
		],
	] as [string, Script][])(
		'leaves a script whose serverStart %s unmarked',
		(_case, script) => {
			const scripts =
				script.resourceKey === 'shared'
					? [script, { ...other, resourceKey: 'shared' }]
					: [script, other];
			expect(
				marked(
					serverScriptStart({
						mode,
						prefetch: prefetchFor({ marketing: true }),
						scripts,
					})
				)
			).not.toContain(script.resourceKey ?? script.id);
		}
	);

	test("drops an earlier render's marks", () => {
		// An earlier render marked the pixel; this render starts nothing for
		// it, since the browser holds a newer decision under its key.
		marked(
			serverScriptStart({
				mode,
				prefetch: prefetchFor({ marketing: true }),
				scripts: [pixel],
				storageConfig: { storageKey: 'earlier' },
			})
		);
		expect(
			Object.keys((window as StartedWindow).__inthRender?.starts ?? {})
		).toEqual(['pixel']);
		const { choice } = choiceRecords(
			{ marketing: false },
			{ confirmedAt: CONFIRMED_AT + 1 }
		);
		localStorage.setItem(
			'next',
			encodeStoredConsentEnvelopeJson({
				categories: choice?.categories ?? {},
				version: 3,
			})
		);
		expect(
			marked(
				serverScriptStart({
					mode,
					prefetch: prefetchFor({ marketing: true }),
					scripts: [pixel],
					storageConfig: { storageKey: 'next' },
				})
			)
		).toEqual([]);
	});

	test('reports the scripts it starts, as it marks them', () => {
		const scripts: Script[] = [
			pixel,
			{ ...other, serverStart: () => undefined },
			{
				...other,
				id: 'throws',
				serverStart: () => {
					throw new Error('x');
				},
			},
		];
		const prefetch = prefetchFor({ marketing: true });
		const plan = serverScriptStartPlan({ mode, prefetch, scripts }, 'render');
		expect([...plan.started]).toEqual(['pixel']);
		expect(plan.code).toBe(
			serverScriptStart({ mode, prefetch, scripts }, 'render')
		);
		expect(marked(plan.code)).toEqual([...plan.started]);
	});

	test.each([
		[
			'its setup throws',
			{ ...pixel, serverStart: () => ({ code: 'throw new Error("setup")' }) },
		],
		[
			'the shared prelude throws',
			{
				...pixel,
				serverStart: () => ({
					code: '',
					prelude: 'throw new Error("prelude")',
				}),
			},
		],
	] as [string, Script][])(
		'drops the mark and tells the page when %s in the browser',
		(_case, script) => {
			const failed = vi.fn();
			window.addEventListener('__inthServerStartFailed', failed);
			try {
				// Marked as the page parses, then the setup runs and fails.
				run(
					serverScriptStart({
						mode,
						prefetch: prefetchFor({ marketing: true }),
						scripts: [script],
					})
				);
				expect(document.head.querySelector('script')).toBeNull();
				expect(
					Object.keys((window as StartedWindow).__inthRender?.starts ?? {})
				).toEqual([]);
				expect(failed).toHaveBeenCalled();
				expect((window as StartedWindow).__inthRender?.failed).toBe(1);
			} finally {
				window.removeEventListener('__inthServerStartFailed', failed);
			}
		}
	);

	test('marks nothing when the loader already ran in this document', () => {
		// Its code bails on the same guard, so nothing would start these.
		(window as StartedWindow).__inthLoaderRan = true;
		expect(
			marked(
				serverScriptStart({
					mode,
					prefetch: prefetchFor({ marketing: true }),
					scripts: [pixel],
				})
			)
		).toEqual([]);
	});

	test('marks nothing when the browser holds a newer decision', () => {
		Object.defineProperty(navigator, 'globalPrivacyControl', {
			configurable: true,
			value: true,
		});
		try {
			expect(
				marked(
					serverScriptStart({
						mode,
						prefetch: prefetchFor({ marketing: true }),
						scripts: [pixel],
					})
				)
			).toEqual([]);
		} finally {
			Reflect.deleteProperty(navigator, 'globalPrivacyControl');
		}
	});
});

describe('two renders in one document', () => {
	test("leave nothing of the first render's page state in the second", () => {
		vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
		const runCode = (code: string | undefined): void => {
			// oxlint-disable-next-line no-new-func -- Runs the generated inline script, as the page would.
			new Function(code ?? '')();
		};
		const page = () => (window as StartedWindow).__inthRender;

		// The first render: its check holds, the pixel is marked, and the
		// shared prelude throws, so it is marked failed.
		const first = {
			mode,
			prefetch: prefetchFor({ marketing: true }),
			scripts: [
				{
					...pixel,
					serverStart: () => ({ code: '', prelude: 'throw new Error("p")' }),
				},
			],
		};
		const firstPlan = serverScriptStartPlan(first, 'first');
		runCode(storedChoiceCheckScript(first, firstPlan));
		runCode(firstPlan.code);
		expect(page()?.id).toBe('first');
		expect(page()?.current?.()).toBe(true);
		expect(page()?.failed).toBe(1);

		// The second render, after a client-side navigation or a remount:
		// the browser now holds a newer denial, so its check fails and its
		// start marks nothing.
		const { choice } = choiceRecords(
			{ marketing: false },
			{ confirmedAt: CONFIRMED_AT + 1 }
		);
		localStorage.setItem(
			'inth',
			encodeStoredConsentEnvelopeJson({
				categories: choice?.categories ?? {},
				version: 3,
			})
		);
		const second = {
			mode,
			prefetch: prefetchFor({ marketing: true }),
			scripts: [pixel],
		};
		const secondPlan = serverScriptStartPlan(second, 'second');
		runCode(storedChoiceCheckScript(second, secondPlan));
		runCode(secondPlan.code);
		expect(page()).toEqual({ id: 'second', starts: {} });
	});
});
