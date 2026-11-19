import { useScriptLoader } from '@inth/react';
import { ServerBootData } from '@inth/react/deferred/engine';
import { useSaveConsents, useSnapshot } from '@inth/react/hooks';
import { ConsentProvider } from '@inth/react/provider';
/**
 * In the browser, the Next.js `ConsentRoot` reads the snapshot the server
 * left in the page and decides when its engine loads: after the page's
 * priority images for a visitor the banner asks to choose, or a returning
 * visitor whose stored choice is current; at once for one it must serve.
 * The engine marks its arrival by rendering the boot data's slot.
 *
 * The same cases as `@inth/tanstack-start`'s `root-deferred.test.tsx`.
 * The banner tap before the engine is covered by `@inth/react`'s
 * `deferred/__tests__/commit-path.test.tsx` and the example app journeys.
 */
import type { Callbacks } from '@inth/sdk/engine';
import type { Script } from '@inth/sdk/modules/script-loader';
import {
	serverScriptStart,
	storedChoiceCheckScript,
} from '@inth/sdk/runtime/script-server-start';
import { act, StrictMode, useLayoutEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { encodeStoredConsentEnvelopeJson } from '../../../core/src/modules/persistence/writer/encode';
import { ConsentRoot } from '../root';
import type { ConsentRootProps } from '../root';
import type { ConsentState } from '../types';
import { transportMode } from './fixtures/transport-mode';
import { policyFixture } from './policy-fixture';

const mode = transportMode({
	init: () => Promise.resolve({}),
	save: () => Promise.resolve({ ok: true as const }),
});
const consentCategories = ['necessary', 'marketing'] as const;
const rule = { categories: ['marketing'], scopeMode: 'permissive' } as const;

/**
 * The server's consent state for `values`, recorded and read at `now`
 * (by default the current time), so none reads as a future choice.
 */
const stateFor = (
	values: Parameters<typeof policyFixture>[0],
	now?: number
): ConsentState => {
	const at = now ?? Date.now();
	return { ...policyFixture(values, rule, at), now: at } as ConsentState;
};

const cleanups: (() => void)[] = [];

/** A hero image that is still loading and never loads by itself. */
const loadingHero = (): HTMLImageElement => {
	const image = document.createElement('img');
	image.setAttribute('fetchpriority', 'high');
	Object.defineProperty(image, 'complete', { value: false });
	document.body.append(image);
	cleanups.push(() => image.remove());
	return image;
};

/** The id of the server render these tests stand in for. */
const RENDER_ID = 'test-render';

/** Leaves the boot data a server render of `state` would in the page. */
const leaveBootData = (state: ConsentState): void => {
	const holder = document.createElement('div');
	holder.innerHTML = renderToString(
		<ConsentProvider
			options={{
				consentCategories: [...consentCategories],
				mode,
				prefetch: state,
			}}
		>
			<ServerBootData renderId={RENDER_ID} />
		</ConsentProvider>
	);
	const boot = holder.querySelector('script[data-inth-boot]');
	if (!boot) {
		throw new Error('the server render left no boot data');
	}
	document.head.append(boot);
	cleanups.push(() => boot.remove());
};

/** The globals the server's inline scripts leave in the page. */
interface ServerStartGlobals {
	__inthRender?: { starts?: Record<string, number> };
	__inthStarted?: Record<string, HTMLScriptElement | undefined>;
}

/** The test's window, with what the server's inline scripts leave there. */
const startGlobals: Window & ServerStartGlobals = window;

/** Marks `key` as started in the page object, as the server's start does. */
const markStarted = (key: string): void => {
	const starts = startGlobals.__inthRender?.starts;
	if (starts) {
		starts[key] = 1;
	}
};

/** A plain marketing script, as a returning visitor's choice allows. */
const PIXEL = '/never-served/pixel.js';
const scripts: Script[] = [{ category: 'marketing', id: 'pixel', src: PIXEL }];

/**
 * Runs the stored-choice check a server render of `state` leaves in the
 * page, as the browser would while parsing it.
 */
const runStoredChoiceCheck = (state: ConsentState): void => {
	const code = storedChoiceCheckScript(
		{
			consentCategories: [...consentCategories],
			mode,
			prefetch: state,
		},
		undefined,
		RENDER_ID
	);
	expect(code).toBeDefined();
	// oxlint-disable-next-line no-new-func -- Runs the server's inline script, as the page would.
	new Function(code ?? '')();
	cleanups.push(() => {
		Reflect.deleteProperty(window, '__inthRender');
	});
};

const pixelStarted = (src = PIXEL): boolean =>
	document.querySelector(`script[src$="${src}"]`) !== null;

/** A plain marketing script passed to `ConsentRoot` itself. */
const ROOT_PIXEL = '/never-served/root-pixel.js';
const rootPixel: Script = {
	category: 'marketing',
	id: 'root-pixel',
	src: ROOT_PIXEL,
};
const rootScripts: Script[] = [rootPixel];

const Probe = () => {
	const snapshot = useSnapshot();
	useScriptLoader(scripts);
	return (
		<main
			data-active-ui={snapshot.activeUI}
			data-marketing={String(snapshot.effectivePermissions.marketing)}
		/>
	);
};

const mount = async (
	state: ConsentState,
	callbacks?: Callbacks,
	props: Partial<ConsentRootProps> = {}
) => {
	// Persistence on, as an app has it: the engine reads the browser's
	// stored records when it loads.
	const container = document.createElement('div');
	document.body.append(container);
	let root: Root | undefined;
	await act(() => {
		root = createRoot(container);
		root.render(
			<ConsentRoot
				options={{
					callbacks,
					consentCategories: [...consentCategories],
					mode,
				}}
				persistence
				state={state}
				{...props}
			>
				<Probe />
			</ConsentRoot>
		);
	});
	cleanups.push(() => {
		root?.unmount();
		container.remove();
	});
	/** Renders the root again with `next` props, as a navigation would. */
	const rerender = async (
		next: Partial<ConsentRootProps>,
		extra?: ReactNode
	) => {
		await act(() => {
			root?.render(
				<ConsentRoot
					options={{
						callbacks,
						consentCategories: [...consentCategories],
						mode,
					}}
					persistence
					state={state}
					{...next}
				>
					<Probe />
					{extra}
				</ConsentRoot>
			);
		});
	};
	return {
		engineIn: () => container.querySelector('script[data-inth-boot]') !== null,
		main: () => container.querySelector('main'),
		rerender,
		unmount: () =>
			act(() => {
				root?.unmount();
			}),
	};
};

const settle = () =>
	act(
		() =>
			new Promise<void>((resolve) => {
				setTimeout(resolve, 100);
			})
	);

beforeEach(async () => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	localStorage.clear();
	// A root the last test unmounted ends its render a task later, and
	// every test names the same render. Let it, then forget it, so this
	// test's render starts fresh.
	await new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});
	Reflect.deleteProperty(window, '__inthRender');
	Reflect.deleteProperty(window, '__inthEndedRenders');
});

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) {
		cleanup();
	}
	for (const script of document.querySelectorAll(
		'script[src*="/never-served/"]'
	)) {
		script.remove();
	}
	Reflect.deleteProperty(window, '__inthStarted');
	localStorage.clear();
});

