/**
 * The stand-in kernel: reads come from the server's snapshots, actions
 * wait for the engine and run on it, and once attached every read goes to
 * the engine while subscribers stay subscribed.
 */
import type { ConsentKernel, ConsentSnapshot } from '@inth/sdk/engine';
import { describe, expect, test, vi } from 'vite-plus/test';

import {
	EARLY_TAP_HOLD_PRESSES_KEY,
	EARLY_TAP_NOTIFY_KEY,
	EARLY_TAP_STYLE_ID,
	EARLY_TAPS_WINDOW_KEY,
	SERVER_START_FAILED_EVENT,
} from '../../../../core/src/libs/page-globals';
import { EARLY_CONSENT_TAP_SCRIPT } from '../../../../core/src/surface-actions/early-consent-tap-script';
import {
	DISPLAY_ONLY_OPTIONS,
	liveRootKey,
	rootNeedsEngine,
	watchStoredChoice,
} from '../boot';
import { createDeferredKernel } from '../create-deferred-kernel';
import type { DeferredEngine } from '../create-deferred-kernel';
import {
	deferredModules,
	deferredScriptsReady,
} from '../deferred-registry.model';
import { scriptsNeedEngine } from '../runnable-script.model';
import { scheduleDeferredEngine } from '../schedule-deferred-engine';
import { OPTIONS } from './live-key-fields.type-test';

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
	test('with a tap router: a queued tap is routed, and banner input starts the engine', () => {
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
		host[EARLY_TAPS_WINDOW_KEY] = queue;
		try {
			const start = vi.fn();
			const onTap = vi.fn();
			const stop = scheduleDeferredEngine(start, onTap);
			// The early-tap script calls this after it queued a click.
			(queue[EARLY_TAP_NOTIFY_KEY] as () => void)();
			expect(onTap).toHaveBeenLastCalledWith();
			expect(start).not.toHaveBeenCalled();
			// The banner replays its own taps with the engine, so a press on
			// it wakes the engine like any other input.
			accept.dispatchEvent(new Event('pointerdown', { bubbles: true }));
			expect(start).toHaveBeenCalledTimes(1);
			stop();
			expect(queue[EARLY_TAP_NOTIFY_KEY]).toBeUndefined();

			// A tap queued before hydration is routed when scheduled.
			queue.taps = [{ action: 'accept', at: 1 }];
			const early = vi.fn();
			const routed = vi.fn();
			const stopEarly = scheduleDeferredEngine(early, routed);
			expect(routed).toHaveBeenCalledTimes(1);
			expect(early).not.toHaveBeenCalled();
			stopEarly();
		} finally {
			Reflect.deleteProperty(host, EARLY_TAPS_WINDOW_KEY);
			image.remove();
			banner.remove();
		}
	});

	test('a press on the banner starts the engine though the early-tap script holds it', () => {
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
		// oxlint-disable-next-line no-new-func -- Runs the inline script as server HTML would.
		new Function(EARLY_CONSENT_TAP_SCRIPT)();
		const queue = host[EARLY_TAPS_WINDOW_KEY] as Record<string, unknown> & {
			stop: () => void;
		};
		// The root holds presses on the banner until the engine renders.
		queue[EARLY_TAP_HOLD_PRESSES_KEY] = 1;
		try {
			const start = vi.fn();
			const onTap = vi.fn();
			const stop = scheduleDeferredEngine(start, onTap);
			expect(start).not.toHaveBeenCalled();
			// The script stops the press at the document; the engine's wake-up
			// listens on the window, which sees it first.
			accept.dispatchEvent(
				new PointerEvent('pointerdown', { bubbles: true, composed: true })
			);
			expect(start).toHaveBeenCalledTimes(1);
			accept.click();
			expect(onTap).toHaveBeenCalledTimes(1);
			stop();
		} finally {
			queue.stop();
			Reflect.deleteProperty(host, EARLY_TAPS_WINDOW_KEY);
			document.getElementById(EARLY_TAP_STYLE_ID)?.remove();
			image.remove();
			banner.remove();
		}
	});

	test('queued taps stay routed after the engine started, until stopped', () => {
		// No priority image: the engine starts as soon as it is scheduled.
		const host = window as unknown as Record<string, Record<string, unknown>>;
		const queue: Record<string, unknown> = { taps: [] };
		host[EARLY_TAPS_WINDOW_KEY] = queue;
		try {
			const start = vi.fn();
			const onTap = vi.fn();
			const stop = scheduleDeferredEngine(start, onTap);
			expect(start).toHaveBeenCalledTimes(1);
			// The engine is still downloading: a queued tap is still the root's.
			(queue[EARLY_TAP_NOTIFY_KEY] as () => void)();
			expect(onTap).toHaveBeenCalledTimes(1);
			stop();
			expect(queue[EARLY_TAP_NOTIFY_KEY]).toBeUndefined();
		} finally {
			Reflect.deleteProperty(host, EARLY_TAPS_WINDOW_KEY);
		}
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
		host[EARLY_TAPS_WINDOW_KEY] = { taps: [{ action: 'accept' }] };
		const early = vi.fn();
		scheduleDeferredEngine(early);
		expect(early).toHaveBeenCalledTimes(1);
		Reflect.deleteProperty(host, EARLY_TAPS_WINDOW_KEY);
		image.remove();
		banner.remove();
	});
});

