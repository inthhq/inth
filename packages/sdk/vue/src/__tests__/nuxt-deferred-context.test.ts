/**
 * The Nuxt plugin's deferred context (`runtime/deferred/shell.ts`): the
 * browser starts from the server's snapshot, records a dialog save in its
 * own task without the consent engine, and the engine adopts that record
 * when it loads. A banner tap before the engine loads the engine, and the
 * banner replays it once it hydrates.
 */
import type { ConsentSnapshot, KernelEvent, Script } from '@inth/sdk/engine';
import { createScriptLoader } from '@inth/sdk/modules/script-loader';
import type { InitOutput } from '@inth/sdk/schema/types';
import {
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@inth/sdk/schema/types';
import { EARLY_CONSENT_TAP_SCRIPT } from '@inth/sdk/surface-actions';
import type { CompleteCommitInput } from '@inth/sdk/surface-actions/early-commit';
import { completeCommit } from '@inth/sdk/surface-actions/early-commit';
import { translations } from '@inth/sdk/translations/en';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';

import { PENDING_SAVES_STORAGE_KEY } from '../../../core/src/libs/storage-keys';
import { useEventDispatcher } from '../runtime/composables/event-dispatcher';
import type { EventDispatcher } from '../runtime/composables/event-dispatcher';
import { useConsentLanguage } from '../runtime/composables/language';
import { useScriptLoader } from '../runtime/composables/script-loader';
import { createDeferredContext } from '../runtime/deferred/shell';
import type { DeferredEngineFactory } from '../runtime/deferred/shell';
import type {
	RuntimeConsentConfig,
	VueConsentKernelContext,
} from '../runtime/kernel';
import {
	symbolKernel,
	symbolKernelContext,
	symbolSnapshot,
} from '../runtime/utils/symbols';
import { createVueConsentKernelContext } from './test-kernel';

const init: InitOutput = {
	branding: 'inth',
	location: { countryCode: 'GB', regionCode: null },
	policyResolution: writePolicyResolutionWire(
		resolvePolicyRules({
			countryCode: null,
			regionCode: null,
			rules: [
				{
					categories: ['measurement', 'marketing'],
					id: 'nuxt_deferred',
					match: { fallback: true },
					model: 'opt-in',
					prompt: 'choice',
					scopeMode: 'permissive',
				},
			],
		})
	),
	policySnapshotToken: 'nuxt_deferred_token',
	translations: { language: 'en', translations },
};

const config: Pick<RuntimeConsentConfig, 'projectUrl' | 'consentCategories'> = {
	consentCategories: ['necessary', 'measurement', 'marketing'],
	projectUrl: 'https://consent.example',
};

/** A backend that records every save. */
const createBackend = () => {
	const saves: unknown[] = [];
	const fetch = vi.fn((input: RequestInfo | URL, request?: RequestInit) => {
		if (String(input).split('?')[0]?.endsWith('/v1/consent/records')) {
			const save = JSON.parse(String(request?.body ?? 'null')) as {
				subjectId: string;
			};
			saves.push(save);
			return Promise.resolve(
				Response.json({
					recordId: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
					subjectId: save.subjectId,
				})
			);
		}
		return Promise.resolve(Response.json({}));
	});
	return { fetch: fetch as unknown as typeof globalThis.fetch, saves };
};

/** The snapshot the server renders from: a fresh visitor under the policy. */
const serverSnapshot = (): ConsentSnapshot => {
	const server = createVueConsentKernelContext({
		config: { ...config, customFetch: createBackend().fetch },
		prefetch: init,
	});
	const snapshot = server.kernel.getSnapshot();
	server.dispose();
	return snapshot;
};

/** The stock banner's markup, as the server renders it, and its script. */
const renderBanner = (): void => {
	document.body.innerHTML = `
		<div data-testid="consent-banner-root" data-model="opt-in" data-prompt="choice">
			<button data-action="accept" data-testid="consent-banner-accept-button">Accept all</button>
			<button data-action="reject" data-testid="consent-banner-reject-button">Reject all</button>
			<button data-action="customize" data-testid="consent-banner-customize-button">Customize</button>
		</div>`;
	// The server writes it into the HTML, where it runs before any bundle.
	// oxlint-disable-next-line no-new-func -- Runs the inline script's text as the page would.
	new Function(EARLY_CONSENT_TAP_SCRIPT)();
};

const tap = (action: string): void => {
	document
		.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)
		?.click();
};