test('a visitor the banner asks waits for the hero before the engine loads', async () => {
	const state = stateFor({});
	const hero = loadingHero();
	leaveBootData(state);

	const page = await mount(state);
	// The page renders from the server's snapshot, without the engine.
	expect(page.main()?.dataset.activeUi).toBe('banner');
	expect(page.main()?.dataset.marketing).toBe('false');
	await settle();
	expect(page.engineIn()).toBe(false);

	await act(() => {
		hero.dispatchEvent(new Event('load'));
	});
	await settle();
	expect(page.engineIn()).toBe(true);
	expect(page.main()?.dataset.activeUi).toBe('banner');
});

test('a returning visitor whose stored choice is current starts their scripts and waits for the hero', async () => {
	const state = stateFor({ marketing: true });
	const hero = loadingHero();
	leaveBootData(state);
	runStoredChoiceCheck(state);

	const page = await mount(state);
	expect(page.main()?.dataset.marketing).toBe('true');
	await settle();
	// The choice's plain script runs without the engine, which waits.
	expect(pixelStarted()).toBe(true);
	expect(page.engineIn()).toBe(false);

	await act(() => {
		hero.dispatchEvent(new Event('load'));
	});
	await settle();
	expect(page.engineIn()).toBe(true);
	expect(page.main()?.dataset.marketing).toBe('true');
	// The loader adopted the script rather than inserting another.
	expect(document.querySelectorAll(`script[src$="${PIXEL}"]`)).toHaveLength(1);
});

