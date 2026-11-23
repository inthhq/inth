/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	explicitChoice,
	matchedResolution,
	NOW,
	optInRule,
	optOutRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import type {
	KernelConfig,
	KernelVendorsState,
	LiftOptOutTransportResult,
	OptOutTransportResult,
	SaveResult,
} from '../../consent-kernel.model';
import {
	createConsentKernel,
	createKernel as createInternalKernel,
} from '../../kernel';
import type { InternalKernel } from '../../kernel/kernel-internals.model';
import { createMemoryOutboxStore } from '../../kernel/save-outbox';
import type { SaveOutboxStore } from '../../kernel/save-outbox';
import { OPT_OUT_CONFIRMATION_STORAGE_KEY } from '../../libs/storage-keys';
import { createStandInKernel } from '../../runtime/stand-in-kernel';
import {
	claimOptOutConfirmationHost,
	closeOptOutConfirmation,
	hasOptOutConfirmationHost,
	isOptOutConfirmationOpen,
	optOutConsentSurface,
	subscribeOptOutConfirmation,
} from '../../surface-actions/opt-out';
import { watchPendingOptOutConfirmation } from '../../surface-actions/opt-out-reload';
import {
	clearPendingOptOutConfirmation,
	hasPendingOptOutConfirmation,
	markPendingOptOutConfirmation,
} from '../../surface-actions/opt-out-reload.store';
import { pressSaleRight } from '../../surface-session/surface-commands.model';
import { watchRevocationReload } from '../revocation-reload';
import { createScriptLoader } from '../script-loader';

const vendors: KernelVendorsState = {
	declared: [
		{
			category: 'marketing',
			id: 'meta-pixel',
			name: 'Meta Pixel',
			presentable: true,
			source: 'config',
		},
	],
	listVersion: null,
};

const kernels: { dispose: () => void }[] = [];

const createKernel = (
	config: Partial<KernelConfig> = {},
	outboxStore?: SaveOutboxStore
) => {
	const fullConfig: KernelConfig = {
		initialPolicyResolution: matchedResolution(
			optInRule({ categories: ['marketing', 'measurement'] })
		),
		now: NOW,
		...config,
	};
	const kernel = outboxStore
		? createInternalKernel(fullConfig, { outboxStore })
		: createConsentKernel(fullConfig);
	kernels.push(kernel);
	return kernel;
};

const watch = (
	kernel: ReturnType<typeof createKernel>,
	options: { enabled?: boolean } = {}
) => {
	const reload = vi.fn();
	const onBeforeReload = vi.fn();
	const dispose = watchRevocationReload({
		getOnBeforeReload: () => onBeforeReload,
		isEnabled: () => options.enabled !== false,
		kernel,
		reload,
	});
	return { dispose, onBeforeReload, reload };
};

const grantMarketing = async (kernel: ReturnType<typeof createKernel>) => {
	const saving = kernel.commands.save({ marketing: true });
	await vi.advanceTimersByTimeAsync(10);
	await saving;
};

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.restoreAllMocks();
	for (const kernel of kernels.splice(0)) {
		closeOptOutConfirmation(
			kernel as Parameters<typeof closeOptOutConfirmation>[0]
		);
		kernel.dispose();
	}
	window.sessionStorage.clear();
	vi.useRealTimers();
});

