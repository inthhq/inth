import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	buildSnapshot,
	createFakeNativeModule,
} from '../../__tests__/helpers/fake-native';
import { resetNativeStub } from '../../__tests__/helpers/react-native-stub';
import { resetConsentClient } from '../../native/client';
import type { ConsentSnapshot } from '../../protocol';
import {
	connectAdjust,
	connectAdMob,
	connectAmplitude,
	connectAppsFlyer,
	connectBranch,
	connectBraze,
	connectFirebaseAnalytics,
	connectMetaAppEvents,
	connectMixpanel,
	connectPostHog,
	connectSentryReplay,
	connectSingular,
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
 * A vendor client that records every method call. The next call after `holdNext`
 * returns a promise that settles only when `release` runs, or never.
 */
const recorder = () => {
	const calls: string[] = [];
	let hold = false;
	let release = () => {};
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
					if (!hold) {
						return;
					}
					hold = false;
					return new Promise<void>((resolve) => {
						release = resolve;
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
		holdNext: () => {
			hold = true;
		},
		release: () => release(),
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
	['AdMob', (client, options) => connectAdMob(client, options)],
	['AppsFlyer', connectAppsFlyer],
	['Adjust', connectAdjust],
	['Meta App Events', connectMetaAppEvents],
	['Braze', connectBraze],
	['Branch', (client, options) => connectBranch(client, options)],
	['Singular', connectSingular],
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
	const grantedOnly = vendor.calls.filter((call) => !denied.includes(call));
	await integration.disconnect();
	resetConsentClient();
	resetNativeStub();
	return { denied, grantedOnly };
};

afterEach(() => {
	resetConsentClient();
	resetNativeStub();
	revision = 0;
});

describe.each(helpers)('%s', (_name, connect) => {
	test('withdrawal runs at once while a grant-time vendor promise never settles', async () => {
		const { denied, grantedOnly } = await profile(connect);
		expect(grantedOnly.length).toBeGreaterThan(0);

		const fake = createFakeNativeModule({ snapshot: permissions(false) });
		const vendor = recorder();
		const integration = connect(vendor.client as never, { onError: vi.fn() });
		await integration.ready;
		vendor.holdNext();
		fake.pushSnapshot(permissions(true));
		await settle(vendor.calls);

		const mark = vendor.calls.length;
		fake.pushSnapshot(permissions(false));
		await settle(vendor.calls);
		const beforeRelease = vendor.calls.slice(mark);
		expect(
			beforeRelease
				.filter((call) => denied.includes(call))
				.slice(0, denied.length)
		).toEqual(denied);

		vendor.release();
		await settle(vendor.calls);
		const afterWithdrawal = vendor.calls.slice(mark);
		expect(
			afterWithdrawal.filter((call) => grantedOnly.includes(call))
		).toEqual([]);
		expect(afterWithdrawal.slice(-denied.length)).toEqual(denied);
		await integration.disconnect();
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