test('a visitor who chose, without a confirmed stored choice, gets the engine at once', async () => {
	// No stored-choice check ran: shared or cached HTML, or a server that
	// resolved no visitor's state.
	const state = stateFor({ marketing: true });
	loadingHero();
	leaveBootData(state);

	const page = await mount(state);
	expect(page.main()?.dataset.marketing).toBe('true');
	await settle();
	// The hero is still loading: only an engine started at once is in.
	expect(page.engineIn()).toBe(true);
});

test('a returning visitor whose browser holds a newer denial hears the callbacks before the hero loads', async () => {
	// The cookie the server read holds a grant; a later denial reached only
	// localStorage. The engine applies it when it loads and the app's
	// callbacks hear the change, so the root must not wait for the hero,
	// nor start the denied script without the engine.
	const fixture = policyFixture({ marketing: true }, rule);
	const grant = fixture.initialRecords?.choice?.categories.marketing;
	if (!grant) {
		throw new Error('the fixture grants marketing');
	}
	const state = {
		...fixture,
		initialRecords: {
			choice: {
				categories: {
					marketing: { ...grant, confirmedAt: fixture.now - 60_000 },
				},
				version: 3,
			},
		},
	} as ConsentState;
	localStorage.setItem(
		'inth',
		encodeStoredConsentEnvelopeJson({
			categories: {
				marketing: { ...grant, confirmedAt: fixture.now - 1000, value: false },
			},
			version: 3,
		})
	);
	loadingHero();
	leaveBootData(state);
	runStoredChoiceCheck(state);
	const onPermissionsChanged = vi.fn();

	const page = await mount(state, { onPermissionsChanged });
	await settle();
	// The hero is still loading: only an engine started at once is in.
	expect(page.engineIn()).toBe(true);
	expect(page.main()?.dataset.marketing).toBe('false');
	expect(onPermissionsChanged).toHaveBeenCalled();
	expect(pixelStarted()).toBe(false);
});

test("a returning visitor's root scripts start before the hero, without the engine", async () => {
	const state = stateFor({ marketing: true });
	loadingHero();
	leaveBootData(state);
	runStoredChoiceCheck(state);

	const page = await mount(state, undefined, { scripts: rootScripts });
	await settle();
	expect(pixelStarted(ROOT_PIXEL)).toBe(true);
	expect(page.engineIn()).toBe(false);
});

test('a returning visitor who denied a script that observes consent before it loads hears the denial before the hero loads', async () => {
	// The loader calls onConsentChange with the first decision, a denial
	// too, as it mounts; an integration switches a shared SDK off with it.
	const state = stateFor({ marketing: false });
	loadingHero();
	leaveBootData(state);
	runStoredChoiceCheck(state);
	const onConsentChange = vi.fn();

	const page = await mount(state, undefined, {
		scripts: [
			{
				...rootPixel,
				observeConsentBeforeLoad: true,
				onConsentChange,
			},
		] as ConsentRootProps['scripts'],
	});
	await settle();
	// The hero is still loading: only an engine started at once is in.
	expect(page.engineIn()).toBe(true);
	await vi.waitFor(() => expect(onConsentChange).toHaveBeenCalled());
	expect(pixelStarted(ROOT_PIXEL)).toBe(false);
});

test('with persistence off, root scripts the root cannot start load the engine at once', async () => {
	// Without persistence the root has no commit path, so nothing but the
	// engine starts its `scripts`: waiting for the hero would hold them.
	const state = stateFor({ marketing: true });
	loadingHero();
	leaveBootData(state);
	runStoredChoiceCheck(state);

	const page = await mount(state, undefined, {
		persistence: false,
		scripts: rootScripts,
	});
	await settle();
	expect(page.engineIn()).toBe(true);
});

const serverStarted: Script = {
	category: 'marketing',
	id: 'started-pixel',
	serverStart: () => ({ code: '' }),
	src: '/never-served/started-pixel.js',
};

