/**
 * `useScriptLoader` under a deferred root's stand-in kernel: a script that
 * may run with the server's state starts the engine at once, instead of
 * waiting for the page's priority images or a tap. A gated script the
 * visitor has not allowed does not.
 */
import { createConsentKernel } from '@c15t/core';
import type { ConsentSnapshot } from '@c15t/core';
import { createScriptLoader } from '@c15t/core/modules/script-loader';
import type { Script } from '@c15t/core/modules/script-loader';
import { startPlainScripts } from '@c15t/core/surface-actions/plain-scripts';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { policyFixture } from '../../__tests__/policy-fixture';
import { KernelContext } from '../../context';
import { useScriptLoader } from '../../module-hooks/script-loader';
import { createDeferredKernel } from '../deferred-kernel';
import { setDeferredScriptStarter } from '../registry';
import { isRunnableNow, scriptsNeedEngine } from '../runnable';

/**
 * Leaves what a server render with id `id` leaves in the test's document:
 * boot data carrying the id, and the page object its inline scripts write.
 * c15t's modules run in the test's window, so that is where they look.
 */
const leavePageRender = (
	pageObject: Record<string, unknown>,
	id = 'test-render'
): (() => void) => {
	const boot = document.createElement('script');
	boot.type = 'application/json';
	boot.setAttribute('data-c15t-boot', '');
	boot.textContent = JSON.stringify({ i: id, s: {} });
	document.head.prepend(boot);
	(globalThis as Record<string, unknown>).__c15tRender = { id, ...pageObject };
	return () => {
		boot.remove();
		Reflect.deleteProperty(globalThis, '__c15tRender');
	};
};

const freshVisitor = {
	activeUI: 'banner',
	effectivePermissions: {
		marketing: false,
		measurement: false,
		necessary: true,
	},
} as unknown as ConsentSnapshot;

const gated: Script = {
	category: 'measurement',
	id: 'gated',
	src: '/gated.js',
};

const standIn = function standIn() {
	const requestEngine = vi.fn();
	const handle = createDeferredKernel({
		requestEngine,
		serverSnapshot: freshVisitor,
		snapshot: freshVisitor,
	});
	return { handle, requestEngine };
};

const tick = () =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, 20);
	});

const Loader = ({ scripts }: { scripts: Script[] }) => {
	useScriptLoader(scripts);
	return null;
};

describe('isRunnableNow', () => {
	test.each([
		[{ alwaysLoad: true, category: 'marketing' }, true],
		[{ category: 'necessary' }, true],
		[{ category: 'measurement' }, false],
		[{ category: { or: ['necessary', 'measurement'] } }, true],
		[{ category: { and: ['necessary', 'measurement'] } }, false],
		[{ category: { not: 'marketing' } }, true],
		[{ category: 'unknown-category' }, false],
	] as [Pick<Script, 'alwaysLoad' | 'category'>, boolean][])(
		'%j → %s',
		(script, expected) => {
			expect(isRunnableNow(script, freshVisitor)).toBe(expected);
		}
	);
});

describe('scriptsNeedEngine', () => {
	const started = (): ReturnType<NonNullable<Script['serverStart']>> =>
		undefined as never;
	test('a runnable script the server did not start needs the engine', () => {
		expect(
			scriptsNeedEngine([{ ...gated, alwaysLoad: true }], freshVisitor, true)
		).toBe(true);
	});
	test('a runnable script the server started does not', () => {
		const script = { ...gated, alwaysLoad: true, serverStart: started };
		// The page's server start marks what it starts as it parses.
		const cleanup = leavePageRender({ starts: { gated: 1 } });
		try {
			expect(scriptsNeedEngine([script], freshVisitor, true)).toBe(false);
			// Unless the root turned the server start off.
			expect(scriptsNeedEngine([script], freshVisitor, false)).toBe(true);
		} finally {
			cleanup();
		}
	});
	test('a runnable script with a serverStart the page did not start needs the engine', () => {
		// Its serverStart returned nothing or threw, or it shares a resource:
		// the server left it to the loader and marked nothing.
		const script = { ...gated, alwaysLoad: true, serverStart: started };
		const cleanup = leavePageRender({ starts: {} });
		try {
			expect(scriptsNeedEngine([script], freshVisitor, true)).toBe(true);
		} finally {
			cleanup();
		}
	});
	test('a root that does not name its renders counts a serverStart entry as started', () => {
		// Its boot data carries no render id, so there are no marks to read.
		const script = { ...gated, alwaysLoad: true, serverStart: started };
		expect(scriptsNeedEngine([script], freshVisitor, true)).toBe(false);
	});
	test('a plain script the root starts itself does not', () => {
		const always = { ...gated, category: 'necessary' };
		expect(scriptsNeedEngine([always], freshVisitor, true, true)).toBe(false);
		// One the loader has to run still does.
		expect(
			scriptsNeedEngine(
				[{ ...always, onLoad: () => undefined }],
				freshVisitor,
				true,
				true
			)
		).toBe(true);
	});
	test('a gated script that reports a denial before it loads does', () => {
		const observer = {
			...gated,
			observeConsentBeforeLoad: true,
			onConsentChange: () => undefined,
		};
		expect(scriptsNeedEngine([observer], freshVisitor, true, true)).toBe(true);
	});
	test('gated scripts the visitor has not allowed do not', () => {
		expect(scriptsNeedEngine([gated], freshVisitor, true)).toBe(false);
		expect(scriptsNeedEngine(undefined, freshVisitor, true)).toBe(false);
	});
});

