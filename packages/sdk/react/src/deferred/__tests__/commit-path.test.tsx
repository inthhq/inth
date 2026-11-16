/**
 * A banner tap before a deferred root's engine has loaded: an accept or
 * reject is committed on the stand-in in the tap's own task (`instant.ts`),
 * completed by the commit path (`commit.ts`) without the engine, which
 * loads afterwards and takes over without saving again. Each test
 * streams a real server render into an iframe and hydrates it. React runs
 * in this window, so the tests hand it the iframe's early-tap queue.
 */
import type { KernelConfig } from '@c15t/core';
import {
	Suspense,
	act,
	useEffect,
	useState,
	useSyncExternalStore,
} from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { PENDING_SAVES_STORAGE_KEY } from '../../../../core/src/libs/storage-keys';
import {
	EARLY_TAP_STYLE_ID,
	EARLY_TAPS_WINDOW_KEY,
} from '../../../../core/src/surface-actions/early-tap-script';
import { policyFixture } from '../../__tests__/policy-fixture';
import {
	BANNER,
	deferred,
	fulfilledThenable,
	streamPage,
} from '../../__tests__/streamed-ssr-harness';
import type { StreamedPage } from '../../__tests__/streamed-ssr-harness';
import { useSaveConsents, useSnapshot } from '../../hooks';
import { ConsentProvider, custom } from '../../index';
import { useScriptLoader } from '../../module-hooks/script-loader';
import type { Script } from '../../module-hooks/script-loader';
import { readConsentBoot } from '../boot';
import type { ConsentBoot } from '../boot';
import { ConsentBootData, ServerBootData } from '../boot-data';
import type { CommitTapInput, CommitTapResult } from '../commit';
import type { DeferredCommitConfig } from '../committed';
import type * as EngineNamespace from '../engine';
import { DeferredConsentShell } from '../shell';
import { DeferredConsentBanner, DeferredConsentDialog } from '../surfaces';

type EngineModule = typeof EngineNamespace;

/** Holds the commit path's module until a test releases it. */
const commitGate = vi.hoisted(() => {
	let release: () => void = () => undefined;
	let promise = Promise.resolve();
	return {
		hold() {
			promise = new Promise<void>((resolve) => {
				release = resolve;
			});
		},
		release: () => release(),
		wait: () => promise,
	};
});

/** The commit path's module, held while the gate is. */
const loadCommit = async () => {
	await commitGate.wait();
	return import('../commit');
};

const config = (): KernelConfig => ({
	initialBranding: 'c15t',
	initialLocation: { countryCode: 'DE', regionCode: null },
	initialOverrides: { country: 'DE', language: 'en' },
	...policyFixture({}, { categories: ['marketing'], id: 'gdpr' }),
});

const consentCategories = ['necessary', 'marketing'] as const;
const transportInit = vi.fn(() => Promise.resolve({}));
const transportSave = vi.fn(() => Promise.resolve({ ok: true as const }));
const mode = custom({ init: transportInit, save: transportSave });

/** Counts executions in this window, where the root inserts scripts. */
const counted = (id: string): Script => ({
	category: 'marketing',
	id,
	src: `data:text/javascript,window.__ran=window.__ran||{};window.__ran['${id}']=(window.__ran['${id}']||0)+1`,
});
const ran = (id: string): number =>
	(window as unknown as { __ran?: Record<string, number> }).__ran?.[id] ?? 0;
const inserted = (id: string): number =>
	document.querySelectorAll(`script[src*="__ran['${id}']"]`).length;

/** Page saves' results, by the order they were made. */
const pageSaves: unknown[] = [];

/**
 * What the page's `useSnapshot()` effect saw, in order, as the CookieBench
 * fixture's `updateBridge` effect reads it.
 */
const effects: { chose: boolean | undefined; marketing: boolean }[] = [];

const NO_SCRIPTS: Script[] = [];

/** Passes `scripts` from its second render on, as a page that reads them in an effect. */
const LateScripts = ({ scripts }: { scripts: Script[] }) => {
	const [late, setLate] = useState<Script[]>([]);
	useEffect(() => {
		// oxlint-disable-next-line react/set-state-in-effect, react/no-deriving-state-in-effects -- The late registration this test reproduces.
		setLate(scripts);
	}, [scripts]);
	useScriptLoader(late);
	return null;
};