test.each([
	['returned nothing', { ...serverStarted, serverStart: () => undefined }],
	[
		'threw',
		{
			...serverStarted,
			serverStart: () => {
				throw new Error('setup failed');
			},
		},
	],
	['shares a resourceKey', { ...serverStarted, resourceKey: 'shared' }],
] as const)(
	'a root script whose serverStart %s loads the engine at once',
	async (_case, script) => {
		// The server's start left this entry to the loader and marked
		// nothing for it, so the engine has to run it.
		const state = stateFor({ marketing: true });
		loadingHero();
		leaveBootData(state);
		runStoredChoiceCheck(state);

		const page = await mount(state, undefined, { scripts: [script] });
		await settle();
		expect(page.engineIn()).toBe(true);
	}
);

test.each<[keyof Script, boolean]>([
	['onError', true],
	['onLoad', true],
	['onDispose', true],
	['persistAfterDispose', true],
	['onBeforeLoad', false],
	['onConsentChange', false],
	// A revoke loads the engine, whose loader adopts the element first.
	['persistAfterConsentRevoked', false],
])(
	'a root script the server started with %s loads the engine at once: %s',
	async (field, eager) => {
		// Only the loader hears the element's load or error, and only it
		// keeps the element or calls onDispose when a root that goes first
		// would remove it. The server start's code ran the setup
		// onBeforeLoad would, and a consent change takes the engine anyway.
		const state = stateFor({ marketing: true });
		loadingHero();
		leaveBootData(state);
		runStoredChoiceCheck(state);
		markStarted('started-pixel');

		const page = await mount(state, undefined, {
			scripts: [
				{
					...serverStarted,
					[field]: field.startsWith('on') ? () => undefined : true,
				},
			] as ConsentRootProps['scripts'],
		});
		await settle();
		// The hero is still loading: only an engine started at once is in.
		expect(page.engineIn()).toBe(eager);
	}
);

test('a root script the server started lets the engine wait for the hero', async () => {
	const state = stateFor({ marketing: true });
	loadingHero();
	leaveBootData(state);
	runStoredChoiceCheck(state);
	// What the server's start marks as the page parses.
	markStarted('started-pixel');

	const page = await mount(state, undefined, { scripts: [serverStarted] });
	await settle();
	expect(page.engineIn()).toBe(false);
});

test.each<[string, Partial<ConsentRootProps>]>([
	['a permitted root script is added', { scripts: rootScripts }],
	['a network blocker is enabled', { networkBlocker: { rules: [] } }],
])(
	"while a returning visitor's engine waits, it loads at once when %s",
	async (_case, next) => {
		const state = stateFor({ marketing: true });
		loadingHero();
		leaveBootData(state);
		runStoredChoiceCheck(state);

		const page = await mount(state);
		await settle();
		expect(page.engineIn()).toBe(false);
		await page.rerender(next);
		await settle();
		// The plan made at mount no longer holds, so the engine runs it.
		expect(page.engineIn()).toBe(true);
	}
);

/** A plain root script and a root that passes a fresh inline callback. */
const liveRoot = (
	extra: Partial<ConsentRootProps> = {}
): Partial<ConsentRootProps> => ({
	options: {
		callbacks: { onPermissionsChanged: () => undefined },
		consentCategories: [...consentCategories],
		mode,
	},
	scripts: [{ ...rootPixel }] as ConsentRootProps['scripts'],
	...extra,
});

test.each<[string, Partial<ConsentRootProps>]>([
	[
		'onLoad is added to a root script',
		{
			scripts: [
				{ ...rootPixel, onLoad: () => undefined },
			] as ConsentRootProps['scripts'],
		},
	],
	[
		'the storage config changes',
		{ persistence: { storageConfig: { storageKey: 'other-consent' } } },
	],
])(
	'while the engine waits, a root whose plan no longer holds loads it at once when %s',
	async (_case, next) => {
		const state = stateFor({ marketing: true });
		loadingHero();
		leaveBootData(state);
		runStoredChoiceCheck(state);

		const page = await mount(state, undefined, liveRoot());
		await settle();
		expect(page.engineIn()).toBe(false);
		await page.rerender(liveRoot(next));
		await settle();
		expect(page.engineIn()).toBe(true);
	}
);

test('a rerender with an equal inline array and a fresh callback keeps the engine waiting', async () => {
	const state = stateFor({ marketing: true });
	loadingHero();
	leaveBootData(state);
	runStoredChoiceCheck(state);

	const page = await mount(state, undefined, liveRoot());
	await settle();
	await page.rerender(liveRoot());
	await settle();
	expect(page.engineIn()).toBe(false);
});

