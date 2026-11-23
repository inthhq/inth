/**
 * A deferred root, end to end: the server renders the whole provider, the
 * banner and the boot data; the browser hydrates the page against the
 * stand-in kernel, keeps the banner's server HTML, and loads the engine
 * only when asked. Each test streams a real server render into an iframe
 * and hydrates it.
 */
import type { Callbacks, KernelConfig } from '@inth/sdk/engine';
import type { Script } from '@inth/sdk/modules/script-loader';
import type { PolicyRule } from '@inth/sdk/schema/types';
import { Suspense, act, useLayoutEffect, useSyncExternalStore } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { serverScriptStart } from '../../../../core/src/runtime/script-server-start';
import { transportMode } from '../../__tests__/fixtures/transport-mode';
import { policyFixture } from '../../__tests__/policy-fixture';
import {
	BANNER,
	deferred,
	fulfilledThenable,
	streamPage,
} from '../../__tests__/streamed-ssr-harness';
import type { StreamedPage } from '../../__tests__/streamed-ssr-harness';
import { CardSurface } from '../../components/prompt/card-surface';
import { DrawerSurface } from '../../components/prompt/drawer-surface';
import { PromptContainersContext } from '../../components/prompt/prompt';
import { BannerSurface } from '../../components/prompt/strip';
import { useSaveConsents, useSnapshot } from '../../hooks';
import { InthProvider } from '../../index';
import { useScriptLoader } from '../../module-hooks/script-loader';
import {
	awaitsChoice,
	canDeferEngineAfterChoice,
	endPageRender,
	readConsentBoot,
} from '../boot';
import type { ConsentBoot } from '../boot';
import { ConsentBootData, ServerBootData } from '../consent-boot-data';
import { engineNeededAtLoad } from '../use-consent-boot-plan';
import type { DeferredCommitConfig } from '../deferred-committed.model';
import type * as EngineNamespace from '../engine';
import { ENGINE_CHUNKS_KEY } from '../engine-preload.store';
import { DeferredConsentShell } from '../deferred-consent-shell';
import { DeferredConsentBanner } from '../surfaces';

const policyConfig = function policyConfig(
	rule: Partial<PolicyRule> = {},
	values: Parameters<typeof policyFixture>[0] = {}
): KernelConfig {
	return {
		initialBranding: 'inth',
		initialLocation: { countryCode: 'DE', regionCode: null },
		initialOverrides: { country: 'DE', language: 'en' },
		...policyFixture(values, {
			categories: ['marketing'],
			id: 'gdpr',
			...rule,
		}),
	};
};

const transportInit = vi.fn(() => Promise.resolve({}));
const transportSave = vi.fn(() => Promise.resolve({ ok: true as const }));
const mode = transportMode({ init: transportInit, save: transportSave });
/** The categories the page uses, as the CookieBench fixture names them. */
const consentCategories = ['necessary', 'marketing'] as const;

/** Page content that reads consent and saves it, outside the banner. */
/*
 * The server and the client render in one page here, so the server's
 * streamed prompt container would share React's context stack with the
 * client's hydration. The containers render at once instead, as they do
 * on a server that loaded them at module evaluation.
 */
const CONTAINERS = {
	banner: BannerSurface,
	card: CardSurface,
	drawer: DrawerSurface,
};

/**
 * The production containers, lazy and none of them loaded: the context's
 * default, read before any render. Passed explicitly, because the server
 * render's provider in this same window would otherwise leak its eager
 * containers into the client's hydration.
 */
const LAZY_CONTAINERS = (
	PromptContainersContext as unknown as { _currentValue: typeof CONTAINERS }
)._currentValue;

const Probe = () => {
	const snapshot = useSnapshot();
	const save = useSaveConsents();
	return (
		<main
			data-active-ui={snapshot.activeUI}
			data-marketing={String(snapshot.effectivePermissions.marketing)}
		>
			<button
				id="save-all"
				onClick={() => {
					void save('all');
				}}
				type="button"
			>
				Accept from the page
			</button>
		</main>
	);
};

/**
 * What a production server renders: each container as the lazy wrapper
 * renders it once its chunk is in (the server loads them at module
 * evaluation), inside its own boundary.
 */
const SERVER_CONTAINERS = {
	banner: (props: Parameters<typeof BannerSurface>[0]) => (
		<Suspense fallback={null}>
			<BannerSurface {...props} />
		</Suspense>
	),
	card: (props: Parameters<typeof CardSurface>[0]) => (
		<Suspense fallback={null}>
			<CardSurface {...props} />
		</Suspense>
	),
	drawer: (props: Parameters<typeof DrawerSurface>[0]) => (
		<Suspense fallback={null}>
			<DrawerSurface {...props} />
		</Suspense>
	),
};

const ServerPage = ({
	containers = CONTAINERS,
	prefetch,
}: {
	containers?: typeof CONTAINERS;
	prefetch: unknown;
}) => (
	<html lang="en">
		<head />
		<body>
			<InthProvider
				options={{
					consentCategories,
					mode,
					persistence: false,
					prefetch: prefetch as KernelConfig,
				}}
			>
				<Probe />
				<PromptContainersContext.Provider value={containers}>
					<DeferredConsentBanner />
				</PromptContainersContext.Provider>
				<Suspense fallback={null}>
					<ServerBootData
						chunks="/_next/static/"
						renderId="test-render"
						storedChoice
						storedChoiceCheck="/* the server's stored-choice check */"
					/>
				</Suspense>
			</InthProvider>
		</body>
	</html>
);

type EngineModule = typeof EngineNamespace;

/** Scripts a test changes after the page hydrated. */
const liveScripts = {
	listeners: new Set<() => void>(),
	scripts: [] as Script[],
	set(next: Script[]) {
		liveScripts.scripts = next;
		for (const listener of liveScripts.listeners) {
			listener();
		}
	},
	subscribe(listener: () => void) {
		liveScripts.listeners.add(listener);
		return () => {
			liveScripts.listeners.delete(listener);
		};
	},
};

/** `useScriptLoader` with the scripts `liveScripts` holds now. */
const LiveHookScripts = () => {
	const scripts = useSyncExternalStore(
		liveScripts.subscribe,
		() => liveScripts.scripts,
		() => liveScripts.scripts
	);
	useScriptLoader(scripts);
	return null;
};

