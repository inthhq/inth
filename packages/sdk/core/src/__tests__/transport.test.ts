/**
 * The kernel's `commands.init`, `commands.save` and `commands.identify`
 * against a stub transport.
 */
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import type { InitResponse, KernelConfig, KernelTransport } from '../index';
import { createKernel } from '../kernel';
import { createMemoryOutboxStore } from '../kernel/save-outbox';
import {
	choiceRecords,
	matchedResolution,
	NOW,
	noticeRule,
	optInRule,
} from './fixtures/kernel-fixtures';

/**
 * A kernel with its own in-memory save outbox, so a save one test fails
 * never replays in another.
 */
const createConsentKernel = function createConsentKernel(
	config: KernelConfig = {}
) {
	return createKernel(config, { outboxStore: createMemoryOutboxStore() });
};

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('kernel transport: no transport = no-op commands', () => {
	test('init returns ok without firing any network call', async () => {
		const fetchSpy = vi.fn().mockResolvedValue(new Response());
		vi.stubGlobal('fetch', fetchSpy);

		try {
			const kernel = createConsentKernel();
			const result = await kernel.commands.init();

			expect(result.ok).toBe(true);
			expect(fetchSpy).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}
	});

	test('save returns ok without firing any network call', async () => {
		const fetchSpy = vi.fn().mockResolvedValue(new Response());
		vi.stubGlobal('fetch', fetchSpy);

		try {
			const kernel = createConsentKernel();
			const result = await kernel.commands.save('all');

			expect(result.ok).toBe(true);
			expect(fetchSpy).not.toHaveBeenCalled();
			expect(
				Object.keys(kernel.getSnapshot().explicitChoice?.categories ?? {})
			).not.toHaveLength(0);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

describe('kernel transport: init applies response to snapshot', () => {
	test('legacy jurisdiction + showConsentBanner init fields are ignored', async () => {
		const transport: KernelTransport = {
			init() {
				return Promise.resolve({
					jurisdiction: 'GDPR',
					showConsentBanner: true,
				} as InitResponse);
			},
		};
		const kernel = createConsentKernel({ transport });

		expect(kernel.getSnapshot().model).toBe('opt-in');
		expect(kernel.getSnapshot().resolution.status).toBe('unconfigured');

		await kernel.commands.init();

		// A complete response without any policy field is a malformed init:
		// failed, strict opt-in permissions, first layer hidden.
		expect(kernel.getSnapshot().model).toBe('opt-in');
		expect(kernel.getSnapshot().resolution).toEqual({
			policy: null,
			reason: 'invalid-payload',
			status: 'failed',
		});
		expect(kernel.getSnapshot().promptRequirement).toEqual({
			kind: 'choice',
			reason: 'missing',
		});
		expect(kernel.getSnapshot().activeUI).toBe('none');
	});

	test('resolvedOverrides merge into snapshot.overrides', async () => {
		const transport: KernelTransport = {
			init() {
				return Promise.resolve({
					resolvedOverrides: { country: 'DE', region: 'BE' },
				});
			},
		};
		const kernel = createConsentKernel({
			initialOverrides: { language: 'de' },
			transport,
		});

		await kernel.commands.init();

		expect(kernel.getSnapshot().overrides).toEqual({
			country: 'DE',
			language: 'de',
			region: 'BE',
		});
	});

	test('legacy server booleans cannot seed a draft or a choice', async () => {
		const transport: KernelTransport = {
			init() {
				return Promise.resolve({
					consents: { marketing: true, measurement: true },
					hasConsented: true,
				} as unknown as InitResponse);
			},
		};
		const kernel = createConsentKernel({ transport });

		await kernel.commands.init();

		const snap = kernel.getSnapshot();
		// Booleans without receipts cannot be an explicit choice.
		expect(snap.explicitChoice).toBeNull();
		expect(snap.explicitChoice).toBeNull();
		expect(snap.effectivePermissions.marketing).toBe(false);

		// Missing receipts cannot preselect a later explicit confirmation.
		await kernel.commands.save();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(kernel.getSnapshot().effectivePermissions.measurement).toBe(false);
		expect(kernel.getSnapshot().effectivePermissions.experience).toBe(false);
	});

	test('init passes current overrides + user as InitContext', async () => {
		const initSpy = vi.fn<NonNullable<KernelTransport['init']>>();
		initSpy.mockResolvedValue({});
		const transport: KernelTransport = { init: initSpy };

		const kernel = createConsentKernel({
			initialOverrides: { country: 'US', language: 'en' },
			initialUser: { externalId: 'user-42' },
			transport,
		});

		await kernel.commands.init();

		expect(initSpy).toHaveBeenCalledTimes(1);
		const ctx = initSpy.mock.calls[0]?.[0];
		expect(ctx?.overrides).toEqual({ country: 'US', language: 'en' });
		expect(ctx?.user?.externalId).toBe('user-42');
	});

	test('init emits command:init:started then :completed', async () => {
		const events: string[] = [];
		const transport: KernelTransport = {
			init() {
				return Promise.resolve({});
			},
		};
		const kernel = createConsentKernel({ transport });
		kernel.events.on('command:init:started', () => events.push('started'));
		kernel.events.on('command:init:completed', (e) =>
			events.push(`completed:${String(e.result.ok)}`)
		);

		await kernel.commands.init();

		expect(events).toEqual(['started', 'completed:true']);
	});

	test('init transport error → result.ok=false + command:error event', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const boom = new Error('backend on fire');
		const transport: KernelTransport = {
			init() {
				throw boom;
			},
		};
		const kernel = createConsentKernel({ initRetry: false, transport });

		const errors: unknown[] = [];
		kernel.events.on('command:error', (e) => errors.push(e.error));

		const result = await kernel.commands.init();

		expect(result.ok).toBe(false);
		expect(result.error).toBe(boom);
		expect(errors).toEqual([boom]);
		// Failure is observable, permissions stay safe, first layer hidden.
		expect(kernel.getSnapshot().resolution).toEqual({
			policy: null,
			reason: 'transport',
			status: 'failed',
		});
		expect(kernel.getSnapshot().model).toBe('opt-in');
		expect(kernel.getSnapshot().activeUI).toBe('none');
	});

	test('provisional policy suppresses activeUI until init resolves', async () => {
		let resolveInit: (value: InitResponse) => void = () => {};
		const transport: KernelTransport = {
			init() {
				return new Promise((resolve) => {
					resolveInit = resolve;
				});
			},
		};
		const kernel = createConsentKernel({
			initialPolicyPending: true,
			transport,
		});

		// Model is populated for SSR ergonomics, but no surface renders.
		expect(kernel.getSnapshot().model).toBe('opt-in');
		expect(kernel.getSnapshot().activeUI).toBe('none');
		expect(kernel.getSnapshot().policyPending).toBe(true);

		const pending = kernel.commands.init();
		expect(kernel.getSnapshot().activeUI).toBe('none');

		resolveInit({
			policyResolution: { ...matchedResolution(optInRule()), version: 1 },
		});
		await pending;

		expect(kernel.getSnapshot().policyPending).toBe(false);
		expect(kernel.getSnapshot().activeUI).toBe('banner');
	});

	test('provisional policy stays withheld when init fails', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const boom = new Error('backend unreachable');
		const transport: KernelTransport = {
			init() {
				throw boom;
			},
		};
		const kernel = createConsentKernel({
			initRetry: false,
			initialPolicyPending: true,
			transport,
		});
		const initFailures: {
			attempt: number;
			error: unknown;
			nextRetryMs: number | null;
		}[] = [];
		const commandErrors: unknown[] = [];
		kernel.events.on('init:failed', (event) => {
			initFailures.push(event);
		});
		kernel.events.on('command:error', (event) => {
			commandErrors.push(event.error);
		});

		const result = await kernel.commands.init();

		expect(result.ok).toBe(false);
		expect(kernel.getSnapshot().policyPending).toBe(true);
		expect(kernel.getSnapshot().activeUI).toBe('none');
		expect(initFailures).toEqual([
			{ attempt: 1, error: boom, nextRetryMs: null, type: 'init:failed' },
		]);
		expect(commandErrors).toEqual([boom]);
	});

	test('retries failed init with jittered backoff until it succeeds', async () => {
		vi.useFakeTimers();
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		const initSpy = vi
			.fn<NonNullable<KernelTransport['init']>>()
			.mockRejectedValueOnce(new Error('first failure'))
			.mockRejectedValueOnce(new Error('second failure'))
			.mockResolvedValue({
				policyResolution: { ...matchedResolution(optInRule()), version: 1 },
			});
		const kernel = createConsentKernel({
			initRetry: { baseDelayMs: 100, maxAttempts: 3, maxDelayMs: 1000 },
			initialPolicyPending: true,
			transport: { init: initSpy },
		});
		const failures: { attempt: number; nextRetryMs: number | null }[] = [];
		const commandEvents: string[] = [];
		kernel.events.on('init:failed', (event) => {
			failures.push({
				attempt: event.attempt,
				nextRetryMs: event.nextRetryMs,
			});
		});
		kernel.events.on('command:init:started', () => {
			commandEvents.push('started');
		});
		kernel.events.on('command:init:completed', (event) => {
			commandEvents.push(`completed:${String(event.result.ok)}`);
		});

		const firstResult = await kernel.commands.init();
		expect(firstResult.ok).toBe(false);
		expect(failures).toEqual([{ attempt: 1, nextRetryMs: 75 }]);

		await vi.advanceTimersByTimeAsync(75);
		expect(failures).toEqual([
			{ attempt: 1, nextRetryMs: 75 },
			{ attempt: 2, nextRetryMs: 150 },
		]);

		await vi.advanceTimersByTimeAsync(150);
		expect(initSpy).toHaveBeenCalledTimes(3);
		expect(kernel.getSnapshot().policyPending).toBe(false);
		expect(kernel.getSnapshot().activeUI).toBe('banner');
		expect(commandEvents).toEqual([
			'started',
			'completed:false',
			'started',
			'completed:false',
			'started',
			'completed:true',
		]);
		kernel.dispose();
	});

	test('initRetry false never retries', async () => {
		vi.useFakeTimers();
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const initSpy = vi.fn().mockRejectedValue(new Error('offline'));
		const kernel = createConsentKernel({
			initRetry: false,
			transport: { init: initSpy },
		});

		await kernel.commands.init();
		await vi.advanceTimersByTimeAsync(60_000);

		expect(initSpy).toHaveBeenCalledTimes(1);
		kernel.dispose();
	});

	test('dispose cancels a pending init retry', async () => {
		vi.useFakeTimers();
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(Math, 'random').mockReturnValue(1);
		const initSpy = vi.fn().mockRejectedValue(new Error('offline'));
		const kernel = createConsentKernel({
			initRetry: { baseDelayMs: 100, maxAttempts: 3 },
			transport: { init: initSpy },
		});

		await kernel.commands.init();
		kernel.dispose();
		kernel.dispose();
		await vi.advanceTimersByTimeAsync(1000);

		expect(initSpy).toHaveBeenCalledTimes(1);
	});

	test('init after dispose re-arms background retries', async () => {
		vi.useFakeTimers();
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(Math, 'random').mockReturnValue(1);
		const initSpy = vi.fn().mockRejectedValue(new Error('offline'));
		const kernel = createConsentKernel({
			initRetry: { baseDelayMs: 100, maxAttempts: 3 },
			transport: { init: initSpy },
		});

		await kernel.commands.init();
		kernel.dispose();
		// StrictMode-style remount: same kernel, init called again.
		await kernel.commands.init();
		await vi.advanceTimersByTimeAsync(1000);

		// 1 (first mount) + 1 (remount) + 2 retries after the remount.
		expect(initSpy).toHaveBeenCalledTimes(4);
	});

	test('a newer init supersedes a slower in-flight attempt', async () => {
		let resolveFirst: (value: InitResponse) => void = () => {};
		const initSpy = vi
			.fn<NonNullable<KernelTransport['init']>>()
			.mockImplementationOnce(
				() =>
					new Promise<InitResponse>((resolve) => {
						resolveFirst = resolve;
					})
			)
			.mockResolvedValueOnce({ resolvedOverrides: { language: 'fr' } });
		const kernel = createConsentKernel({ transport: { init: initSpy } });
		const completed: boolean[] = [];
		kernel.events.on('command:init:completed', ({ result }) => {
			completed.push(result.ok);
		});

		const first = kernel.commands.init();
		const second = await kernel.commands.init();
		expect(second.ok).toBe(true);
		expect(kernel.getSnapshot().overrides.language).toBe('fr');

		resolveFirst({ resolvedOverrides: { language: 'de' } });
		const firstResult = await first;

		expect(firstResult.ok).toBe(false);
		expect(kernel.getSnapshot().overrides.language).toBe('fr');
		expect(completed).toEqual([true, false]);
		kernel.dispose();
	});

	test('a superseded failure neither warns nor schedules a retry', async () => {
		vi.useFakeTimers();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		let rejectFirst: (reason: unknown) => void = () => {};
		const initSpy = vi
			.fn<NonNullable<KernelTransport['init']>>()
			.mockImplementationOnce(
				() =>
					new Promise<InitResponse>((_resolve, reject) => {
						rejectFirst = reject;
					})
			)
			.mockResolvedValue({});
		const kernel = createConsentKernel({
			initRetry: { baseDelayMs: 100, maxAttempts: 3 },
			transport: { init: initSpy },
		});
		const failures: number[] = [];
		kernel.events.on('init:failed', ({ attempt }) => {
			failures.push(attempt);
		});

		const first = kernel.commands.init();
		await kernel.commands.init();
		rejectFirst(new Error('slow failure'));
		await first;
		await vi.advanceTimersByTimeAsync(1000);

		expect(failures).toEqual([]);
		expect(warn).not.toHaveBeenCalled();
		expect(initSpy).toHaveBeenCalledTimes(2);
		kernel.dispose();
	});

	test('online retries init immediately', async () => {
		vi.useFakeTimers();
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(Math, 'random').mockReturnValue(1);
		const originalWindow = globalThis.window;
		const browserEvents = new EventTarget();
		vi.stubGlobal('window', {
			...originalWindow,
			addEventListener: browserEvents.addEventListener.bind(browserEvents),
			removeEventListener:
				browserEvents.removeEventListener.bind(browserEvents),
		});
		const initSpy = vi
			.fn()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValue({});
		const kernel = createConsentKernel({
			initRetry: { baseDelayMs: 10_000, maxAttempts: 2 },
			transport: { init: initSpy },
		});

		try {
			await kernel.commands.init();
			browserEvents.dispatchEvent(new Event('online'));
			await vi.advanceTimersByTimeAsync(0);

			expect(initSpy).toHaveBeenCalledTimes(2);
			await vi.advanceTimersByTimeAsync(10_000);
			expect(initSpy).toHaveBeenCalledTimes(2);
		} finally {
			kernel.dispose();
			vi.stubGlobal('window', originalWindow);
		}
	});

	test('defers a due retry until the document becomes visible', async () => {
		vi.useFakeTimers();
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(Math, 'random').mockReturnValue(1);
		const originalDocument = globalThis.document;
		let visibilityState: DocumentVisibilityState = 'hidden';
		const listeners = new Set<EventListener>();
		vi.stubGlobal('document', {
			...originalDocument,
			addEventListener(type: string, listener: EventListener) {
				if (type === 'visibilitychange') {
					listeners.add(listener);
				}
			},
			removeEventListener(type: string, listener: EventListener) {
				if (type === 'visibilitychange') {
					listeners.delete(listener);
				}
			},
			get visibilityState() {
				return visibilityState;
			},
		});
		const initSpy = vi
			.fn()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValue({});
		const kernel = createConsentKernel({
			initRetry: { baseDelayMs: 100, maxAttempts: 2 },
			transport: { init: initSpy },
		});

		try {
			await kernel.commands.init();
			await vi.advanceTimersByTimeAsync(100);
			expect(initSpy).toHaveBeenCalledTimes(1);

			visibilityState = 'visible';
			for (const listener of listeners) {
				listener(new Event('visibilitychange'));
			}
			await vi.runAllTimersAsync();
			expect(initSpy).toHaveBeenCalledTimes(2);
		} finally {
			kernel.dispose();
			vi.stubGlobal('document', originalDocument);
		}
	});

	test('getServerSnapshot stays at revision 0 through client mutations', async () => {
		const resolution = matchedResolution(optInRule());
		const kernel = createConsentKernel({
			initialPolicyResolution: resolution,
			transport: {
				init() {
					return Promise.resolve({
						policyResolution: { ...resolution, version: 1 },
					});
				},
			},
		});
		const server = kernel.getServerSnapshot();
		expect(server.revision).toBe(0);
		expect(server.activeUI).toBe('banner');

		// Simulate the client boot mutations that land before hydration
		// completes: persistence hydrate applies a stored full choice…
		kernel.hydrate(
			choiceRecords(
				{
					experience: true,
					functionality: true,
					marketing: true,
					measurement: true,
				},
				{ fingerprint: resolution.fingerprints.choice, now: Date.now() }
			)
		);
		await kernel.commands.init();

		// …but hydration must still be able to render what the server saw.
		expect(kernel.getSnapshot().activeUI).toBe('none');
		expect(kernel.getServerSnapshot()).toBe(server);
		expect(kernel.getServerSnapshot().activeUI).toBe('banner');
	});

	test('provisional policy finalizes when the transport has no init', async () => {
		const kernel = createConsentKernel({
			initialPolicyPending: true,
			transport: {},
		});

		expect(kernel.getSnapshot().activeUI).toBe('none');
		await kernel.commands.init();
		expect(kernel.getSnapshot().policyPending).toBe(false);
		expect(kernel.getSnapshot().activeUI).toBe('banner');
	});
});

describe('kernel transport: save flows consents to backend', () => {
	test('save calls transport.save with current consent payload', async () => {
		const saveSpy = vi.fn<NonNullable<KernelTransport['save']>>();
		saveSpy.mockResolvedValue({ ok: true, subjectId: 'sub-1' });
		const transport: KernelTransport = { save: saveSpy };

		const kernel = createConsentKernel({ transport });
		const result = await kernel.commands.save('all');

		expect(result.ok).toBe(true);
		expect(result.subjectId).toBe('sub-1');
		expect(saveSpy).toHaveBeenCalledTimes(1);
		const payload = saveSpy.mock.calls[0]?.[0];
		expect(payload?.subjectId).toMatch(/^[\da-f]{8}-[\da-f]{4}-7/u);
		expect(payload?.consents.marketing).toBe(true);
	});

	test('save creates and reuses a subjectId', async () => {
		const saveSpy = vi.fn<NonNullable<KernelTransport['save']>>();
		saveSpy.mockResolvedValue({ ok: true });
		const kernel = createConsentKernel({ transport: { save: saveSpy } });

		await kernel.commands.save('all');
		const first = kernel.getSnapshot().subject?.subjectId ?? null;
		await kernel.commands.save({ marketing: false });
		const second = kernel.getSnapshot().subject?.subjectId ?? null;

		expect(first).toMatch(/^[\da-f]{8}-[\da-f]{4}-7/u);
		expect(second).toBe(first);
		expect(saveSpy.mock.calls[0]?.[0].subjectId).toBe(first);
		expect(saveSpy.mock.calls[1]?.[0].subjectId).toBe(first);
	});

	test('save commits the snapshot synchronously but defers transport.save off the commit task', async () => {
		const saveSpy = vi.fn<NonNullable<KernelTransport['save']>>();
		saveSpy.mockResolvedValue({ ok: true });
		const kernel = createConsentKernel({ transport: { save: saveSpy } });

		const pending = kernel.commands.save('all');

		// The optimistic commit is synchronous — UI can flip and paint…
		expect(
			Object.keys(kernel.getSnapshot().explicitChoice?.categories ?? {})
		).not.toHaveLength(0);
		expect(kernel.getSnapshot().activeUI).toBe('none');
		// …while the network call is deferred a macrotask so it never
		// contends with the commit/paint task.
		expect(saveSpy).not.toHaveBeenCalled();

		const result = await pending;
		expect(result.ok).toBe(true);
		expect(saveSpy).toHaveBeenCalledTimes(1);
	});

	test('save transport error → result.ok=false + command:error event', async () => {
		const boom = new Error('save failed');
		const transport: KernelTransport = {
			save() {
				throw boom;
			},
		};
		const kernel = createConsentKernel({ transport });

		const errors: unknown[] = [];
		kernel.events.on('command:error', (e) => errors.push(e.error));

		const result = await kernel.commands.save('all');
		expect(result.ok).toBe(false);
		expect(errors).toEqual([boom]);
		// Snapshot mutation still happened (local optimistic commit).
		expect(
			Object.keys(kernel.getSnapshot().explicitChoice?.categories ?? {})
		).not.toHaveLength(0);
	});
});

describe('kernel transport: identify forwards to transport', () => {
	test('identify calls transport.identify after updating snapshot', async () => {
		const identifySpy = vi.fn<NonNullable<KernelTransport['identify']>>();
		identifySpy.mockResolvedValue();
		const transport: KernelTransport = { identify: identifySpy };

		const kernel = createConsentKernel({
			initialRecords: choiceRecords(
				{ measurement: true },
				{ subjectId: 'sub-42' }
			),
			now: NOW,
			transport,
		});
		await kernel.commands.identify({ externalId: 'user-42' });

		expect(kernel.getSnapshot().user?.externalId).toBe('user-42');
		expect(identifySpy).toHaveBeenCalledTimes(1);
		expect(identifySpy).toHaveBeenCalledWith(
			{ externalId: 'user-42' },
			'sub-42'
		);
	});

	// An app or server that seeds a known subject, with no record yet,
	// links it and loads its record at once.
	test('identify links and loads a subject the app supplied before any record', async () => {
		const identifySpy = vi.fn<NonNullable<KernelTransport['identify']>>();
		identifySpy.mockResolvedValue();
		const loadSubjectRecord =
			vi.fn<NonNullable<KernelTransport['loadSubjectRecord']>>();
		loadSubjectRecord.mockResolvedValue(null);
		const kernel = createConsentKernel({
			initialRecords: { subject: { subjectId: 'sub_existing_backend' } },
			transport: { identify: identifySpy, loadSubjectRecord },
		});
		await kernel.commands.identify({ externalId: 'user-42' });

		expect(identifySpy).toHaveBeenCalledWith(
			{ externalId: 'user-42' },
			'sub_existing_backend'
		);
		expect(loadSubjectRecord).toHaveBeenCalledWith('sub_existing_backend');
	});

	test('identify passes no subject for a provisional ID until a save records it', async () => {
		const identifySpy = vi.fn<NonNullable<KernelTransport['identify']>>();
		identifySpy.mockResolvedValue();
		const loadSubjectRecord =
			vi.fn<NonNullable<KernelTransport['loadSubjectRecord']>>();
		loadSubjectRecord.mockResolvedValue(null);
		const kernel = createKernel({
			initialPolicyResolution: matchedResolution(optInRule()),
			initialRecords: { subject: { subjectId: 'sub-42' } },
			now: NOW,
			transport: {
				identify: identifySpy,
				loadSubjectRecord,
				save: () => Promise.resolve({ ok: true }),
			},
		});
		kernel.markProvisionalSubject('sub-42');
		await kernel.commands.identify({ externalId: 'user-42' });
		expect(identifySpy).toHaveBeenLastCalledWith(
			{ externalId: 'user-42' },
			null
		);
		expect(loadSubjectRecord).not.toHaveBeenCalled();

		await kernel.commands.save({ measurement: true });
		await kernel.commands.identify({ externalId: 'user-42' });
		expect(identifySpy).toHaveBeenLastCalledWith(
			{ externalId: 'user-42' },
			'sub-42'
		);
	});

	// With persistence off, `dismissNotice()` stores and sends nothing, so
	// the ID it acknowledges is still gone on the next page load.
	test('a notice dismissal that stores nothing leaves the ID provisional', async () => {
		const identifySpy = vi.fn<NonNullable<KernelTransport['identify']>>();
		identifySpy.mockResolvedValue();
		const kernel = createKernel({
			initialPolicyResolution: matchedResolution(noticeRule()),
			initialRecords: { subject: { subjectId: 'sub-42' } },
			now: NOW,
			transport: { identify: identifySpy },
		});
		kernel.markProvisionalSubject('sub-42');
		await kernel.commands.dismissNotice();
		await kernel.commands.identify({ externalId: 'user-42' });

		expect(identifySpy).toHaveBeenLastCalledWith(
			{ externalId: 'user-42' },
			null
		);
	});

	test('identify transport error emits command:error, rejects, and keeps the updated snapshot', async () => {
		const boom = new Error('identify failed');
		const transport: KernelTransport = {
			identify() {
				throw boom;
			},
		};
		const kernel = createConsentKernel({ transport });
		const errors: unknown[] = [];
		kernel.events.on('command:error', (e) => errors.push(e.error));

		await expect(
			kernel.commands.identify({ externalId: 'user-42' })
		).rejects.toBe(boom);

		expect(kernel.getSnapshot().user?.externalId).toBe('user-42');
		expect(errors).toEqual([boom]);
	});
});
