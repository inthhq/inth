/**
 * The Nuxt plugin's deferred context (`runtime/deferred/shell.ts`): the
 * browser starts from the server's snapshot, records a banner choice in the
 * tap's own task without the consent engine, and the engine adopts that
 * record when it loads.
 */
import type { ConsentSnapshot, KernelEvent, Script } from '@c15t/core';
import { createScriptLoader } from '@c15t/core/modules/script-loader';
import { EARLY_CONSENT_TAP_SCRIPT } from '@c15t/core/surface-actions';
import type { InitOutput } from '@c15t/schema/types';
import {
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@c15t/schema/types';
import { translations } from '@c15t/translations/en';
import { mount } from '@vue/test-utils';
import { afterEach, expect, test, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { defineComponent, h } from 'vue';

import { PENDING_SAVES_STORAGE_KEY } from '../../../core/src/libs/storage-keys';
import { useEventDispatcher } from '../runtime/composables/event-dispatcher';
import type { EventDispatcher } from '../runtime/composables/event-dispatcher';
import { useConsentLanguage } from '../runtime/composables/language';
import type { CompleteCommitInput } from '../runtime/deferred/commit';
import { completeCommit } from '../runtime/deferred/commit';
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
	branding: 'c15t',
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

const config: Pick<RuntimeConsentConfig, 'backendURL' | 'consentCategories'> = {
	backendURL: 'https://consent.example',
	consentCategories: ['necessary', 'measurement', 'marketing'],
};

/** A backend that records every save. */
const createBackend = () => {
	const saves: unknown[] = [];
	const fetch = vi.fn((input: RequestInfo | URL, request?: RequestInit) => {
		if (String(input).split('?')[0]?.endsWith('/subjects')) {
			saves.push(JSON.parse(String(request?.body ?? 'null')));
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
				.__c15tEarlyTaps;
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
	Reflect.deleteProperty(window, '__c15tEarlyTaps');
	Reflect.deleteProperty(window, '__c15tStarted');
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

test('an accept tapped before the engine commits in the tap’s own task', async () => {
	renderBanner();
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

	tap('accept');

	// Same task: the refs carry the choice and the scripts are in.
	expect(context.snapshot.value.explicitChoice).not.toBeNull();
	expect(context.snapshot.value.effectivePermissions).toMatchObject({
		marketing: true,
		measurement: true,
	});
	expect(context.storedConsent.value).not.toBeNull();
	expect(document.querySelector('script[src="/m.js"]')).not.toBeNull();
	expect(document.querySelector('script[src="/k.js"]')).not.toBeNull();
	// The banner stays hidden by the context, not the replayable script.
	expect(document.getElementById('c15t-early-commit')).not.toBeNull();
	expect(harness.completeCommit).not.toHaveBeenCalled();
	expect(harness.loadEngine).not.toHaveBeenCalled();

	await settle();
	expect(harness.completeCommit).toHaveBeenCalledOnce();
	expect(localStorage.getItem('c15t')).not.toBeNull();
	// The engine is asked for once the record is stored.
	expect(harness.loadEngine).toHaveBeenCalledOnce();
	expect(harness.backend.saves).toEqual([]);
	loader.dispose();
});

test('the engine adopts the committed record and sends the queued save once', async () => {
	renderBanner();
	const harness = createHarness();
	const { context } = harness;
	context.start();
	const heard: KernelEvent[] = [];
	tap('accept');
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
	renderBanner();
	const onChoiceRecorded = vi.fn();
	const onPermissionsChanged = vi.fn();
	const harness = createHarness({
		callbacks: { onChoiceRecorded, onPermissionsChanged },
	});
	const { context } = harness;
	context.start();
	refuseOutboxWrites();

	tap('accept');
	// Same task: the refs carry the choice.
	expect(context.snapshot.value.effectivePermissions.marketing).toBe(true);
	await settle();
	expect(harness.completeCommit).toHaveBeenCalledOnce();
	await expect(harness.completeCommit.mock.results[0]?.value).resolves.toBe(
		null
	);
	// The record is stored, nothing is queued, and nothing is announced:
	// the engine records the tap.
	expect(JSON.parse(localStorage.getItem('c15t') ?? 'null')).toMatchObject({
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

test('a tap recorded before the context started is committed when it starts', async () => {
	renderBanner();
	tap('reject');
	const harness = createHarness();
	const { context } = harness;
	expect(context.snapshot.value.explicitChoice).toBeNull();
	context.start();
	expect(context.snapshot.value.explicitChoice).not.toBeNull();
	expect(context.snapshot.value.effectivePermissions).toMatchObject({
		marketing: false,
		measurement: false,
	});
	await settle();
	expect(harness.completeCommit).toHaveBeenCalledOnce();
	expect(
		(window as unknown as Record<string, { taps?: unknown[] }>).__c15tEarlyTaps
			?.taps ?? []
	).toEqual([]);
});

test('Customize opens the dialog from the stand-in, and its save commits at once', async () => {
	renderBanner();
	const harness = createHarness();
	const { context } = harness;
	context.start();
	tap('customize');
	expect(context.activeUI.value).toBe('manager');
	expect(document.getElementById('c15t-early-commit')).not.toBeNull();
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
	expect(localStorage.getItem('c15t')).not.toBeNull();
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
	renderBanner();
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
	tap('accept');
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