/** Scripts the page passes to `useScriptLoader`. */
const HookScripts = ({ scripts }: { scripts: Script[] }) => {
	useScriptLoader(scripts);
	return null;
};

/** A plain marketing script, as a returning visitor's choice allows. */
const pixel = (id: string): Script => ({
	category: 'marketing',
	id,
	src: `/never-served/${id}.js`,
});

/**
 * Whether `id` was inserted. Inth's modules run in the test's window, so
 * that is the document they insert into.
 */
const started = (id: string): boolean =>
	document.querySelector(`script[src$="/never-served/${id}.js"]`) !== null;

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
		Reflect.deleteProperty(globalThis, '__inthEndedRenders');
	};
};

let leftPageRender: (() => void) | undefined;

/** The stored-choice check a server render leaves, answering `current`. */
const storedChoice = (_doc: Document, current: () => boolean): void => {
	leftPageRender?.();
	leftPageRender = leavePageRender({ current, starts: {} });
};

const ClientPage = ({
	boot,
	callbacks,
	commit,
	defer,
	hookScripts,
	lazyContainers = false,
	live,
	liveHookScripts,
	loadEngine,
	prefetch,
	schedule,
	startScripts,
}: {
	boot: ConsentBoot;
	callbacks?: Callbacks;
	commit?: DeferredCommitConfig;
	defer: boolean;
	hookScripts?: Script[];
	/** Hydrate with the production lazy containers, none of them loaded. */
	lazyContainers?: boolean;
	live?: string;
	liveHookScripts?: boolean;
	loadEngine: () => Promise<EngineModule>;
	prefetch: unknown;
	schedule?: (start: () => void) => () => void;
	startScripts?: boolean;
}) => (
	<html lang="en">
		<head />
		<body>
			<DeferredConsentShell
				boot={boot}
				commit={commit}
				defer={defer}
				live={live}
				loadEngine={loadEngine}
				options={{ consentCategories }}
				prefetch={prefetch}
				renderEngine={(engine: EngineModule, attach) => (
					<engine.DeferredEngineHost
						attach={attach}
						options={{
							callbacks,
							consentCategories,
							mode,
							persistence: false,
							prefetch: prefetch as KernelConfig,
							scripts: commit?.scripts,
						}}
					>
						<ConsentBootData
							chunks="/_next/static/"
							storedChoice
						/>
					</engine.DeferredEngineHost>
				)}
				schedule={schedule}
				startScripts={startScripts}
			>
				<Probe />
				{hookScripts ? <HookScripts scripts={hookScripts} /> : null}
				{liveHookScripts ? <LiveHookScripts /> : null}
				<PromptContainersContext.Provider
					value={lazyContainers ? LAZY_CONTAINERS : CONTAINERS}
				>
					<DeferredConsentBanner />
				</PromptContainersContext.Provider>
			</DeferredConsentShell>
		</body>
	</html>
);

const tick = (ms = 50) =>
	act(
		() =>
			new Promise<void>((resolve) => {
				setTimeout(resolve, ms);
			})
	);

let page: StreamedPage | undefined;

beforeEach(() => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	transportInit.mockClear();
	transportSave.mockClear();
});

afterEach(() => {
	page?.dispose();
	page = undefined;
	leftPageRender?.();
	leftPageRender = undefined;
	Reflect.deleteProperty(globalThis, '__inthStarted');
	for (const script of document.querySelectorAll(
		'script[src*="/never-served/"]'
	)) {
		script.remove();
	}
});

/** Whether the server left the engine preload after the boot data. */
const hasEnginePreload = (doc: Document): boolean =>
	Array.from(doc.querySelectorAll('script:not([type])')).some((script) =>
		script.textContent?.includes(ENGINE_CHUNKS_KEY)
	);

/** Streams the server render with a streamed state, then reads its boot data. */
const serve = async function serve(
	config: KernelConfig,
	containers: typeof CONTAINERS = CONTAINERS
) {
	const server = deferred<KernelConfig>();
	page = await streamPage(
		<ServerPage
			containers={containers}
			prefetch={server.promise}
		/>
	);
	server.resolve(config);
	await page.finish();
	const boot = readConsentBoot(page.doc);
	expect(page.serverErrors).toEqual([]);
	expect(boot).not.toBeNull();
	return { boot: boot as ConsentBoot, page };
};

const reactProps = (element: Element | null | undefined): boolean =>
	Boolean(
		element &&
		Object.keys(element).some((key) => key.startsWith('__reactProps'))
	);

test('a fresh visitor: the page hydrates at once, the banner keeps its server HTML, and the engine waits', async () => {
	const config = policyConfig();
	const { boot, page: streamed } = await serve(config);
	// The children rendered before the state resolved; the banner after.
	expect(boot.s.activeUI).toBe('none');
	expect(boot.r?.activeUI).toBe('banner');
	expect(awaitsChoice(boot.r ?? boot.s)).toBe(true);
	// The engine waits: nothing preloads it.
	expect(hasEnginePreload(streamed.doc)).toBe(false);

	const loadEngine = vi.fn(() => import('../engine'));
	const schedule = vi.fn(() => () => undefined);
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			defer
			loadEngine={loadEngine}
			prefetch={fulfilledThenable(config)}
			schedule={schedule}
		/>
	);
	await tick(100);

	expect(hydrated.recoverableErrors).toEqual([]);
	expect(schedule).toHaveBeenCalledTimes(1);
	expect(loadEngine).not.toHaveBeenCalled();
	const main = streamed.doc.querySelector('main');
	// Hydrated, and past hydration it reads the resolved server state.
	expect(reactProps(streamed.doc.getElementById('save-all'))).toBe(true);
	expect(main?.dataset.activeUi).toBe('banner');
	expect(main?.dataset.marketing).toBe('false');
	// The banner is the server's markup, not yet React's.
	const accept = streamed.doc.querySelector(
		`${BANNER} [data-testid="consent-banner-accept-button"]`
	);
	expect(accept).not.toBeNull();
	expect(reactProps(accept)).toBe(false);

	// An action from the page loads the engine and runs on it.
	await act(() => {
		(streamed.doc.getElementById('save-all') as HTMLButtonElement).click();
	});
	await vi.waitFor(() => {
		expect(transportSave).toHaveBeenCalledTimes(1);
	});
	expect(loadEngine).toHaveBeenCalledTimes(1);
	await vi.waitFor(() => {
		expect(main?.dataset.marketing).toBe('true');
		expect(streamed.doc.querySelector(BANNER)).toBeNull();
	});
	expect(hydrated.recoverableErrors).toEqual([]);
	await hydrated.unmount();
});

