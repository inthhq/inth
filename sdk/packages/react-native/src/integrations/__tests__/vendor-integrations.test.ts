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
	connectAppsFlyer,
	connectBranch,
	connectBraze,
	connectMetaAppEvents,
	connectSingular,
} from '../index';
import type { AnalyticsIntegrationOptions, GoogleAdsConsent } from '../index';

let revision = 0;

/** A resolved snapshot granting exactly the named optional categories. */
const grant = (
	...categories: (
		| 'experience'
		| 'functionality'
		| 'marketing'
		| 'measurement'
	)[]
): ConsentSnapshot => {
	revision += 1;
	const initial = buildSnapshot();
	return buildSnapshot({
		effectivePermissions: {
			...initial.effectivePermissions,
			experience: categories.includes('experience'),
			functionality: categories.includes('functionality'),
			marketing: categories.includes('marketing'),
			measurement: categories.includes('measurement'),
		},
		revision,
	});
};

const pending = (): ConsentSnapshot => ({
	...grant('marketing', 'measurement'),
	policyPending: true,
	ready: false,
});

const ads = (consent: GoogleAdsConsent) =>
	`${consent.adStorage}:${consent.adUserData}:${consent.adPersonalization}`;

const tick = () =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});

/** Wait until the vendor calls stop changing. */
const settle = async (calls: string[]): Promise<void> => {
	const { length } = calls;
	await tick();
	if (calls.length !== length) {
		await settle(calls);
	}
};

/** Record one vendor call. */
const log = (calls: string[], call: string): void => {
	calls.push(call);
};

afterEach(() => {
	resetConsentClient();
	resetNativeStub();
	revision = 0;
});

type Connect = (
	calls: string[],
	options: AnalyticsIntegrationOptions
) => ReturnType<typeof connectAdMob>;

interface VendorCase {
	readonly name: string;
	readonly connect: Connect;
	/** Calls while pending, and again on disconnect. */
	readonly denied: string[];
	/** Calls when marketing (and measurement) is granted from denied. */
	readonly granted: string[];
	/** Calls when marketing is withdrawn from a full grant. */
	readonly withdrawn: string[];
}

const cases: VendorCase[] = [
	{
		connect: (calls, options) =>
			connectAdMob(
				{ setConsent: (consent) => log(calls, `ads:${ads(consent)}`) },
				options
			),
		denied: ['ads:false:false:false'],
		granted: ['ads:true:true:true'],
		name: 'AdMob',
		withdrawn: ['ads:false:false:false'],
	},
	{
		connect: (calls, options) =>
			connectAppsFlyer(
				{
					setConsentData: (consent) => log(calls, `consent:${ads(consent)}`),
					start: () => log(calls, 'start'),
					stop: (stopped) => log(calls, `stop:${stopped}`),
				},
				options
			),
		denied: ['stop:true', 'consent:false:false:false'],
		granted: ['consent:true:true:true', 'stop:false', 'start'],
		name: 'AppsFlyer',
		withdrawn: ['stop:true', 'consent:false:false:false'],
	},
	{
		connect: (calls, options) =>
			connectAdjust(
				{
					disable: () => log(calls, 'disable'),
					enable: () => log(calls, 'enable'),
					trackThirdPartySharing: (consent) =>
						log(calls, `sharing:${ads(consent)}`),
				},
				options
			),
		denied: ['disable'],
		granted: ['enable', 'sharing:true:true:true'],
		name: 'Adjust',
		withdrawn: ['disable'],
	},
	{
		connect: (calls, options) =>
			connectMetaAppEvents(
				{
					setAdvertiserIDCollectionEnabled: (enabled) =>
						log(calls, `advertiserId:${enabled}`),
					setAutoLogAppEventsEnabled: (enabled) =>
						log(calls, `autoLog:${enabled}`),
					setLimitedDataUse: (limited) => log(calls, `ldu:${limited}`),
				},
				options
			),
		denied: ['autoLog:false', 'advertiserId:false', 'ldu:true'],
		granted: ['ldu:false', 'advertiserId:true', 'autoLog:true'],
		name: 'Meta App Events',
		withdrawn: ['autoLog:false', 'advertiserId:false', 'ldu:true'],
	},
	{
		connect: (calls, options) =>
			connectBraze(
				{
					disableSDK: () => log(calls, 'disable'),
					enableSDK: () => log(calls, 'enable'),
					setGoogleAdsConsent: (consent) => log(calls, `ads:${ads(consent)}`),
				},
				options
			),
		denied: ['disable'],
		granted: ['enable', 'ads:true:true:true'],
		name: 'Braze',
		withdrawn: ['disable'],
	},
	{
		connect: (calls, options) =>
			connectBranch(
				{
					setConsumerProtectionAttributionLevel: (level) =>
						log(calls, `level:${level}`),
					setDMAParamsForEEA: (consent) => log(calls, `dma:${ads(consent)}`),
				},
				options
			),
		denied: ['level:NONE', 'dma:false:false:false'],
		granted: ['dma:true:true:true', 'level:FULL'],
		name: 'Branch',
		withdrawn: ['level:MINIMAL', 'dma:false:false:false'],
	},
	{
		connect: (calls, options) =>
			connectSingular(
				{
					limitDataSharing: (limit) => log(calls, `limit:${limit}`),
					resumeAllTracking: () => log(calls, 'resume'),
					stopAllTracking: () => log(calls, 'stop'),
					trackingOptIn: () => log(calls, 'optIn'),
				},
				options
			),
		denied: ['stop', 'limit:true'],
		granted: ['limit:false', 'resume', 'optIn'],
		name: 'Singular',
		withdrawn: ['stop', 'limit:true'],
	},
];