describe('watchStoredChoice', () => {
	test('checks again when the stored decision reaches its deadline', () => {
		vi.useFakeTimers();
		try {
			const check = vi.fn();
			const stop = watchStoredChoice(check, Date.now() + 60_000);
			vi.advanceTimersByTime(59_999);
			expect(check).not.toHaveBeenCalled();
			vi.advanceTimersByTime(1);
			expect(check).toHaveBeenCalledTimes(1);
			stop();
		} finally {
			vi.useRealTimers();
		}
	});

	test('checks at a deadline beyond the longest timer delay', () => {
		// About 24.8 days: shorter than common consent lifetimes.
		const longest = 2_147_483_647;
		vi.useFakeTimers();
		try {
			const check = vi.fn();
			const stop = watchStoredChoice(check, Date.now() + longest + 60_000);
			vi.advanceTimersByTime(longest);
			vi.advanceTimersByTime(59_999);
			expect(check).not.toHaveBeenCalled();
			vi.advanceTimersByTime(1);
			expect(check).toHaveBeenCalledTimes(1);
			stop();
		} finally {
			vi.useRealTimers();
		}
	});

	test('stops checking once stopped', () => {
		const check = vi.fn();
		const stop = watchStoredChoice(check, null);
		stop();
		window.dispatchEvent(new Event('storage'));
		window.dispatchEvent(new Event('focus'));
		expect(check).not.toHaveBeenCalled();
	});
});

/**
 * Leaves what a server render with id `id` leaves in the test's document:
 * boot data carrying the id, and the page object its inline scripts write.
 * Inth's modules run in the test's window, so that is where they look.
 */
const leavePageRender = (
	pageObject: Record<string, unknown>,
	id = 'test-render'
): (() => void) => {
	const boot = document.createElement('script');
	boot.type = 'application/json';
	boot.setAttribute('data-inth-boot', '');
	boot.textContent = JSON.stringify({ i: id, s: {} });
	document.head.prepend(boot);
	(globalThis as Record<string, unknown>).__inthRender = { id, ...pageObject };
	return () => {
		boot.remove();
		Reflect.deleteProperty(globalThis, '__inthRender');
	};
};

describe('a server start that fails while the engine waits', () => {
	/** A hero image still loading, so nothing else wakes the engine. */
	const loadingHero = () => {
		const image = document.createElement('img');
		image.setAttribute('fetchpriority', 'high');
		Object.defineProperty(image, 'complete', { value: false });
		document.body.append(image);
		return () => image.remove();
	};

	test('loads the engine when the page reports it', () => {
		const removeHero = loadingHero();
		const start = vi.fn();
		const dispose = scheduleDeferredEngine(start);
		expect(start).not.toHaveBeenCalled();
		window.dispatchEvent(new Event(SERVER_START_FAILED_EVENT));
		expect(start).toHaveBeenCalledTimes(1);
		dispose();
		removeHero();
	});

	test('loads the engine at once when it failed before the root scheduled it', () => {
		const removeHero = loadingHero();
		const cleanup = leavePageRender({ failed: 1, starts: {} });
		try {
			const start = vi.fn();
			const dispose = scheduleDeferredEngine(start);
			expect(start).toHaveBeenCalledTimes(1);
			dispose();
		} finally {
			cleanup();
			removeHero();
		}
	});
});

test("a failure an earlier render's server start recorded does not wake this root", () => {
	const image = document.createElement('img');
	image.setAttribute('fetchpriority', 'high');
	Object.defineProperty(image, 'complete', { value: false });
	document.body.append(image);
	const cleanup = leavePageRender({ starts: {} });
	(globalThis as Record<string, unknown>).__inthRender = {
		failed: 1,
		id: 'an-earlier-render',
		starts: {},
	};
	try {
		const start = vi.fn();
		const dispose = scheduleDeferredEngine(start);
		expect(start).not.toHaveBeenCalled();
		dispose();
	} finally {
		cleanup();
		image.remove();
	}
});