/**
 * Whether `element` rendered under a container still loading at mount: the
 * lazy wrapper `createDeferredModule` renders, which suspends inside the
 * hydrating boundary. A container already loaded renders directly.
 */
const underLazyContainer = (element: Element | null): boolean => {
	const key = element
		? Object.keys(element).find((name) => name.startsWith('__reactFiber'))
		: undefined;
	let fiber = key
		? (element as unknown as Record<string, unknown>)[key]
		: undefined;
	while (fiber) {
		const { elementType, return: parent } = fiber as {
			elementType?: { displayName?: string } | null;
			return?: unknown;
		};
		if (elementType?.displayName === 'DeferredComponent') {
			return true;
		}
		fiber = parent;
	}
	return false;
};

test('[BNR-13] with lazy containers, the engine loads the server-rendered container before the banner hydrates, so the banner keeps its node', async () => {
	const config = policyConfig();
	const { boot, page: streamed } = await serve(config, SERVER_CONTAINERS);
	const banner = streamed.doc.querySelector(BANNER);
	const placement = banner?.getAttribute('data-placement');
	expect(placement).toBeTruthy();
	// Inth's modules run in the test's window and read the server banner's
	// placement from its document.
	const mirror = document.createElement('div');
	mirror.dataset.testid = 'consent-banner-root';
	mirror.dataset.placement = placement as string;
	document.body.append(mirror);
	try {
		let start: () => void = () => undefined;
		const hydrated = await streamed.hydrate(
			<ClientPage
				boot={boot}
				defer
				lazyContainers
				loadEngine={() => import('../engine')}
				prefetch={fulfilledThenable(config)}
				schedule={(begin) => {
					start = begin;
					return () => undefined;
				}}
			/>
		);
		await act(() => {
			start();
		});
		await vi.waitFor(() => {
			expect(
				reactProps(
					streamed.doc.querySelector(
						'[data-testid="consent-banner-accept-button"]'
					)
				)
			).toBe(true);
		});
		// The same element: hydrated, not replaced by a client render.
		expect(streamed.doc.querySelector(BANNER)).toBe(banner);
		// The container was in before the banner hydrated, so nothing in
		// the hydrating boundary waited for its chunk.
		expect(underLazyContainer(banner)).toBe(false);
		expect(hydrated.recoverableErrors).toEqual([]);
		await hydrated.unmount();
	} finally {
		mirror.remove();
	}
});

test('once the engine loads unprompted, the banner hydrates in place and works', async () => {
	const config = policyConfig();
	const { boot, page: streamed } = await serve(config);
	let start: () => void = () => undefined;
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			defer
			loadEngine={() => import('../engine')}
			prefetch={fulfilledThenable(config)}
			schedule={(begin) => {
				start = begin;
				return () => undefined;
			}}
		/>
	);
	const banner = streamed.doc.querySelector(BANNER);
	await act(() => {
		start();
	});
	await vi.waitFor(() => {
		expect(
			reactProps(
				streamed.doc.querySelector(
					'[data-testid="consent-banner-accept-button"]'
				)
			)
		).toBe(true);
	});
	// The same element: hydrated, not replaced.
	expect(streamed.doc.querySelector(BANNER)).toBe(banner);
	expect(hydrated.recoverableErrors).toEqual([]);

	await act(() => {
		(
			streamed.doc.querySelector(
				'[data-testid="consent-banner-accept-button"]'
			) as HTMLButtonElement
		).click();
	});
	await vi.waitFor(() => {
		expect(transportSave).toHaveBeenCalledTimes(1);
	});
	await vi.waitFor(() => {
		expect(streamed.doc.querySelector('main')?.dataset.marketing).toBe('true');
	});
	await hydrated.unmount();
});

test('the engine starts as the root chunk runs for an app that loaded IABProvider, whatever the visitor', async () => {
	const { page: streamed } = await serve(policyConfig());
	const provider = Symbol.for('inth.react.iab-provider');
	const host = globalThis as Record<symbol, unknown>;
	const before = host[provider];
	try {
		Reflect.deleteProperty(host, provider);
		// A fresh visitor's engine waits for the page's priority images.
		expect(engineNeededAtLoad(streamed.doc)).toBe(false);
		// The shell cannot serve an IAB tree.
		host[provider] = true;
		expect(engineNeededAtLoad(streamed.doc)).toBe(true);
	} finally {
		host[provider] = before;
	}
});

test('a returning visitor with consent: a preload the check can skip, and the engine loads when asked', async () => {
	const config = policyConfig({}, { marketing: true });
	const { boot, page: streamed } = await serve(config);
	expect(awaitsChoice(boot.r ?? boot.s)).toBe(false);
	// No surface shows, so the engine can wait for the priority images:
	// preloading it would share bandwidth with them. The preload stays in
	// the page and runs only when the stored-choice check finds the choice
	// stale, and the engine then loads at once.
	expect(canDeferEngineAfterChoice(boot.r ?? boot.s)).toBe(true);
	expect(hasEnginePreload(streamed.doc)).toBe(true);
	expect(
		Array.from(streamed.doc.querySelectorAll('script:not([type])')).some(
			(script) =>
				script.textContent?.includes(ENGINE_CHUNKS_KEY) &&
				script.textContent.includes('__inthRender')
		)
	).toBe(true);

	const loadEngine = vi.fn(() => import('../engine'));
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			defer={false}
			loadEngine={loadEngine}
			prefetch={fulfilledThenable(config)}
		/>
	);
	expect(loadEngine).toHaveBeenCalledTimes(1);
	expect(streamed.doc.querySelector('main')?.dataset.marketing).toBe('true');
	await tick(100);
	expect(hydrated.recoverableErrors).toEqual([]);
	expect(streamed.doc.querySelector('main')?.dataset.marketing).toBe('true');
	await hydrated.unmount();
});