describe('useScriptLoader under a stand-in kernel', () => {
	test('a gated script the visitor has not allowed leaves the engine waiting', async () => {
		const { handle, requestEngine } = standIn();
		await render(
			<KernelContext.Provider value={handle.kernel}>
				<Loader scripts={[gated]} />
			</KernelContext.Provider>
		);
		await tick();
		expect(requestEngine).not.toHaveBeenCalled();
	});

	test.each([
		['an alwaysLoad', { ...gated, alwaysLoad: true, id: 'always' }],
		['a necessary', { ...gated, category: 'necessary', id: 'necessary' }],
	] as [string, Script][])(
		'%s script starts the engine on mount',
		async (_name, script) => {
			const { handle, requestEngine } = standIn();
			await render(
				<KernelContext.Provider value={handle.kernel}>
					<Loader scripts={[gated, script]} />
				</KernelContext.Provider>
			);
			await vi.waitFor(() => expect(requestEngine).toHaveBeenCalled());
		}
	);

	test('a gated script that reports a denial before it loads starts the engine on mount', async () => {
		// The loader calls its onConsentChange with the denial as it mounts.
		const { handle, requestEngine } = standIn();
		await render(
			<KernelContext.Provider value={handle.kernel}>
				<Loader
					scripts={[
						{
							...gated,
							observeConsentBeforeLoad: true,
							onConsentChange: () => undefined,
						},
					]}
				/>
			</KernelContext.Provider>
		);
		await vi.waitFor(() => expect(requestEngine).toHaveBeenCalled());
	});

	test('a runnable script passed after mount starts the engine', async () => {
		const { handle, requestEngine } = standIn();
		const screen = await render(
			<KernelContext.Provider value={handle.kernel}>
				<Loader scripts={[]} />
			</KernelContext.Provider>
		);
		await tick();
		expect(requestEngine).not.toHaveBeenCalled();
		await screen.rerender(
			<KernelContext.Provider value={handle.kernel}>
				<Loader scripts={[{ ...gated, alwaysLoad: true }]} />
			</KernelContext.Provider>
		);
		await vi.waitFor(() => expect(requestEngine).toHaveBeenCalled());
	});
});