const Probe = ({ scripts }: { scripts: Script[] }) => {
	const snapshot = useSnapshot();
	const save = useSaveConsents();
	useScriptLoader(scripts);
	useEffect(() => {
		effects.push({
			chose: snapshot.explicitChoice?.categories.marketing?.value,
			marketing: snapshot.effectivePermissions.marketing,
		});
	}, [snapshot]);
	return (
		<main
			data-active-ui={snapshot.activeUI}
			data-marketing={String(snapshot.effectivePermissions.marketing)}
		>
			<button
				id="accept-from-page"
				onClick={() => {
					// oxlint-disable-next-line promise/prefer-await-to-then -- Records the result for the test.
					void save('all').then((result) => pageSaves.push(result));
				}}
				type="button"
			>
				Accept
			</button>
		</main>
	);
};

const providerOptions = (prefetch: unknown) => ({
	consentCategories,
	mode,
	persistence: false as const,
	prefetch: prefetch as KernelConfig,
});

const ServerPage = ({ prefetch }: { prefetch: unknown }) => (
	<html lang="en">
		<head />
		<body>
			<ConsentProvider options={providerOptions(prefetch)}>
				<Probe scripts={[]} />
				<DeferredConsentBanner />
				<DeferredConsentDialog />
				<Suspense fallback={null}>
					<ServerBootData />
				</Suspense>
			</ConsentProvider>
		</body>
	</html>
);

/** Hands the iframe's early-tap queue to the root, as one window has. */
const shareTapQueue = (streamed: StreamedPage): void => {
	const frame = streamed.doc.defaultView as unknown as Record<string, unknown>;
	(window as unknown as Record<string, unknown>)[EARLY_TAPS_WINDOW_KEY] =
		frame[EARLY_TAPS_WINDOW_KEY];
};

/**
 * A schedule that never starts the engine on its own: only the commit
 * path, an action or the test does. It routes taps as the real one does.
 */
const routeTapsOnly = (
	_start: () => void,
	_handle: unknown,
	onTap?: () => void
) => {
	const queue = (window as unknown as Record<string, Record<string, unknown>>)[
		EARLY_TAPS_WINDOW_KEY
	];
	if (queue && onTap) {
		queue.n = () => onTap();
		if ((queue.taps as unknown[]).length) {
			onTap();
		}
	}
	return () => undefined;
};

const ClientPage = ({
	boot,
	commit,
	loadCommit: load = loadCommit,
	loadEngine,
	prefetch,
	scripts,
	lateScripts = NO_SCRIPTS,
	live,
}: {
	boot: ConsentBoot;
	commit: DeferredCommitConfig;
	live?: string;
	loadCommit?: typeof loadCommit;
	loadEngine: () => Promise<EngineModule>;
	prefetch: unknown;
	scripts: Script[];
	lateScripts?: Script[];
}) => (
	<html lang="en">
		<head />
		<body>
			<DeferredConsentShell
				boot={boot}
				commit={commit}
				defer
				live={live}
				loadCommit={load}
				loadEngine={loadEngine}
				options={{ consentCategories }}
				prefetch={prefetch}
				renderEngine={(engine: EngineModule, attach, committed) => (
					<engine.DeferredEngineHost
						attach={attach}
						committed={committed}
						options={{
							...providerOptions(prefetch),
							callbacks: commit.callbacks,
							scripts: commit.scripts,
						}}
					>
						<ConsentBootData />
					</engine.DeferredEngineHost>
				)}
				schedule={routeTapsOnly}
			>
				<Probe scripts={scripts} />
				<LateScripts scripts={lateScripts} />
				<DeferredConsentBanner />
				<DeferredConsentDialog />
			</DeferredConsentShell>
		</body>
	</html>
);

let page: StreamedPage | undefined;

/** `Storage.prototype.setItem`, while a test refuses the outbox's writes. */
let refusedOutbox: MockInstance | undefined;