describe('watchRevocationReload', () => {
	it('reloads after a save turns off a granted category', async () => {
		const kernel = createKernel();
		const { onBeforeReload, reload } = watch(kernel);
		await grantMarketing(kernel);
		expect(reload).not.toHaveBeenCalled();

		await kernel.commands.save({ marketing: false });
		expect(reload).not.toHaveBeenCalled();
		await vi.runAllTimersAsync();

		expect(onBeforeReload).toHaveBeenCalledOnce();
		expect(onBeforeReload.mock.calls[0]?.[0].preferences.marketing).toBe(false);
		expect(reload).toHaveBeenCalledOnce();
		expect(onBeforeReload.mock.invocationCallOrder[0]).toBeLessThan(
			reload.mock.invocationCallOrder[0] ?? 0
		);
	});

	it('does not reload when nothing granted was turned off', async () => {
		const kernel = createKernel();
		const { reload } = watch(kernel);

		// First visit under opt-in: rejecting revokes nothing that ran.
		await kernel.commands.save({ marketing: false });
		await kernel.commands.save({ marketing: true });
		await kernel.commands.save({ measurement: true });
		await vi.runAllTimersAsync();

		expect(reload).not.toHaveBeenCalled();
	});

	it('reloads when an opt-out visitor rejects defaults that already ran', async () => {
		const kernel = createKernel({
			initialPolicyResolution: matchedResolution(
				optOutRule({ categories: ['marketing'] })
			),
		});
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
		const { reload } = watch(kernel);

		await kernel.commands.save({ marketing: false });
		await vi.runAllTimersAsync();

		expect(reload).toHaveBeenCalledOnce();
	});

	it('reloads when a granted vendor is turned off', async () => {
		const kernel = createKernel({ initialVendors: vendors });
		const { reload } = watch(kernel);
		await grantMarketing(kernel);

		await kernel.commands.save({}, { vendors: { 'meta-pixel': false } });
		await vi.runAllTimersAsync();

		expect(reload).toHaveBeenCalledOnce();
	});

	it('does not reload for a vendor whose category is already denied', async () => {
		const kernel = createKernel({ initialVendors: vendors });
		const { reload } = watch(kernel);

		await kernel.commands.save({}, { vendors: { 'meta-pixel': false } });
		await vi.runAllTimersAsync();

		expect(reload).not.toHaveBeenCalled();
	});

	it('does not reload when disabled', async () => {
		const kernel = createKernel();
		const { onBeforeReload, reload } = watch(kernel, { enabled: false });
		await grantMarketing(kernel);

		await kernel.commands.save({ marketing: false });
		await vi.runAllTimersAsync();

		expect(onBeforeReload).not.toHaveBeenCalled();
		expect(reload).not.toHaveBeenCalled();
	});

	it('waits for the save request up to the cap before reloading', async () => {
		let finishSave: (result: SaveResult) => void = () => undefined;
		let saves = 0;
		const kernel = createKernel({
			transport: {
				save: () => {
					saves += 1;
					if (saves === 1) {
						return Promise.resolve({ ok: true });
					}
					return new Promise<SaveResult>((resolve) => {
						finishSave = resolve;
					});
				},
			},
		});
		const { reload } = watch(kernel);
		await grantMarketing(kernel);

		const saving = kernel.commands.save({ marketing: false });
		await vi.advanceTimersByTimeAsync(500);
		expect(reload).not.toHaveBeenCalled();

		finishSave({ ok: true });
		await saving;
		await vi.advanceTimersByTimeAsync(0);
		expect(reload).toHaveBeenCalledOnce();

		// Passing the cap after the reload already fired must not reload again.
		await vi.advanceTimersByTimeAsync(2000);
		expect(reload).toHaveBeenCalledOnce();
	});

	it('reloads at 1,000 ms after onBeforeConsentRevocationReload when a save request never settles', async () => {
		let finishSave: (result: SaveResult) => void = () => undefined;
		let saves = 0;
		const kernel = createKernel({
			transport: {
				save: () => {
					saves += 1;
					if (saves === 1) {
						return Promise.resolve({ ok: true });
					}
					return new Promise<SaveResult>((resolve) => {
						finishSave = resolve;
					});
				},
			},
		});
		const { onBeforeReload, reload } = watch(kernel);
		await grantMarketing(kernel);

		const saving = kernel.commands.save({ marketing: false });
		await vi.advanceTimersByTimeAsync(999);
		expect(onBeforeReload).not.toHaveBeenCalled();
		expect(reload).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(onBeforeReload).toHaveBeenCalledOnce();
		expect(onBeforeReload.mock.calls[0]?.[0].preferences.marketing).toBe(false);
		expect(reload).toHaveBeenCalledOnce();
		expect(onBeforeReload.mock.invocationCallOrder[0]).toBeLessThan(
			reload.mock.invocationCallOrder[0] ?? 0
		);

		// A late answer after the cap must not trigger a second reload.
		finishSave({ ok: true });
		await saving;
		await vi.runAllTimersAsync();
		expect(onBeforeReload).toHaveBeenCalledOnce();
		expect(reload).toHaveBeenCalledOnce();
	});

	it('cancels a pending reload and its cap timer on dispose', async () => {
		let saves = 0;
		const kernel = createKernel({
			transport: {
				save: () => {
					saves += 1;
					if (saves === 1) {
						return Promise.resolve({ ok: true });
					}
					return new Promise<SaveResult>(() => {
						// Never settles.
					});
				},
			},
		});
		const { dispose, reload } = watch(kernel);
		await grantMarketing(kernel);

		void kernel.commands.save({ marketing: false });
		await vi.advanceTimersByTimeAsync(100);
		dispose();
		await vi.advanceTimersByTimeAsync(2000);

		expect(reload).not.toHaveBeenCalled();
	});
});

describe('watchRevocationReload with an external consent source', () => {
	const createExternalKernel = () =>
		createKernel({ initialExternalPermissions: {} });

	it('reloads once after the source withdraws a granted category', async () => {
		const kernel = createExternalKernel();
		const { onBeforeReload, reload } = watch(kernel);
		kernel.set.externalPermissions({ marketing: true, measurement: true });

		kernel.set.externalPermissions({ measurement: true });
		kernel.set.externalPermissions({});
		expect(reload).not.toHaveBeenCalled();
		await vi.runAllTimersAsync();

		expect(onBeforeReload).toHaveBeenCalledOnce();
		expect(onBeforeReload.mock.calls[0]?.[0].preferences).toMatchObject({
			marketing: false,
			measurement: false,
		});
		expect(reload).toHaveBeenCalledOnce();
	});

	it('does not reload when the source only grants', async () => {
		const kernel = createExternalKernel();
		const { reload } = watch(kernel);

		kernel.set.externalPermissions({ marketing: true });
		kernel.set.externalPermissions({ marketing: true, measurement: true });
		await vi.runAllTimersAsync();

		expect(reload).not.toHaveBeenCalled();
	});

	it('does not reload when disabled', async () => {
		const kernel = createExternalKernel();
		const { onBeforeReload, reload } = watch(kernel, { enabled: false });
		kernel.set.externalPermissions({ marketing: true });

		kernel.set.externalPermissions({});
		await vi.runAllTimersAsync();

		expect(onBeforeReload).not.toHaveBeenCalled();
		expect(reload).not.toHaveBeenCalled();
	});

	it('cancels a pending reload on dispose', async () => {
		const kernel = createExternalKernel();
		const { dispose, reload } = watch(kernel);
		kernel.set.externalPermissions({ marketing: true });

		kernel.set.externalPermissions({});
		dispose();
		await vi.runAllTimersAsync();

		expect(reload).not.toHaveBeenCalled();
	});
});