test.each<[string, (state: ConsentState) => ConsentState | undefined]>([
	[
		'swapped for a denial',
		(state: ConsentState) => stateFor({ marketing: false }, state.now),
	],
])(
	// A removed state leaves the engine nothing to render boot data from,
	// so this test cannot see it load; the key covers it (react's
	// `liveRootKey` test).
	'while the engine waits, it loads at once when the state is %s',
	async (_case, swap) => {
		const state = stateFor({ marketing: true });
		loadingHero();
		leaveBootData(state);
		runStoredChoiceCheck(state);

		const page = await mount(state);
		await settle();
		expect(page.engineIn()).toBe(false);
		// A client navigation hands the root another server state.
		await page.rerender({ state: swap(state) as ConsentRootProps['state'] });
		await settle();
		expect(page.engineIn()).toBe(true);
	}
);

/** A route's own `useScriptLoader` entries. */
const RouteScripts = ({ scripts: own }: { scripts: Script[] }) => {
	useScriptLoader(own);
	return null;
};

test('a navigation to a denial that mounts a hook script starts nothing and loads the engine', async () => {
	// The route's effect runs before the root's own: the early start must
	// see the new state is not the one it was made with.
	const state = stateFor({ marketing: true });
	loadingHero();
	leaveBootData(state);
	runStoredChoiceCheck(state);

	const page = await mount(state);
	await settle();
	expect(page.engineIn()).toBe(false);
	const denied = stateFor({ marketing: false }, state.now);
	// The engine that loads removes a denied element it finds, so watch for
	// one being inserted at all: its request would already have left.
	const inserted: string[] = [];
	const watcher = new MutationObserver((records) => {
		for (const record of records) {
			for (const node of record.addedNodes) {
				if (node instanceof HTMLScriptElement && node.src) {
					inserted.push(node.src);
				}
			}
		}
	});
	watcher.observe(document, { childList: true, subtree: true });
	cleanups.push(() => watcher.disconnect());
	await page.rerender(
		{ state: denied as ConsentRootProps['state'] },
		<RouteScripts
			scripts={[
				{
					category: 'marketing',
					id: 'route-pixel',
					src: '/never-served/route-pixel.js',
				},
			]}
		/>
	);
	await settle();
	expect(inserted.filter((src) => src.endsWith('/route-pixel.js'))).toEqual([]);
	expect(page.engineIn()).toBe(true);
});

/** The `src` of every script element inserted from now on. */
const watchInsertions = (): string[] => {
	const inserted: string[] = [];
	const watcher = new MutationObserver((records) => {
		for (const record of records) {
			for (const node of record.addedNodes) {
				if (node instanceof HTMLScriptElement && node.src) {
					inserted.push(node.src);
				}
			}
		}
	});
	watcher.observe(document, { childList: true, subtree: true });
	cleanups.push(() => watcher.disconnect());
	return inserted;
};

test("a root mounted again after a navigation does not plan from the first document's boot data", async () => {
	// The boot data still describes the grant the first document rendered;
	// the new mount's state denies it.
	const state = stateFor({ marketing: true });
	loadingHero();
	leaveBootData(state);
	runStoredChoiceCheck(state);
	const first = await mount(state);
	await settle();
	expect(first.engineIn()).toBe(false);
	await first.unmount();
	for (const script of document.querySelectorAll(
		'script[src*="/never-served/"]'
	)) {
		script.remove();
	}

	const inserted = watchInsertions();
	const denied = stateFor({ marketing: false }, state.now);
	// The new route passes the root a script of the denied category.
	const second = await mount(denied, undefined, { scripts: rootScripts });
	await settle();
	expect(inserted.filter((src) => src.endsWith(ROOT_PIXEL))).toEqual([]);
	// The hero is still loading: only an engine started at once is in.
	expect(second.engineIn()).toBe(true);
});

test('a returning visitor who denied a category gets the engine at once with clearOnRevocation', async () => {
	// Its cleanup of the denied category's cookies and storage runs only in
	// the engine.
	const state = stateFor({ marketing: false });
	loadingHero();
	leaveBootData(state);
	runStoredChoiceCheck(state);

	const page = await mount(state, undefined, { clearOnRevocation: {} });
	await settle();
	// The hero is still loading: only an engine started at once is in.
	expect(page.engineIn()).toBe(true);
});