/** Blocked or full storage for the outbox's key only. */
const refuseOutboxWrites = (): void => {
	const { setItem } = Storage.prototype;
	refusedOutbox = vi
		.spyOn(Storage.prototype, 'setItem')
		.mockImplementation(function refuse(
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

beforeEach(() => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	transportInit.mockClear();
	transportSave.mockClear();
	effects.length = 0;
	localStorage.clear();
	Reflect.deleteProperty(window, '__ran');
	Reflect.deleteProperty(window, '__c15tStarted');
});

afterEach(() => {
	refusedOutbox?.mockRestore();
	refusedOutbox = undefined;
	commitGate.release();
	page?.dispose();
	page = undefined;
	Reflect.deleteProperty(window, EARLY_TAPS_WINDOW_KEY);
	document.getElementById(EARLY_TAP_STYLE_ID)?.remove();
	for (const script of document.querySelectorAll('script[src*="__ran"]')) {
		script.remove();
	}
	localStorage.clear();
});

/** Streams the server render of a fresh visitor with a streamed state. */
const serve = async function serve(state: KernelConfig) {
	const server = deferred<KernelConfig>();
	page = await streamPage(<ServerPage prefetch={server.promise} />);
	server.resolve(state);
	await page.finish();
	const boot = readConsentBoot(page.doc);
	expect(page.serverErrors).toEqual([]);
	expect(boot?.r?.activeUI).toBe('banner');
	return { boot: boot as ConsentBoot, page };
};

/** An engine import held until the test releases it. */
const heldEngine = function heldEngine() {
	const gate = deferred<undefined>();
	const loadEngine = vi.fn(async () => {
		await gate.promise;
		return import('../engine');
	});
	return { loadEngine, release: () => gate.resolve(undefined) };
};

const tapBanner = (streamed: StreamedPage, action: string): void => {
	(
		streamed.doc.querySelector(
			`${BANNER} [data-action="${action}"]`
		) as HTMLButtonElement
	).click();
};

const queuedSaves = (): unknown[] =>
	JSON.parse(localStorage.getItem(PENDING_SAVES_STORAGE_KEY) ?? '[]');

test('an accept before the engine is recorded without it; the engine takes it over without saving again', async () => {
	const state = config();
	const { boot, page: streamed } = await serve(state);
	const onChoiceRecorded = vi.fn();
	const onPermissionsChanged = vi.fn();
	const engine = heldEngine();
	shareTapQueue(streamed);
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			commit={{ callbacks: { onChoiceRecorded, onPermissionsChanged } }}
			loadEngine={engine.loadEngine}
			prefetch={fulfilledThenable(state)}
			scripts={[]}
		/>
	);
	const main = streamed.doc.querySelector('main');
	expect(main?.dataset.marketing).toBe('false');

	await act(() => {
		tapBanner(streamed, 'accept');
	});
	await vi.waitFor(() => {
		expect(main?.dataset.marketing).toBe('true');
	});
	// Recorded from the commit path: the stand-in reads the choice, the
	// callbacks heard it, the record is stored and the save queued.
	expect(main?.dataset.activeUi).toBe('none');
	await vi.waitFor(() => {
		expect(onChoiceRecorded).toHaveBeenCalledTimes(1);
	});
	expect(onChoiceRecorded.mock.calls[0]?.[0]).toMatchObject({
		consentAction: 'all',
		uiSource: 'banner',
	});
	expect(onPermissionsChanged).toHaveBeenCalledTimes(1);
	expect(JSON.parse(localStorage.getItem('c15t') ?? 'null')).toMatchObject({
		categories: { marketing: { value: true } },
		version: 3,
	});
	await vi.waitFor(() => {
		expect(queuedSaves()).toHaveLength(1);
	});
	expect(transportSave).not.toHaveBeenCalled();
	// The engine is asked for only after the choice is in.
	await vi.waitFor(() => {
		expect(engine.loadEngine).toHaveBeenCalledTimes(1);
	});

	await act(() => {
		engine.release();
	});
	// The engine starts from the records, sends the queued save once and
	// replaces the banner's server HTML.
	await vi.waitFor(() => {
		expect(transportSave).toHaveBeenCalledTimes(1);
		expect(streamed.doc.querySelector(BANNER)).toBeNull();
	});
	await vi.waitFor(() => {
		expect(queuedSaves()).toHaveLength(0);
	});
	expect(main?.dataset.marketing).toBe('true');
	expect(onChoiceRecorded).toHaveBeenCalledTimes(1);
	expect(onPermissionsChanged).toHaveBeenCalledTimes(1);
	expect(hydrated.recoverableErrors).toEqual([]);
	await hydrated.unmount();
});

test('an accept before the engine calls the callback the latest render passed', async () => {
	// An inline callback is rebuilt each render and keeps the live key, so
	// the engine keeps waiting; the tap must still call the new one.
	const state = config();
	const { boot, page: streamed } = await serve(state);
	const first = vi.fn();
	const latest = vi.fn();
	const store = {
		callback: first,
		listeners: new Set<() => void>(),
	};
	const LatestCallbackPage = (
		props: Omit<Parameters<typeof ClientPage>[0], 'commit'>
	) => {
		const onChoiceRecorded = useSyncExternalStore(
			(listener) => {
				store.listeners.add(listener);
				return () => {
					store.listeners.delete(listener);
				};
			},
			() => store.callback,
			() => store.callback
		);
		return (
			<ClientPage
				{...props}
				commit={{ callbacks: { onChoiceRecorded } }}
			/>
		);
	};
	const engine = heldEngine();
	shareTapQueue(streamed);
	const hydrated = await streamed.hydrate(
		<LatestCallbackPage
			boot={boot}
			loadEngine={engine.loadEngine}
			prefetch={fulfilledThenable(state)}
			scripts={[]}
		/>
	);
	await act(() => {
		store.callback = latest;
		for (const listener of store.listeners) {
			listener();
		}
	});
	expect(engine.loadEngine).not.toHaveBeenCalled();

	// The page's own accept: a rerender before the engine drops the
	// banner's server HTML in this harness, as it does on canary.
	await act(() => {
		(
			streamed.doc.getElementById('accept-from-page') as HTMLButtonElement
		).click();
	});
	await vi.waitFor(() => {
		expect(latest).toHaveBeenCalledTimes(1);
	});
	expect(first).not.toHaveBeenCalled();
	await act(() => {
		engine.release();
	});
	await hydrated.unmount();
});

test('the commit starts plain page and root scripts; their loaders adopt them once', async () => {
	const state = config();
	const { boot, page: streamed } = await serve(state);
	const engine = heldEngine();
	shareTapQueue(streamed);
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			commit={{ scripts: [counted('root')] }}
			loadEngine={engine.loadEngine}
			prefetch={fulfilledThenable(state)}
			scripts={[counted('page')]}
		/>
	);
	expect(inserted('page') + inserted('root')).toBe(0);

	await act(() => {
		tapBanner(streamed, 'accept');
	});
	await vi.waitFor(() => {
		expect(ran('page')).toBe(1);
		expect(ran('root')).toBe(1);
	});
	await vi.waitFor(() => {
		expect(engine.loadEngine).toHaveBeenCalled();
	});

	await act(() => {
		engine.release();
	});
	await vi.waitFor(() => {
		expect(transportSave).toHaveBeenCalledTimes(1);
	});
	// Give the loaders time to mount: each adopted its element.
	await act(
		() =>
			new Promise<void>((resolve) => {
				setTimeout(resolve, 200);
			})
	);
	expect(inserted('page')).toBe(1);
	expect(inserted('root')).toBe(1);
	expect(ran('page')).toBe(1);
	expect(ran('root')).toBe(1);
	expect(hydrated.recoverableErrors).toEqual([]);
	await hydrated.unmount();
});