describe('an opt-out click while an external consent source owns consent', () => {
	it('reloads nothing, writes no marker and asks the source for its preferences', async () => {
		const kernel = createKernel({
			initialExternalPermissions: { marketing: true, measurement: true },
			initialPolicyResolution: matchedResolution(
				optOutRule({ categories: ['marketing', 'measurement'] })
			),
		});
		const { reload } = watch(kernel);
		const requested = vi.fn();
		kernel.events.on('preferences:requested', requested);

		await expect(optOutConsentSurface(kernel)).resolves.toEqual({
			ok: false,
			reason: 'not-available',
		});
		await vi.runAllTimersAsync();

		expect(requested).toHaveBeenCalledOnce();
		expect(reload).not.toHaveBeenCalled();
		expect(hasPendingOptOutConfirmation()).toBe(false);
		expect(isOptOutConfirmationOpen(kernel)).toBe(false);
		expect(kernel.getSnapshot().optOut).toBeNull();
	});
});

describe('watchRevocationReload with durable opt-out', () => {
	const createOptOutKernel = (
		config: Partial<KernelConfig> = {},
		outboxStore?: SaveOutboxStore
	) =>
		createKernel(
			{
				initialPolicyResolution: matchedResolution(
					optOutRule({
						categories: ['marketing', 'measurement'],
						privacySignals: {
							gpc: { denyCategories: ['marketing', 'measurement'] },
						},
					})
				),
				...config,
			},
			outboxStore
		);

	it('reloads once after a one-click opt-out turns off a granted category', async () => {
		const kernel = createOptOutKernel();
		const { onBeforeReload, reload } = watch(kernel);
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);

		await kernel.commands.optOut();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		await vi.runAllTimersAsync();

		expect(onBeforeReload).toHaveBeenCalledOnce();
		expect(onBeforeReload.mock.calls[0]?.[0].preferences.marketing).toBe(false);
		expect(reload).toHaveBeenCalledOnce();
		expect(onBeforeReload.mock.invocationCallOrder[0]).toBeLessThan(
			reload.mock.invocationCallOrder[0] ?? 0
		);
	});

	it('does not reload when marketing and measurement are already denied', async () => {
		const resolution = matchedResolution(
			optOutRule({ categories: ['marketing', 'measurement'] })
		);
		const kernel = createKernel({
			initialPolicyResolution: resolution,
			initialRecords: {
				choice: explicitChoice(
					{ marketing: false, measurement: false },
					{
						confirmedAt: NOW - 1000,
						fingerprint: resolution.fingerprints.choice,
					}
				),
			},
		});
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(kernel.getSnapshot().effectivePermissions.measurement).toBe(false);
		const { onBeforeReload, reload } = watch(kernel);

		await kernel.commands.optOut();
		await vi.runAllTimersAsync();

		expect(onBeforeReload).not.toHaveBeenCalled();
		expect(reload).not.toHaveBeenCalled();
	});

	it('does not reload on a second optOut() when a record is already held', async () => {
		const kernel = createOptOutKernel();
		const { onBeforeReload, reload } = watch(kernel);

		await kernel.commands.optOut();
		await vi.runAllTimersAsync();
		expect(reload).toHaveBeenCalledOnce();

		reload.mockClear();
		onBeforeReload.mockClear();

		const second = await kernel.commands.optOut();
		expect(second).toMatchObject({ changed: false, ok: true });
		await vi.runAllTimersAsync();

		expect(onBeforeReload).not.toHaveBeenCalled();
		expect(reload).not.toHaveBeenCalled();
	});

	it('does not reload when a Global Privacy Control signal records an opt-out', async () => {
		const kernel = createOptOutKernel();
		(kernel as InternalKernel).markLive();
		const { onBeforeReload, reload } = watch(kernel);
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);

		kernel.set.privacySignals({ gpc: true });
		await vi.runAllTimersAsync();

		expect(kernel.getSnapshot().optOut?.method).toBe('gpc');
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(onBeforeReload).not.toHaveBeenCalled();
		expect(reload).not.toHaveBeenCalled();
	});

	it('does not reload when an opt-out is applied from a backend answer', async () => {
		const resolution = matchedResolution(
			optOutRule({ categories: ['marketing', 'measurement'] })
		);
		const kernel = createOptOutKernel({
			transport: {
				init: () =>
					Promise.resolve({
						location: { countryCode: 'US', regionCode: 'CA' },
						policyResolution: resolution,
						records: {
							optOut: {
								heldBy: 'person',
								method: 'api',
								recordedAt: NOW - 1000,
								rights: ['sale', 'share'],
							},
						},
					}),
			},
		});
		const { onBeforeReload, reload } = watch(kernel);
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);

		await kernel.commands.init();
		await vi.runAllTimersAsync();

		expect(kernel.getSnapshot().optOut?.method).toBe('api');
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(onBeforeReload).not.toHaveBeenCalled();
		expect(reload).not.toHaveBeenCalled();
	});

	it('does not reload on optIn() or a save that lifts an opt-out', async () => {
		const heldOptOut = {
			heldBy: 'device' as const,
			method: 'button' as const,
			recordedAt: NOW - 1000,
			rights: ['sale', 'share'] as ('sale' | 'share')[],
		};

		const optInKernel = createOptOutKernel({
			initialRecords: { optOut: heldOptOut },
		});
		const optInWatcher = watch(optInKernel);
		await optInKernel.commands.optIn();
		await vi.runAllTimersAsync();
		expect(optInKernel.getSnapshot().optOut).toBeNull();
		expect(optInKernel.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(optInWatcher.onBeforeReload).not.toHaveBeenCalled();
		expect(optInWatcher.reload).not.toHaveBeenCalled();

		const saveKernel = createOptOutKernel({
			initialRecords: { optOut: heldOptOut },
		});
		const saveWatcher = watch(saveKernel);
		await saveKernel.commands.save({ marketing: true });
		await vi.runAllTimersAsync();
		expect(saveKernel.getSnapshot().optOut).toBeNull();
		expect(saveKernel.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(saveWatcher.onBeforeReload).not.toHaveBeenCalled();
		expect(saveWatcher.reload).not.toHaveBeenCalled();
	});

	it('does not reload on optOut() when disabled', async () => {
		const kernel = createOptOutKernel();
		const { onBeforeReload, reload } = watch(kernel, { enabled: false });

		await kernel.commands.optOut();
		await vi.runAllTimersAsync();

		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(onBeforeReload).not.toHaveBeenCalled();
		expect(reload).not.toHaveBeenCalled();
	});

	it('does not reload on optOut() under an opt-in policy', async () => {
		const kernel = createKernel();
		const { onBeforeReload, reload } = watch(kernel);
		await grantMarketing(kernel);

		const result = await kernel.commands.optOut();
		await vi.runAllTimersAsync();

		expect(result).toEqual({ ok: false, reason: 'not-available' });
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(onBeforeReload).not.toHaveBeenCalled();
		expect(reload).not.toHaveBeenCalled();
	});

	it('waits for the opt-out request up to the cap before reloading and replays a failed opt-out on a new kernel', async () => {
		const outboxStore = createMemoryOutboxStore();
		let finishOptOut: (result: OptOutTransportResult) => void = () => undefined;
		const sentKeys: string[] = [];
		const first = createOptOutKernel(
			{
				transport: {
					optOut: (payload) => {
						sentKeys.push(payload.idempotencyKey);
						return new Promise<OptOutTransportResult>((resolve) => {
							finishOptOut = resolve;
						});
					},
				},
			},
			outboxStore
		);
		const { reload } = watch(first);

		const optingOut = first.commands.optOut();
		await vi.advanceTimersByTimeAsync(500);
		expect(sentKeys).toHaveLength(1);
		expect(reload).not.toHaveBeenCalled();

		// Request fails before the cap: reload happens then, and the entry remains
		// queued in the outbox store for the next load.
		finishOptOut({ ok: false });
		await optingOut;
		await vi.advanceTimersByTimeAsync(0);
		expect(reload).toHaveBeenCalledOnce();

		// A new kernel over the same outbox store replays the failed opt-out
		// with the same idempotency key.
		vi.useRealTimers();
		const replayedKeys: string[] = [];
		const second = createOptOutKernel(
			{
				transport: {
					optOut: (payload) => {
						replayedKeys.push(payload.idempotencyKey);
						return Promise.resolve({ ok: true });
					},
				},
			},
			outboxStore
		);
		await second.commands.init();
		await vi.waitFor(() => {
			expect(replayedKeys).toEqual(sentKeys);
		});
	});

	it('reloads at 1,000 ms after onBeforeConsentRevocationReload when an opt-out request never settles', async () => {
		let finishOptOut: (result: OptOutTransportResult) => void = () => undefined;
		const kernel = createOptOutKernel({
			transport: {
				optOut: () =>
					new Promise<OptOutTransportResult>((resolve) => {
						finishOptOut = resolve;
					}),
			},
		});
		const { onBeforeReload, reload } = watch(kernel);

		const optingOut = kernel.commands.optOut();
		await vi.advanceTimersByTimeAsync(999);
		expect(onBeforeReload).not.toHaveBeenCalled();
		expect(reload).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(onBeforeReload).toHaveBeenCalledOnce();
		expect(onBeforeReload.mock.calls[0]?.[0].preferences.marketing).toBe(false);
		expect(reload).toHaveBeenCalledOnce();
		expect(onBeforeReload.mock.invocationCallOrder[0]).toBeLessThan(
			reload.mock.invocationCallOrder[0] ?? 0
		);

		finishOptOut({ ok: true });
		await optingOut;
		await vi.runAllTimersAsync();
		expect(onBeforeReload).toHaveBeenCalledOnce();
		expect(reload).toHaveBeenCalledOnce();
	});

	it('reloads once when a save refuses marketing under an opt-out rule and also records an opt-out', async () => {
		const kernel = createOptOutKernel();
		const { onBeforeReload, reload } = watch(kernel);
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);

		await kernel.commands.save({ marketing: false });
		await vi.runAllTimersAsync();

		expect(kernel.getSnapshot().optOut?.method).toBe('button');
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(onBeforeReload).toHaveBeenCalledOnce();
		expect(reload).toHaveBeenCalledOnce();
	});

	it('waits for a pending opt-out request started by save() up to the cap and resolves save() first', async () => {
		let finishOptOut: (result: OptOutTransportResult) => void = () => undefined;
		const optOut = vi.fn(
			() =>
				new Promise<OptOutTransportResult>((resolve) => {
					finishOptOut = resolve;
				})
		);
		const kernel = createOptOutKernel({
			transport: {
				optOut,
				save: () => Promise.resolve({ ok: true }),
			},
		});
		const { onBeforeReload, reload } = watch(kernel);
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);

		const saving = kernel.commands.save({ marketing: false });
		await vi.advanceTimersByTimeAsync(0);
		const saveResult = await saving;
		expect(saveResult.ok).toBe(true);
		expect(optOut).toHaveBeenCalledOnce();

		// The save resolved, but the opt-out request is still in flight before the cap.
		await vi.advanceTimersByTimeAsync(500);
		expect(onBeforeReload).not.toHaveBeenCalled();
		expect(reload).not.toHaveBeenCalled();

		finishOptOut({ ok: true });
		await vi.advanceTimersByTimeAsync(0);
		expect(onBeforeReload).toHaveBeenCalledOnce();
		expect(reload).toHaveBeenCalledOnce();
	});

	it('starts the 1,000 ms cap when the revoking action is recorded, not when a follow-up request starts', async () => {
		let finishSave: (result: SaveResult) => void = () => undefined;
		const liftOptOut = vi.fn(
			() =>
				new Promise<LiftOptOutTransportResult>(() => {
					// Never settles.
				})
		);
		const kernel = createKernel({
			initialPolicyResolution: matchedResolution(
				optOutRule({
					categories: ['functionality', 'marketing', 'measurement'],
					privacySignals: {
						gpc: { denyCategories: ['marketing'] },
					},
				})
			),
			initialRecords: {
				optOut: {
					heldBy: 'person',
					method: 'api',
					recordedAt: NOW - 1000,
					rights: ['sale', 'share'],
				},
			},
			transport: {
				liftOptOut,
				save: () =>
					new Promise<SaveResult>((resolve) => {
						finishSave = resolve;
					}),
			},
		});
		const { onBeforeReload, reload } = watch(kernel);

		const saving = kernel.commands.save({
			functionality: false,
			marketing: true,
		});
		await vi.advanceTimersByTimeAsync(400);
		expect(reload).not.toHaveBeenCalled();

		// Save finishes at 400 ms and starts the hanging account lift.
		finishSave({ ok: true });
		await saving;
		expect(liftOptOut).toHaveBeenCalledOnce();

		// 599 ms later (999 ms total since revocation): still waiting.
		await vi.advanceTimersByTimeAsync(599);
		expect(reload).not.toHaveBeenCalled();

		// At 1,000 ms total since revocation (not 1,000 ms after the lift started): reloads once.
		await vi.advanceTimersByTimeAsync(1);
		expect(onBeforeReload).toHaveBeenCalledOnce();
		expect(reload).toHaveBeenCalledOnce();
	});

	it('waits for a pending account opt-out lift started by save() up to the cap when another category was revoked', async () => {
		let finishLift: (result: LiftOptOutTransportResult) => void = () =>
			undefined;
		const liftOptOut = vi.fn(
			() =>
				new Promise<LiftOptOutTransportResult>((resolve) => {
					finishLift = resolve;
				})
		);
		const kernel = createKernel({
			initialPolicyResolution: matchedResolution(
				optOutRule({
					categories: ['functionality', 'marketing', 'measurement'],
					privacySignals: {
						gpc: { denyCategories: ['marketing'] },
					},
				})
			),
			initialRecords: {
				optOut: {
					heldBy: 'person',
					method: 'api',
					recordedAt: NOW - 1000,
					rights: ['sale', 'share'],
				},
			},
			transport: {
				liftOptOut,
				save: () => Promise.resolve({ ok: true }),
			},
		});
		const { onBeforeReload, reload } = watch(kernel);
		// Marketing is denied by the account-held opt-out; functionality is still granted.
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(kernel.getSnapshot().effectivePermissions.functionality).toBe(true);

		const saving = kernel.commands.save({
			functionality: false,
			marketing: true,
		});
		await vi.advanceTimersByTimeAsync(0);
		const saveResult = await saving;
		expect(saveResult.ok).toBe(true);
		expect(liftOptOut).toHaveBeenCalledOnce();

		// The save resolved, but the account opt-out lift is still in flight before the cap.
		await vi.advanceTimersByTimeAsync(500);
		expect(onBeforeReload).not.toHaveBeenCalled();
		expect(reload).not.toHaveBeenCalled();

		finishLift({ ok: true, optOut: null });
		await vi.advanceTimersByTimeAsync(0);
		expect(onBeforeReload).toHaveBeenCalledOnce();
		expect(reload).toHaveBeenCalledOnce();
	});

	it('waits for a pending device opt-out lift started by save() up to the cap when another category was revoked', async () => {
		let finishLift: (result: LiftOptOutTransportResult) => void = () =>
			undefined;
		const liftOptOut = vi.fn(
			() =>
				new Promise<LiftOptOutTransportResult>((resolve) => {
					finishLift = resolve;
				})
		);
		const kernel = createKernel({
			initialPolicyResolution: matchedResolution(
				optOutRule({
					categories: ['functionality', 'marketing', 'measurement'],
					privacySignals: {
						gpc: { denyCategories: ['marketing'] },
					},
				})
			),
			initialRecords: {
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW - 1000,
					rights: ['sale', 'share'],
				},
			},
			transport: {
				liftOptOut,
				save: () => Promise.resolve({ ok: true }),
			},
		});
		const { onBeforeReload, reload } = watch(kernel);
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(kernel.getSnapshot().effectivePermissions.functionality).toBe(true);

		const saving = kernel.commands.save({
			functionality: false,
			marketing: true,
		});
		await vi.advanceTimersByTimeAsync(0);
		const saveResult = await saving;
		expect(saveResult.ok).toBe(true);
		expect(liftOptOut).toHaveBeenCalledOnce();

		// The save resolved, but the device opt-out lift is still in flight before the cap.
		await vi.advanceTimersByTimeAsync(500);
		expect(onBeforeReload).not.toHaveBeenCalled();
		expect(reload).not.toHaveBeenCalled();

		finishLift({ ok: true, optOut: null });
		await vi.advanceTimersByTimeAsync(0);
		expect(onBeforeReload).toHaveBeenCalledOnce();
		expect(reload).toHaveBeenCalledOnce();
	});
});

