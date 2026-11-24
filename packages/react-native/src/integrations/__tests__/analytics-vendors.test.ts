import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import {
	buildSnapshot,
	createFakeNativeModule,
} from '../../__tests__/helpers/fake-native';
import { resetNativeStub } from '../../__tests__/helpers/react-native-stub';
import { resetConsentClient } from '../../native/client';
import type { ConsentSnapshot } from '../../protocol';
import {
	connectAmplitude,
	connectMixpanel,
	connectSentryReplay,
} from '../index';
import type { AnalyticsIntegrationOptions } from '../index';

const snapshot = (revision: number, measurement: boolean): ConsentSnapshot => {
	const initial = buildSnapshot();
	return buildSnapshot({
		effectivePermissions: { ...initial.effectivePermissions, measurement },
		revision,
	});
};

const deferred = () => {
	let release = () => {};
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release };
};

const vendors = [
	{
		connect: (
			apply: (allowed: boolean) => void | Promise<void>,
			options: AnalyticsIntegrationOptions
		) =>
			connectMixpanel(
				{
					optInTracking: () => apply(true),
					optOutTracking: () => apply(false),
				},
				options
			),
		name: 'Mixpanel',
	},
	{
		connect: (
			apply: (allowed: boolean) => void | Promise<void>,
			options: AnalyticsIntegrationOptions
		) => connectAmplitude({ setOptOut: (optOut) => apply(!optOut) }, options),
		name: 'Amplitude',
	},
	{
		connect: (
			apply: (allowed: boolean) => void | Promise<void>,
			options: AnalyticsIntegrationOptions
		) =>
			connectSentryReplay(
				{ start: () => apply(true), stop: () => apply(false) },
				options
			),
		name: 'Sentry Replay',
	},
];

afterEach(() => {
	resetConsentClient();
	resetNativeStub();
});

describe.each(vendors)('$name', ({ connect }) => {
	test('denies pending authority even when the snapshot contains a grant', async () => {
		createFakeNativeModule({
			snapshot: { ...snapshot(0, true), policyPending: true, ready: false },
		});
		const apply = vi.fn((_allowed: boolean) => {});
		const integration = connect(apply, { onError: vi.fn() });
		await integration.ready;
		expect(apply.mock.calls).toEqual([[false]]);
		await integration.disconnect();
	});

	test('applies a saved grant and submits withdrawal without flushing', async () => {
		const fake = createFakeNativeModule({ snapshot: snapshot(0, true) });
		const apply = vi.fn((_allowed: boolean) => {});
		const integration = connect(apply, { onError: vi.fn() });
		await integration.ready;
		expect(apply.mock.calls).toEqual([[true]]);
		fake.pushSnapshot(snapshot(1, false));
		await vi.waitFor(() => expect(apply.mock.calls).toEqual([[true], [false]]));
		await integration.disconnect();
	});

	test('does not repeat a grant on unrelated snapshots but supports explicit reset sync', async () => {
		const fake = createFakeNativeModule({ snapshot: snapshot(0, true) });
		let vendorAllowed = false;
		const apply = vi.fn((allowed: boolean) => {
			vendorAllowed = allowed;
		});
		const integration = connect(apply, { onError: vi.fn() });
		await integration.ready;
		fake.pushSnapshot(snapshot(1, true));
		await Promise.resolve();
		expect(apply).toHaveBeenCalledOnce();
		vendorAllowed = false;
		await integration.sync();
		expect(vendorAllowed).toBe(true);
		expect(apply).toHaveBeenCalledTimes(2);
		await integration.disconnect();
	});

	test('disconnect overrides an independent vendor reset and detaches', async () => {
		const fake = createFakeNativeModule();
		let vendorAllowed = true;
		const apply = vi.fn((allowed: boolean) => {
			vendorAllowed = allowed;
		});
		const integration = connect(apply, { onError: vi.fn() });
		await integration.ready;
		vendorAllowed = true;
		await integration.disconnect();
		expect(vendorAllowed).toBe(false);
		fake.pushSnapshot(snapshot(1, true));
		await Promise.resolve();
		expect(apply.mock.calls).toEqual([[false], [false]]);
		await integration.disconnect();
		expect(apply).toHaveBeenCalledTimes(2);
	});

	test('finishes with denial when a promise-aware grant completes after withdrawal', async () => {
		const fake = createFakeNativeModule({ snapshot: snapshot(0, true) });
		const wait = deferred();
		let vendorAllowed = false;
		const apply = vi.fn(async (allowed: boolean) => {
			if (allowed) {
				await wait.promise;
			}
			vendorAllowed = allowed;
		});
		const integration = connect(apply, { onError: vi.fn() });
		await vi.waitFor(() => expect(apply).toHaveBeenCalledWith(true));
		fake.pushSnapshot(snapshot(1, false));
		// The withdrawal does not wait for the pending grant.
		expect(apply).toHaveBeenLastCalledWith(false);
		wait.release();
		await integration.ready;
		// The grant settles after the withdrawal, and denial is applied again.
		await vi.waitFor(() => expect(vendorAllowed).toBe(false));
		expect(apply.mock.calls[0]).toEqual([true]);
		expect(apply.mock.calls.slice(1).every(([allowed]) => !allowed)).toBe(true);
		await integration.disconnect();
	});

	test('disconnects during a promise-aware grant and never submits another enable', async () => {
		const fake = createFakeNativeModule({ snapshot: snapshot(0, true) });
		const wait = deferred();
		const apply = vi.fn((allowed: boolean) =>
			allowed ? wait.promise : Promise.resolve()
		);
		const integration = connect(apply, { onError: vi.fn() });
		await vi.waitFor(() => expect(apply).toHaveBeenCalledOnce());
		const stop = integration.disconnect();
		expect(integration.disconnect()).toBe(stop);
		// Disconnect does not wait for the pending grant.
		expect(apply).toHaveBeenLastCalledWith(false);
		wait.release();
		await stop;
		fake.pushSnapshot(snapshot(1, false));
		fake.pushSnapshot(snapshot(2, true));
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 0);
		});
		expect(apply.mock.calls[0]).toEqual([true]);
		expect(apply.mock.calls.slice(1).every(([allowed]) => !allowed)).toBe(true);
	});

	test('reports vendor failures and permits explicit retry and later withdrawal', async () => {
		const fake = createFakeNativeModule({ snapshot: snapshot(0, true) });
		const failure = new Error('Vendor rejected grant');
		const onError = vi.fn();
		const apply = vi.fn((_allowed: boolean) => Promise.resolve());
		apply.mockRejectedValueOnce(failure);
		const integration = connect(apply, { onError });
		await expect(integration.ready).rejects.toBe(failure);
		expect(onError).toHaveBeenCalledWith(failure);
		await integration.sync();
		fake.pushSnapshot(snapshot(1, false));
		await vi.waitFor(() => expect(apply).toHaveBeenLastCalledWith(false));
		await integration.disconnect();
	});

	test('honors a selected optional category', async () => {
		createFakeNativeModule();
		const apply = vi.fn((_allowed: boolean) => {});
		const integration = connect(apply, {
			category: 'functionality',
			onError: vi.fn(),
		});
		await integration.ready;
		expect(apply).toHaveBeenCalledWith(true);
		await integration.disconnect();
	});
});

