import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	buildSnapshot,
	createFakeNativeModule,
} from '../../__tests__/helpers/fake-native';
import { resetNativeStub } from '../../__tests__/helpers/react-native-stub';
import { resetConsentClient } from '../../native/client';
import type { ConsentSnapshot } from '../../protocol';
import {
	connectAmplitude,
	connectFirebaseAnalytics,
	connectMixpanel,
	connectPostHog,
	connectSentryReplay,
} from '../index';
import type { AnalyticsIntegrationOptions, ConsentIntegration } from '../index';

let revision = 0;

const permissions = (granted: boolean): ConsentSnapshot => {
	revision += 1;
	const initial = buildSnapshot();
	return buildSnapshot({
		effectivePermissions: {
			...initial.effectivePermissions,
			experience: granted,
			functionality: granted,
			marketing: granted,
			measurement: granted,
		},
		revision,
	});
};

/** A snapshot granting exactly the named categories. */
const granting = (
	...categories: ('marketing' | 'measurement')[]
): ConsentSnapshot => {
	revision += 1;
	const initial = buildSnapshot();
	return buildSnapshot({
		effectivePermissions: {
			...initial.effectivePermissions,
			experience: false,
			functionality: false,
			marketing: categories.includes('marketing'),
			measurement: categories.includes('measurement'),
		},
		revision,
	});
};

const tick = () =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});

/** Wait until no new vendor call arrives for a tick. */
const settle = async (calls: readonly string[]): Promise<void> => {
	const { length } = calls;
	await tick();
	if (calls.length !== length) {
		await settle(calls);
	}
};

/**
 * A vendor client that records every method call. `holdNext(skip)` holds the
 * call `skip` calls from now: it returns a promise that settles only when the
 * release function `takeRelease` hands out runs, or never.
 */
const recorder = () => {
	const calls: string[] = [];
	let holdIn: number | undefined;
	let pending: (() => void) | undefined;
	let fail: string | undefined;
	const client = new Proxy(
		{},
		{
			get:
				(_target, name) =>
				(...args: unknown[]): Promise<void> | undefined => {
					const call = `${String(name)}:${JSON.stringify(args)}`;
					if (call === fail) {
						return Promise.reject(new Error(`vendor rejected ${call}`));
					}
					calls.push(call);
					if (holdIn === undefined) {
						return;
					}
					if (holdIn > 0) {
						holdIn -= 1;
						return;
					}
					holdIn = undefined;
					return new Promise<void>((resolve) => {
						pending = resolve;
					});
				},
		}
	);
	return {
		calls,
		client,
		failOn: (call: string | undefined) => {
			fail = call;
		},
		holdNext: (skip = 0) => {
			holdIn = skip;
		},
		takeRelease: (): (() => void) => {
			const release = pending ?? (() => {});
			pending = undefined;
			return release;
		},
	};
};

type Connect = (
	client: never,
	options: AnalyticsIntegrationOptions
) => ConsentIntegration;

const helpers: readonly (readonly [string, Connect])[] = [
	['Firebase', (client, options) => connectFirebaseAnalytics(client, options)],
	['PostHog', connectPostHog],
	['Mixpanel', connectMixpanel],
	['Sentry Replay', connectSentryReplay],
	['Amplitude', connectAmplitude],
];

/** The calls a helper makes for denial, and those only a grant makes. */
const profile = async (connect: Connect) => {
	const fake = createFakeNativeModule({ snapshot: permissions(false) });
	const vendor = recorder();
	const integration = connect(vendor.client as never, { onError: vi.fn() });
	await integration.ready;
	const denied = [...vendor.calls];
	vendor.calls.length = 0;
	fake.pushSnapshot(permissions(true));
	await settle(vendor.calls);
	const grantCalls = [...vendor.calls];
	const grantedOnly = grantCalls.filter((call) => !denied.includes(call));
	await integration.disconnect();
	resetConsentClient();
	resetNativeStub();
	return { denied, grantCalls, grantedOnly };
};

afterEach(() => {
	resetConsentClient();
	resetNativeStub();
	revision = 0;
});