/**
 * Accept all from the stock dialog before the engine, as its save button
 * does: a save on the provided kernel.
 */
const acceptInDialog = (context: VueConsentKernelContext): void => {
	void context.kernel.commands.save('all', { uiSource: 'dialog' });
};

/** Waits for the tasks after a tap: the commit chunk runs one task later. */
const settle = async (): Promise<void> => {
	for (let index = 0; index < 5; index += 1) {
		// oxlint-disable-next-line no-await-in-loop -- Each wait is one task after the last.
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
	}
};

interface Harness {
	context: VueConsentKernelContext;
	backend: ReturnType<typeof createBackend>;
	loadEngine: ReturnType<typeof vi.fn>;
	releaseEngine: () => void;
	engine: () => VueConsentKernelContext | undefined;
	/** The engine runtime's `setLanguage`, spied as soon as it exists. */
	setLanguage: () => ReturnType<typeof vi.spyOn> | undefined;
	completeCommit: ReturnType<typeof vi.fn>;
}

const contexts: VueConsentKernelContext[] = [];

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

/**
 * A deferred context whose engine is held until `releaseEngine`, and whose
 * schedule only routes taps: the engine loads when the context asks.
 */
const createHarness = (
	extra: Pick<RuntimeConsentConfig, 'callbacks' | 'scripts'> = {}
): Harness => {
	const backend = createBackend();
	let release: () => void = () => undefined;
	const released = new Promise<void>((resolve) => {
		release = resolve;
	});
	let engine: VueConsentKernelContext | undefined;
	let setLanguage: ReturnType<typeof vi.spyOn> | undefined;
	const factory: DeferredEngineFactory = (committed) => {
		engine = createVueConsentKernelContext({
			config: { ...config, ...extra, customFetch: backend.fetch },
			initialRecords: committed ? { ...committed.records } : undefined,
			now: committed ? Date.now() : undefined,
			prefetch: init,
		});
		const { runtime } = engine;
		if (!runtime) {
			throw new Error('the engine context has no runtime');
		}
		setLanguage = vi.spyOn(runtime, 'setLanguage');
		contexts.push(engine);
		return engine;
	};
	const loadEngine = vi.fn(async () => {
		await released;
		return factory;
	});
	const complete = vi.fn((input: CompleteCommitInput) => completeCommit(input));
	const context = createDeferredContext({
		completeCommit: complete,
		config: () => ({ ...config, ...extra }),
		loadEngine,
		// Routes taps only: nothing else wakes the engine in these tests.
		schedule: (_requestEngine, route) => {
			const queue = (window as unknown as Record<string, { n?: () => void }>)
				.__inthEarlyTaps;
			if (queue) {
				queue.n = route;
			}
			route();
			return () => undefined;
		},
		snapshot: serverSnapshot(),
	});
	contexts.push(context);
	return {
		backend,
		completeCommit: complete,
		context,
		engine: () => engine,
		loadEngine,
		releaseEngine: release,
		setLanguage: () => setLanguage,
	};
};

afterEach(() => {
	refusedOutbox?.mockRestore();
	refusedOutbox = undefined;
	for (const context of contexts.splice(0)) {
		context.dispose();
	}
	localStorage.clear();
	for (const cookie of document.cookie.split(';')) {
		const name = cookie.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	}
	Reflect.deleteProperty(window, '__inthEarlyTaps');
	Reflect.deleteProperty(window, '__inthStarted');
	document.head.innerHTML = '';
	document.body.innerHTML = '';
});

test('the context reads the server snapshot without loading the engine', () => {
	const { context, loadEngine } = createHarness();
	expect(context.snapshot.value.activeUI).toBe('banner');
	expect(context.snapshot.value.explicitChoice).toBeNull();
	expect(context.activeUI.value).toBe('banner');
	expect(context.init.value?.translations.language).toBe('en');
	expect(context.storedConsent.value).toBeNull();
	// A module registering what it gates waits for the engine.
	context.kernel.set.registerConsentCategories(['measurement']);
	context.start();
	expect(loadEngine).not.toHaveBeenCalled();
});