const vendor = (name: string): VendorCase => {
	const found = cases.find((entry) => entry.name === name);
	if (!found) {
		throw new Error(`No test case for ${name}`);
	}
	return found;
};

describe.each(cases)('$name', ({ connect, denied, granted, withdrawn }) => {
	test('denies pending authority even when the snapshot contains a grant', async () => {
		createFakeNativeModule({ snapshot: pending() });
		const calls: string[] = [];
		const integration = connect(calls, { onError: vi.fn() });
		await integration.ready;
		expect(calls).toEqual(denied);
		calls.length = 0;
		await integration.disconnect();
		expect(calls).toEqual(denied);
	});

	test('applies a grant and its withdrawal in order', async () => {
		const fake = createFakeNativeModule({ snapshot: grant() });
		const calls: string[] = [];
		const integration = connect(calls, { onError: vi.fn() });
		await integration.ready;
		calls.length = 0;
		fake.pushSnapshot(grant('marketing', 'measurement'));
		await settle(calls);
		expect(calls.splice(0)).toEqual(granted);
		fake.pushSnapshot(grant('measurement'));
		await settle(calls);
		expect(calls.splice(0)).toEqual(withdrawn);
		await integration.disconnect();
	});

	test('ignores a change to a category it does not read', async () => {
		const fake = createFakeNativeModule({ snapshot: grant('marketing') });
		const calls: string[] = [];
		const integration = connect(calls, { onError: vi.fn() });
		await integration.ready;
		calls.length = 0;
		fake.pushSnapshot(grant('marketing', 'experience'));
		await settle(calls);
		expect(calls).toEqual([]);
		await integration.disconnect();
	});
});