test('Mixpanel accepts the real void-returning API and preserves its receiver', async () => {
	createFakeNativeModule({ snapshot: snapshot(0, true) });
	const submitted: string[] = [];
	const mixpanel = {
		optInTracking() {
			this.submitted.push('opt-in');
		},
		optOutTracking() {
			this.submitted.push('opt-out');
		},
		submitted,
	};
	const integration = connectMixpanel(mixpanel, { onError: vi.fn() });
	await integration.ready;
	expect(submitted).toEqual(['opt-in']);
	await integration.disconnect();
	expect(submitted).toEqual(['opt-in', 'opt-out']);
});

test('Amplitude passes denied and granted opt-out flags with the client receiver', async () => {
	const fake = createFakeNativeModule();
	const amplitude = {
		optOut: false,
		setOptOut(optOut: boolean) {
			this.optOut = optOut;
		},
	};
	const integration = connectAmplitude(amplitude, { onError: vi.fn() });
	await integration.ready;
	expect(amplitude.optOut).toBe(true);
	fake.pushSnapshot(snapshot(1, true));
	await vi.waitFor(() => expect(amplitude.optOut).toBe(false));
	await integration.disconnect();
	expect(amplitude.optOut).toBe(true);
});

test('Sentry Replay preserves the receiver and waits for its promised stop', async () => {
	const fake = createFakeNativeModule({ snapshot: snapshot(0, true) });
	const wait = deferred();
	const replay = {
		recording: false,
		start() {
			this.recording = true;
		},
		async stop() {
			await wait.promise;
			this.recording = false;
		},
	};
	const integration = connectSentryReplay(replay, { onError: vi.fn() });
	await integration.ready;
	expect(replay.recording).toBe(true);
	fake.pushSnapshot(snapshot(1, false));
	const stop = integration.disconnect();
	await Promise.resolve();
	expect(replay.recording).toBe(true);
	wait.release();
	await stop;
	expect(replay.recording).toBe(false);
});