/** The callbacks a root hears while its engine loads, as `type:permissions`. */
const recordCallbacks = function recordCallbacks() {
	const heard: string[] = [];
	const permissions = (snapshot: {
		effectivePermissions: Record<string, boolean | undefined>;
	}) =>
		Object.entries(snapshot.effectivePermissions)
			.filter(([, granted]) => granted)
			.map(([name]) => name)
			.sort()
			.join(',');
	const callbacks: Callbacks = {
		onChoiceRecorded: (event) => {
			heard.push(`choice:${permissions(event.snapshot)}`);
		},
		onError: (event) => {
			heard.push(`error:${event.error}`);
		},
		onPermissionsChanged: (event) => {
			heard.push(`permissions:${permissions(event.snapshot)}`);
		},
		onSurfaceShown: (event) => {
			heard.push(`surface:${event.surface}`);
		},
	};
	return { callbacks, heard };
};

test('a returning visitor whose engine waits hears the callbacks an eager engine fires', async () => {
	const config = policyConfig({}, { marketing: true });

	// The engine at once, as before returning visitors could defer it.
	const eager = recordCallbacks();
	const first = await serve(config);
	const eagerPage = await first.page.hydrate(
		<ClientPage
			boot={first.boot}
			callbacks={eager.callbacks}
			defer={false}
			loadEngine={() => import('../engine')}
			prefetch={fulfilledThenable(config)}
		/>
	);
	await tick(200);
	await eagerPage.unmount();
	page?.dispose();
	page = undefined;

	// The engine after the trigger, with the stored choice's scripts started.
	const waiting = recordCallbacks();
	const second = await serve(config);
	storedChoice(second.page.doc, () => true);
	let wake: () => void = () => undefined;
	const loadEngine = vi.fn(() => import('../engine'));
	const deferredPage = await second.page.hydrate(
		<ClientPage
			boot={second.boot}
			callbacks={waiting.callbacks}
			defer
			loadEngine={loadEngine}
			prefetch={fulfilledThenable(config)}
			schedule={(start) => {
				wake = start;
				return () => undefined;
			}}
			startScripts
		/>
	);
	await tick(100);
	expect(loadEngine).not.toHaveBeenCalled();
	expect(waiting.heard).toEqual([]);
	await act(() => {
		wake();
	});
	await tick(200);
	expect(loadEngine).toHaveBeenCalledTimes(1);
	expect(deferredPage.recoverableErrors).toEqual([]);
	// The stored choice is current, so neither engine has a change to
	// report at load; whatever the eager one reports, the waiting one does.
	expect(waiting.heard).toEqual(eager.heard);
	await deferredPage.unmount();
});

test('a returning visitor whose stored choice holds gets the root and hook scripts without the engine', async () => {
	const config = policyConfig({}, { marketing: true });
	const { boot, page: streamed } = await serve(config);
	storedChoice(streamed.doc, () => true);
	const loadEngine = vi.fn(() => import('../engine'));
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			commit={{ scripts: [pixel('root-pixel')] }}
			defer
			hookScripts={[pixel('hook-pixel')]}
			loadEngine={loadEngine}
			prefetch={fulfilledThenable(config)}
			schedule={() => () => undefined}
			startScripts
		/>
	);
	await tick(100);
	expect(hydrated.recoverableErrors).toEqual([]);
	expect(loadEngine).not.toHaveBeenCalled();
	// The root's own `scripts`, as well as the hook's.
	expect(started('root-pixel')).toBe(true);
	expect(started('hook-pixel')).toBe(true);
	await hydrated.unmount();
});

test('root scripts started before the engine leave with the root, or when it drops them', async () => {
	// The engine never arrives, so nothing else owns what the root started.
	const config = policyConfig({}, { marketing: true });
	const { boot, page: streamed } = await serve(config);
	storedChoice(streamed.doc, () => true);
	const store = {
		listeners: new Set<() => void>(),
		scripts: [pixel('root-pixel'), pixel('kept-pixel')],
	};
	const ScriptsPage = (
		props: Omit<Parameters<typeof ClientPage>[0], 'commit'>
	) => {
		const scripts = useSyncExternalStore(
			(listener) => {
				store.listeners.add(listener);
				return () => {
					store.listeners.delete(listener);
				};
			},
			() => store.scripts,
			() => store.scripts
		);
		return (
			<ClientPage
				{...props}
				commit={{ scripts }}
			/>
		);
	};
	const hydrated = await streamed.hydrate(
		<ScriptsPage
			boot={boot}
			defer
			loadEngine={() =>
				new Promise<EngineModule>(() => {
					// Never settles.
				})
			}
			prefetch={fulfilledThenable(config)}
			schedule={() => () => undefined}
			startScripts
		/>
	);
	await tick(100);
	expect(started('root-pixel')).toBe(true);
	expect(started('kept-pixel')).toBe(true);
	await act(() => {
		store.scripts = [pixel('kept-pixel')];
		for (const listener of store.listeners) {
			listener();
		}
	});
	await tick(20);
	expect(started('root-pixel')).toBe(false);
	expect(started('kept-pixel')).toBe(true);
	await hydrated.unmount();
	expect(started('kept-pixel')).toBe(false);
});

test('a root script a hook also passes stays when the root drops it', async () => {
	const config = policyConfig({}, { marketing: true });
	const { boot, page: streamed } = await serve(config);
	storedChoice(streamed.doc, () => true);
	const store = {
		listeners: new Set<() => void>(),
		scripts: [pixel('shared-pixel')],
	};
	const ScriptsPage = (
		props: Omit<Parameters<typeof ClientPage>[0], 'commit'>
	) => {
		const scripts = useSyncExternalStore(
			(listener) => {
				store.listeners.add(listener);
				return () => {
					store.listeners.delete(listener);
				};
			},
			() => store.scripts,
			() => store.scripts
		);
		return (
			<ClientPage
				{...props}
				commit={{ scripts }}
			/>
		);
	};
	const hydrated = await streamed.hydrate(
		<ScriptsPage
			boot={boot}
			defer
			hookScripts={[pixel('shared-pixel')]}
			loadEngine={() =>
				new Promise<EngineModule>(() => {
					// Never settles.
				})
			}
			prefetch={fulfilledThenable(config)}
			schedule={() => () => undefined}
			startScripts
		/>
	);
	await tick(100);
	expect(started('shared-pixel')).toBe(true);
	await act(() => {
		store.scripts = [];
		for (const listener of store.listeners) {
			listener();
		}
	});
	await tick(20);
	// The hook still passes it.
	expect(started('shared-pixel')).toBe(true);
	await hydrated.unmount();
	expect(started('shared-pixel')).toBe(false);
});