describe('useScriptLoader for a returning visitor who chose', () => {
	// A real snapshot: the loader mounts on the stand-in and reads it.
	const returning = createConsentKernel(
		policyFixture({ marketing: true, measurement: true })
	).getSnapshot();

	const chosen = function chosen() {
		const requestEngine = vi.fn();
		const handle = createDeferredKernel({
			requestEngine,
			serverSnapshot: returning,
			snapshot: returning,
		});
		const start = vi.fn();
		setDeferredScriptStarter(handle.kernel, start);
		return { handle, requestEngine, start };
	};

	test('starts a plain allowed script without the engine', async () => {
		const { handle, requestEngine, start } = chosen();
		await render(
			<KernelContext.Provider value={handle.kernel}>
				<Loader scripts={[gated]} />
			</KernelContext.Provider>
		);
		await vi.waitFor(() => expect(start).toHaveBeenCalledWith([gated]));
		await tick();
		expect(requestEngine).not.toHaveBeenCalled();
	});

	test('a script with anonymizeId: false waits for the loader, which the engine brings', async () => {
		// Its code may read the loader's element id as it runs, which only
		// the loader sets.
		const { handle, requestEngine } = chosen();
		await render(
			<KernelContext.Provider value={handle.kernel}>
				<Loader scripts={[{ ...gated, anonymizeId: false }]} />
			</KernelContext.Provider>
		);
		await vi.waitFor(() => expect(requestEngine).toHaveBeenCalled());
	});

	test("the loader gives a script's own code its element id", async () => {
		const seen = globalThis as { __c15tSeenId?: string };
		const kernel = createConsentKernel(
			policyFixture({ marketing: true, measurement: true })
		);
		const loader = createScriptLoader({
			kernel,
			scripts: [
				{
					anonymizeId: false,
					category: 'necessary',
					id: 'reads-its-id',
					src: `data:text/javascript,${encodeURIComponent(
						'window.__c15tSeenId=document.currentScript&&document.currentScript.id'
					)}`,
				},
			],
		});
		try {
			await vi.waitFor(() => {
				expect(seen.__c15tSeenId).toBe('c15t-script-reads-its-id');
			});
		} finally {
			loader.dispose();
			Reflect.deleteProperty(globalThis, '__c15tSeenId');
		}
	});

	test('a script the loader has to run still starts the engine', async () => {
		const { handle, requestEngine } = chosen();
		await render(
			<KernelContext.Provider value={handle.kernel}>
				<Loader scripts={[{ ...gated, onLoad: () => undefined }]} />
			</KernelContext.Provider>
		);
		await vi.waitFor(() => expect(requestEngine).toHaveBeenCalled());
	});
});