test('a reject tapped before hydration is replayed through the commit path', async () => {
	const state = config();
	const { boot, page: streamed } = await serve(state);
	// Tapped while the page is still server HTML: the inline script holds it.
	tapBanner(streamed, 'reject');
	shareTapQueue(streamed);
	const onChoiceRecorded = vi.fn();
	const engine = heldEngine();
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			commit={{ callbacks: { onChoiceRecorded } }}
			loadEngine={engine.loadEngine}
			prefetch={fulfilledThenable(state)}
			scripts={[counted('page')]}
		/>
	);
	await vi.waitFor(() => {
		expect(onChoiceRecorded).toHaveBeenCalledTimes(1);
	});
	expect(onChoiceRecorded.mock.calls[0]?.[0]).toMatchObject({
		consentAction: 'necessary',
	});
	expect(streamed.doc.querySelector('main')?.dataset.activeUi).toBe('none');
	expect(
		JSON.parse(localStorage.getItem('c15t') ?? 'null')?.categories
	).toMatchObject({ marketing: { value: false } });
	expect(ran('page')).toBe(0);

	await act(() => {
		engine.release();
	});
	await vi.waitFor(() => {
		expect(transportSave).toHaveBeenCalledTimes(1);
	});
	expect(onChoiceRecorded).toHaveBeenCalledTimes(1);
	expect(ran('page')).toBe(0);
	expect(hydrated.recoverableErrors).toEqual([]);
	await hydrated.unmount();
});

test('a page accept on the stand-in goes through the commit path too', async () => {
	pageSaves.length = 0;
	const state = config();
	const { boot, page: streamed } = await serve(state);
	const engine = heldEngine();
	shareTapQueue(streamed);
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			commit={{}}
			loadEngine={engine.loadEngine}
			prefetch={fulfilledThenable(state)}
			scripts={[]}
		/>
	);
	await act(() => {
		(
			streamed.doc.getElementById('accept-from-page') as HTMLButtonElement
		).click();
	});
	// Resolved from the commit, with the engine still held.
	await vi.waitFor(() => {
		expect(pageSaves).toHaveLength(1);
	});
	expect(pageSaves[0]).toMatchObject({ confirmed: ['marketing'], ok: true });
	expect(streamed.doc.querySelector('main')?.dataset.marketing).toBe('true');
	expect(transportSave).not.toHaveBeenCalled();
	await act(() => {
		engine.release();
	});
	await vi.waitFor(() => {
		expect(transportSave).toHaveBeenCalledTimes(1);
	});
	expect(hydrated.recoverableErrors).toEqual([]);
	await hydrated.unmount();
});