test('an accept saved from the dialog before the engine commits in its own task', async () => {
	const harness = createHarness();
	const { context } = harness;
	context.start();
	// The page's own loader, subscribed to the provided kernel.
	const loader = createScriptLoader({
		kernel: context.kernel,
		scripts: [
			{ category: 'measurement', id: 'page-measurement', src: '/m.js' },
			{ category: 'marketing', id: 'page-marketing', src: '/k.js' },
		],
	});
	expect(document.querySelector('script[src="/m.js"]')).toBeNull();

	acceptInDialog(context);

	// Same task: the refs carry the choice and the scripts are in.
	expect(context.snapshot.value.explicitChoice).not.toBeNull();
	expect(context.snapshot.value.effectivePermissions).toMatchObject({
		marketing: true,
		measurement: true,
	});
	expect(context.storedConsent.value).not.toBeNull();
	expect(document.querySelector('script[src="/m.js"]')).not.toBeNull();
	expect(document.querySelector('script[src="/k.js"]')).not.toBeNull();
	expect(harness.completeCommit).not.toHaveBeenCalled();
	expect(harness.loadEngine).not.toHaveBeenCalled();

	await settle();
	expect(harness.completeCommit).toHaveBeenCalledOnce();
	expect(localStorage.getItem('inth')).not.toBeNull();
	// The engine is asked for once the record is stored.
	expect(harness.loadEngine).toHaveBeenCalledOnce();
	expect(harness.backend.saves).toEqual([]);
	loader.dispose();
});

test('a banner tap waits for the banner’s own handlers, and loads the engine', async () => {
	renderBanner();
	const harness = createHarness();
	const { context } = harness;
	context.start();

	tap('accept');

	// Nothing commits: the hydrated banner replays it through its own plan.
	expect(context.snapshot.value.explicitChoice).toBeNull();
	expect(document.getElementById('inth-early-commit')).toBeNull();
	expect(harness.loadEngine).toHaveBeenCalledOnce();
	await settle();
	expect(harness.completeCommit).not.toHaveBeenCalled();
	expect(context.snapshot.value.explicitChoice).toBeNull();
	// The tap stays queued for the banner, which stops the script.
	const queue = (
		window as unknown as Record<
			string,
			{ taps?: unknown[]; stop?: () => void } | undefined
		>
	).__inthEarlyTaps;
	expect(queue?.taps).toHaveLength(1);
	queue?.stop?.();
});

test('the engine adopts the committed record and sends the queued save once', async () => {
	const harness = createHarness();
	const { context } = harness;
	context.start();
	const heard: KernelEvent[] = [];
	acceptInDialog(context);
	const committed = context.snapshot.value.explicitChoice;
	await settle();
	harness.releaseEngine();
	await vi.waitFor(() => expect(harness.engine()).toBeDefined());
	const engine = harness.engine() as VueConsentKernelContext;
	engine.kernel.events.on('choice:recorded', (event) => heard.push(event));
	await vi.waitFor(() =>
		expect(harness.backend.saves.length).toBeGreaterThan(0)
	);
	await settle();

	// Reads now come from the engine, which starts from the record.
	expect(context.kernel.getSnapshot()).toBe(engine.kernel.getSnapshot());
	expect(engine.kernel.getSnapshot().explicitChoice?.categories).toEqual(
		committed?.categories
	);
	expect(context.snapshot.value.activeUI).toBe('none');
	expect(context.runtime).toBe(engine.runtime);
	// One save, the queued one; nothing recorded again.
	expect(harness.backend.saves).toHaveLength(1);
	expect(heard).toEqual([]);
});

test('a save the outbox cannot keep goes to the engine, which records it once', async () => {
	const onChoiceRecorded = vi.fn();
	const onPermissionsChanged = vi.fn();
	const harness = createHarness({
		callbacks: { onChoiceRecorded, onPermissionsChanged },
	});
	const { context } = harness;
	context.start();
	refuseOutboxWrites();

	acceptInDialog(context);
	// Same task: the refs carry the choice.
	expect(context.snapshot.value.effectivePermissions.marketing).toBe(true);
	await settle();
	expect(harness.completeCommit).toHaveBeenCalledOnce();
	await expect(harness.completeCommit.mock.results[0]?.value).resolves.toBe(
		null
	);
	// The record is stored, nothing is queued, and nothing is announced:
	// the engine records the save.
	expect(JSON.parse(localStorage.getItem('inth') ?? 'null')).toMatchObject({
		categories: { marketing: { value: true } },
	});
	expect(localStorage.getItem(PENDING_SAVES_STORAGE_KEY)).toBeNull();
	expect(onChoiceRecorded).not.toHaveBeenCalled();
	expect(onPermissionsChanged).not.toHaveBeenCalled();
	expect(harness.backend.saves).toEqual([]);
	expect(harness.loadEngine).toHaveBeenCalledOnce();

	harness.releaseEngine();
	// One save reaches the backend, announced once.
	await vi.waitFor(() => {
		expect(harness.backend.saves).toHaveLength(1);
		expect(onChoiceRecorded).toHaveBeenCalledTimes(1);
	});
	await settle();
	expect(harness.backend.saves).toHaveLength(1);
	expect(onChoiceRecorded).toHaveBeenCalledTimes(1);
	expect(onChoiceRecorded.mock.calls[0]?.[0]).toMatchObject({
		consentAction: 'all',
	});
	expect(
		context.kernel.getSnapshot().explicitChoice?.categories.marketing?.value
	).toBe(true);
});