describe('script loader denial callbacks before revocation reload', () => {
	const createOptOutKernel = () =>
		createKernel({
			initialPolicyResolution: matchedResolution(
				optOutRule({ categories: ['marketing', 'measurement'] })
			),
		});

	it.each(['optOut', 'saveNone'] as const)(
		'runs loaded tag onConsentChange denials before onBeforeConsentRevocationReload and reload on %s',
		async (action) => {
			const order: string[] = [];
			const kernel = createOptOutKernel();
			const reload = vi.fn(() => {
				order.push('reload');
			});
			const onBeforeReload = vi.fn(() => {
				order.push('onBeforeReload');
			});
			const disposeReload = watchRevocationReload({
				getOnBeforeReload: () => onBeforeReload,
				isEnabled: () => true,
				kernel,
				reload,
			});
			const loader = createScriptLoader({
				kernel,
				scripts: [
					{
						category: 'marketing',
						id: `marketing-tag-${action}`,
						onConsentChange: ({ consents, hasConsent }) => {
							if (!hasConsent && consents.marketing === false) {
								order.push('gated:denied');
							}
						},
						textContent: 'window.__tagLoaded = true;',
					},
					{
						alwaysLoad: true,
						category: 'marketing',
						id: `always-load-tag-${action}`,
						onConsentChange: ({ consents, hasConsent }) => {
							if (!hasConsent && consents.marketing === false) {
								order.push('alwaysLoad:denied');
							}
						},
						textContent: 'window.__alwaysLoaded = true;',
					},
				],
			});
			try {
				expect(loader.getLoadedScriptIds()).toEqual(
					expect.arrayContaining([
						`marketing-tag-${action}`,
						`always-load-tag-${action}`,
					])
				);

				if (action === 'optOut') {
					await kernel.commands.optOut();
				} else {
					await kernel.commands.save('none');
				}
				await vi.runAllTimersAsync();

				expect(order).toEqual([
					'gated:denied',
					'alwaysLoad:denied',
					'onBeforeReload',
					'reload',
				]);
			} finally {
				loader.dispose();
				disposeReload();
				document.head.innerHTML = '';
			}
		}
	);
});