describe('a marketing-only change after a grant', () => {
	test('AppsFlyer sends consent without starting again', async () => {
		const fake = createFakeNativeModule({ snapshot: grant('measurement') });
		const calls: string[] = [];
		const integration = vendor('AppsFlyer').connect(calls, {
			category: 'measurement',
			onError: vi.fn(),
		});
		await integration.ready;
		expect(calls.splice(0)).toEqual([
			'consent:false:false:false',
			'stop:false',
			'start',
		]);
		fake.pushSnapshot(grant('measurement', 'marketing'));
		await settle(calls);
		expect(calls.splice(0)).toEqual(['consent:true:true:true']);
		fake.pushSnapshot(grant('measurement'));
		await settle(calls);
		expect(calls.splice(0)).toEqual(['consent:false:false:false']);
		await integration.sync();
		expect(calls.splice(0)).toEqual([
			'consent:false:false:false',
			'stop:false',
			'start',
		]);
		await integration.disconnect();
	});

	test('Adjust shares again without enabling again', async () => {
		const fake = createFakeNativeModule({ snapshot: grant('measurement') });
		const calls: string[] = [];
		const integration = vendor('Adjust').connect(calls, {
			category: 'measurement',
			onError: vi.fn(),
		});
		await integration.ready;
		calls.length = 0;
		fake.pushSnapshot(grant('measurement', 'marketing'));
		await settle(calls);
		expect(calls).toEqual(['sharing:true:true:true']);
		await integration.disconnect();
	});

	test('Braze records attributes without enabling again', async () => {
		const fake = createFakeNativeModule({ snapshot: grant('functionality') });
		const calls: string[] = [];
		const integration = vendor('Braze').connect(calls, {
			category: 'functionality',
			onError: vi.fn(),
		});
		await integration.ready;
		expect(calls.splice(0)).toEqual(['enable', 'ads:false:false:false']);
		fake.pushSnapshot(grant('functionality', 'marketing'));
		await settle(calls);
		expect(calls.splice(0)).toEqual(['ads:true:true:true']);
		// Braze still runs, so the denial is written.
		fake.pushSnapshot(grant('functionality'));
		await settle(calls);
		expect(calls.splice(0)).toEqual(['ads:false:false:false']);
		await integration.disconnect();
		expect(calls).toEqual(['disable']);
	});

	test('Branch raises measurement-only attribution to full', async () => {
		const fake = createFakeNativeModule({ snapshot: grant('measurement') });
		const calls: string[] = [];
		const integration = vendor('Branch').connect(calls, { onError: vi.fn() });
		await integration.ready;
		expect(calls.splice(0)).toEqual(['level:MINIMAL', 'dma:false:false:false']);
		fake.pushSnapshot(grant('measurement', 'marketing'));
		await settle(calls);
		expect(calls).toEqual(['dma:true:true:true', 'level:FULL']);
		await integration.disconnect();
	});

	test('Singular changes only the sharing limit', async () => {
		const fake = createFakeNativeModule({ snapshot: grant('measurement') });
		const calls: string[] = [];
		const integration = vendor('Singular').connect(calls, {
			category: 'measurement',
			onError: vi.fn(),
		});
		await integration.ready;
		expect(calls.splice(0)).toEqual(['limit:true', 'resume', 'optIn']);
		fake.pushSnapshot(grant('measurement', 'marketing'));
		await settle(calls);
		expect(calls).toEqual(['limit:false']);
		await integration.disconnect();
	});
});

test('AppsFlyer stops when consent is withdrawn while start is pending', async () => {
	const fake = createFakeNativeModule({ snapshot: grant() });
	const calls: string[] = [];
	let release = () => {};
	const integration = connectAppsFlyer(
		{
			setConsentData: (consent) => log(calls, `consent:${consent.adUserData}`),
			start: () => {
				calls.push('start');
				return new Promise<void>((resolve) => {
					release = resolve;
				});
			},
			stop: (stopped) => log(calls, `stop:${stopped}`),
		},
		{ onError: vi.fn() }
	);
	await integration.ready;
	calls.length = 0;
	fake.pushSnapshot(grant('marketing'));
	await vi.waitFor(() => expect(calls).toContain('start'));
	fake.pushSnapshot(grant());
	release();
	await settle(calls);
	expect(calls).toEqual([
		'consent:true',
		'stop:false',
		'start',
		'stop:true',
		'consent:false',
	]);
	await integration.disconnect();
});

test('vendor helpers reject necessary as their category', () => {
	createFakeNativeModule();
	expect(() =>
		connectAppsFlyer(
			{ setConsentData: vi.fn(), start: vi.fn(), stop: vi.fn() },
			// @ts-expect-error An always-allowed category cannot gate a vendor.
			{ category: 'necessary', onError: vi.fn() }
		)
	).toThrow(TypeError);
});