describe('liveRootKey', () => {
	const script = {
		category: 'marketing',
		id: 'pixel',
		src: 'https://cdn.example.com/pixel.js',
	};
	const root = (extra: Record<string, unknown> = {}) => ({
		options: { callbacks: { onPermissionsChanged: () => undefined } },
		scripts: [{ ...script }],
		...extra,
	});
	type Root = Parameters<typeof liveRootKey>[0];

	test.each(Object.entries(OPTIONS))('options.%s is %s', (name, kind) => {
		expect(DISPLAY_ONLY_OPTIONS.includes(name as never)).toBe(
			kind === 'display'
		);
		const changed = root({ options: { ...root().options, [name]: { x: 1 } } });
		expect(liveRootKey(changed as Root) !== liveRootKey(root() as Root)).toBe(
			kind === 'key'
		);
	});

	test('a root prop outside the display-only list changes the key', () => {
		// Any prop, including one added later.
		expect(liveRootKey(root({ somethingNew: 1 }) as Root)).not.toBe(
			liveRootKey(root() as Root)
		);
		expect(liveRootKey(root({ children: 'page' }) as Root)).toBe(
			liveRootKey(root() as Root)
		);
	});

	test('changes when the consent overrides change', () => {
		expect(
			liveRootKey(
				root({
					options: { ...root().options, overrides: { gpc: true } },
				}) as Root
			)
		).not.toBe(liveRootKey(root() as Root));
	});

	test('stays the same for an equal inline array and a fresh inline callback', () => {
		expect(liveRootKey(root() as Root)).toBe(liveRootKey(root() as Root));
	});
	test.each([
		['a root script added', { scripts: [script, { ...script, id: 'b' }] }],
		['a network blocker enabled', { networkBlocker: {} }],
		['the root turned off', { options: { enabled: false } }],
		[
			'onLoad added to a script',
			{ scripts: [{ ...script, onLoad: () => undefined }] },
		],
		['a vendor set on a script', { scripts: [{ ...script, vendor: 'v' }] }],
		[
			'a script attribute added',
			{ scripts: [{ ...script, attributes: { a: '1' } }] },
		],
		['a script nonce set', { scripts: [{ ...script, nonce: 'n' }] }],
		[
			'the persistence storage config changed',
			{ persistence: { storageConfig: { storageKey: 'other' } } },
		],
		['the root nonce changed', { options: { nonce: 'n' } }],
		['a callback removed', { options: {} }],
		['server start turned off', { scriptLoader: { serverStart: false } }],
	] as [string, Record<string, unknown>][])(
		'changes with %s',
		(_case, extra) => {
			expect(liveRootKey(root(extra) as Root)).not.toBe(
				liveRootKey(root() as Root)
			);
		}
	);

	test("changes when a script's callbackOnly predicate is replaced, not when it is kept", () => {
		// The loader remounts a script given a new predicate.
		const predicate = () => false;
		const at = liveRootKey(
			root({ scripts: [{ ...script, callbackOnly: predicate }] }) as Root
		);
		expect(
			liveRootKey(
				root({ scripts: [{ ...script, callbackOnly: predicate }] }) as Root
			)
		).toBe(at);
		expect(
			liveRootKey(
				root({ scripts: [{ ...script, callbackOnly: () => true }] }) as Root
			)
		).not.toBe(at);
	});

	test('changes when the state is swapped or removed, not when it is kept', () => {
		const state = { now: 1 };
		const at = liveRootKey(root({ state }) as Root);
		expect(liveRootKey(root({ state }) as Root)).toBe(at);
		expect(liveRootKey(root({ state: { now: 1 } }) as Root)).not.toBe(at);
		expect(liveRootKey(root() as Root)).not.toBe(at);
	});

	test('covers every root field the deferral rule reads', () => {
		// Records the fields `rootNeedsEngine` and `scriptsNeedEngine` read
		// from a root, through proxies, and checks the key changes with each.
		const read = new Set<string>();
		const watch = <Value extends object>(value: Value, prefix: string) =>
			new Proxy(value, {
				get(target, key) {
					if (typeof key === 'string') {
						read.add(`${prefix}${key}`);
					}
					return (target as Record<PropertyKey, unknown>)[key];
				},
			});
		const scriptRead = watch({ ...script, alwaysLoad: true }, 'scripts.');
		// The root itself is watched too, for the top-level fields it reads.
		rootNeedsEngine(
			watch(
				{
					networkBlocker: watch({ enabled: true }, 'networkBlocker.'),
					options: watch({}, 'options.'),
				},
				'root.'
			)
		);
		scriptsNeedEngine(
			[scriptRead],
			{ effectivePermissions: { marketing: true } } as never,
			true,
			true,
			() => true
		);
		expect(read.size).toBeGreaterThan(0);
		for (const field of read) {
			const [scope, name] = field.split('.') as [string, string];
			let changed: Record<string, unknown> = { [scope]: { [name]: 'changed' } };
			if (scope === 'root') {
				changed = { [name]: { changed: true } };
			}
			if (scope === 'scripts') {
				changed = { scripts: [{ ...script, [name]: 'changed' }] };
			}
			if (scope === 'options') {
				// Only this field differs: the callbacks stay.
				changed = { options: { ...root().options, [name]: 'changed' } };
			}
			expect(
				liveRootKey(root(changed) as Root),
				`the key follows ${field}`
			).not.toBe(liveRootKey(root() as Root));
		}
	});
});
