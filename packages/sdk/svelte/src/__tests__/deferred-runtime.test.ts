/**
 * The deferred runtime's commit path (`lib/deferred/create-deferred-runtime.ts`) when the
 * commit chunk cannot finish a choice the stand-in already shows: the
 * engine records it, once, and announces it once.
 */
import { EARLY_TAP_STYLE_ID } from '@inth/sdk/runtime/page-globals';
import { completeCommit } from '@inth/sdk/surface-actions/early-commit';
import type {
	CompleteCommitInput,
	CompleteCommitResult,
} from '@inth/sdk/surface-actions/early-commit';
import { afterEach, expect, test, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { PENDING_SAVES_STORAGE_KEY } from '../../../core/src/libs/storage-keys';
import { createOwnedRuntime } from '../lib/create-owned-runtime';
import type { RootBoot } from '../lib/deferred/consent-boot.model';
import { createDeferredRuntime } from '../lib/deferred/create-deferred-runtime';
import type { EngineFactory } from '../lib/deferred/create-deferred-runtime';
import { createRootEngine } from '../lib/deferred/engine';
import { runtimeOptionsFor } from '../lib/resolve-provider-options';
import type { ProviderOptionsInput } from '../lib/resolve-provider-options';
import { transportMode } from './fixtures/transport-mode';
import { policyFixture } from './policy-fixture';

const transportInit = vi.fn(() => Promise.resolve({}));
const transportSave = vi.fn(() => Promise.resolve({ ok: true as const }));
const mode = transportMode({ init: transportInit, save: transportSave });

type Callbacks = ProviderOptionsInput['callbacks'];

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

/** Waits for the tasks after a tap: the commit chunk runs one task later. */
const settle = async (): Promise<void> => {
	for (let index = 0; index < 5; index += 1) {
		// oxlint-disable-next-line no-await-in-loop -- Each wait is one task after the last.
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
	}
};

const disposers: (() => void)[] = [];

/**
 * A deferred runtime over a fresh visitor's boot, whose engine is held
 * until `release`, and whose schedule never loads the engine on its own.
 */
const createHarness = (input: {
	callbacks?: Callbacks;
	completeCommit?: (
		input: CompleteCommitInput
	) => Promise<CompleteCommitResult | null>;
	/** The first engine chunk request fails. */
	failFirstLoad?: boolean;
}) => {
	const prefetch = policyFixture();
	const providerOptions: ProviderOptionsInput = {
		callbacks: input.callbacks,
		consentCategories: ['necessary', 'measurement', 'marketing'],
		prefetch,
		scripts: [],
	};
	const runtimeOptions = () => runtimeOptionsFor({ ...providerOptions, mode });
	const server = createOwnedRuntime(runtimeOptions());
	// As the server leaves it: plain data.
	const boot: RootBoot = {
		d: 1,
		s: JSON.parse(JSON.stringify(server.kernel.getSnapshot())),
	};
	server.dispose();
	let release: () => void = () => undefined;
	const released = new Promise<void>((resolve) => {
		release = resolve;
	});
	const loadEngine = vi.fn(async (): Promise<EngineFactory> => {
		await released;
		return (committed) => {
			const built = createRootEngine({
				committed,
				mode,
				options: runtimeOptions(),
				state: { mode: { type: 'manifest' }, prefetch },
			});
			return {
				preloadSavePath: () => Promise.resolve(),
				runtime: built.runtime,
				updateOptions: (next) => ({ ...next, mode: built.transport }),
			};
		};
	});
	if (input.failFirstLoad) {
		loadEngine.mockRejectedValueOnce(new Error('The engine chunk failed.'));
	}
	const runtime = createDeferredRuntime({
		boot,
		completeCommit: input.completeCommit,
		loadEngine,
		options: () => providerOptions,
		schedule: () => () => undefined,
	});
	disposers.push(() => runtime.dispose());
	runtime.start();
	return { loadEngine, release, runtime };
};

afterEach(() => {
	for (const dispose of disposers.splice(0)) {
		dispose();
	}
	refusedOutbox?.mockRestore();
	refusedOutbox = undefined;
	transportInit.mockClear();
	transportSave.mockClear();
	localStorage.clear();
	for (const cookie of document.cookie.split(';')) {
		const name = cookie.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	}
	(window as { __inthStarted?: unknown }).__inthStarted = undefined;
});

test('a save the outbox cannot keep goes to the engine, which records it once', async () => {
	const onChoiceRecorded = vi.fn();
	const onPermissionsChanged = vi.fn();
	/** What the commit path resolved with, per save. */
	const commits: unknown[] = [];
	const harness = createHarness({
		callbacks: { onChoiceRecorded, onPermissionsChanged },
		completeCommit: async (input) => {
			const result = await completeCommit(input);
			commits.push(result);
			return result;
		},
	});
	refuseOutboxWrites();

	const saved = harness.runtime.kernel.commands.save('all', {
		uiSource: 'banner',
	});
	// In the tap's task: the stand-in shows the choice.
	expect(
		harness.runtime.kernel.getSnapshot().effectivePermissions.marketing
	).toBe(true);
	await vi.waitFor(() => {
		expect(commits).toEqual([null]);
	});
	// The record is stored, nothing is queued, and nothing is announced:
	// the engine records the choice.
	expect(JSON.parse(localStorage.getItem('inth') ?? 'null')).toMatchObject({
		categories: { marketing: { value: true } },
	});
	expect(localStorage.getItem(PENDING_SAVES_STORAGE_KEY)).toBeNull();
	expect(onChoiceRecorded).not.toHaveBeenCalled();
	expect(onPermissionsChanged).not.toHaveBeenCalled();
	expect(transportSave).not.toHaveBeenCalled();
	await vi.waitFor(() => {
		expect(harness.loadEngine).toHaveBeenCalledTimes(1);
	});

	harness.release();
	await expect(saved).resolves.toMatchObject({ ok: true });
	// One save reaches the backend, announced once.
	await vi.waitFor(() => {
		expect(transportSave).toHaveBeenCalledTimes(1);
		expect(onChoiceRecorded).toHaveBeenCalledTimes(1);
	});
	await settle();
	expect(transportSave).toHaveBeenCalledTimes(1);
	expect(onChoiceRecorded).toHaveBeenCalledTimes(1);
	expect(onChoiceRecorded.mock.calls[0]?.[0]).toMatchObject({
		consentAction: 'all',
	});
	expect(
		harness.runtime.kernel.getSnapshot().explicitChoice?.categories.marketing
			?.value
	).toBe(true);
});

test('a choice the commit chunk declines after the stand-in shows it is recorded by the engine once', async () => {
	const onChoiceRecorded = vi.fn();
	const declined = vi.fn(
		(_input: CompleteCommitInput): Promise<CompleteCommitResult | null> =>
			Promise.resolve(null)
	);
	const harness = createHarness({
		callbacks: { onChoiceRecorded },
		completeCommit: declined,
	});

	const saved = harness.runtime.kernel.commands.save('all', {
		uiSource: 'banner',
	});
	expect(
		harness.runtime.kernel.getSnapshot().effectivePermissions.marketing
	).toBe(true);
	await vi.waitFor(() => {
		expect(declined).toHaveBeenCalledTimes(1);
	});
	// The chunk completed an instant commit, and declined it.
	expect(declined.mock.calls[0]?.[0].instant).toBeDefined();
	await vi.waitFor(() => {
		expect(harness.loadEngine).toHaveBeenCalledTimes(1);
	});
	expect(transportSave).not.toHaveBeenCalled();

	harness.release();
	await expect(saved).resolves.toMatchObject({ ok: true });
	await vi.waitFor(() => {
		expect(transportSave).toHaveBeenCalledTimes(1);
		expect(onChoiceRecorded).toHaveBeenCalledTimes(1);
	});
	await settle();
	// Exactly once: not again from a second path after the engine attached.
	expect(transportSave).toHaveBeenCalledTimes(1);
	expect(onChoiceRecorded).toHaveBeenCalledTimes(1);
});

test('a save waiting for an engine that fails to load rejects, and the next save loads it again', async () => {
	const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	const harness = createHarness({
		completeCommit: () => Promise.resolve(null),
		failFirstLoad: true,
	});
	harness.release();

	const first = harness.runtime.kernel.commands.save('all', {
		uiSource: 'banner',
	});
	await expect(first).rejects.toThrow('The engine chunk failed.');

	const second = harness.runtime.kernel.commands.save('all', {
		uiSource: 'banner',
	});
	await expect(second).resolves.toMatchObject({ ok: true });
	expect(harness.loadEngine).toHaveBeenCalledTimes(2);
	logged.mockRestore();
});

test('[BNR-06] an engine that fails to load shows a banner the early-tap script hid again', async () => {
	const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	// As the script leaves it after a tap it handed to the engine.
	const hidden = document.createElement('style');
	hidden.id = EARLY_TAP_STYLE_ID;
	document.head.append(hidden);
	const harness = createHarness({
		completeCommit: () => Promise.resolve(null),
		failFirstLoad: true,
	});
	harness.release();

	await expect(
		harness.runtime.kernel.commands.save('all', { uiSource: 'banner' })
	).rejects.toThrow('The engine chunk failed.');
	expect(document.getElementById(EARLY_TAP_STYLE_ID)).toBeNull();
	logged.mockRestore();
});
