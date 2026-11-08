/**
 * The stand-in kernel: reads come from the server's snapshots, actions
 * wait for the engine and run on it, and once attached every read goes to
 * the engine while subscribers stay subscribed.
 */
import type { ConsentKernel, ConsentSnapshot } from '@c15t/core';
import { describe, expect, test, vi } from 'vitest';

import {
	EARLY_TAP_HOLD_PRESSES_KEY,
	EARLY_TAP_NOTIFY_KEY,
	EARLY_TAP_ROOT,
	EARLY_TAPS_WINDOW_KEY,
} from '../../../../core/src/surface-actions/early-tap-script';
import { createDeferredKernel } from '../deferred-kernel';
import type { DeferredEngine } from '../deferred-kernel';
import { deferredModules, deferredScriptsReady } from '../registry';
import {
	BANNER_ROOT,
	EARLY_TAP_HOLD_PRESSES,
	EARLY_TAP_NOTIFY,
	EARLY_TAPS_KEY,
	scheduleDeferredEngine,
} from '../trigger';

const snapshot = (activeUI: string, revision = 0) =>
	({ activeUI, revision }) as unknown as ConsentSnapshot;

const fakeEngine = function fakeEngine(live: ConsentSnapshot) {
	const listeners = new Set<(next: ConsentSnapshot) => void>();
	let current = live;
	const kernel = {
		commands: { save: vi.fn(() => Promise.resolve({ ok: true })) },
		events: { on: vi.fn(() => () => undefined) },
		getSnapshot: () => current,
		set: { activeUI: vi.fn() },
		subscribe: (listener: (next: ConsentSnapshot) => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	} as unknown as ConsentKernel;
	return {
		emit(next: ConsentSnapshot) {
			current = next;
			for (const listener of listeners) {
				listener(next);
			}
		},
		engine: {
			kernel,
			modules: { loadScriptLoader: vi.fn() },
			services: {
				clearRecords: vi.fn(),
				getConsentCategories: () => ['necessary'],
				getPresentation: () => undefined,
				isStarted: () => true,
				runtime: {} as never,
				setLanguage: vi.fn(),
			},
			streamed: undefined,
		} as unknown as DeferredEngine,
		kernel,
	};
};

describe('createDeferredKernel', () => {
	test('reads the server snapshots until the engine attaches', () => {
		const server = snapshot('none');
		const live = snapshot('banner');
		const handle = createDeferredKernel({
			requestEngine: vi.fn(),
			serverSnapshot: server,
			snapshot: live,
		});
		expect(handle.kernel.getServerSnapshot()).toBe(server);
		expect(handle.kernel.getSnapshot()).toBe(live);
		expect(handle.attached()).toBe(false);
		expect(deferredModules(handle.kernel)).toBeInstanceOf(Promise);
	});

	test('actions ask for the engine and run on it once attached, in order', async () => {
		const requestEngine = vi.fn();
		const handle = createDeferredKernel({
			requestEngine,
			serverSnapshot: snapshot('none'),
			snapshot: snapshot('banner'),
		});
		handle.kernel.set.activeUI('dialog');
		const saved = handle.kernel.commands.save('all');
		expect(requestEngine).toHaveBeenCalledTimes(2);

		const { engine, kernel } = fakeEngine(snapshot('banner', 1));
		handle.attach(engine);
		await expect(saved).resolves.toEqual({ ok: true });
		expect(kernel.set.activeUI).toHaveBeenCalledWith('dialog');
		expect(kernel.commands.save).toHaveBeenCalledWith('all');
		await expect(deferredModules(handle.kernel)).resolves.toBe(engine.modules);
	});

	test('after attaching, reads go to the engine and subscribers hear its changes', () => {
		const handle = createDeferredKernel({
			requestEngine: vi.fn(),
			serverSnapshot: snapshot('none'),
			snapshot: snapshot('banner'),
		});
		const listener = vi.fn();
		handle.kernel.subscribe(listener);
		const fake = fakeEngine(snapshot('banner', 1));
		handle.attach(fake.engine);
		// Told about the switch itself.
		expect(listener).toHaveBeenLastCalledWith(fake.kernel.getSnapshot());
		expect(handle.kernel.getSnapshot()).toBe(fake.kernel.getSnapshot());
		// The server snapshot stays the one the HTML was rendered from.
		expect(handle.kernel.getServerSnapshot().activeUI).toBe('none');
		const next = snapshot('none', 2);
		fake.emit(next);
		expect(listener).toHaveBeenLastCalledWith(next);
		// Commands go straight to the engine's, in the same call.
		void handle.kernel.commands.save('none');
		expect(fake.kernel.commands.save).toHaveBeenLastCalledWith('none');
	});

	test('setSnapshot replaces what reads return until the engine attaches', () => {
		const handle = createDeferredKernel({
			requestEngine: vi.fn(),
			serverSnapshot: snapshot('none'),
			snapshot: snapshot('none'),
		});
		const listener = vi.fn();
		handle.kernel.subscribe(listener);
		const resolved = snapshot('banner', 1);
		handle.setSnapshot(resolved);
		expect(handle.kernel.getSnapshot()).toBe(resolved);
		expect(listener).toHaveBeenCalledWith(resolved);
		const fake = fakeEngine(snapshot('banner', 2));
		handle.attach(fake.engine);
		handle.setSnapshot(snapshot('none', 3));
		expect(handle.kernel.getSnapshot()).toBe(fake.kernel.getSnapshot());
	});

	test('a choice tapped before the engine attaches hides the banner until it applies', async () => {
		const requestEngine = vi.fn();
		const handle = createDeferredKernel({
			requestEngine,
			serverSnapshot: snapshot('none'),
			snapshot: snapshot('banner'),
		});
		const saved = handle.kernel.commands.save('all');
		expect(requestEngine).toHaveBeenCalled();
		const hidden = handle.kernel.getSnapshot();
		expect(hidden.activeUI).toBe('none');
		// Stable while nothing changed, as useSyncExternalStore needs.
		expect(handle.kernel.getSnapshot()).toBe(hidden);
		// The engine attaches showing the banner; the tap still hides it.
		const fake = fakeEngine(snapshot('banner', 1));
		let finish: (value: unknown) => void = () => undefined;
		vi.mocked(fake.kernel.commands.save).mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}) as never
		);
		handle.attach(fake.engine);
		expect(handle.kernel.getSnapshot().activeUI).toBe('none');
		await vi.waitFor(() =>
			expect(fake.kernel.commands.save).toHaveBeenCalled()
		);
		fake.emit(snapshot('none', 2));
		finish({ ok: true });
		await saved;
		expect(handle.kernel.getSnapshot()).toBe(fake.kernel.getSnapshot());
	});

	test('a later engine kernel replaces the first one for subscribers', () => {
		const handle = createDeferredKernel({
			requestEngine: vi.fn(),
			serverSnapshot: snapshot('none'),
			snapshot: snapshot('banner'),
		});
		const listener = vi.fn();
		handle.kernel.subscribe(listener);
		const first = fakeEngine(snapshot('banner', 1));
		const second = fakeEngine(snapshot('none', 5));
		handle.attach(first.engine);
		handle.attach(second.engine);
		listener.mockClear();
		first.emit(snapshot('banner', 9));
		expect(listener).not.toHaveBeenCalled();
		second.emit(snapshot('none', 6));
		expect(listener).toHaveBeenCalledTimes(1);
	});

	test('a commit before the engine: reads, listeners and event listeners hear it, and the engine still takes over', async () => {
		const requestEngine = vi.fn();
		const handle = createDeferredKernel({
			requestEngine,
			serverSnapshot: snapshot('none'),
			snapshot: snapshot('banner'),
		});
		const heard = vi.fn();
		handle.kernel.subscribe(heard);
		const recorded = vi.fn();
		handle.kernel.events.on('choice:recorded', recorded);
		// A loader waits for a commit or the engine, whichever comes first.
		const scripts = vi.fn();
		void deferredScriptsReady(handle.kernel)?.then(scripts);
		const committed = snapshot('none', 1);
		const event = { snapshot: committed, type: 'choice:recorded' } as never;
		expect(handle.commit(committed, [event])).toBe(true);
		expect(handle.kernel.getSnapshot()).toBe(committed);
		// The server snapshot stays what the HTML was rendered from.
		expect(handle.kernel.getServerSnapshot()).toEqual(snapshot('none'));
		expect(heard).toHaveBeenCalledWith(committed);
		expect(recorded).toHaveBeenCalledWith(event);
		expect(requestEngine).not.toHaveBeenCalled();
		await vi.waitFor(() => {
			expect(scripts).toHaveBeenCalledTimes(1);
		});

		const { engine } = fakeEngine(snapshot('none', 2));
		handle.attach(engine);
		expect(handle.kernel.getSnapshot()).toEqual(snapshot('none', 2));
		// Refused once the engine is in: it records actions itself.
		expect(handle.commit(snapshot('none', 3), [])).toBe(false);
		expect(handle.kernel.getSnapshot()).toEqual(snapshot('none', 2));
	});

	test('pending lists setter calls waiting for the engine until it attaches', () => {
		const handle = createDeferredKernel({
			requestEngine: vi.fn(),
			serverSnapshot: snapshot('none'),
			snapshot: snapshot('banner'),
		});
		handle.kernel.set.registerConsentCategories(['marketing']);
		expect(handle.pending()).toEqual([
			{ args: [['marketing']], name: 'registerConsentCategories' },
		]);
		handle.attach(fakeEngine(snapshot('banner')).engine);
		expect(handle.pending()).toEqual([]);
	});

	test('event listeners added early attach to the engine', async () => {
		const handle = createDeferredKernel({
			requestEngine: vi.fn(),
			serverSnapshot: snapshot('none'),
			snapshot: snapshot('banner'),
		});
		const listener = vi.fn();
		handle.kernel.events.on('permissions:changed', listener);
		const fake = fakeEngine(snapshot('banner', 1));
		handle.attach(fake.engine);
		await handle.ready;
		expect(fake.kernel.events.on).toHaveBeenCalledWith(
			'permissions:changed',
			listener
		);
	});
});