describe('scripts a hook started before its loader', () => {
	const returning = createConsentKernel(
		policyFixture({ marketing: true, measurement: true })
	).getSnapshot();
	const owned: Script = {
		category: 'measurement',
		id: 'owned-early',
		src: '/never-served/owned-early.js',
	};
	const inPage = (): boolean =>
		document.querySelector('script[src$="/owned-early.js"]') !== null;

	/** A stand-in whose loader chunk never arrives, starting plain scripts. */
	const chosen = function chosen() {
		const handle = createDeferredKernel({
			requestEngine: vi.fn(),
			serverSnapshot: returning,
			snapshot: returning,
		});
		setDeferredScriptStarter(handle.kernel, (scripts) =>
			startPlainScripts(scripts, returning, undefined)
		);
		return handle;
	};

	afterEach(() => {
		for (const script of document.querySelectorAll(
			'script[src$="/owned-early.js"]'
		)) {
			script.remove();
		}
		Reflect.deleteProperty(globalThis, '__c15tStarted');
	});

	test('are not started for a hook that unmounted before a commit made the loader ready', async () => {
		// A fresh visitor: nothing starts at mount. The hook unmounts, then a
		// banner tap commits without the engine and installs a starter.
		const handle = createDeferredKernel({
			requestEngine: vi.fn(),
			serverSnapshot: returning,
			snapshot: returning,
		});
		const screen = await render(
			<KernelContext.Provider value={handle.kernel}>
				<Loader scripts={[owned]} />
			</KernelContext.Provider>
		);
		await screen.unmount();
		setDeferredScriptStarter(handle.kernel, (scripts) =>
			startPlainScripts(scripts, returning, undefined)
		);
		handle.commit(returning, []);
		await new Promise((resolve) => {
			setTimeout(resolve, 50);
		});
		expect(inPage()).toBe(false);
	});

	test('stay while another hook still declares them, and go with the last', async () => {
		const handle = chosen();
		const other = {
			...owned,
			id: 'other-hook-entry',
			resourceKey: 'owned-early',
		};
		const first = await render(
			<KernelContext.Provider value={handle.kernel}>
				<Loader scripts={[owned]} />
			</KernelContext.Provider>
		);
		await vi.waitFor(() => expect(inPage()).toBe(true));
		// A second hook declares the same resource, which is already in.
		const second = await render(
			<KernelContext.Provider value={handle.kernel}>
				<Loader scripts={[other]} />
			</KernelContext.Provider>
		);
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		await first.unmount();
		expect(inPage()).toBe(true);
		await second.unmount();
		expect(inPage()).toBe(false);
	});

	test('are not held, and the engine is requested, by a second hook that declares the key otherwise', async () => {
		const requestEngine = vi.fn();
		const handle = createDeferredKernel({
			requestEngine,
			serverSnapshot: returning,
			snapshot: returning,
		});
		setDeferredScriptStarter(handle.kernel, (scripts) =>
			startPlainScripts(scripts, returning, undefined)
		);
		const first = await render(
			<KernelContext.Provider value={handle.kernel}>
				<Loader scripts={[owned]} />
			</KernelContext.Provider>
		);
		await vi.waitFor(() => expect(inPage()).toBe(true));
		const second = await render(
			<KernelContext.Provider value={handle.kernel}>
				<Loader
					scripts={[
						{
							...owned,
							id: 'other-hook-entry',
							resourceKey: 'owned-early',
							src: '/never-served/owned-early-v2.js',
						},
					]}
				/>
			</KernelContext.Provider>
		);
		await vi.waitFor(() => expect(requestEngine).toHaveBeenCalled());
		// The second hook never held the first one's element.
		await first.unmount();
		expect(inPage()).toBe(false);
		await second.unmount();
	});

	test.each([
		['a new src', { src: '/never-served/owned-early-v2.js' }],
		['a denied category', { category: 'functionality' }],
	] as [string, Partial<Script>][])(
		'are released, and the engine requested, when the hook gives the same key %s',
		async (_case, change) => {
			const requestEngine = vi.fn();
			const handle = createDeferredKernel({
				requestEngine,
				serverSnapshot: returning,
				snapshot: returning,
			});
			setDeferredScriptStarter(handle.kernel, (scripts) =>
				startPlainScripts(scripts, returning, undefined)
			);
			const screen = await render(
				<KernelContext.Provider value={handle.kernel}>
					<Loader scripts={[owned]} />
				</KernelContext.Provider>
			);
			await vi.waitFor(() => expect(inPage()).toBe(true));
			await screen.rerender(
				<KernelContext.Provider value={handle.kernel}>
					<Loader scripts={[{ ...owned, ...change }]} />
				</KernelContext.Provider>
			);
			await vi.waitFor(() => expect(inPage()).toBe(false));
			expect(requestEngine).toHaveBeenCalled();
		}
	);

	test('that one hook declares twice under one key stay until the hook changes one', async () => {
		const requestEngine = vi.fn();
		const handle = createDeferredKernel({
			requestEngine,
			serverSnapshot: returning,
			snapshot: returning,
		});
		// As the root's starter does, it starts nothing once the engine was
		// asked for.
		setDeferredScriptStarter(handle.kernel, (scripts) =>
			requestEngine.mock.calls.length > 0
				? []
				: startPlainScripts(scripts, returning, undefined)
		);
		const twin = {
			...owned,
			id: 'owned-early-twin',
			resourceKey: 'owned-early',
		};
		const view = (scripts: Script[]) => (
			<KernelContext.Provider value={handle.kernel}>
				<Loader scripts={scripts} />
			</KernelContext.Provider>
		);
		const screen = await render(view([owned, twin]));
		await vi.waitFor(() => expect(inPage()).toBe(true));
		// The same two, as new objects: nothing changed.
		await screen.rerender(view([{ ...owned }, { ...twin }]));
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect(inPage()).toBe(true);
		expect(requestEngine).not.toHaveBeenCalled();
		// One of them moves.
		await screen.rerender(
			view([owned, { ...twin, src: '/never-served/owned-early-v2.js' }])
		);
		await vi.waitFor(() => expect(inPage()).toBe(false));
		expect(requestEngine).toHaveBeenCalled();
	});

	test('leave with the hook when it unmounts first', async () => {
		const handle = chosen();
		const screen = await render(
			<KernelContext.Provider value={handle.kernel}>
				<Loader scripts={[owned]} />
			</KernelContext.Provider>
		);
		await vi.waitFor(() => expect(inPage()).toBe(true));
		await screen.unmount();
		expect(inPage()).toBe(false);
		expect(
			(globalThis as { __c15tStarted?: Record<string, unknown> })
				.__c15tStarted?.['owned-early']
		).toBeUndefined();
	});

	test('leave when the hook drops them', async () => {
		const handle = chosen();
		const screen = await render(
			<KernelContext.Provider value={handle.kernel}>
				<Loader scripts={[owned]} />
			</KernelContext.Provider>
		);
		await vi.waitFor(() => expect(inPage()).toBe(true));
		await screen.rerender(
			<KernelContext.Provider value={handle.kernel}>
				<Loader scripts={[]} />
			</KernelContext.Provider>
		);
		await vi.waitFor(() => expect(inPage()).toBe(false));
		expect(
			(globalThis as { __c15tStarted?: Record<string, unknown> })
				.__c15tStarted?.['owned-early']
		).toBeUndefined();
	});
});
