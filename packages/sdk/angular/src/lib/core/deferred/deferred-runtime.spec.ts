import type { ConsentSnapshot } from '@inth/sdk/engine';
import {
	createConsentProviderRuntime,
	defaultRuntimeModules,
} from '@inth/sdk/runtime';
import type { ConsentProviderRuntime } from '@inth/sdk/runtime/provider';
import { pendingBootSnapshot } from '@inth/sdk/surface-state';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { testLocal } from '../../../__tests__/test-local';
import type { InthResolvedOptions } from '../options';
import { createDeferredRuntime } from './deferred-runtime';

const SRC = 'https://vendor.test/measure.js';

const options = (): InthResolvedOptions => ({
	scripts: [{ category: 'measurement', id: 'measure', src: SRC }],
});

const snapshotFor = (
	activeUI: 'banner' | 'none',
	measurement: boolean
): ConsentSnapshot =>
	({
		...pendingBootSnapshot({}),
		activeUI,
		effectivePermissions: {
			...pendingBootSnapshot({}).effectivePermissions,
			measurement,
		},
	}) as ConsentSnapshot;

const started = () =>
	[...document.querySelectorAll('script')].filter(
		(script) => script.src === SRC
	);

afterEach(() => {
	for (const script of started()) {
		script.remove();
	}
	localStorage.clear();
	for (const name of ['inth', 'inth-epoch', 'site-consent']) {
		document.cookie = `${name}=; Max-Age=0; path=/`;
	}
	delete (window as { __inthStarted?: unknown }).__inthStarted;
});