describe.each(helpers)('%s', (_name, connect) => {
	test('withdrawal runs at once while any grant-time vendor promise never settles', async () => {
		const { denied, grantCalls, grantedOnly } = await profile(connect);
		expect(grantedOnly.length).toBeGreaterThan(0);
		// Hold each grant-time call in turn, so every enabling call is shown to
		// re-read consent rather than trust a stale grant.
		// One held call at a time: the cases share the fake native module.
		const holdFrom = async (held: number): Promise<void> => {
			if (held >= grantCalls.length) {
				return;
			}
			const fake = createFakeNativeModule({ snapshot: permissions(false) });
			const vendor = recorder();
			const integration = connect(vendor.client as never, {
				onError: vi.fn(),
			});
			await integration.ready;
			vendor.holdNext(held);
			fake.pushSnapshot(permissions(true));
			await settle(vendor.calls);
			const release = vendor.takeRelease();

			const mark = vendor.calls.length;
			fake.pushSnapshot(permissions(false));
			await settle(vendor.calls);
			expect(
				vendor.calls
					.slice(mark)
					.filter((call) => denied.includes(call))
					.slice(0, denied.length),
				`denial ran while grant call ${held} was held`
			).toEqual(denied);

			release();
			await settle(vendor.calls);
			const afterWithdrawal = vendor.calls.slice(mark);
			expect(
				afterWithdrawal.filter((call) => grantedOnly.includes(call)),
				`no grant-only call after withdrawal, holding grant call ${held}`
			).toEqual([]);
			expect(afterWithdrawal.slice(-denied.length)).toEqual(denied);
			await integration.disconnect();
			resetConsentClient();
			resetNativeStub();
			await holdFrom(held + 1);
		};
		await holdFrom(0);
	});

	test('a regrant waits for a pending preempting withdrawal, then applies', async () => {
		const { grantedOnly } = await profile(connect);
		const fake = createFakeNativeModule({ snapshot: permissions(false) });
		const vendor = recorder();
		const integration = connect(vendor.client as never, { onError: vi.fn() });
		await integration.ready;
		vendor.holdNext();
		fake.pushSnapshot(permissions(true));
		await settle(vendor.calls);
		const releaseGrant = vendor.takeRelease();

		vendor.holdNext();
		fake.pushSnapshot(permissions(false));
		await settle(vendor.calls);
		const releaseWithdrawal = vendor.takeRelease();

		releaseGrant();
		await settle(vendor.calls);
		const mark = vendor.calls.length;
		fake.pushSnapshot(permissions(true));
		await settle(vendor.calls);
		expect(
			vendor.calls.slice(mark).filter((call) => grantedOnly.includes(call)),
			'the regrant must not overtake the pending withdrawal'
		).toEqual([]);

		releaseWithdrawal();
		await settle(vendor.calls);
		const afterRelease = vendor.calls.slice(mark);
		expect(
			grantedOnly.every((call) => afterRelease.includes(call)),
			'the regrant applies once the withdrawal settles'
		).toBe(true);
		const lastDenial = Math.max(
			...afterRelease.map((call, index) =>
				grantedOnly.includes(call) ? -1 : index
			)
		);
		const lastGrant = Math.max(
			...afterRelease.map((call, index) =>
				grantedOnly.includes(call) ? index : -1
			)
		);
		expect(lastGrant).toBeGreaterThan(lastDenial);
		await integration.disconnect();
	});

	test('a second withdrawal runs at once after the first preempting withdrawal settled', async () => {
		// The calls a withdrawal of measurement makes from a measurement-only grant.
		const probeFake = createFakeNativeModule({ snapshot: granting() });
		const probe = recorder();
		const probeIntegration = connect(probe.client as never, {
			category: 'measurement',
			onError: vi.fn(),
		});
		await probeIntegration.ready;
		probeFake.pushSnapshot(granting('measurement', 'marketing'));
		await settle(probe.calls);
		const grantCalls = probe.calls.splice(0);
		probeFake.pushSnapshot(granting('measurement'));
		await settle(probe.calls);
		probe.calls.length = 0;
		probeFake.pushSnapshot(granting());
		await settle(probe.calls);
		const stops = probe.calls.splice(0);
		await probeIntegration.disconnect();
		resetConsentClient();
		resetNativeStub();

		// Hold each grant-time call in turn, forever: withdraw marketing, let that
		// withdrawal settle, then withdraw measurement.
		const holdFrom = async (held: number): Promise<void> => {
			if (held >= grantCalls.length) {
				return;
			}
			const fake = createFakeNativeModule({ snapshot: granting() });
			const vendor = recorder();
			const integration = connect(vendor.client as never, {
				category: 'measurement',
				onError: vi.fn(),
			});
			await integration.ready;
			vendor.holdNext(held);
			fake.pushSnapshot(granting('measurement', 'marketing'));
			await settle(vendor.calls);
			fake.pushSnapshot(granting('measurement'));
			await settle(vendor.calls);
			const mark = vendor.calls.length;
			fake.pushSnapshot(granting());
			await settle(vendor.calls);
			expect(
				vendor.calls
					.slice(mark)
					.filter((call) => stops.includes(call))
					.slice(0, stops.length),
				`measurement's stop calls ran while grant call ${held} was held`
			).toEqual(stops);
			await integration.disconnect();
			resetConsentClient();
			resetNativeStub();
			await holdFrom(held + 1);
		};
		await holdFrom(0);
	});

	test('a failing first denial call does not skip the rest and is reported', async () => {
		const { denied } = await profile(connect);
		const fake = createFakeNativeModule({ snapshot: permissions(true) });
		const vendor = recorder();
		const onError = vi.fn();
		const integration = connect(vendor.client as never, { onError });
		await integration.ready;
		await settle(vendor.calls);
		const mark = vendor.calls.length;
		vendor.failOn(denied[0]);
		fake.pushSnapshot(permissions(false));
		await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
		await settle(vendor.calls);
		expect(vendor.calls.slice(mark)).toEqual(denied.slice(1));
		expect(onError).toHaveBeenCalledWith(
			new Error(`vendor rejected ${denied[0]}`)
		);
		vendor.failOn(undefined);
		await integration.disconnect();
	});
});