test('a tap recorded before the context started loads the engine when it starts', async () => {
	renderBanner();
	tap('reject');
	const harness = createHarness();
	const { context } = harness;
	expect(harness.loadEngine).not.toHaveBeenCalled();
	context.start();
	expect(harness.loadEngine).toHaveBeenCalledOnce();
	await settle();
	// Nothing commits before the engine: the banner replays the tap.
	expect(context.snapshot.value.explicitChoice).toBeNull();
	expect(harness.completeCommit).not.toHaveBeenCalled();
	const queue = (
		window as unknown as Record<
			string,
			{ taps?: unknown[]; stop?: () => void } | undefined
		>
	).__inthEarlyTaps;
	expect(queue?.taps).toHaveLength(1);
	queue?.stop?.();
});

test('the dialog opens from the stand-in, and its save commits at once', async () => {
	const harness = createHarness();
	const { context } = harness;
	context.start();
	context.activeUI.value = 'manager';
	expect(context.activeUI.value).toBe('manager');
	expect(harness.loadEngine).not.toHaveBeenCalled();

	// The stock dialog saves through the provided kernel.
	const saved = context.kernel.commands.save(
		{ marketing: false, measurement: true },
		{ uiSource: 'dialog' }
	);
	expect(context.snapshot.value.effectivePermissions).toMatchObject({
		marketing: false,
		measurement: true,
	});
	expect(context.activeUI.value).toBeNull();
	await expect(saved).resolves.toMatchObject({ ok: true });
	expect(localStorage.getItem('inth')).not.toBeNull();
});

test('a language set before the engine loads is applied once it attaches', async () => {
	const harness = createHarness();
	const { context } = harness;
	context.start();
	let language!: ReturnType<typeof useConsentLanguage>;
	const wrapper = mount(
		defineComponent({
			setup() {
				language = useConsentLanguage();
				return () => h('p', language.value ?? '');
			},
		}),
		{
			global: {
				provide: {
					[symbolKernelContext as symbol]: context,
					[symbolKernel as symbol]: context.kernel,
					[symbolSnapshot as symbol]: context.snapshot,
				},
			},
		}
	);
	expect(harness.loadEngine).not.toHaveBeenCalled();

	// The runtime is not there yet: the change waits instead of throwing.
	expect(() => {
		language.value = 'de';
	}).not.toThrow();
	await settle();
	expect(harness.loadEngine).toHaveBeenCalledOnce();

	harness.releaseEngine();
	await vi.waitFor(() => expect(harness.engine()).toBeDefined());
	await settle();

	expect(harness.setLanguage()).toHaveBeenCalledExactlyOnceWith('de');
	expect(context.snapshot.value.overrides.language).toBe('de');
	expect(language.value).toBe('de');
	wrapper.unmount();
});

test('an event tracked before the engine loads is delivered once it attaches', async () => {
	const capture = vi.fn();
	const posthog: Script = {
		callbackOnly: true,
		category: 'measurement',
		id: 'posthog',
		vendor: 'posthog',
	};
	const harness = createHarness({ scripts: [posthog] });
	const { context } = harness;
	context.start();
	let events!: EventDispatcher;
	const wrapper = mount(
		defineComponent({
			setup() {
				events = useEventDispatcher(() => ({
					globals: { posthog: { capture } },
				}));
				return () => h('div');
			},
		}),
		{
			global: {
				provide: {
					[symbolKernelContext as symbol]: context,
					[symbolKernel as symbol]: context.kernel,
					[symbolSnapshot as symbol]: context.snapshot,
				},
			},
		}
	);
	expect(context.runtime).toBeUndefined();

	// The runtime is not there yet: the event waits instead of throwing,
	// and waiting does not load the engine.
	expect(() => events.track('signup')).not.toThrow();
	await settle();
	expect(capture).not.toHaveBeenCalled();
	expect(harness.loadEngine).not.toHaveBeenCalled();

	// The accept commits and asks for the engine; the event follows it.
	acceptInDialog(context);
	await settle();
	harness.releaseEngine();
	await vi.waitFor(() => expect(harness.engine()).toBeDefined());
	await settle();

	expect(context.runtime).toBe(harness.engine()?.runtime);
	expect(capture.mock.calls.map((call) => call[0])).toEqual(['signup']);
	// From here the dispatcher sends through the engine at once.
	events.track('checkout');
	expect(capture.mock.calls.map((call) => call[0])).toEqual([
		'signup',
		'checkout',
	]);
	wrapper.unmount();
});