/** Mounts the root as `wrap` places it, the way `mount` does. */
const mountWrapped = async (
	state: ConsentState,
	wrap: (root: ReactNode) => ReactNode
) => {
	const container = document.createElement('div');
	document.body.append(container);
	let root: Root | undefined;
	await act(() => {
		root = createRoot(container);
		root.render(
			wrap(
				<ConsentRoot
					options={{ consentCategories: [...consentCategories], mode }}
					persistence
					state={state}
				>
					<Probe />
				</ConsentRoot>
			)
		);
	});
	cleanups.push(() => {
		root?.unmount();
		container.remove();
	});
	return {
		engineIn: () => container.querySelector('script[data-inth-boot]') !== null,
	};
};

test('a first render thrown away before it commits still lets the retry defer the engine', async () => {
	// A sibling suspends with no boundary above it, so React drops the
	// whole render and starts again once the promise settles.
	const state = stateFor({ marketing: true });
	loadingHero();
	leaveBootData(state);
	runStoredChoiceCheck(state);
	let settled = false;
	const pending = new Promise<void>((resolve) => {
		setTimeout(resolve, 20);
	}).then(() => {
		settled = true;
	});
	const SuspendsOnce = () => {
		if (!settled) {
			throw pending;
		}
		return null;
	};
	const page = await mountWrapped(state, (root) => (
		<>
			{root}
			<SuspendsOnce />
		</>
	));
	await act(async () => {
		await pending;
	});
	await settle();
	// The hero is still loading: the engine waits for it.
	expect(page.engineIn()).toBe(false);
	expect(pixelStarted()).toBe(true);
});

test('StrictMode still lets the engine wait for the hero', async () => {
	const state = stateFor({ marketing: true });
	loadingHero();
	leaveBootData(state);
	runStoredChoiceCheck(state);
	const page = await mountWrapped(state, (root) => (
		<StrictMode>{root}</StrictMode>
	));
	await settle();
	expect(page.engineIn()).toBe(false);
	expect(pixelStarted()).toBe(true);
});

test('while the engine waits, it loads at once when the consent overrides change', async () => {
	// An override such as a privacy signal changes what the visitor allows.
	const state = stateFor({ marketing: true });
	loadingHero();
	leaveBootData(state);
	runStoredChoiceCheck(state);

	const page = await mount(state);
	await settle();
	expect(page.engineIn()).toBe(false);
	await page.rerender({
		options: {
			consentCategories: [...consentCategories],
			mode,
			overrides: { gpc: true },
		},
	});
	await settle();
	expect(page.engineIn()).toBe(true);
});

test('a root script started before the engine leaves when the root unmounts first', async () => {
	const state = stateFor({ marketing: true });
	loadingHero();
	leaveBootData(state);
	runStoredChoiceCheck(state);

	const page = await mount(state, undefined, { scripts: rootScripts });
	await settle();
	expect(page.engineIn()).toBe(false);
	expect(pixelStarted(ROOT_PIXEL)).toBe(true);
	await page.unmount();
	expect(pixelStarted(ROOT_PIXEL)).toBe(false);
});

/**
 * An accept from the page's own UI as it mounts, in the render that
 * changes the root's options: before the engine can load.
 */
const AcceptOnMount = () => {
	const save = useSaveConsents();
	useLayoutEffect(() => {
		void save('all');
	}, [save]);
	return null;
};

test('an accept after persistence is turned off records nothing through the old persistence', async () => {
	// The banner asks; the root mounted with persistence on.
	const state = stateFor({});
	loadingHero();
	leaveBootData(state);
	const page = await mount(state, undefined, {});
	await settle();
	expect(page.engineIn()).toBe(false);
	await page.rerender({ persistence: false }, <AcceptOnMount />);
	await settle();
	// The engine records it, under the root's new options.
	expect(localStorage.getItem('inth')).toBeNull();
	expect(page.engineIn()).toBe(true);
});