test("a root that unmounts before its engine ends its render for the server start's inline code", async () => {
	// A server start still waiting for the page's priority images checks
	// the render's id before it inserts anything.
	const config = policyConfig({}, { marketing: true });
	const { boot, page: streamed } = await serve(config);
	storedChoice(streamed.doc, () => true);
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			defer
			loadEngine={() =>
				new Promise<EngineModule>(() => {
					// Never settles.
				})
			}
			prefetch={fulfilledThenable(config)}
			schedule={() => () => undefined}
			startScripts
		/>
	);
	const render = () =>
		(globalThis as { __inthRender?: { id?: string } }).__inthRender?.id;
	await tick(20);
	expect(render()).toBe('test-render');
	await hydrated.unmount();
	await tick(20);
	expect(render()).not.toBe('test-render');
});

test('a server start that streams in after the root unmounted inserts nothing', async () => {
	// The server's start module loaded late: the boot data names the render,
	// but no stored-choice check made its page object, and the start script
	// streams in once the module loads.
	const config = policyConfig({}, { marketing: true });
	const { boot, page: streamed } = await serve(config);
	leftPageRender = leavePageRender({});
	Reflect.deleteProperty(globalThis, '__inthRender');
	// An earlier test's loader marked the document; this page's has not run.
	Reflect.deleteProperty(globalThis, '__inthLoaderRan');
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			defer
			loadEngine={() =>
				new Promise<EngineModule>(() => {
					// Never settles.
				})
			}
			prefetch={fulfilledThenable(config)}
			schedule={() => () => undefined}
		/>
	);
	await tick(20);
	await hydrated.unmount();
	await tick(20);

	const code = serverScriptStart(
		{
			consentCategories: [...consentCategories],
			mode,
			prefetch: config,
			scripts: [{ ...pixel('late-pixel'), serverStart: () => ({ code: '' }) }],
		} as Parameters<typeof serverScriptStart>[0],
		'test-render'
	);
	expect(code).toContain('late-pixel');
	// oxlint-disable-next-line no-new-func -- Runs the server's inline script, as the page would.
	new Function(code ?? '')();
	await tick(100);
	expect(started('late-pixel')).toBe(false);
});

test('the page keeps every ended render id, up to the last 1,000', () => {
	for (let index = 0; index < 1001; index += 1) {
		const leave = leavePageRender({}, `render-${index}`);
		endPageRender(`render-${index}`);
		// The next render gets its own boot data; the list stays.
		const ended = (globalThis as Record<string, unknown>).__inthEndedRenders;
		leave();
		(globalThis as Record<string, unknown>).__inthEndedRenders = ended;
	}
	const ended = (globalThis as Record<string, unknown>)
		.__inthEndedRenders as string[];
	expect(ended).toHaveLength(1000);
	expect(ended[0]).toBe('render-1');
	expect(ended.at(-1)).toBe('render-1000');
	Reflect.deleteProperty(globalThis, '__inthEndedRenders');
});

test("an ended render's late server start leaves a newer render's page object alone", async () => {
	// Render A's root went first; a later render B made its page object.
	// A's start script then streams in.
	const config = policyConfig({}, { marketing: true });
	const { boot, page: streamed } = await serve(config);
	storedChoice(streamed.doc, () => true);
	// An earlier test's loader marked the document; this page's has not run.
	Reflect.deleteProperty(globalThis, '__inthLoaderRan');
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			defer
			loadEngine={() =>
				new Promise<EngineModule>(() => {
					// Never settles.
				})
			}
			prefetch={fulfilledThenable(config)}
			schedule={() => () => undefined}
		/>
	);
	await tick(20);
	await hydrated.unmount();
	await tick(20);
	const renderB = { id: 'render-b', starts: {} };
	(globalThis as Record<string, unknown>).__inthRender = renderB;

	const code = serverScriptStart(
		{
			consentCategories: [...consentCategories],
			mode,
			prefetch: config,
			scripts: [{ ...pixel('late-pixel'), serverStart: () => ({ code: '' }) }],
		} as Parameters<typeof serverScriptStart>[0],
		'test-render'
	);
	// oxlint-disable-next-line no-new-func -- Runs the server's inline script, as the page would.
	new Function(code ?? '')();
	await tick(100);
	expect(started('late-pixel')).toBe(false);
	expect((globalThis as Record<string, unknown>).__inthRender).toBe(renderB);
	expect(renderB).toEqual({ id: 'render-b', starts: {} });
});

test('a root script started early that the root declares with a new src is released, and the engine loads', async () => {
	const config = policyConfig({}, { marketing: true });
	const { boot, page: streamed } = await serve(config);
	storedChoice(streamed.doc, () => true);
	const store = {
		listeners: new Set<() => void>(),
		scripts: [pixel('moving-pixel')],
	};
	const ScriptsPage = (
		props: Omit<Parameters<typeof ClientPage>[0], 'commit'>
	) => {
		const scripts = useSyncExternalStore(
			(listener) => {
				store.listeners.add(listener);
				return () => {
					store.listeners.delete(listener);
				};
			},
			() => store.scripts,
			() => store.scripts
		);
		return (
			<ClientPage
				{...props}
				commit={{ scripts }}
			/>
		);
	};
	const loadEngine = vi.fn(
		() =>
			new Promise<EngineModule>(() => {
				// Never settles.
			})
	);
	const hydrated = await streamed.hydrate(
		<ScriptsPage
			boot={boot}
			defer
			loadEngine={loadEngine}
			prefetch={fulfilledThenable(config)}
			schedule={() => () => undefined}
			startScripts
		/>
	);
	await tick(100);
	expect(started('moving-pixel')).toBe(true);
	await act(() => {
		store.scripts = [
			{ ...pixel('moving-pixel'), src: '/never-served/moved-pixel.js' },
		];
		for (const listener of store.listeners) {
			listener();
		}
	});
	await tick(20);
	expect(started('moving-pixel')).toBe(false);
	expect(loadEngine).toHaveBeenCalled();
	await hydrated.unmount();
});