test('a tap after the live options changed waits for the engine and records nothing itself', async () => {
	// Persistence turned off, say: the mount-time commit config no longer
	// says how to record the choice.
	const state = config();
	const { boot, page: streamed } = await serve(state);
	const engine = heldEngine();
	shareTapQueue(streamed);
	const store = { key: 'at-mount', listeners: new Set<() => void>() };
	const LivePage = (props: Omit<Parameters<typeof ClientPage>[0], 'live'>) => {
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
			commit={{}}
			loadEngine={engine.loadEngine}
			prefetch={fulfilledThenable(state)}
			scripts={[]}
		/>
	);
	await act(() => {
		store.key = 'persistence-off';
		for (const listener of store.listeners) {
			listener();
		}
	});
	await act(() => {
		(
			streamed.doc.getElementById('accept-from-page') as HTMLButtonElement
		).click();
	});
	await new Promise((resolve) => {
		setTimeout(resolve, 50);
	});
	// Nothing recorded through the old config; the engine is asked for.
	expect(localStorage.getItem('c15t')).toBeNull();
	expect(queuedSaves()).toHaveLength(0);
	expect(engine.loadEngine).toHaveBeenCalled();
	await act(() => {
		engine.release();
	});
	await hydrated.unmount();
});

test('customize hides the banner and opens the dialog without the engine; its save commits', async () => {
	const state = config();
	const { boot, page: streamed } = await serve(state);
	const engine = heldEngine();
	shareTapQueue(streamed);
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			commit={{}}
			loadEngine={engine.loadEngine}
			prefetch={fulfilledThenable(state)}
			scripts={[]}
		/>
	);
	const main = streamed.doc.querySelector('main');
	let hidden = false;
	await act(() => {
		tapBanner(streamed, 'customize');
		// Read in the tap's task: in this harness the banner is in the
		// iframe, so the root's check finds it gone at the next frame.
		hidden = document.getElementById('c15t-early-commit') !== null;
	});
	// Hidden by the root, which shows it again if the dialog closes.
	expect(hidden).toBe(true);
	// The dialog's chunks load first; give a busy machine time.
	await vi.waitFor(
		() => {
			expect(
				document.querySelector('[data-testid="consent-dialog-root"]')
			).not.toBeNull();
		},
		{ timeout: 5000 }
	);
	expect(main?.dataset.activeUi).toBe('dialog');
	// The engine is asked for once the dialog is on screen, and still held.
	await vi.waitFor(() => {
		expect(engine.loadEngine).toHaveBeenCalledTimes(1);
	});

	await act(() => {
		(
			document.querySelector(
				'[data-testid="consent-widget-reject-button"]'
			) as HTMLButtonElement
		).click();
	});
	await vi.waitFor(() => {
		expect(main?.dataset.activeUi).toBe('none');
	});
	expect(main?.dataset.marketing).toBe('false');
	// The stand-in showed the choice in the click's task; the commit chunk
	// stores it once it has loaded.
	await vi.waitFor(() => {
		expect(
			JSON.parse(localStorage.getItem('c15t') ?? 'null')?.categories
		).toMatchObject({ marketing: { value: false } });
	});
	expect(transportSave).not.toHaveBeenCalled();

	await act(() => {
		engine.release();
	});
	await vi.waitFor(() => {
		expect(transportSave).toHaveBeenCalledTimes(1);
	});
	await vi.waitFor(() => {
		expect(
			document.querySelector('[data-testid="consent-dialog-root"]')
		).toBeNull();
	});
	expect(main?.dataset.activeUi).toBe('none');
	expect(hydrated.recoverableErrors).toEqual([]);
	await hydrated.unmount();
});

/**
 * The effects the page had run when the task after the next click in `doc`
 * started: anything there ran in the click's own task. Listens on the
 * window, ahead of the early-tap script's document listener, which stops
 * the event.
 */
const effectsInTapTask = (doc: Document) =>
	new Promise<typeof effects>((resolve) => {
		(doc.defaultView ?? window).addEventListener(
			'click',
			() => {
				setTimeout(() => resolve([...effects]), 0);
			},
			{ capture: true, once: true }
		);
	});

/** React as a page runs it: no `act()` batching around a tap. */
const outsideAct = () => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = false;
};