test('a server start still waiting for the hero inserts nothing once the root unmounts', async () => {
	const state = stateFor({ marketing: true });
	const hero = loadingHero();
	leaveBootData(state);
	runStoredChoiceCheck(state);
	// An earlier test's loader marked the document; this page's has not run.
	Reflect.deleteProperty(window, '__inthLoaderRan');
	// The server's start, as the page parses it: its insert waits for the
	// hero.
	const code = serverScriptStart(
		{
			consentCategories: [...consentCategories],
			mode,
			prefetch: state,
			scripts: [serverStarted],
		} as Parameters<typeof serverScriptStart>[0],
		RENDER_ID
	);
	expect(code).toBeDefined();
	// oxlint-disable-next-line no-new-func -- Runs the server's inline script, as the page would.
	new Function(code ?? '')();

	const page = await mount(state, undefined, { scripts: [serverStarted] });
	await settle();
	expect(pixelStarted(serverStarted.src)).toBe(false);
	await page.unmount();
	await settle();
	await act(() => {
		hero.dispatchEvent(new Event('load'));
	});
	await settle();
	expect(pixelStarted(serverStarted.src)).toBe(false);
});

/** Waits for `check` to pass, on what the page shows rather than a delay. */
const until = (check: () => void) =>
	vi.waitFor(check, { interval: 20, timeout: 10_000 });

/**
 * Leaves the server start of `serverStarted` in the page, waiting for a
 * hero that is still loading, as the page parses it. Returns the hero and
 * a read of the element it registered.
 */
const leaveServerStart = (state: ConsentState) => {
	const hero = loadingHero();
	leaveBootData(state);
	runStoredChoiceCheck(state);
	// An earlier test's loader marked the document; this page's has not run.
	Reflect.deleteProperty(window, '__inthLoaderRan');
	const code = serverScriptStart(
		{
			consentCategories: [...consentCategories],
			mode,
			prefetch: state,
			scripts: [serverStarted],
		} as Parameters<typeof serverScriptStart>[0],
		RENDER_ID
	);
	// oxlint-disable-next-line no-new-func -- Runs the server's inline script, as the page would.
	new Function(code ?? '')();
	const registered = (): HTMLScriptElement | undefined =>
		startGlobals.__inthStarted?.[serverStarted.id];
	return { hero, registered };
};

/** The elements in the page that load `src`. */
const elementsFor = (src: string): Element[] => [
	...document.querySelectorAll(`script[src$="${src}"]`),
];

test('a live change that drops a server-started script removes it at once, and the engine starts it again from its new src', async () => {
	const state = stateFor({ marketing: true });
	const { hero, registered } = leaveServerStart(state);

	const page = await mount(state, undefined, { scripts: [serverStarted] });
	await until(() => {
		expect(registered()?.src).toMatch(/started-pixel\.js$/u);
	});
	const element = registered();
	expect(page.engineIn()).toBe(false);

	await page.rerender({ scripts: [] });
	expect(registered()).toBeUndefined();

	const moved: Script = {
		...serverStarted,
		src: '/never-served/moved-pixel.js',
	};
	await page.rerender({ scripts: [moved] });
	await until(() => {
		expect(page.engineIn()).toBe(true);
		expect(pixelStarted(moved.src)).toBe(true);
	});
	await act(() => {
		hero.dispatchEvent(new Event('load'));
	});
	await settle();
	expect(pixelStarted(serverStarted.src)).toBe(false);
	expect(element?.isConnected).toBe(false);
});

test('a live change that keeps a server-started script as it was leaves it for the loader, which inserts it once', async () => {
	const state = stateFor({ marketing: true });
	const { hero, registered } = leaveServerStart(state);

	const page = await mount(state, undefined, { scripts: [serverStarted] });
	await until(() => {
		expect(registered()).toBeDefined();
	});
	const element = registered();
	expect(page.engineIn()).toBe(false);

	// An option change that loads the engine, with the script as it was.
	await page.rerender({
		networkBlocker: { rules: [] },
		scripts: [serverStarted],
	});
	expect(registered()).toBe(element);
	await until(() => {
		expect(page.engineIn()).toBe(true);
	});
	await act(() => {
		hero.dispatchEvent(new Event('load'));
	});
	await until(() => {
		expect(element?.isConnected).toBe(true);
	});
	await settle();
	expect(elementsFor(serverStarted.src)).toEqual([element]);
});

/** Runs `run` as the render that mounts it commits. */
const OnCommit = ({ run }: { run: () => void }) => {
	useLayoutEffect(() => {
		run();
	}, [run]);
	return null;
};