test("a root whose live options change ends its render for the server start's inline code in that render", async () => {
	const config = policyConfig({}, { marketing: true });
	const { boot, page: streamed } = await serve(config);
	storedChoice(streamed.doc, () => true);
	const liveKey = { key: 'at-mount', listeners: new Set<() => void>() };
	let idInRender: string | undefined;
	const Spy = () => {
		idInRender = (globalThis as { __inthRender?: { id?: string } }).__inthRender
			?.id;
		return null;
	};
	const LivePage = (props: Parameters<typeof ClientPage>[0]) => {
		const live = useSyncExternalStore(
			(listener) => {
				liveKey.listeners.add(listener);
				return () => {
					liveKey.listeners.delete(listener);
				};
			},
			() => liveKey.key,
			() => liveKey.key
		);
		return (
			<>
				<ClientPage
					{...props}
					live={live}
				/>
				{live === 'at-mount' ? null : <Spy />}
			</>
		);
	};
	const hydrated = await streamed.hydrate(
		<LivePage
			boot={boot}
			defer
			loadEngine={() =>
				new Promise<EngineModule>(() => {
					// Never settles.
				})
			}
			prefetch={fulfilledThenable(config)}
			schedule={() => () => undefined}
			startScripts
		/>
	);
	await tick(20);
	await act(() => {
		liveKey.key = 'denied';
		for (const listener of liveKey.listeners) {
			listener();
		}
	});
	// Read while the render that changed the options ran, after the shell.
	expect(idInRender).not.toBe('test-render');
	await hydrated.unmount();
});

test("a root checks the stored choice through its own render's check, not a newer render's", async () => {
	const config = policyConfig({}, { marketing: true });
	const { boot, page: streamed } = await serve(config);
	expect(boot.i).toBe('test-render');
	storedChoice(streamed.doc, () => true);
	// Render B's boot element and page object replaced render A's before A's
	// session started its scripts; B's check passes, A's is gone.
	const element = document.querySelector('script[data-inth-boot]');
	if (element) {
		element.textContent = JSON.stringify({ i: 'render-b', s: {} });
	}
	Object.assign(globalThis, {
		__inthRender: { current: () => true, id: 'render-b', starts: {} },
	});
	const loadEngine = vi.fn(
		() =>
			new Promise<EngineModule>(() => {
				// Never settles.
			})
	);
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			commit={{ scripts: [pixel('other-render-pixel')] }}
			defer
			loadEngine={loadEngine}
			prefetch={fulfilledThenable(config)}
			schedule={() => () => undefined}
			startScripts
		/>
	);
	await tick(50);
	// A cannot confirm its own stored choice: nothing goes in without the
	// engine, which loads.
	expect(started('other-render-pixel')).toBe(false);
	expect(loadEngine).toHaveBeenCalled();
	await hydrated.unmount();
});

test('a root ends the render its own boot data names, not a newer one the page holds by the time it mounts', async () => {
	const config = policyConfig({}, { marketing: true });
	const { boot, page: streamed } = await serve(config);
	// This root planned its render from render A's boot data. A client
	// navigation then left render B's boot element and page object before
	// the root's session was created.
	expect(boot.i).toBe('test-render');
	storedChoice(streamed.doc, () => true);
	const element = document.querySelector('script[data-inth-boot]');
	expect(element).not.toBeNull();
	if (element) {
		element.textContent = JSON.stringify({ i: 'render-b', s: {} });
	}
	const newer = { current: () => true, id: 'render-b', starts: {} };
	Object.assign(globalThis, { __inthRender: newer });
	const liveKey = { key: 'at-mount', listeners: new Set<() => void>() };
	const LivePage = (props: Parameters<typeof ClientPage>[0]) => {
		const live = useSyncExternalStore(
			(listener) => {
				liveKey.listeners.add(listener);
				return () => {
					liveKey.listeners.delete(listener);
				};
			},
			() => liveKey.key,
			() => liveKey.key
		);
		return (
			<ClientPage
				{...props}
				live={live}
			/>
		);
	};
	const hydrated = await streamed.hydrate(
		<LivePage
			boot={boot}
			defer
			loadEngine={() =>
				new Promise<EngineModule>(() => {
					// Never settles.
				})
			}
			prefetch={fulfilledThenable(config)}
			schedule={() => () => undefined}
			startScripts
		/>
	);
	await tick(20);
	await act(() => {
		liveKey.key = 'denied';
		for (const listener of liveKey.listeners) {
			listener();
		}
	});
	await hydrated.unmount();
	await tick(20);
	// Render B's page object is still the page's.
	expect((globalThis as Record<string, unknown>).__inthRender).toBe(newer);
	expect(
		(globalThis as { __inthEndedRenders?: string[] }).__inthEndedRenders ?? []
	).not.toContain('render-b');
});

/** Runs `run` as the render that removes it commits. */
const OnUnmount = ({ run }: { run: () => void }) => {
	useLayoutEffect(() => run, [run]);
	return null;
};

/**
 * Registers `key` as a server start of render `render` inserted, as the
 * start script does, and returns its element.
 */
const serverStartedElement = (
	key: string,
	render: string
): HTMLScriptElement => {
	const element = document.createElement('script');
	element.src = `/never-served/${key}.js`;
	Object.assign(element, { __inthStartRender: render });
	document.head.append(element);
	const scope = globalThis as Record<string, unknown>;
	const registry = (scope.__inthStarted ?? {}) as Record<string, unknown>;
	registry[key] = element;
	scope.__inthStarted = registry;
	return element;
};

test("a root's delayed cleanup leaves a newer render alone and releases its own server starts", async () => {
	const config = policyConfig({}, { marketing: true });
	const { boot, page: streamed } = await serve(config);
	leftPageRender = leavePageRender({
		current: () => true,
		starts: { 'a-pixel': 1 },
	});
	const own = serverStartedElement('a-pixel', 'test-render');
	const renderB = { id: 'render-b', starts: { 'b-pixel': 1 } };
	let theirs: HTMLScriptElement | undefined;
	// Render B takes the document over in the commit that unmounts A,
	// before A's cleanup runs: its boot data, its page object and what its
	// server start inserted.
	const takeOver = () => {
		const bootData = document.querySelector('script[data-inth-boot]');
		if (bootData) {
			bootData.textContent = JSON.stringify({ i: 'render-b', s: {} });
		}
		(globalThis as Record<string, unknown>).__inthRender = renderB;
		theirs = serverStartedElement('b-pixel', 'render-b');
	};
	const hydrated = await streamed.hydrate(
		<>
			<ClientPage
				boot={boot}
				defer
				loadEngine={() =>
					new Promise<EngineModule>(() => {
						// Never settles.
					})
				}
				prefetch={fulfilledThenable(config)}
				schedule={() => () => undefined}
			/>
			<OnUnmount run={takeOver} />
		</>
	);
	await tick(20);
	await hydrated.unmount();
	await tick(20);

	expect((globalThis as Record<string, unknown>).__inthRender).toBe(renderB);
	expect(renderB).toEqual({ id: 'render-b', starts: { 'b-pixel': 1 } });
	expect(theirs?.isConnected).toBe(true);
	expect((globalThis as Record<string, unknown>).__inthEndedRenders).toEqual([
		'test-render',
	]);
	expect(own.isConnected).toBe(false);
});