describe('createDeferredRuntime', () => {
	test('starts the plain scripts an answered visitor allows without the engine', () => {
		// The engine never arrives: the test sees only what the page does first.
		const never = new Promise<never>(() => {
			/* pending */
		});
		const loadEngine = vi.fn(() => never);
		const runtime = createDeferredRuntime({
			boot: { d: 1, s: snapshotFor('none', true) },
			loadEngine,
			options,
			schedule: () => () => undefined,
		});
		runtime.start();
		expect(started()).toHaveLength(1);
		expect(loadEngine).not.toHaveBeenCalled();
		runtime.dispose();
	});

	test('starts nothing for a visitor the banner still asks', () => {
		const runtime = createDeferredRuntime({
			boot: { d: 1, s: snapshotFor('banner', false) },
			loadEngine: () =>
				new Promise<never>(() => {
					/* pending */
				}),
			options,
			schedule: () => () => undefined,
		});
		runtime.start();
		expect(started()).toHaveLength(0);
		runtime.dispose();
	});

	describe('update() before the engine', () => {
		const scripts: InthResolvedOptions['scripts'] = [
			{ category: 'measurement', id: 'measure', src: SRC },
		];
		const deferredWithEngine = () => {
			const engines: ConsentProviderRuntime[] = [];
			const factory = () => {
				const engine = createConsentProviderRuntime(
					{ mode: testLocal(), persistence: false },
					defaultRuntimeModules
				);
				vi.spyOn(engine, 'update');
				engines.push(engine);
				return {
					preloadSavePath: () => Promise.resolve(),
					runtime: engine,
					updateOptions: (next: unknown) => next as never,
				};
			};
			const loadEngine = vi.fn(() => Promise.resolve(factory));
			const runtime = createDeferredRuntime({
				boot: { d: 1, s: snapshotFor('banner', false) },
				loadEngine,
				options: () => ({ scripts }),
				schedule: () => () => undefined,
			});
			return { engines, loadEngine, runtime };
		};

		test('resolves only once the engine runs new network rules', async () => {
			const { engines, runtime } = deferredWithEngine();
			runtime.start();

			await runtime.update({
				networkBlocker: {
					rules: [{ category: 'measurement', domain: 'tracker.example' }],
				},
				scripts,
			});

			expect(engines).toHaveLength(1);
			expect(engines[0]?.started).toBe(true);
			runtime.dispose();
		});

		test('ends on the newest options when updates overlap the engine load', async () => {
			const { engines, runtime } = deferredWithEngine();
			runtime.start();
			const networkBlocker = {
				rules: [
					{ category: 'measurement' as const, domain: 'tracker.example' },
				],
			};
			const onConsentSet = vi.fn();

			const first = runtime.update({ networkBlocker, scripts });
			// Same engine-live options, so this one returns before the load.
			const second = runtime.update({
				callbacks: { onConsentSet },
				networkBlocker,
				scripts,
			} as never);
			await Promise.all([first, second]);

			const updates = vi.mocked(engines[0]?.update);
			expect(updates?.mock.lastCall?.[0]).toMatchObject({
				callbacks: { onConsentSet },
			});
			runtime.dispose();
		});

		test('loads nothing for options the engine reads when it is created', async () => {
			const { loadEngine, runtime } = deferredWithEngine();
			runtime.start();

			await runtime.update({ noStyle: true, scripts } as never);

			expect(loadEngine).not.toHaveBeenCalled();
			runtime.dispose();
		});
	});

	test('records an early choice under a nested persistence key, which the engine reads', async () => {
		const persistence = { storageConfig: { storageKey: 'site-consent' } };
		// The snapshot a server renders the banner with: a resolved policy.
		const server = createConsentProviderRuntime(
			{ ...options(), mode: testLocal(), persistence: false },
			defaultRuntimeModules
		);
		server.start();
		await vi.waitFor(() => {
			expect(server.kernel.getSnapshot().activeUI).toBe('banner');
		});
		const rendered = server.kernel.getSnapshot();
		server.dispose();
		const runtime = createDeferredRuntime({
			boot: { d: 1, s: rendered },
			// The engine never lands: the stand-in records the choice.
			loadEngine: () =>
				new Promise<never>(() => {
					/* pending */
				}),
			options: () => ({ ...options(), persistence }),
			schedule: () => () => undefined,
		});
		runtime.start();
		// The save settles with the engine, which never comes.
		runtime.kernel.commands.save('all').catch(() => undefined);
		await vi.waitFor(() => {
			expect(localStorage.getItem('site-consent')).not.toBeNull();
		});
		expect(localStorage.getItem('inth')).toBeNull();
		runtime.dispose();

		const engine = createConsentProviderRuntime(
			{ ...options(), mode: testLocal(), persistence },
			defaultRuntimeModules
		);
		engine.start();
		await vi.waitFor(() => {
			expect(
				engine.kernel.getSnapshot().explicitChoice?.categories.measurement
					?.value
			).toBe(true);
		});
		engine.dispose();
	});

	test('clears the stored choice before the engine loads', () => {
		const stored = `c.necessary:1,c.measurement:1,i.t:${Date.now()}`;
		document.cookie = `inth=${stored}; path=/`;
		localStorage.setItem('inth', stored);
		const runtime = createDeferredRuntime({
			boot: { d: 1, s: snapshotFor('none', true) },
			// The engine never lands: the page reloads or tears down first.
			loadEngine: () =>
				new Promise<never>(() => {
					/* pending */
				}),
			options,
			schedule: () => () => undefined,
		});
		runtime.start();

		runtime.clearRecords();
		runtime.dispose();

		expect(localStorage.getItem('inth')).toBeNull();
		expect(document.cookie).not.toMatch(/(?:^|; )inth=/u);
		// A reload sees the clear: decisions from before it stay void.
		expect(localStorage.getItem('inth-epoch')).not.toBeNull();
		expect(runtime.kernel.getSnapshot().explicitChoice).toBeNull();
		expect(runtime.kernel.getSnapshot().effectivePermissions.measurement).toBe(
			false
		);
	});

	test('loads the engine again after a failed chunk load', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {
			/* The failed load logs. */
		});
		const engines: ConsentProviderRuntime[] = [];
		const factory = () => {
			const engine = createConsentProviderRuntime(
				{ mode: testLocal(), persistence: false },
				defaultRuntimeModules
			);
			engines.push(engine);
			return {
				preloadSavePath: () => Promise.resolve(),
				runtime: engine,
				updateOptions: (next: unknown) => next as never,
			};
		};
		const loadEngine = vi
			.fn<() => Promise<typeof factory>>()
			.mockRejectedValueOnce(new Error('chunk failed'))
			.mockResolvedValue(factory);
		const runtime = createDeferredRuntime({
			boot: { d: 1, s: snapshotFor('banner', false) },
			loadEngine,
			options,
			schedule: () => () => undefined,
		});
		runtime.start();

		runtime.load();
		expect(await runtime.ready).toBeUndefined();
		expect(error).toHaveBeenCalled();

		await runtime.reinit();
		expect(loadEngine).toHaveBeenCalledTimes(2);
		expect(engines).toHaveLength(1);
		expect(engines[0]?.started).toBe(true);
		runtime.dispose();
		error.mockRestore();
	});

	test('retries an identical live update after the engine failed to load', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {
			/* The failed load logs. */
		});
		const engines: ConsentProviderRuntime[] = [];
		const factory = () => {
			const engine = createConsentProviderRuntime(
				{ mode: testLocal(), persistence: false },
				defaultRuntimeModules
			);
			engines.push(engine);
			return {
				preloadSavePath: () => Promise.resolve(),
				runtime: engine,
				updateOptions: (next: unknown) => next as never,
			};
		};
		const loadEngine = vi
			.fn<() => Promise<typeof factory>>()
			.mockRejectedValueOnce(new Error('chunk failed'))
			.mockResolvedValue(factory);
		const scripts: InthResolvedOptions['scripts'] = [];
		const runtime = createDeferredRuntime({
			boot: { d: 1, s: snapshotFor('banner', false) },
			loadEngine,
			options: () => ({ scripts }),
			schedule: () => () => undefined,
		});
		runtime.start();
		const patch: Parameters<typeof runtime.update>[0] = {
			networkBlocker: {
				rules: [{ category: 'measurement', domain: 'tracker.example' }],
			},
			scripts,
		};

		await runtime.update(patch);
		expect(engines).toHaveLength(0);

		await runtime.update(patch);
		expect(loadEngine).toHaveBeenCalledTimes(2);
		expect(engines[0]?.started).toBe(true);
		runtime.dispose();
		error.mockRestore();
	});

	test('a save waiting on a failed engine load gives the banner back, and the next one saves', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {
			/* The failed load logs. */
		});
		const engines: ConsentProviderRuntime[] = [];
		const factory = () => {
			const engine = createConsentProviderRuntime(
				{ mode: testLocal(), persistence: false },
				defaultRuntimeModules
			);
			engines.push(engine);
			return {
				preloadSavePath: () => Promise.resolve(),
				runtime: engine,
				updateOptions: (next: unknown) => next as never,
			};
		};
		const loadEngine = vi
			.fn<() => Promise<typeof factory>>()
			.mockRejectedValueOnce(new Error('chunk failed'))
			.mockResolvedValue(factory);
		const runtime = createDeferredRuntime({
			boot: { d: 1, s: snapshotFor('banner', false) },
			loadEngine,
			options,
			schedule: () => () => undefined,
		});
		runtime.start();
		// A vendor choice is not one the commit path records without the
		// engine, so it waits for it.
		const save = (): Promise<unknown> =>
			runtime.kernel.commands.save('all', { vendors: {} } as never);

		const first = save();
		expect(runtime.kernel.getSnapshot().activeUI).toBe('none');
		await expect(first).rejects.toThrow('chunk failed');
		expect(runtime.kernel.getSnapshot().activeUI).toBe('banner');

		const result = await save();
		expect(loadEngine).toHaveBeenCalledTimes(2);
		expect(engines[0]?.started).toBe(true);
		// The engine ran the save, which closed the banner.
		expect(result).toMatchObject({ ok: true });
		expect(runtime.kernel.getSnapshot().activeUI).toBe('none');
		runtime.dispose();
		error.mockRestore();
	});

	test('a failed engine load shows a banner the early-tap script hid again', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {
			/* The failed load logs. */
		});
		// The style the early-tap script adds when it holds a tap.
		const hidden = document.createElement('style');
		hidden.id = 'inth-early-tap';
		document.head.append(hidden);
		const runtime = createDeferredRuntime({
			boot: { d: 1, s: snapshotFor('banner', false) },
			loadEngine: () => Promise.reject(new Error('chunk failed')),
			options,
			schedule: () => () => undefined,
		});
		runtime.start();
		runtime.load();
		expect(await runtime.ready).toBeUndefined();
		expect(document.getElementById('inth-early-tap')).toBeNull();
		runtime.dispose();
		error.mockRestore();
	});

	test('an engine that throws while it is built settles like a failed load', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {
			/* The failed build logs. */
		});
		let builds = 0;
		const engines: ConsentProviderRuntime[] = [];
		const factory = () => {
			builds += 1;
			if (builds === 1) {
				// As a custom mode factory that throws would.
				throw new Error('mode failed');
			}
			const engine = createConsentProviderRuntime(
				{ mode: testLocal(), persistence: false },
				defaultRuntimeModules
			);
			engines.push(engine);
			return {
				preloadSavePath: () => Promise.resolve(),
				runtime: engine,
				updateOptions: (next: unknown) => next as never,
			};
		};
		const runtime = createDeferredRuntime({
			boot: { d: 1, s: snapshotFor('banner', false) },
			loadEngine: () => Promise.resolve(factory),
			options,
			schedule: () => () => undefined,
		});
		runtime.start();
		const save = (): Promise<unknown> =>
			runtime.kernel.commands.save('all', { vendors: {} } as never);

		const first = save();
		await expect(first).rejects.toThrow('mode failed');
		// `ready` settles, so the app's pending task closes.
		expect(await runtime.ready).toBeUndefined();
		expect(runtime.kernel.getSnapshot().activeUI).toBe('banner');

		await expect(save()).resolves.toMatchObject({ ok: true });
		expect(engines).toHaveLength(1);
		runtime.dispose();
		error.mockRestore();
	});
});