test("a hook's script an instant accept started leaves with the hook when it unmounts in the tap's task", async () => {
	const state = config();
	const { boot, page: streamed } = await serve(state);
	const engine = heldEngine();
	commitGate.hold();
	shareTapQueue(streamed);
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			commit={{}}
			loadEngine={engine.loadEngine}
			prefetch={fulfilledThenable(state)}
			scripts={[counted('owned-by-hook')]}
		/>
	);
	outsideAct();
	tapBanner(streamed, 'accept');
	expect(inserted('owned-by-hook')).toBe(1);
	// The page goes in the same task, before the hook's own claim could run.
	const gone = hydrated.unmount();
	await gone;
	commitGate.release();
	await new Promise((resolve) => {
		setTimeout(resolve, 50);
	});
	expect(inserted('owned-by-hook')).toBe(0);
});

test("an accept takes effect in the tap's task, with its scripts started; the commit chunk stores it and the engine adds nothing", async () => {
	const state = config();
	const { boot, page: streamed } = await serve(state);
	const onChoiceRecorded = vi.fn();
	const engine = heldEngine();
	commitGate.hold();
	shareTapQueue(streamed);
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			commit={{ callbacks: { onChoiceRecorded }, scripts: [counted('root')] }}
			loadEngine={engine.loadEngine}
			prefetch={fulfilledThenable(state)}
			scripts={[counted('page')]}
		/>
	);
	outsideAct();
	// The banner cannot hydrate yet: its script holds presses on it.
	const queue = (window as unknown as Record<string, Record<string, unknown>>)[
		EARLY_TAPS_WINDOW_KEY
	];
	expect(queue?.b).toBe(1);
	const seen = effectsInTapTask(streamed.doc);

	tapBanner(streamed, 'accept');
	// Inserted while the click is still being dispatched.
	expect(inserted('page')).toBe(1);
	expect(inserted('root')).toBe(1);
	// `useSnapshot()`'s effect ran with the choice before the next task.
	expect((await seen).at(-1)).toEqual({ chose: true, marketing: true });
	// Nothing stored or announced yet: that is the commit chunk's work.
	expect(localStorage.getItem('c15t')).toBeNull();
	expect(onChoiceRecorded).not.toHaveBeenCalled();
	await vi.waitFor(() => {
		expect(ran('page')).toBe(1);
		expect(ran('root')).toBe(1);
	});
	const heard = effects.length;

	commitGate.release();
	await vi.waitFor(() => {
		expect(onChoiceRecorded).toHaveBeenCalledTimes(1);
		expect(queuedSaves()).toHaveLength(1);
	});
	expect(JSON.parse(localStorage.getItem('c15t') ?? 'null')).toMatchObject({
		categories: { marketing: { value: true } },
		version: 3,
	});
	// The commit chunk planned the same snapshot: the page heard nothing new.
	expect(effects).toHaveLength(heard);
	await vi.waitFor(() => {
		expect(engine.loadEngine).toHaveBeenCalledTimes(1);
	});

	await act(() => {
		engine.release();
	});
	await vi.waitFor(() => {
		expect(transportSave).toHaveBeenCalledTimes(1);
		expect(queuedSaves()).toHaveLength(0);
	});
	// The engine rendered: React may hydrate at a press again.
	expect(queue?.b).toBe(0);
	await act(
		() =>
			new Promise<void>((resolve) => {
				setTimeout(resolve, 200);
			})
	);
	expect(transportSave).toHaveBeenCalledTimes(1);
	expect(onChoiceRecorded).toHaveBeenCalledTimes(1);
	expect(inserted('page')).toBe(1);
	expect(inserted('root')).toBe(1);
	expect(ran('page')).toBe(1);
	expect(ran('root')).toBe(1);
	expect(effects.at(-1)).toEqual({ chose: true, marketing: true });
	expect(hydrated.recoverableErrors).toEqual([]);
	await hydrated.unmount();
});

test("a reject takes effect in the tap's task and starts nothing", async () => {
	const state = config();
	const { boot, page: streamed } = await serve(state);
	const engine = heldEngine();
	commitGate.hold();
	shareTapQueue(streamed);
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			commit={{ scripts: [counted('root')] }}
			loadEngine={engine.loadEngine}
			prefetch={fulfilledThenable(state)}
			scripts={[counted('page')]}
		/>
	);
	outsideAct();
	const seen = effectsInTapTask(streamed.doc);

	tapBanner(streamed, 'reject');
	expect((await seen).at(-1)).toEqual({ chose: false, marketing: false });
	expect(inserted('page') + inserted('root')).toBe(0);
	expect(localStorage.getItem('c15t')).toBeNull();

	commitGate.release();
	await vi.waitFor(() => {
		expect(
			JSON.parse(localStorage.getItem('c15t') ?? 'null')?.categories
		).toMatchObject({ marketing: { value: false } });
	});
	await act(() => {
		engine.release();
	});
	await vi.waitFor(() => {
		expect(transportSave).toHaveBeenCalledTimes(1);
	});
	expect(inserted('page') + inserted('root')).toBe(0);
	expect(hydrated.recoverableErrors).toEqual([]);
	await hydrated.unmount();
});