/** The server-started script the live-change cases below declare. */
const liveScript: Script = {
	...pixel('live-pixel'),
	serverStart: () => ({ code: '' }),
};

test.each([
	['without root scripts to compare', undefined, undefined, false],
	['that drop the script', [liveScript], [], false],
	[
		'that declare it otherwise',
		[liveScript],
		[{ ...liveScript, src: '/never-served/moved-pixel.js' }],
		false,
	],
	['that leave it as it was', [liveScript], [liveScript], true],
] as const)(
	'a root whose live options change, with scripts %s, keeps its server-started element only when the script stays as it was',
	async (_, atMount, afterChange, kept) => {
		const config = policyConfig({}, { marketing: true });
		const { boot, page: streamed } = await serve(config);
		leftPageRender = leavePageRender({
			current: () => true,
			starts: { 'live-pixel': 1 },
		});
		const element = serverStartedElement('live-pixel', 'test-render');
		const store = {
			key: 'at-mount',
			listeners: new Set<() => void>(),
			scripts: atMount as readonly Script[] | undefined,
		};
		const LivePage = (props: Parameters<typeof ClientPage>[0]) => {
			const live = useSyncExternalStore(
				(listener) => {
					store.listeners.add(listener);
					return () => {
						store.listeners.delete(listener);
					};
				},
				() => store.key,
				() => store.key
			);
			const scripts = useSyncExternalStore(
				(listener) => {
					store.listeners.add(listener);
					return () => {
						store.listeners.delete(listener);
					};
				},
				() => store.scripts,
				() => store.scripts
			);
			return (
				<ClientPage
					{...props}
					commit={scripts ? { scripts: [...scripts] } : undefined}
					live={live}
				/>
			);
		};
		const hydrated = await streamed.hydrate(
			<LivePage
				boot={boot}
				defer
				loadEngine={() =>
					new Promise<EngineModule>(() => {
						// Never settles.
					})
				}
				prefetch={fulfilledThenable(config)}
				schedule={() => () => undefined}
			/>
		);
		await tick(20);
		await act(() => {
			store.key = 'changed';
			store.scripts = afterChange as readonly Script[] | undefined;
			for (const listener of store.listeners) {
				listener();
			}
		});
		// A script the new options drop or change is no longer what the page
		// runs; one they keep as it was stays for the loader to adopt.
		expect(element.isConnected).toBe(kept);
		await hydrated.unmount();
	}
);

test('a stored choice withdrawn after the page parsed starts nothing and loads the engine', async () => {
	const config = policyConfig({}, { marketing: true });
	const { boot, page: streamed } = await serve(config);
	// Current when the page parsed, then another tab withdrew the choice.
	let current = true;
	storedChoice(streamed.doc, () => current);
	current = false;
	// The engine never arrives, so only what the root starts itself shows.
	const loadEngine = vi.fn(
		() =>
			new Promise<EngineModule>(() => {
				// Never settles.
			})
	);
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			commit={{ scripts: [pixel('root-pixel')] }}
			defer
			hookScripts={[pixel('hook-pixel')]}
			loadEngine={loadEngine}
			prefetch={fulfilledThenable(config)}
			schedule={() => () => undefined}
			startScripts
		/>
	);
	await tick(20);
	expect(loadEngine).toHaveBeenCalled();
	expect(started('root-pixel')).toBe(false);
	expect(started('hook-pixel')).toBe(false);
	await hydrated.unmount();
});

test('a script passed after the stored choice was withdrawn starts nothing and loads the engine', async () => {
	const config = policyConfig({}, { marketing: true });
	const { boot, page: streamed } = await serve(config);
	let current = true;
	storedChoice(streamed.doc, () => current);
	liveScripts.set([pixel('first-pixel')]);
	const loadEngine = vi.fn(
		() =>
			new Promise<EngineModule>(() => {
				// Never settles: only what starts without the engine shows.
			})
	);
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			defer
			liveHookScripts
			loadEngine={loadEngine}
			prefetch={fulfilledThenable(config)}
			schedule={() => () => undefined}
			startScripts
		/>
	);
	await tick(100);
	expect(started('first-pixel')).toBe(true);
	expect(loadEngine).not.toHaveBeenCalled();

	// Another tab withdraws the choice; then the page passes a new script.
	current = false;
	await act(() => {
		liveScripts.set([pixel('first-pixel'), pixel('later-pixel')]);
	});
	await tick(100);
	expect(started('later-pixel')).toBe(false);
	expect(loadEngine).toHaveBeenCalled();
	await hydrated.unmount();
	liveScripts.set([]);
});

test.each([
	[
		'another tab writes storage',
		() => window.dispatchEvent(new Event('storage')),
	],
	['the page gets focus again', () => window.dispatchEvent(new Event('focus'))],
] as const)(
	'a stored choice withdrawn while the engine waits loads the engine when %s',
	async (_case, wake) => {
		const config = policyConfig({}, { marketing: true });
		const { boot, page: streamed } = await serve(config);
		let current = true;
		storedChoice(streamed.doc, () => current);
		const loadEngine = vi.fn(
			() =>
				new Promise<EngineModule>(() => {
					// Never settles.
				})
		);
		const hydrated = await streamed.hydrate(
			<ClientPage
				boot={boot}
				commit={{ scripts: [pixel('root-pixel')] }}
				defer
				loadEngine={loadEngine}
				prefetch={fulfilledThenable(config)}
				schedule={() => () => undefined}
				startScripts
			/>
		);
		await tick(50);
		expect(started('root-pixel')).toBe(true);
		expect(loadEngine).not.toHaveBeenCalled();

		current = false;
		await act(() => {
			wake();
		});
		await tick(20);
		expect(loadEngine).toHaveBeenCalled();
		await hydrated.unmount();
	}
);

