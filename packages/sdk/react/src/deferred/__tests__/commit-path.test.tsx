/**
 * A choice before a deferred root's engine has loaded: a page's accept or
 * reject through the stand-in's commands is committed in its own task
 * (`instant.ts`), completed by the commit path (`commit.ts`) without the
 * engine, which loads afterwards and takes over without saving again. The
 * stock banner leaves its own taps to the engine, which replays them. Each test
 * streams a real server render into an iframe and hydrates it. React runs
 * in this window, so the tests hand it the iframe's early-tap queue.
 */
import type { KernelConfig } from '@inth/sdk/engine';
import {
	Suspense,
	act,
	useEffect,
	useState,
	useSyncExternalStore,
} from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import {
	EARLY_TAP_STYLE_ID,
	EARLY_TAPS_WINDOW_KEY,
} from '../../../../core/src/libs/page-globals';
import { PENDING_SAVES_STORAGE_KEY } from '../../../../core/src/libs/storage-keys';
import { transportMode } from '../../__tests__/fixtures/transport-mode';
import { policyFixture } from '../../__tests__/policy-fixture';
import {
	BANNER,
	deferred,
	fulfilledThenable,
	streamPage,
} from '../../__tests__/streamed-ssr-harness';
import type { StreamedPage } from '../../__tests__/streamed-ssr-harness';
import { useSaveConsents, useSnapshot } from '../../hooks';
import { InthProvider } from '../../index';
import { useScriptLoader } from '../../module-hooks/script-loader';
import type { Script } from '../../module-hooks/script-loader';
import { readConsentBoot } from '../boot';
import type { ConsentBoot } from '../boot';
import { ConsentBootData, ServerBootData } from '../boot-data';
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
	initialBranding: 'inth',
	initialLocation: { countryCode: 'DE', regionCode: null },
	initialOverrides: { country: 'DE', language: 'en' },
	...policyFixture({}, { categories: ['marketing'], id: 'gdpr' }),
});

const consentCategories = ['necessary', 'marketing'] as const;
const transportInit = vi.fn(() => Promise.resolve({}));
const transportSave = vi.fn(() => Promise.resolve({ ok: true as const }));
const mode = transportMode({ init: transportInit, save: transportSave });

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
			<InthProvider options={providerOptions(prefetch)}>
				<Probe scripts={[]} />
				<DeferredConsentBanner />
				<DeferredConsentDialog />
				<Suspense fallback={null}>
					<ServerBootData />
				</Suspense>
			</InthProvider>
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

beforeEach(() => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	transportInit.mockClear();
	transportSave.mockClear();
	effects.length = 0;
	localStorage.clear();
	Reflect.deleteProperty(window, '__ran');
	Reflect.deleteProperty(window, '__inthStarted');
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
	expect(localStorage.getItem('inth')).toBeNull();
	expect(queuedSaves()).toHaveLength(0);
	expect(engine.loadEngine).toHaveBeenCalled();
	await act(() => {
		engine.release();
	});
	await hydrated.unmount();
});

test('an instant accept that neither the commit chunk nor the engine can record asks again', async () => {
	const state = config();
	const { boot, page: streamed } = await serve(state);
	const unhandled = vi.fn();
	window.addEventListener('unhandledrejection', unhandled);
	const failure = new TypeError('Failed to fetch chunk');
	// Fails once, then never settles: the page stays on the stand-in.
	const loadEngine = vi
		.fn<() => Promise<never>>()
		.mockRejectedValueOnce(failure)
		.mockImplementation(
			() =>
				new Promise<never>(() => {
					// Never settles.
				})
		);
	shareTapQueue(streamed);
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			commit={{}}
			loadCommit={() => Promise.reject(failure)}
			loadEngine={loadEngine}
			prefetch={fulfilledThenable(state)}
			scripts={[]}
		/>
	);
	const main = streamed.doc.querySelector('main');

	await act(() => {
		tapBanner(streamed, 'accept');
	});
	await vi.waitFor(() => {
		expect(loadEngine).toHaveBeenCalled();
		expect(main?.dataset.marketing).not.toBe('true');
		expect(streamed.doc.querySelector(BANNER)).not.toBeNull();
	});
	expect(localStorage.getItem('inth')).toBeNull();
	expect(unhandled).not.toHaveBeenCalled();
	window.removeEventListener('unhandledrejection', unhandled);
	await hydrated.unmount();
});