describe('withdrawal still restricts collection when a vendor call fails', () => {
	test('AppsFlyer sends denied consent when stop rejects, and reports it', async () => {
		const fake = createFakeNativeModule({ snapshot: grant('marketing') });
		const calls: string[] = [];
		const failure = new Error('AppsFlyer rejected stop');
		const onError = vi.fn();
		const integration = connectAppsFlyer(
			{
				setConsentData: (consent) =>
					log(calls, `consent:${consent.adUserData}`),
				start: () => log(calls, 'start'),
				stop: (stopped) =>
					stopped ? Promise.reject(failure) : log(calls, 'stop:false'),
			},
			{ onError }
		);
		await integration.ready;
		calls.length = 0;
		fake.pushSnapshot(grant());
		await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
		expect(calls).toEqual(['consent:false']);
	});

	test('Meta turns the other settings off when one rejects or never settles', async () => {
		const fake = createFakeNativeModule({ snapshot: grant('marketing') });
		const calls: string[] = [];
		const failure = new Error('Meta rejected auto-log');
		const onError = vi.fn();
		let hang = false;
		const integration = connectMetaAppEvents(
			{
				setAdvertiserIDCollectionEnabled: (enabled) => {
					log(calls, `advertiserId:${enabled}`);
					return hang && !enabled ? new Promise<void>(() => {}) : undefined;
				},
				setAutoLogAppEventsEnabled: (enabled) =>
					enabled ? log(calls, 'autoLog:true') : Promise.reject(failure),
				setLimitedDataUse: (limited) => log(calls, `ldu:${limited}`),
			},
			{ onError }
		);
		await integration.ready;
		calls.length = 0;
		hang = true;
		fake.pushSnapshot(grant());
		await vi.waitFor(() =>
			expect(calls).toEqual(['advertiserId:false', 'ldu:true'])
		);
	});
});

describe('Braze, Singular and Branch withdrawal survives a failing vendor call', () => {
	test('Braze withdrawal only disables, so a failing attribute write cannot block it', async () => {
		const fake = createFakeNativeModule({ snapshot: grant('marketing') });
		const calls: string[] = [];
		const integration = connectBraze(
			{
				disableSDK: () => log(calls, 'disable'),
				enableSDK: () => log(calls, 'enable'),
				setGoogleAdsConsent: (consent) =>
					consent.adUserData
						? log(calls, 'ads:true')
						: Promise.reject(new Error('Braze rejected attributes')),
			},
			{ onError: vi.fn() }
		);
		await integration.ready;
		calls.length = 0;
		fake.pushSnapshot(grant());
		await settle(calls);
		expect(calls).toEqual(['disable']);
	});

	test('Singular limits data sharing when stop rejects, and reports it', async () => {
		const fake = createFakeNativeModule({ snapshot: grant('marketing') });
		const calls: string[] = [];
		const failure = new Error('Singular rejected stop');
		const onError = vi.fn();
		let failStop = false;
		const integration = connectSingular(
			{
				limitDataSharing: (limit) => log(calls, `limit:${limit}`),
				resumeAllTracking: () => log(calls, 'resume'),
				stopAllTracking: () =>
					failStop ? Promise.reject(failure) : log(calls, 'stop'),
				trackingOptIn: () => log(calls, 'optIn'),
			},
			{ onError }
		);
		await integration.ready;
		calls.length = 0;
		failStop = true;
		fake.pushSnapshot(grant());
		await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
		expect(calls).toEqual(['limit:true']);
	});

	test('Branch sends denied DMA parameters when lowering the level never settles', async () => {
		const fake = createFakeNativeModule({ snapshot: grant('marketing') });
		const calls: string[] = [];
		const integration = connectBranch(
			{
				setConsumerProtectionAttributionLevel: (level) => {
					log(calls, `level:${level}`);
					return level === 'FULL' ? undefined : new Promise<void>(() => {});
				},
				setDMAParamsForEEA: (consent) =>
					log(calls, `dma:${consent.adPersonalization}`),
			},
			{ onError: vi.fn() }
		);
		await integration.ready;
		calls.length = 0;
		fake.pushSnapshot(grant());
		await vi.waitFor(() => expect(calls).toEqual(['level:NONE', 'dma:false']));
	});
});