describe('useScriptLoader before the engine', () => {
	const provide = (context: VueConsentKernelContext) => ({
		global: {
			provide: {
				[symbolKernelContext as symbol]: context,
				[symbolKernel as symbol]: context.kernel,
				[symbolSnapshot as symbol]: context.snapshot,
			},
		},
	});

	test('a gated script waits, an Accept starts it with the choice, and the engine takes it over', async () => {
		const harness = createHarness();
		const { context } = harness;
		context.start();
		const wrapper = mount(
			defineComponent({
				setup() {
					useScriptLoader([
						{
							category: 'measurement',
							id: 'late-measurement',
							src: '/late.js',
						},
					]);
					return () => h('div');
				},
			}),
			provide(context)
		);
		// Nothing may run yet: the engine is not asked for.
		expect(harness.loadEngine).not.toHaveBeenCalled();
		expect(document.querySelector('script[src="/late.js"]')).toBeNull();

		acceptInDialog(context);
		// Same task: the registered plain script starts with the choice,
		// marked as started early, so a server start leaves it to its owners
		// instead of taking it over.
		const late = document.querySelector('script[src="/late.js"]');
		expect(late).not.toBeNull();
		expect((late as { __inthEarly?: boolean } | null)?.__inthEarly).toBe(true);
		await settle();
		harness.releaseEngine();
		await vi.waitFor(() => expect(harness.engine()).toBeDefined());
		await settle();

		// The engine's loader adopted it: one element, not two.
		expect(document.querySelectorAll('script[src="/late.js"]')).toHaveLength(1);
		const ids = () =>
			harness.engine()?.runtime?.scripts.map((script) => script.id);
		expect(ids()).toContain('late-measurement');
		wrapper.unmount();
		await vi.waitFor(() => expect(ids()).not.toContain('late-measurement'));
	});

	test('a registration disposed before the engine removes the script an Accept started', async () => {
		const harness = createHarness();
		const { context } = harness;
		context.start();
		const wrapper = mount(
			defineComponent({
				setup() {
					useScriptLoader([
						{ category: 'measurement', id: 'route-only', src: '/route.js' },
					]);
					return () => h('div');
				},
			}),
			provide(context)
		);
		acceptInDialog(context);
		expect(document.querySelector('script[src="/route.js"]')).not.toBeNull();

		// The route leaves while the engine chunk is still loading.
		wrapper.unmount();
		expect(document.querySelector('script[src="/route.js"]')).toBeNull();

		await settle();
		harness.releaseEngine();
		await vi.waitFor(() => expect(harness.engine()).toBeDefined());
		await settle();
		expect(document.querySelector('script[src="/route.js"]')).toBeNull();
		expect(
			harness.engine()?.runtime?.scripts.map((script) => script.id)
		).not.toContain('route-only');
	});

	test('a registration changed before the engine removes what the old set started, unless another owner wants it', async () => {
		const harness = createHarness({
			scripts: [{ category: 'measurement', id: 'shared', src: '/shared.js' }],
		});
		const { context } = harness;
		context.start();
		const scripts = ref<Script[]>([
			{ category: 'measurement', id: 'a', src: '/a.js' },
			// The config has this resource too: the page still wants it.
			{
				category: 'measurement',
				id: 'shared-again',
				resourceKey: 'shared',
				src: '/shared.js',
			},
		]);
		const wrapper = mount(
			defineComponent({
				setup() {
					useScriptLoader(scripts);
					return () => h('div');
				},
			}),
			provide(context)
		);
		acceptInDialog(context);
		expect(document.querySelectorAll('script[src="/a.js"]')).toHaveLength(1);
		expect(document.querySelectorAll('script[src="/shared.js"]')).toHaveLength(
			1
		);

		scripts.value = [{ category: 'measurement', id: 'b', src: '/b.js' }];
		await nextTick();
		// `a` is gone; the shared resource stays for the configured script.
		expect(document.querySelector('script[src="/a.js"]')).toBeNull();
		expect(document.querySelectorAll('script[src="/shared.js"]')).toHaveLength(
			1
		);
		wrapper.unmount();
	});

	test('a disposed script whose resource a survivor wants from another URL is removed for it', () => {
		const harness = createHarness();
		const { context } = harness;
		context.start();
		// Registered first: its element occupies the key at the tap. The
		// second wants the same resource from another file.
		const First = defineComponent({
			setup() {
				useScriptLoader([
					{
						category: 'measurement',
						id: 'tag-v1',
						resourceKey: 'tag',
						src: '/tag-v1.js',
					},
				]);
				return () => h('div');
			},
		});
		const Second = defineComponent({
			setup() {
				useScriptLoader([
					{
						category: 'measurement',
						id: 'tag-v2',
						resourceKey: 'tag',
						src: '/tag-v2.js',
					},
					// The same file, but the loader runs it with a callback: it
					// never adopts an element the commit inserted.
					{
						category: 'measurement',
						id: 'tag-v1-observed',
						onLoad: () => undefined,
						resourceKey: 'tag',
						src: '/tag-v1.js',
					},
					// The same file, plain, but second for its key: the loader
					// mounts the first survivor, so this one keeps nothing.
					{
						category: 'measurement',
						id: 'tag-v1-again',
						resourceKey: 'tag',
						src: '/tag-v1.js',
					},
				]);
				return () => h('div');
			},
		});
		const wrapper = mount(
			defineComponent({
				props: { first: { default: true, type: Boolean } },
				setup: (props) => () => [props.first ? h(First) : null, h(Second)],
			}),
			provide(context)
		);
		acceptInDialog(context);
		const started = () =>
			[
				...document.querySelectorAll<HTMLScriptElement>('script[src*="/tag-"]'),
			].map((element) => element.getAttribute('src'));
		expect(started()).toEqual(['/tag-v1.js']);

		// The first leaves; the second wants another file, so nothing is kept
		// for it to adopt and the loader mounts its own once the engine is in.
		void wrapper.setProps({ first: false });
		return nextTick().then(() => {
			expect(started()).toEqual([]);
			wrapper.unmount();
		});
	});

	test('a script that may run now loads the engine at once', async () => {
		const harness = createHarness();
		const { context } = harness;
		context.start();
		const wrapper = mount(
			defineComponent({
				setup() {
					useScriptLoader([
						{
							alwaysLoad: true,
							category: 'necessary',
							id: 'ops',
							src: '/ops.js',
						},
					]);
					return () => h('div');
				},
			}),
			provide(context)
		);
		// The request resolves a promise; the load runs a task later.
		await settle();
		expect(harness.loadEngine).toHaveBeenCalledOnce();
		wrapper.unmount();
	});
});