test("a page object from another render is not this root's", async () => {
	// After a client-side navigation or a remount, the document can hold
	// the page object an earlier render's scripts wrote.
	const config = policyConfig({}, { marketing: true });
	const { boot, page: streamed } = await serve(config);
	leftPageRender = leavePageRender({ current: () => true, starts: {} });
	(globalThis as Record<string, unknown>).__inthRender = {
		current: () => true,
		failed: 1,
		id: 'an-earlier-render',
		starts: { 'root-pixel': 1 },
	};
	const loadEngine = vi.fn(
		() =>
			new Promise<EngineModule>(() => {
				// Never settles.
			})
	);
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			commit={{ scripts: [pixel('root-pixel')] }}
			defer
			loadEngine={loadEngine}
			prefetch={fulfilledThenable(config)}
			schedule={() => () => undefined}
			startScripts
		/>
	);
	await tick(20);
	// The earlier render's grant counts for nothing: the engine loads, and
	// nothing starts without it.
	expect(loadEngine).toHaveBeenCalled();
	expect(started('root-pixel')).toBe(false);
	await hydrated.unmount();
});

test('a hook script mounted in the render that changes the live options starts nothing and loads the engine', async () => {
	// A navigation hands the root a denial and mounts a route that passes a
	// plain script to useScriptLoader. Its effect runs before the shell's,
	// so the starter itself must see that the session is stale.
	const config = policyConfig({}, { marketing: true });
	const { boot, page: streamed } = await serve(config);
	storedChoice(streamed.doc, () => true);
	const liveKey = {
		key: 'at-mount',
		listeners: new Set<() => void>(),
	};
	const LiveClientPage = (props: Parameters<typeof ClientPage>[0]) => {
		const live = useSyncExternalStore(
			(listener) => {
				liveKey.listeners.add(listener);
				return () => {
					liveKey.listeners.delete(listener);
				};
			},
			() => liveKey.key,
			() => liveKey.key
		);
		return (
			<ClientPage
				{...props}
				live={live}
			/>
		);
	};
	const loadEngine = vi.fn(
		() =>
			new Promise<EngineModule>(() => {
				// Never settles.
			})
	);
	const hydrated = await streamed.hydrate(
		<LiveClientPage
			boot={boot}
			defer
			liveHookScripts
			loadEngine={loadEngine}
			prefetch={fulfilledThenable(config)}
			schedule={() => () => undefined}
			startScripts
		/>
	);
	await tick(20);
	expect(loadEngine).not.toHaveBeenCalled();
	await act(() => {
		liveKey.key = 'denied';
		liveScripts.scripts = [pixel('route-pixel')];
		for (const listener of [...liveKey.listeners, ...liveScripts.listeners]) {
			listener();
		}
	});
	await tick(20);
	expect(started('route-pixel')).toBe(false);
	expect(loadEngine).toHaveBeenCalled();
	liveScripts.set([]);
	await hydrated.unmount();
});

test('an unmount after the schedule changes leaves no stored-choice watcher', async () => {
	// The effect that starts the watcher runs again when `schedule` changes;
	// the watcher it started first must not outlive the root.
	const config = policyConfig({}, { marketing: true });
	const { boot, page: streamed } = await serve(config);
	storedChoice(streamed.doc, () => true);
	const live = new Set<EventListenerOrEventListenerObject>();
	const add = window.addEventListener.bind(window);
	const remove = window.removeEventListener.bind(window);
	vi.spyOn(window, 'addEventListener').mockImplementation(
		(type: string, listener, options) => {
			if (type === 'storage' && listener) {
				live.add(listener);
			}
			add(type, listener as EventListener, options);
		}
	);
	vi.spyOn(window, 'removeEventListener').mockImplementation(
		(type: string, listener, options) => {
			if (type === 'storage' && listener) {
				live.delete(listener);
			}
			remove(type, listener as EventListener, options);
		}
	);
	const store = {
		listeners: new Set<() => void>(),
		schedule: (() => () => undefined) as (start: () => void) => () => void,
	};
	const SchedulePage = (
		props: Omit<Parameters<typeof ClientPage>[0], 'schedule'>
	) => {
		const schedule = useSyncExternalStore(
			(listener) => {
				store.listeners.add(listener);
				return () => {
					store.listeners.delete(listener);
				};
			},
			() => store.schedule,
			() => store.schedule
		);
		return (
			<ClientPage
				{...props}
				schedule={schedule}
			/>
		);
	};
	const hydrated = await streamed.hydrate(
		<SchedulePage
			boot={boot}
			defer
			loadEngine={() =>
				new Promise<EngineModule>(() => {
					// Never settles.
				})
			}
			prefetch={fulfilledThenable(config)}
			startScripts
		/>
	);
	await tick(20);
	expect(live.size).toBeGreaterThan(0);
	await act(() => {
		store.schedule = () => () => undefined;
		for (const listener of store.listeners) {
			listener();
		}
	});
	await tick(20);
	await hydrated.unmount();
	expect(live.size).toBe(0);
});

test('a live root option that changes while the engine waits loads it at once', async () => {
	const config = policyConfig({}, { marketing: true });
	const { boot, page: streamed } = await serve(config);
	storedChoice(streamed.doc, () => true);
	const liveKey = {
		key: 'at-mount',
		listeners: new Set<() => void>(),
	};
	const LiveClientPage = (props: Parameters<typeof ClientPage>[0]) => {
		const live = useSyncExternalStore(
			(listener) => {
				liveKey.listeners.add(listener);
				return () => {
					liveKey.listeners.delete(listener);
				};
			},
			() => liveKey.key,
			() => liveKey.key
		);
		return (
			<ClientPage
				{...props}
				live={live}
			/>
		);
	};
	const loadEngine = vi.fn(
		() =>
			new Promise<EngineModule>(() => {
				// Never settles.
			})
	);
	const hydrated = await streamed.hydrate(
		<LiveClientPage
			boot={boot}
			defer
			loadEngine={loadEngine}
			prefetch={fulfilledThenable(config)}
			schedule={() => () => undefined}
			startScripts
		/>
	);
	await tick(20);
	expect(loadEngine).not.toHaveBeenCalled();
	// The root's scripts or network blocker change, say on a navigation.
	await act(() => {
		liveKey.key = 'changed';
		for (const listener of liveKey.listeners) {
			listener();
		}
	});
	await tick(20);
	expect(loadEngine).toHaveBeenCalled();
	await hydrated.unmount();
});
