import type { ConsentSnapshot } from '@inth/sdk/engine';
import type { ConsentRuntime } from '@inth/sdk/runtime';
import { onDemandRuntimeModules } from '@inth/sdk/runtime/on-demand';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import {
	EARLY_TAP_ROOT,
	EARLY_TAP_STYLE_ID,
	EARLY_TAPS_WINDOW_KEY,
} from '../../../core/src/libs/page-globals';
import { PENDING_SAVES_STORAGE_KEY } from '../../../core/src/libs/storage-keys';
import { startDeferredClient } from '../browser/shell';
import type { EngineModule } from '../browser/shell';
import {
	getConsentClient,
	getEventDispatcher,
	registerRuntimeModules,
} from '../client';
import type { AstroConsentClient } from '../client';
import { boot, EVENTS_KEY } from '../client-engine';
import type { InthClientOptionsExtension } from '../client-types';
import { resolveOptions } from '../integration';
import { hosted as hostedMode } from '../mode';
import { snapshotFromConfig } from '../server';
import { testing as testingMode } from '../testing';
import type { InthAstroOptions } from '../types';
import { registerDialogAdapter } from '../ui/adapter';
import type { ConsentDialogContext } from '../ui/adapter';
import { testResolution, testRule } from './policy-fixture';

registerRuntimeModules(onDemandRuntimeModules);

const OPTIONS: InthAstroOptions = {
	consentCategories: ['necessary', 'measurement', 'marketing'],
	mode: testingMode({ policy: [testRule] }),
};

const SCRIPT = {
	category: 'measurement' as const,
	id: 'measure',
	src: 'https://example.com/measure.js',
};

const config = () => ({
	initialPolicyResolution: testResolution(),
	initialRecords: {},
	initialTranslations: { language: 'en', translations: {} },
	now: Date.now(),
});

/** The snapshot the server would render the banner from. */
const serverSnapshot = (): ConsentSnapshot =>
	JSON.parse(
		JSON.stringify(
			snapshotFromConfig({
				...config(),
				consentCategories: OPTIONS.consentCategories,
			})
		)
	) as ConsentSnapshot;

/** Yields long enough for pending imports and microtasks to settle. */
const settle = async function settle(rounds = 10): Promise<void> {
	// oxlint-disable-next-line promise/avoid-new -- A macrotask boundary.
	await new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
	if (rounds > 1) {
		await settle(rounds - 1);
	}
};

let hero: HTMLImageElement;
let client: AstroConsentClient | null = null;

/** The storage's `setItem`, while a test refuses the outbox's writes. */
let refusedOutbox: MockInstance | undefined;

/**
 * Blocked or full storage for the outbox's key only. On the storage's
 * prototype: `setup-dom.ts` installs its own `localStorage`.
 */