test('a server start still waiting for the hero inserts nothing once a navigation hands the root a denial', async () => {
	const state = stateFor({ marketing: true });
	const hero = loadingHero();
	leaveBootData(state);
	runStoredChoiceCheck(state);
	// An earlier test's loader marked the document; this page's has not run.
	Reflect.deleteProperty(window, '__inthLoaderRan');
	const code = serverScriptStart(
		{
			consentCategories: [...consentCategories],
			mode,
			prefetch: state,
			scripts: [serverStarted],
		} as Parameters<typeof serverScriptStart>[0],
		RENDER_ID
	);
	// oxlint-disable-next-line no-new-func -- Runs the server's inline script, as the page would.
	new Function(code ?? '')();

	const page = await mount(state, undefined, { scripts: [serverStarted] });
	await settle();
	expect(pixelStarted(serverStarted.src)).toBe(false);
	// The engine that loads removes a denied element, so watch for one being
	// inserted at all: its request would already have left.
	const inserted = watchInsertions();
	// A client navigation hands the root a denial. The hero finishes in
	// that render's commit, before the engine it asks for can attach.
	const denied = stateFor({ marketing: false }, state.now);
	await page.rerender(
		{
			scripts: [serverStarted],
			state: denied as ConsentRootProps['state'],
		},
		<OnCommit run={() => hero.dispatchEvent(new Event('load'))} />
	);
	await settle();
	expect(inserted.filter((src) => src.endsWith(serverStarted.src))).toEqual([]);
});

test('under StrictMode, a root script a hook also passes stays when the hook drops it', async () => {
	// StrictMode disposes the root's session and resumes it: the root holds
	// its scripts again after that.
	const state = stateFor({ marketing: true });
	loadingHero();
	leaveBootData(state);
	runStoredChoiceCheck(state);
	const shared = { category: 'marketing', id: 'pixel', src: PIXEL };
	const store = {
		listeners: new Set<() => void>(),
		scripts: [shared] as Script[],
	};
	const RouteHook = () => {
		const own = useSyncExternalStore(
			(listener) => {
				store.listeners.add(listener);
				return () => {
					store.listeners.delete(listener);
				};
			},
			() => store.scripts,
			() => store.scripts
		);
		useScriptLoader(own);
		return null;
	};
	const container = document.createElement('div');
	document.body.append(container);
	let root: Root | undefined;
	await act(() => {
		root = createRoot(container);
		root.render(
			<StrictMode>
				<ConsentRoot
					options={{ consentCategories: [...consentCategories], mode }}
					persistence
					scripts={[shared] as ConsentRootProps['scripts']}
					state={state}
				>
					<RouteHook />
				</ConsentRoot>
			</StrictMode>
		);
	});
	cleanups.push(() => {
		root?.unmount();
		container.remove();
	});
	await settle();
	expect(pixelStarted()).toBe(true);
	await act(() => {
		store.scripts = [];
		for (const listener of store.listeners) {
			listener();
		}
	});
	await settle();
	// The root still passes it.
	expect(pixelStarted()).toBe(true);
});

test('a script the server start inserted leaves when the root unmounts before its engine', async () => {
	// An earlier test's root ends its render a task after it unmounts; let
	// that pass before this page's render starts.
	await settle();
	const state = stateFor({ marketing: true });
	leaveBootData(state);
	runStoredChoiceCheck(state);
	// An earlier test's loader marked the document; this page's has not run.
	Reflect.deleteProperty(window, '__inthLoaderRan');
	const code = serverScriptStart(
		{
			consentCategories: [...consentCategories],
			mode,
			prefetch: state,
			scripts: [serverStarted],
		} as Parameters<typeof serverScriptStart>[0],
		RENDER_ID
	);
	// oxlint-disable-next-line no-new-func -- Runs the server's inline script, as the page would.
	new Function(code ?? '')();
	// No priority image yet: the start inserts after the first paint.
	await settle();
	expect(pixelStarted(serverStarted.src)).toBe(true);
	// Then one starts loading, and the root's engine waits for it.
	loadingHero();
	const page = await mount(state, undefined, { scripts: [serverStarted] });
	await settle();
	expect(page.engineIn()).toBe(false);
	await page.unmount();
	await settle();
	expect(pixelStarted(serverStarted.src)).toBe(false);
});