test("a save from the early dialog takes effect in the click's task", async () => {
	const state = config();
	const { boot, page: streamed } = await serve(state);
	const engine = heldEngine();
	shareTapQueue(streamed);
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			commit={{}}
			loadEngine={engine.loadEngine}
			prefetch={fulfilledThenable(state)}
			scripts={[counted('page')]}
		/>
	);
	// Held before the dialog opens: it starts the commit path's import.
	commitGate.hold();
	await act(() => {
		tapBanner(streamed, 'customize');
	});
	await vi.waitFor(
		() => {
			expect(
				document.querySelector('[data-testid="consent-dialog-root"]')
			).not.toBeNull();
		},
		{ timeout: 5000 }
	);
	outsideAct();
	const accept = document.querySelector(
		'[data-testid="consent-widget-footer-accept-all-button"]'
	) as HTMLButtonElement;
	const seen = effectsInTapTask(accept.ownerDocument);

	accept.click();
	expect(inserted('page')).toBe(1);
	expect((await seen).at(-1)).toEqual({ chose: true, marketing: true });
	expect(localStorage.getItem('c15t')).toBeNull();

	commitGate.release();
	await vi.waitFor(() => {
		expect(localStorage.getItem('c15t')).not.toBeNull();
	});
	await act(() => {
		engine.release();
	});
	await vi.waitFor(() => {
		expect(transportSave).toHaveBeenCalledTimes(1);
	});
	expect(inserted('page')).toBe(1);
	expect(hydrated.recoverableErrors).toEqual([]);
	await hydrated.unmount();
});

test('an accept tapped before hydration takes effect when the root mounts, before the commit chunk', async () => {
	const state = config();
	const { boot, page: streamed } = await serve(state);
	tapBanner(streamed, 'accept');
	shareTapQueue(streamed);
	const engine = heldEngine();
	commitGate.hold();
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			commit={{}}
			loadEngine={engine.loadEngine}
			prefetch={fulfilledThenable(state)}
			scripts={[counted('page')]}
		/>
	);
	await vi.waitFor(() => {
		expect(effects.at(-1)).toEqual({ chose: true, marketing: true });
	});
	expect(inserted('page')).toBe(1);
	expect(localStorage.getItem('c15t')).toBeNull();

	commitGate.release();
	await vi.waitFor(() => {
		expect(localStorage.getItem('c15t')).not.toBeNull();
	});
	await act(() => {
		engine.release();
	});
	await vi.waitFor(() => {
		expect(transportSave).toHaveBeenCalledTimes(1);
	});
	expect(inserted('page')).toBe(1);
	expect(hydrated.recoverableErrors).toEqual([]);
	await hydrated.unmount();
});

test('scripts a page registers after a tap made before hydration start from the choice, before the loader', async () => {
	const state = config();
	const { boot, page: streamed } = await serve(state);
	tapBanner(streamed, 'accept');
	shareTapQueue(streamed);
	const engine = heldEngine();
	commitGate.hold();
	const late = counted('late');
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			commit={{}}
			lateScripts={[late]}
			loadEngine={engine.loadEngine}
			prefetch={fulfilledThenable(state)}
			scripts={[]}
		/>
	);
	// Inserted by the instant commit's starter, which registers the element
	// for the loader to adopt, not by the loader's own chunk.
	await vi.waitFor(() => {
		expect(ran('late')).toBe(1);
	});
	expect(
		(window as unknown as { __c15tStarted?: Record<string, unknown> })
			.__c15tStarted?.late
	).toBeDefined();
	expect(localStorage.getItem('c15t')).toBeNull();

	commitGate.release();
	await act(() => {
		engine.release();
	});
	await vi.waitFor(() => {
		expect(transportSave).toHaveBeenCalledTimes(1);
	});
	await act(
		() =>
			new Promise<void>((resolve) => {
				setTimeout(resolve, 200);
			})
	);
	expect(inserted('late')).toBe(1);
	expect(ran('late')).toBe(1);
	expect(hydrated.recoverableErrors).toEqual([]);
	await hydrated.unmount();
});