const refuseOutboxWrites = (): void => {
	const prototype = Object.getPrototypeOf(localStorage) as Storage;
	const { setItem } = prototype;
	refusedOutbox = vi
		.spyOn(prototype, 'setItem')
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

/** An engine import held until the test releases it. */
const heldEngine = () => {
	let release: () => void = () => undefined;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	const loadEngine = vi.fn(async () => {
		await held;
		return { boot } satisfies EngineModule;
	});
	return { loadEngine, release };
};

/** A server-rendered page: config, boot block, banner and a loading hero. */
const renderPage = function renderPage(defer = true): void {
	(window as unknown as Record<string, unknown>).__inthAstroConfig = config();
	document.body.innerHTML = `
		<script type="application/json" data-inth-boot>${JSON.stringify({
			d: defer,
			s: serverSnapshot(),
		})}</script>
		<img fetchpriority="high" src="/hero.png" alt="">
		<div data-testid="consent-banner-root">
			<button data-action="reject" data-inth-action="reject" type="button">Reject</button>
			<button data-action="customize" data-inth-action="customize" type="button">Customize</button>
			<button data-action="accept" data-inth-action="accept" type="button">Accept</button>
		</div>
		<p id="outside">Article</p>
	`;
	hero = document.querySelector('img') as HTMLImageElement;
	Object.defineProperty(hero, 'complete', { configurable: true, value: false });
};

const engineLoader = () =>
	vi.fn(() => Promise.resolve({ boot } satisfies EngineModule));

const startShell = function startShell(
	loadEngine = engineLoader(),
	extension: InthClientOptionsExtension = {},
	options: InthAstroOptions = OPTIONS
) {
	const started = startDeferredClient(
		resolveOptions(options),
		loadEngine,
		extension
	);
	client = started;
	return { client: started as AstroConsentClient, loadEngine };
};

const click = function click(action: string): void {
	(
		document.querySelector(`[data-inth-action="${action}"]`) as HTMLElement
	).click();
};

beforeEach(() => {
	localStorage.clear();
	document.head.innerHTML = '';
	document.body.innerHTML = '';
	const globals = window as unknown as Record<string, unknown>;
	globals.__inthAstro = undefined;
	globals.__inthAstroConfig = undefined;
	globals.__inthStarted = undefined;
	globals[EARLY_TAPS_WINDOW_KEY] = undefined;
	// The delegated listener stays installed across tests: it reads the
	// page's client at each click.
	vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
	refusedOutbox?.mockRestore();
	refusedOutbox = undefined;
	getConsentClient()?.dispose();
	client?.dispose();
	client = null;
	for (const cookie of document.cookie.split(';')) {
		const name = cookie.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; max-age=0; path=/`;
		}
	}
	vi.restoreAllMocks();
});

describe('the first-load shell', () => {
	it('answers from the server snapshot and waits for the hero before the engine', async () => {
		renderPage();
		const { client: shell, loadEngine } = startShell();

		expect(getConsentClient()).toBe(shell);
		expect(shell.getConsent().activeUI).toBe('banner');
		expect(shell.runtime).toBeUndefined();
		await settle();
		expect(loadEngine).not.toHaveBeenCalled();

		hero.dispatchEvent(new Event('load'));
		await shell.ready;
		expect(loadEngine).toHaveBeenCalledOnce();
		expect(shell.runtime).toBeDefined();
		// The engine's client takes the page's place; the shell forwards.
		expect(getConsentClient()).not.toBe(shell);
		expect(shell.getConsent().activeUI).toBe('banner');
	});

	it('loads the engine at the first input outside the banner, not inside it', async () => {
		renderPage();
		const { client: shell, loadEngine } = startShell();

		document
			.querySelector('[data-inth-action="reject"]')
			?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		await settle();
		expect(loadEngine).not.toHaveBeenCalled();

		document
			.getElementById('outside')
			?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		await shell.ready;
		expect(loadEngine).toHaveBeenCalledOnce();
	});

	it('commits an accept in the tap task, then hands the record to the engine', async () => {
		renderPage();
		const onChoiceRecorded = vi.fn();
		const { client: shell, loadEngine } = startShell(engineLoader(), {
			callbacks: { onChoiceRecorded },
			scripts: [SCRIPT],
		});
		const heard: ConsentSnapshot[] = [];
		shell.subscribe((snapshot) => heard.push(snapshot));

		click('accept');

		// All of this before any chunk loaded.
		const banner = document.querySelector(EARLY_TAP_ROOT) as HTMLElement;
		expect(banner.hidden).toBe(true);
		expect(shell.getConsent().effectivePermissions.measurement).toBe(true);
		expect(shell.getConsent().activeUI).toBe('none');
		expect(heard).toHaveLength(1);
		expect(
			document.head.querySelectorAll(`script[src="${SCRIPT.src}"]`)
		).toHaveLength(1);
		expect(loadEngine).not.toHaveBeenCalled();

		await shell.ready;
		await settle();
		expect(loadEngine).toHaveBeenCalledOnce();
		expect(document.cookie).toMatch(/(?:^|; )inth=/u);
		const engine = getConsentClient() as AstroConsentClient;
		expect(engine).not.toBe(shell);
		expect(engine.getConsent().activeUI).toBe('none');
		expect(
			engine.getConsent().explicitChoice?.categories.measurement?.value
		).toBe(true);
		// Recorded once, by the shell; the engine starts from the record.
		expect(onChoiceRecorded).toHaveBeenCalledOnce();
		// The loader adopted the script the shell started.
		expect(
			document.querySelectorAll(`script[src="${SCRIPT.src}"]`)
		).toHaveLength(1);
		expect(banner.hidden).toBe(true);
	});

	it('commits a reject without starting gated scripts', async () => {
		renderPage();
		const { client: shell } = startShell(engineLoader(), {
			scripts: [SCRIPT],
		});
		click('reject');
		expect(shell.getConsent().effectivePermissions.measurement).toBe(false);
		expect(
			document.querySelectorAll(`script[src="${SCRIPT.src}"]`)
		).toHaveLength(0);
		await shell.ready;
		await settle();
		expect(getConsentClient()?.getConsent().explicitChoice).not.toBeNull();
	});

	it('replays a tap the early-tap script held before the shell ran', async () => {
		renderPage();
		const stop = vi.fn();
		(window as unknown as Record<string, unknown>)[EARLY_TAPS_WINDOW_KEY] = {
			stop,
			taps: [
				{ action: 'customize', at: Date.now() - 20 },
				{ action: 'reject', at: Date.now() - 10 },
			],
		};
		const style = document.createElement('style');
		style.id = EARLY_TAP_STYLE_ID;
		document.head.append(style);

		const { client: shell } = startShell();
		expect(stop).toHaveBeenCalledOnce();
		expect(shell.getConsent().explicitChoice).not.toBeNull();
		expect(shell.getConsent().effectivePermissions.marketing).toBe(false);
		await shell.ready;
		await settle();
		expect(document.getElementById(EARLY_TAP_STYLE_ID)).toBeNull();
	});

	it('a save the outbox cannot keep goes to the engine, which records it once', async () => {
		renderPage();
		const onChoiceRecorded = vi.fn();
		const onPermissionsChanged = vi.fn();
		const network = vi
			.spyOn(globalThis, 'fetch')
			.mockImplementation((_input, request) =>
				Promise.resolve(
					Response.json(
						request?.method === 'POST'
							? {
									recordId: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
									subjectId: JSON.parse(String(request.body)).subjectId,
								}
							: {}
					)
				)
			);
		/** Saves the backend received. */
		const saves = () =>
			network.mock.calls.filter(
				([input, request]) =>
					String(input).split('?')[0]?.endsWith('/v1/consent/records') &&
					request?.method === 'POST'
			);
		const engine = heldEngine();
		const { client: shell } = startShell(
			engine.loadEngine,
			{ callbacks: { onChoiceRecorded, onPermissionsChanged } },
			{
				...OPTIONS,
				mode: hostedMode(),
				projectUrl: 'https://consent.example',
			}
		);
		refuseOutboxWrites();

		click('accept');
		expect(shell.getConsent().effectivePermissions.measurement).toBe(true);
		// The commit chunk stores the record, then asks for the engine.
		await vi.waitFor(() => {
			expect(engine.loadEngine).toHaveBeenCalledOnce();
		});
		await settle();
		// The record is stored, nothing is queued, and nothing is announced:
		// the engine records the tap.
		expect(JSON.parse(localStorage.getItem('inth') ?? 'null')).toMatchObject({
			categories: { measurement: { value: true } },
		});
		expect(localStorage.getItem(PENDING_SAVES_STORAGE_KEY)).toBeNull();
		expect(onChoiceRecorded).not.toHaveBeenCalled();
		expect(onPermissionsChanged).not.toHaveBeenCalled();
		expect(saves()).toHaveLength(0);

		engine.release();
		await shell.ready;
		// One save reaches the backend, announced once.
		await vi.waitFor(() => {
			expect(saves()).toHaveLength(1);
			expect(onChoiceRecorded).toHaveBeenCalledOnce();
		});
		expect(onChoiceRecorded.mock.calls[0]?.[0]).toMatchObject({
			consentAction: 'all',
		});
		expect(
			getConsentClient()?.getConsent().explicitChoice?.categories.measurement
				?.value
		).toBe(true);
		await settle();
		expect(saves()).toHaveLength(1);
		expect(onChoiceRecorded).toHaveBeenCalledOnce();
	});

	it('leaves the choice to the engine when a clear epoch is stored', async () => {
		renderPage();
		localStorage.setItem('inth-epoch', String(Date.now() - 1000));
		const { client: shell, loadEngine } = startShell();
		const accepted = shell.acceptAll();
		// Nothing committed in the tap's task; the engine records it.
		expect(shell.getConsent().explicitChoice).toBeNull();
		await accepted;
		expect(loadEngine).toHaveBeenCalledOnce();
		expect(
			getConsentClient()?.getConsent().effectivePermissions.measurement
		).toBe(true);
	});

	it.each([
		['the server', false, {}],
		['a consent source', true, { consentSource: {} }],
		[
			'a script that may run now',
			true,
			{ scripts: [{ ...SCRIPT, alwaysLoad: true }] },
		],
	] as const)(
		'loads the engine at once when %s needs it',
		async (_label, serverDefers, extension) => {
			renderPage(serverDefers);
			const { client: shell, loadEngine } = startShell(
				engineLoader(),
				extension as InthClientOptionsExtension
			);
			await shell.ready;
			expect(loadEngine).toHaveBeenCalledOnce();
		}
	);

	it('records nothing without the engine when the server ruled it out', async () => {
		renderPage(false);
		const { client: shell, loadEngine } = startShell();
		const accepted = shell.acceptAll();
		expect(shell.getConsent().explicitChoice).toBeNull();
		expect((document.querySelector(EARLY_TAP_ROOT) as HTMLElement).hidden).toBe(
			false
		);
		await accepted;
		expect(loadEngine).toHaveBeenCalledOnce();
		expect(getConsentClient()?.getConsent().explicitChoice).not.toBeNull();
	});

	it('boots the engine straight away on a page without boot data', async () => {
		(window as unknown as Record<string, unknown>).__inthAstroConfig = config();
		const loadEngine = engineLoader();
		expect(startDeferredClient(resolveOptions(OPTIONS), loadEngine)).toBeNull();
		await settle();
		expect(loadEngine).toHaveBeenCalledOnce();
		expect(getConsentClient()?.runtime).toBeDefined();
	});

	it('starts the engine and the dialog together on Customize', async () => {
		renderPage();
		const mount = vi.fn(() =>
			Promise.resolve({ close: vi.fn(), destroy: vi.fn() })
		);
		const loadAdapter = vi.fn(() =>
			Promise.resolve({ mount, name: 'svelte' as const })
		);
		registerDialogAdapter('svelte', loadAdapter);
		const { client: shell, loadEngine } = startShell();

		const opened = shell.openDialog();
		// Both downloads start before either resolves.
		expect(loadEngine).toHaveBeenCalledOnce();
		expect(loadAdapter).toHaveBeenCalledOnce();
		await opened;
		expect(mount).toHaveBeenCalledOnce();
		expect(shell.getConsent().activeUI).toBe('dialog');
	});

	describe('a Customize tap before the engine', () => {
		/** A dialog island that renders a root while the kernel shows it. */
		const registerIsland = function registerIsland() {
			const runtimes: ConsentRuntime[] = [];
			const close = vi.fn();
			const destroy = vi.fn();
			const mount = vi.fn((context: ConsentDialogContext) => {
				runtimes.push(context.runtime);
				const root = document.createElement('div');
				root.setAttribute('data-testid', 'consent-dialog-root');
				const render = (snapshot: ConsentSnapshot) => {
					root.hidden = snapshot.activeUI !== 'dialog';
				};
				render(context.runtime.kernel.getSnapshot());
				context.runtime.kernel.subscribe(render);
				context.target.append(root);
				return Promise.resolve({ close, destroy });
			});
			registerDialogAdapter('svelte', () =>
				Promise.resolve({ mount, name: 'svelte' as const })
			);
			return { close, destroy, mount, runtimes };
		};

		/** The banner page, with the first-paint rules the server inlines. */
		const renderBannerPage = function renderBannerPage(): void {
			renderPage();
			const style = document.createElement('style');
			style.setAttribute('data-inth-styles', 'inth-first-paint');
			document.head.append(style);
		};

		it('opens the dialog on a stand-in and loads the engine once it shows', async () => {
			renderBannerPage();
			const island = registerIsland();
			const { client: shell, loadEngine } = startShell();
			const banner = document.querySelector(EARLY_TAP_ROOT) as HTMLElement;

			await shell.openDialog();

			expect(island.mount).toHaveBeenCalledOnce();
			expect(shell.getConsent().activeUI).toBe('dialog');
			expect(banner.hidden).toBe(true);
			const root = document.querySelector(
				'[data-testid="consent-dialog-root"]'
			) as HTMLElement;
			expect(root.hidden).toBe(false);
			// The dialog downloads alone; the engine follows once it shows.
			expect(loadEngine).not.toHaveBeenCalled();

			await vi.waitFor(() => {
				expect(loadEngine).toHaveBeenCalledOnce();
			});
			await shell.ready;
			const engine = getConsentClient() as AstroConsentClient;
			expect(engine).not.toBe(shell);
			// The engine took the open dialog over rather than mounting another.
			expect(engine.getConsent().activeUI).toBe('dialog');
			expect(island.runtimes[0]?.kernel.getSnapshot().activeUI).toBe('dialog');
			await engine.openDialog();
			expect(island.mount).toHaveBeenCalledOnce();

			engine.closeDialog();
			expect(island.close).toHaveBeenCalledOnce();
			expect(root.hidden).toBe(true);
			expect(banner.hidden).toBe(false);
		});

		it('closes back to the banner without the engine', async () => {
			renderBannerPage();
			registerIsland();
			const { client: shell, loadEngine } = startShell();
			await shell.openDialog();

			shell.closeDialog();

			expect(shell.getConsent().activeUI).toBe('banner');
			expect(
				(document.querySelector(EARLY_TAP_ROOT) as HTMLElement).hidden
			).toBe(false);
			expect(loadEngine).not.toHaveBeenCalled();
		});

		it('saves from the dialog on the engine', async () => {
			renderBannerPage();
			const island = registerIsland();
			const { client: shell } = startShell();
			await shell.openDialog();

			await island.runtimes[0]?.kernel.commands.save('all');

			const engine = getConsentClient() as AstroConsentClient;
			expect(engine).not.toBe(shell);
			expect(engine.getConsent().effectivePermissions.measurement).toBe(true);
			expect(island.runtimes[0]?.kernel.getSnapshot().activeUI).toBe('none');
		});

		it('starts the engine with the dialog when another island renders it', async () => {
			renderBannerPage();
			const island = registerIsland();
			const { client: shell, loadEngine } = startShell(
				engineLoader(),
				{},
				{ ...OPTIONS, ui: 'react' }
			);
			registerDialogAdapter('react', () =>
				Promise.resolve({ mount: island.mount, name: 'react' as const })
			);

			const opened = shell.openDialog();
			expect(loadEngine).toHaveBeenCalledOnce();
			await opened;
			expect(island.runtimes[0]).toBe(getConsentClient()?.runtime);
		});
	});

	it('sends events made before the engine once it has loaded', async () => {
		renderPage();
		const track = vi.fn();
		const loadEngine = vi.fn(() =>
			Promise.resolve({
				boot: (...args: Parameters<EngineModule['boot']>) => {
					const engine = boot(...args);
					Object.defineProperty(engine, EVENTS_KEY, {
						value: () => ({ pageview: vi.fn(), track }),
					});
					return engine;
				},
			} satisfies EngineModule)
		);
		const { client: shell } = startShell(loadEngine);
		expect(Symbol.for('inth.astro.events')).toBe(EVENTS_KEY);

		getEventDispatcher().track('signup', { plan: 'pro' });
		await settle();
		expect(track).not.toHaveBeenCalled();

		hero.dispatchEvent(new Event('load'));
		await shell.ready;
		await settle();
		expect(track).toHaveBeenCalledWith('signup', { plan: 'pro' });
	});

	it('disposes without loading the engine', async () => {
		renderPage();
		const { client: shell, loadEngine } = startShell();
		shell.dispose();
		client = null;
		expect(getConsentClient()).toBeNull();
		hero.dispatchEvent(new Event('load'));
		await settle();
		expect(loadEngine).not.toHaveBeenCalled();
	});
});