test('a command waiting for an engine that fails to load rejects, and the next one loads it again', async () => {
	const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	const harness = createHarness();
	harness.loadEngine.mockRejectedValueOnce(
		new Error('The engine chunk failed.')
	);
	harness.releaseEngine();
	harness.context.start();

	// A vendor choice only the engine records.
	const first = harness.context.kernel.commands.save('all', {
		vendors: {},
	} as never);
	await expect(first).rejects.toThrow('The engine chunk failed.');
	expect(harness.context.snapshot.value.activeUI).toBe('banner');

	const second = harness.context.kernel.commands.save('all', {
		vendors: {},
	} as never);
	await expect(second).resolves.toMatchObject({ ok: true });
	expect(harness.loadEngine).toHaveBeenCalledTimes(2);
	logged.mockRestore();
});

test('[BNR-06] a banner the early-tap script hid shows again when the engine fails to load', async () => {
	const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	renderBanner();
	const harness = createHarness();
	harness.loadEngine.mockRejectedValueOnce(
		new Error('The engine chunk failed.')
	);
	harness.context.start();

	tap('accept');
	// The script hides the banner until the engine replays the tap.
	expect(document.getElementById('inth-early-tap')).not.toBeNull();
	harness.releaseEngine();

	// No engine will replay it: the banner shows again.
	await vi.waitFor(() =>
		expect(document.getElementById('inth-early-tap')).toBeNull()
	);
	expect(logged).toHaveBeenCalled();
	(
		window as unknown as Record<string, { stop?: () => void } | undefined>
	).__inthEarlyTaps?.stop?.();
	logged.mockRestore();
});