describe('opt-out confirmation across a revocation reload', () => {
	const createOptOutKernel = (config: Partial<KernelConfig> = {}) =>
		createKernel({
			initialPolicyResolution: matchedResolution(
				optOutRule({ categories: ['marketing', 'measurement'] })
			),
			...config,
		});

	it('defers confirmation to sessionStorage when a reload is due and opens it once on the next load', async () => {
		const first = createOptOutKernel();
		const { reload } = watch(first);

		const pending = optOutConsentSurface(first);
		// Does not flash open on the old document before reload.
		expect(isOptOutConfirmationOpen(first)).toBe(false);
		expect(
			window.sessionStorage.getItem(OPT_OUT_CONFIRMATION_STORAGE_KEY)
		).toBe('1');
		expect(hasPendingOptOutConfirmation()).toBe(true);

		await pending;
		await vi.runAllTimersAsync();
		expect(reload).toHaveBeenCalledOnce();
		expect(isOptOutConfirmationOpen(first)).toBe(false);

		const recorded = first.getSnapshot().optOut;
		expect(recorded).not.toBeNull();

		// Second load with the held opt-out: opens once, clears the marker,
		// records nothing new, and does not reload again.
		const second = createOptOutKernel({
			initialRecords: { optOut: recorded ?? undefined },
		});
		const secondWatch = watch(second);
		const onRecorded = vi.fn();
		second.events.on('opt-out:recorded', onRecorded);

		const stopSecond = watchPendingOptOutConfirmation(second);
		expect(isOptOutConfirmationOpen(second)).toBe(true);
		expect(
			window.sessionStorage.getItem(OPT_OUT_CONFIRMATION_STORAGE_KEY)
		).toBeNull();
		expect(onRecorded).not.toHaveBeenCalled();
		await vi.runAllTimersAsync();
		expect(secondWatch.reload).not.toHaveBeenCalled();
		stopSecond();

		// Third load: marker is already cleared, so confirmation does not open.
		const third = createOptOutKernel({
			initialRecords: { optOut: recorded ?? undefined },
		});
		const stopThird = watchPendingOptOutConfirmation(third);
		expect(isOptOutConfirmationOpen(third)).toBe(false);
		stopThird();
	});

	const createSaleRightKernel = (config: Partial<KernelConfig> = {}) =>
		createKernel({
			consentCategories: ['necessary', 'marketing', 'measurement'],
			initialPolicyResolution: matchedResolution(
				optOutRule({
					categories: ['marketing', 'measurement'],
					privacySignals: { gpc: { denyCategories: ['marketing'] } },
				})
			),
			...config,
		});

	it('[RIGHT-08] a Privacy Choices opt-out sets the marker when it reloads, so the next load opens the receipt', async () => {
		const first = createSaleRightKernel();
		const { reload } = watch(first);
		first.set.activeUI('dialog');

		const { outcome, result } = pressSaleRight(first, 'protect');
		expect(outcome).toBe('apply-protect');
		// The dialog stays open on this document: no flash of anything else.
		expect(isOptOutConfirmationOpen(first)).toBe(false);
		expect(first.getSnapshot().activeUI).toBe('dialog');
		expect(hasPendingOptOutConfirmation()).toBe(true);

		await result;
		await vi.runAllTimersAsync();
		// The reload is not delayed for the marker.
		expect(reload).toHaveBeenCalledOnce();

		const second = createSaleRightKernel({
			initialRecords: { optOut: first.getSnapshot().optOut ?? undefined },
		});
		const stop = watchPendingOptOutConfirmation(second);
		expect(isOptOutConfirmationOpen(second)).toBe(true);
		expect(hasPendingOptOutConfirmation()).toBe(false);
		stop();
	});

	it('[RIGHT-08] a Privacy Choices opt-out sets no marker when no reload is due', async () => {
		const kernel = createSaleRightKernel();
		watch(kernel, { enabled: false });
		kernel.set.activeUI('dialog');
		await pressSaleRight(kernel, 'protect').result;
		expect(hasPendingOptOutConfirmation()).toBe(false);
		expect(isOptOutConfirmationOpen(kernel)).toBe(false);
	});

	it('opens confirmation immediately when reload is disabled or nothing granted was turned off', async () => {
		const disabled = createOptOutKernel();
		watch(disabled, { enabled: false });
		await optOutConsentSurface(disabled);
		expect(isOptOutConfirmationOpen(disabled)).toBe(true);
		expect(hasPendingOptOutConfirmation()).toBe(false);

		const alreadyDenied = createOptOutKernel({
			initialRecords: {
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW - 1000,
					rights: ['sale', 'share'],
				},
			},
		});
		watch(alreadyDenied);
		await optOutConsentSurface(alreadyDenied);
		expect(isOptOutConfirmationOpen(alreadyDenied)).toBe(true);
		expect(hasPendingOptOutConfirmation()).toBe(false);
	});

	/** A later load in the same tab that holds `kernel`'s opt-out record. */
	const laterLoadOpensConfirmation = (
		kernel: ReturnType<typeof createKernel>
	) => {
		const later = createOptOutKernel({
			initialRecords: { optOut: kernel.getSnapshot().optOut ?? undefined },
		});
		const stop = watchPendingOptOutConfirmation(later);
		const open = isOptOutConfirmationOpen(later);
		stop();
		return open;
	};

	it.each([
		['before the opt-out command completes', false],
		['after the reload is scheduled', true],
	] as const)(
		'clears the marker and opens confirmation at once when reloads are switched off %s',
		async (_when, afterScheduled) => {
			const kernel = createOptOutKernel();
			let enabled = true;
			const reload = vi.fn();
			watchRevocationReload({
				isEnabled: () => enabled,
				kernel,
				reload,
			});

			const pending = optOutConsentSurface(kernel);
			expect(hasPendingOptOutConfirmation()).toBe(true);
			expect(isOptOutConfirmationOpen(kernel)).toBe(false);
			if (afterScheduled) {
				await pending;
			}
			enabled = false;
			await pending;
			await vi.runAllTimersAsync();

			expect(reload).not.toHaveBeenCalled();
			expect(hasPendingOptOutConfirmation()).toBe(false);
			expect(isOptOutConfirmationOpen(kernel)).toBe(true);
			expect(laterLoadOpensConfirmation(kernel)).toBe(false);
		}
	);

	it('clears the marker when the watcher is disposed before a due reload fires', async () => {
		const kernel = createOptOutKernel();
		const { dispose, reload } = watch(kernel);

		const pending = optOutConsentSurface(kernel);
		expect(hasPendingOptOutConfirmation()).toBe(true);
		await pending;
		dispose();
		await vi.runAllTimersAsync();

		expect(reload).not.toHaveBeenCalled();
		expect(hasPendingOptOutConfirmation()).toBe(false);
		expect(kernel.getSnapshot().optOut).not.toBeNull();
		expect(laterLoadOpensConfirmation(kernel)).toBe(false);
	});

	it('keeps the marker when one of two watchers is disposed and the other still reloads', async () => {
		const kernel = createOptOutKernel();
		const first = watch(kernel);
		const second = watch(kernel);

		const pending = optOutConsentSurface(kernel);
		await pending;
		first.dispose();
		expect(hasPendingOptOutConfirmation()).toBe(true);
		await vi.runAllTimersAsync();

		expect(second.reload).toHaveBeenCalledOnce();
		expect(hasPendingOptOutConfirmation()).toBe(true);
		second.dispose();
	});

	it('does not reload again for an opt-out on a page that came back from an opt-out reload with the marker present', async () => {
		// The page reloaded for an opt-out, and the record did not survive:
		// storage kept nothing, or the site cleared it. The opt-out runs again
		// before the marker is consumed.
		markPendingOptOutConfirmation();
		const kernel = createOptOutKernel();
		const { onBeforeReload, reload } = watch(kernel);

		await optOutConsentSurface(kernel);
		await vi.runAllTimersAsync();

		expect(reload).not.toHaveBeenCalled();
		expect(onBeforeReload).not.toHaveBeenCalled();
		expect(kernel.getSnapshot().optOut).not.toBeNull();
		expect(isOptOutConfirmationOpen(kernel)).toBe(true);
		expect(hasPendingOptOutConfirmation()).toBe(false);
	});

	it('does not reload again once the reloaded page found no opt-out for its marker', async () => {
		markPendingOptOutConfirmation();
		const kernel = createOptOutKernel();
		const stop = watchPendingOptOutConfirmation(kernel);
		expect(hasPendingOptOutConfirmation()).toBe(false);
		expect(isOptOutConfirmationOpen(kernel)).toBe(false);
		const { reload } = watch(kernel);

		await optOutConsentSurface(kernel);
		await vi.runAllTimersAsync();

		expect(reload).not.toHaveBeenCalled();
		expect(isOptOutConfirmationOpen(kernel)).toBe(true);
		expect(hasPendingOptOutConfirmation()).toBe(false);
		stop();
	});

	it('ignores and clears a pending marker when no opt-out is held on the new document', () => {
		markPendingOptOutConfirmation();
		const kernel = createOptOutKernel();
		const stop = watchPendingOptOutConfirmation(kernel);
		expect(isOptOutConfirmationOpen(kernel)).toBe(false);
		expect(hasPendingOptOutConfirmation()).toBe(false);
		stop();
	});

	it('degrades without throwing when sessionStorage is blocked', async () => {
		vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
			throw new DOMException('Blocked', 'SecurityError');
		});
		expect(markPendingOptOutConfirmation()).toBe(false);
		expect(hasPendingOptOutConfirmation()).toBe(false);
		expect(() => clearPendingOptOutConfirmation()).not.toThrow();

		const kernel = createOptOutKernel();
		const { reload } = watch(kernel);
		await optOutConsentSurface(kernel);
		await vi.runAllTimersAsync();
		expect(reload).toHaveBeenCalledOnce();
		expect(isOptOutConfirmationOpen(kernel)).toBe(false);

		const next = createOptOutKernel({
			initialRecords: { optOut: kernel.getSnapshot().optOut ?? undefined },
		});
		const stop = watchPendingOptOutConfirmation(next);
		expect(isOptOutConfirmationOpen(next)).toBe(false);
		stop();
	});

	it('propagates post-reload confirmation through a deferred stand-in kernel', async () => {
		const heldOptOut = {
			heldBy: 'device' as const,
			method: 'button' as const,
			recordedAt: NOW - 1000,
			rights: ['sale', 'share'] as ('sale' | 'share')[],
		};
		const real = createOptOutKernel({
			initialRecords: { optOut: heldOptOut },
		});
		const standIn = createStandInKernel({
			requestEngine: () => undefined,
			snapshot: { ...real.getSnapshot() },
		});
		const onChange = vi.fn();
		const unsubscribe = subscribeOptOutConfirmation(standIn.kernel, onChange);

		markPendingOptOutConfirmation();
		const stop = watchPendingOptOutConfirmation(real);
		expect(isOptOutConfirmationOpen(real)).toBe(true);

		standIn.attach(real);
		await Promise.resolve();
		expect(isOptOutConfirmationOpen(standIn.kernel)).toBe(true);
		expect(onChange).toHaveBeenCalled();

		closeOptOutConfirmation(standIn.kernel);
		expect(isOptOutConfirmationOpen(standIn.kernel)).toBe(false);
		expect(isOptOutConfirmationOpen(real)).toBe(false);

		unsubscribe();
		stop();
		standIn.dispose();
	});

	it('carries a standalone confirmation host claim across stand-in kernel attachment', () => {
		const real = createOptOutKernel();
		const standIn = createStandInKernel({
			requestEngine: () => undefined,
			snapshot: { ...real.getSnapshot() },
		});
		const onStandInChange = vi.fn();
		const onRealChange = vi.fn();
		const release = claimOptOutConfirmationHost(
			standIn.kernel,
			Symbol('standalone')
		);
		const unsubscribeStandIn = subscribeOptOutConfirmation(
			standIn.kernel,
			onStandInChange
		);
		const unsubscribeReal = subscribeOptOutConfirmation(real, onRealChange);

		expect(hasOptOutConfirmationHost(standIn.kernel)).toBe(true);
		expect(hasOptOutConfirmationHost(real)).toBe(false);

		standIn.attach(real);

		expect(hasOptOutConfirmationHost(standIn.kernel)).toBe(true);
		expect(hasOptOutConfirmationHost(real)).toBe(true);
		expect(onStandInChange).toHaveBeenCalled();
		expect(onRealChange).toHaveBeenCalled();

		onStandInChange.mockClear();
		onRealChange.mockClear();
		release();

		expect(hasOptOutConfirmationHost(standIn.kernel)).toBe(false);
		expect(hasOptOutConfirmationHost(real)).toBe(false);
		expect(onStandInChange).toHaveBeenCalled();
		expect(onRealChange).toHaveBeenCalled();

		unsubscribeStandIn();
		unsubscribeReal();
		standIn.dispose();
	});

	it('notifies subscribers when a confirmation open on a stand-in closes on engine attachment', async () => {
		const heldOptOut = {
			heldBy: 'device' as const,
			method: 'button' as const,
			recordedAt: NOW - 1000,
			rights: ['sale', 'share'] as ('sale' | 'share')[],
		};
		const real = createOptOutKernel({
			initialRecords: { optOut: heldOptOut },
		});
		const standIn = createStandInKernel({
			requestEngine: () => undefined,
			snapshot: { ...real.getSnapshot() },
		});
		const onChange = vi.fn();
		const unsubscribe = subscribeOptOutConfirmation(standIn.kernel, onChange);

		const pending = optOutConsentSurface(standIn.kernel);
		expect(isOptOutConfirmationOpen(standIn.kernel)).toBe(true);
		onChange.mockClear();

		standIn.attach(real);
		expect(isOptOutConfirmationOpen(standIn.kernel)).toBe(false);
		expect(onChange).toHaveBeenCalled();

		await pending;
		unsubscribe();
		standIn.dispose();
	});
});