test('a commit the chunk declines after the tap took effect is recorded by the engine once', async () => {
	const state = config();
	const { boot, page: streamed } = await serve(state);
	const onChoiceRecorded = vi.fn();
	const engine = heldEngine();
	const declined = vi.fn(
		(_input: CommitTapInput): Promise<CommitTapResult | null> =>
			Promise.resolve(null)
	);
	shareTapQueue(streamed);
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			commit={{ callbacks: { onChoiceRecorded } }}
			loadCommit={() => Promise.resolve({ commitEarlyTap: declined })}
			loadEngine={engine.loadEngine}
			prefetch={fulfilledThenable(state)}
			scripts={[]}
		/>
	);
	const main = streamed.doc.querySelector('main');

	await act(() => {
		tapBanner(streamed, 'accept');
	});
	expect(main?.dataset.marketing).toBe('true');
	await vi.waitFor(() => {
		expect(declined).toHaveBeenCalledTimes(1);
	});
	// The chunk completed an instant commit, and declined it.
	expect(declined.mock.calls[0]?.[0].instant).toBeDefined();
	await vi.waitFor(() => {
		expect(engine.loadEngine).toHaveBeenCalledTimes(1);
	});
	expect(transportSave).not.toHaveBeenCalled();
	expect(onChoiceRecorded).not.toHaveBeenCalled();

	await act(() => {
		engine.release();
	});
	await vi.waitFor(() => {
		expect(transportSave).toHaveBeenCalledTimes(1);
		expect(onChoiceRecorded).toHaveBeenCalledTimes(1);
	});
	await act(
		() =>
			new Promise<void>((resolve) => {
				setTimeout(resolve, 200);
			})
	);
	// Exactly once: not again from a second path after the engine attached.
	expect(transportSave).toHaveBeenCalledTimes(1);
	expect(onChoiceRecorded).toHaveBeenCalledTimes(1);
	expect(main?.dataset.marketing).toBe('true');
	expect(hydrated.recoverableErrors).toEqual([]);
	await hydrated.unmount();
});

test('a save the outbox cannot keep goes to the engine, which records it once', async () => {
	const state = config();
	const { boot, page: streamed } = await serve(state);
	const onChoiceRecorded = vi.fn();
	const onPermissionsChanged = vi.fn();
	const engine = heldEngine();
	/** What the commit path resolved with, per tap. */
	const commits: unknown[] = [];
	const loadCommitSeen = async () => {
		const module = await loadCommit();
		return {
			commitEarlyTap: async (
				input: Parameters<typeof module.commitEarlyTap>[0]
			) => {
				const result = await module.commitEarlyTap(input);
				commits.push(result);
				return result;
			},
		};
	};
	shareTapQueue(streamed);
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			commit={{ callbacks: { onChoiceRecorded, onPermissionsChanged } }}
			loadCommit={loadCommitSeen}
			loadEngine={engine.loadEngine}
			prefetch={fulfilledThenable(state)}
			scripts={[]}
		/>
	);
	const main = streamed.doc.querySelector('main');
	refuseOutboxWrites();

	await act(() => {
		tapBanner(streamed, 'accept');
	});
	await vi.waitFor(() => {
		expect(commits).toEqual([null]);
	});
	// The record is stored, nothing is queued, and nothing is announced:
	// the engine records the tap.
	expect(main?.dataset.marketing).toBe('true');
	expect(JSON.parse(localStorage.getItem('c15t') ?? 'null')).toMatchObject({
		categories: { marketing: { value: true } },
	});
	expect(queuedSaves()).toEqual([]);
	expect(onChoiceRecorded).not.toHaveBeenCalled();
	expect(onPermissionsChanged).not.toHaveBeenCalled();
	await vi.waitFor(() => {
		expect(engine.loadEngine).toHaveBeenCalledTimes(1);
	});

	await act(() => {
		engine.release();
	});
	// One save reaches the backend, announced once.
	await vi.waitFor(() => {
		expect(transportSave).toHaveBeenCalledTimes(1);
		expect(onChoiceRecorded).toHaveBeenCalledTimes(1);
	});
	expect(onChoiceRecorded.mock.calls[0]?.[0]).toMatchObject({
		consentAction: 'all',
	});
	await act(
		() =>
			new Promise<void>((resolve) => {
				setTimeout(resolve, 200);
			})
	);
	expect(transportSave).toHaveBeenCalledTimes(1);
	expect(onChoiceRecorded).toHaveBeenCalledTimes(1);
	// Heard from the engine alone, which ends on the recorded choice.
	expect(
		onPermissionsChanged.mock.lastCall?.[0].snapshot.effectivePermissions
	).toMatchObject({ marketing: true });
	expect(main?.dataset.marketing).toBe('true');
	expect(streamed.doc.querySelector(BANNER)).toBeNull();
	expect(hydrated.recoverableErrors).toEqual([]);
	await hydrated.unmount();
});