describe('scheduleDeferredEngine', () => {
	test('names the same window key, banner root, notify and hold keys as the early-tap script', () => {
		expect(EARLY_TAPS_KEY).toBe(EARLY_TAPS_WINDOW_KEY);
		expect(BANNER_ROOT).toBe(EARLY_TAP_ROOT);
		expect(EARLY_TAP_NOTIFY).toBe(EARLY_TAP_NOTIFY_KEY);
		expect(EARLY_TAP_HOLD_PRESSES).toBe(EARLY_TAP_HOLD_PRESSES_KEY);
	});

	test('with a tap router: banner input routes instead of starting, page input still starts', () => {
		const image = document.createElement('img');
		image.setAttribute('fetchpriority', 'high');
		Object.defineProperty(image, 'complete', { value: false });
		const banner = document.createElement('div');
		banner.dataset.testid = 'consent-banner-root';
		const accept = document.createElement('button');
		accept.dataset.action = 'accept';
		banner.append(accept);
		document.body.append(image, banner);
		const host = window as unknown as Record<string, Record<string, unknown>>;
		const queue: Record<string, unknown> = { taps: [] };
		host[EARLY_TAPS_KEY] = queue;

		const start = vi.fn();
		const onTap = vi.fn();
		const stop = scheduleDeferredEngine(start, onTap);
		accept.dispatchEvent(new Event('focusin', { bubbles: true }));
		accept.dispatchEvent(new Event('keydown', { bubbles: true }));
		accept.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(start).not.toHaveBeenCalled();
		// A press names the button, ahead of its click.
		expect(onTap).toHaveBeenCalledWith('accept');
		// The early-tap script calls this after it queued a click.
		(queue[EARLY_TAP_NOTIFY] as () => void)();
		expect(onTap).toHaveBeenLastCalledWith();
		expect(start).not.toHaveBeenCalled();
		document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(start).toHaveBeenCalledTimes(1);
		stop();
		expect(queue[EARLY_TAP_NOTIFY]).toBeUndefined();

		// A tap queued before hydration is routed when scheduled.
		queue.taps = [{ action: 'accept', at: 1 }];
		const early = vi.fn();
		const routed = vi.fn();
		const stopEarly = scheduleDeferredEngine(early, routed);
		expect(routed).toHaveBeenCalledTimes(1);
		expect(early).not.toHaveBeenCalled();
		stopEarly();
		Reflect.deleteProperty(host, EARLY_TAPS_KEY);
		image.remove();
		banner.remove();
	});

	test('banner taps stay routed after the engine started, until stopped', () => {
		// No priority image: the engine starts as soon as it is scheduled.
		const banner = document.createElement('div');
		banner.dataset.testid = 'consent-banner-root';
		const accept = document.createElement('button');
		accept.dataset.action = 'accept';
		banner.append(accept);
		document.body.append(banner);
		const host = window as unknown as Record<string, Record<string, unknown>>;
		const queue: Record<string, unknown> = { taps: [] };
		host[EARLY_TAPS_KEY] = queue;

		const start = vi.fn();
		const onTap = vi.fn();
		const stop = scheduleDeferredEngine(start, onTap);
		expect(start).toHaveBeenCalledTimes(1);
		// The engine is still downloading: a tap is still the root's.
		accept.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(onTap).toHaveBeenCalledWith('accept');
		(queue[EARLY_TAP_NOTIFY] as () => void)();
		expect(onTap).toHaveBeenLastCalledWith();
		expect(start).toHaveBeenCalledTimes(1);
		stop();
		expect(queue[EARLY_TAP_NOTIFY]).toBeUndefined();
		accept.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(onTap).toHaveBeenCalledTimes(2);
		Reflect.deleteProperty(host, EARLY_TAPS_KEY);
		banner.remove();
	});

	test('waits for a loading priority image', () => {
		const image = document.createElement('img');
		image.setAttribute('fetchpriority', 'high');
		Object.defineProperty(image, 'complete', { value: false });
		document.body.append(image);
		const start = vi.fn();
		const stop = scheduleDeferredEngine(start);
		expect(start).not.toHaveBeenCalled();
		image.dispatchEvent(new Event('load'));
		expect(start).toHaveBeenCalledTimes(1);
		stop();
		image.remove();
	});

	test.each([
		['pointerdown', () => document.body],
		['keydown', () => document.body],
		['scroll', () => document],
		['scroll', () => document.body],
	] as const)('starts on %s anywhere on the page', (type, target) => {
		const image = document.createElement('img');
		image.setAttribute('fetchpriority', 'high');
		Object.defineProperty(image, 'complete', { value: false });
		document.body.append(image);
		const start = vi.fn();
		const stop = scheduleDeferredEngine(start);
		expect(start).not.toHaveBeenCalled();
		// Scroll does not bubble; pointer and key events do.
		target().dispatchEvent(new Event(type, { bubbles: type !== 'scroll' }));
		expect(start).toHaveBeenCalledTimes(1);
		// Once only, and the listeners are gone.
		window.dispatchEvent(new Event('pointerdown'));
		image.dispatchEvent(new Event('load'));
		expect(start).toHaveBeenCalledTimes(1);
		stop();
		image.remove();
	});

	test('starts at once when the page scrolled before it was scheduled', () => {
		const image = document.createElement('img');
		image.setAttribute('fetchpriority', 'high');
		Object.defineProperty(image, 'complete', { value: false });
		document.body.append(image);
		const scrolled = vi.spyOn(window, 'scrollY', 'get').mockReturnValue(120);
		const start = vi.fn();
		scheduleDeferredEngine(start);
		expect(start).toHaveBeenCalledTimes(1);
		scrolled.mockRestore();
		image.remove();
	});

	test('starts on focus or input in the banner, and at once after an early tap', () => {
		const image = document.createElement('img');
		image.setAttribute('fetchpriority', 'high');
		Object.defineProperty(image, 'complete', { value: false });
		const banner = document.createElement('div');
		banner.dataset.testid = 'consent-banner-root';
		const button = document.createElement('button');
		banner.append(button);
		document.body.append(image, banner);

		const start = vi.fn();
		const stop = scheduleDeferredEngine(start);
		document.body.dispatchEvent(new Event('focusin', { bubbles: true }));
		expect(start).not.toHaveBeenCalled();
		button.dispatchEvent(new Event('focusin', { bubbles: true }));
		expect(start).toHaveBeenCalledTimes(1);
		stop();

		const second = vi.fn();
		const stopSecond = scheduleDeferredEngine(second);
		button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(second).toHaveBeenCalledTimes(1);
		stopSecond();

		const host = window as unknown as Record<string, unknown>;
		host[EARLY_TAPS_KEY] = { taps: [{ action: 'accept' }] };
		const early = vi.fn();
		scheduleDeferredEngine(early);
		expect(early).toHaveBeenCalledTimes(1);
		Reflect.deleteProperty(host, EARLY_TAPS_KEY);
		image.remove();
		banner.remove();
	});
});
