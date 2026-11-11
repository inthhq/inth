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

/**
 * Property: whatever grants, withdrawals and vendor calls that settle, reject,
 * hang or settle late came before, a withdrawal makes every stop call the same
 * helper makes against a vendor that always settles, before any held vendor
 * call is released.
 */

type Category = 'marketing' | 'measurement';
type Connect = (
	client: never,
	options: AnalyticsIntegrationOptions
) => ConsentIntegration;

let revision = 0;

const snapshotOf = (granted: ReadonlySet<Category>): ConsentSnapshot => {
	revision += 1;
	const initial = buildSnapshot();
	return buildSnapshot({
		effectivePermissions: {
			...initial.effectivePermissions,
			experience: false,
			functionality: false,
			marketing: granted.has('marketing'),
			measurement: granted.has('measurement'),
		},
		revision,
	});
};

/** Seeded Park-Miller generator, so a failing sequence replays from its seed. */
const random = (seed: number) => {
	let state = (seed % 2_147_483_646) + 1;
	return () => {
		state = (state * 48_271) % 2_147_483_647;
		return (state - 1) / 2_147_483_646;
	};
};

const tick = () =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});

/** Records every attempted call; `behave` decides how each one settles. */
const vendor = (behave: () => 'settle' | 'reject' | 'hang' | 'late') => {
	const calls: string[] = [];
	const late: (() => void)[] = [];
	const client = new Proxy(
		{},
		{
			get:
				(_target, name) =>
				(...args: unknown[]): Promise<void> => {
					calls.push(`${String(name)}:${JSON.stringify(args)}`);
					const behaviour = behave();
					if (behaviour === 'reject') {
						return Promise.reject(new Error(`${String(name)} failed`));
					}
					if (behaviour === 'hang') {
						return new Promise<void>(() => {});
					}
					if (behaviour === 'late') {
						return new Promise<void>((resolve) => {
							late.push(resolve);
						});
					}
					return Promise.resolve();
				},
		}
	);
	return { calls, client, late };
};

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

const categoryOptions: readonly (Category | undefined)[] = [
	undefined,
	'measurement',
];

/** The calls a withdrawal of everything makes, against a vendor that settles. */
const fullDenial = async (
	connect: Connect,
	category: Category | undefined
): Promise<Set<string>> => {
	const fake = createFakeNativeModule({ snapshot: snapshotOf(new Set()) });
	const probe = vendor(() => 'settle');
	const integration = connect(probe.client as never, {
		category,
		onError: vi.fn(),
	});
	await integration.ready;
	fake.pushSnapshot(snapshotOf(new Set(['marketing', 'measurement'])));
	await tick();
	probe.calls.length = 0;
	fake.pushSnapshot(snapshotOf(new Set()));
	await tick();
	const denial = new Set(probe.calls);
	await integration.disconnect();
	resetConsentClient();
	resetNativeStub();
	return denial;
};

afterEach(() => {
	resetConsentClient();
	resetNativeStub();
	revision = 0;
});

describe.each(helpers)('%s', (_name, connect) => {
	test.each(categoryOptions)(
		'withdrawal stops at once in random sequences (category %s)',
		async (category) => {
			const denial = await fullDenial(connect, category);
			const runSeed = async (seed: number): Promise<void> => {
				const draw = random(seed);
				const granted = new Set<Category>();
				const fake = createFakeNativeModule({ snapshot: snapshotOf(granted) });
				const subject = vendor(() => {
					const roll = draw();
					if (roll < 0.15) {
						return 'reject';
					}
					if (roll < 0.25) {
						return 'hang';
					}
					if (roll < 0.45) {
						return 'late';
					}
					return 'settle';
				});
				const shadow = vendor(() => 'settle');
				connect(subject.client as never, { category, onError: vi.fn() });
				connect(shadow.client as never, { category, onError: vi.fn() });
				await tick();
				const step = async (left: number): Promise<void> => {
					if (left === 0) {
						return;
					}
					const roll = draw();
					if (roll < 0.25 && subject.late.length > 0) {
						const index = Math.floor(draw() * subject.late.length);
						subject.late.splice(index, 1)[0]?.();
						await tick();
						return step(left - 1);
					}
					const which: Category = draw() < 0.5 ? 'marketing' : 'measurement';
					const withdrawing = granted.has(which);
					if (withdrawing) {
						granted.delete(which);
					} else {
						granted.add(which);
					}
					// Let the shadow finish, so its calls below answer this publication.
					await tick();
					const subjectMark = subject.calls.length;
					const shadowMark = shadow.calls.length;
					fake.pushSnapshot(snapshotOf(granted));
					await tick();
					// Only a withdrawal owes stop calls; a grant owes none.
					const owed = withdrawing
						? shadow.calls.slice(shadowMark).filter((call) => denial.has(call))
						: [];
					const made = subject.calls.slice(subjectMark);
					expect(
						owed.filter((call) => !made.includes(call)),
						`seed ${seed}: stop calls owed after withdrawing ${which}`
					).toEqual([]);
					return step(left - 1);
				};
				await step(30);
				resetConsentClient();
				resetNativeStub();
			};
			// 25 seeds per case keep the file near half a minute; tracking only the
			// newest unsettled apply still fails a third of the cases.
			const seeds = Array.from({ length: 25 }, (_, index) => index + 1);
			const runAll = async (index: number): Promise<void> => {
				const seed = seeds[index];
				if (seed === undefined) {
					return;
				}
				await runSeed(seed);
				await runAll(index + 1);
			};
			await runAll(0);
		},
		30_000
	);
});
