/**
 * The provider asks for App Tracking Transparency in step with the consent
 * prompt: after it by default and only with marketing granted, before it with
 * `beforeConsent`, and never by itself with `manual`.
 */

import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	buildSnapshot,
	createFakeNativeModule,
	flushPromises,
	renderTree,
} from '../../__tests__/helpers/fake-native';
import type { FakeNativeModule } from '../../__tests__/helpers/fake-native';
import {
	emitNativeEvent,
	resetNativeStub,
	setAppState,
} from '../../__tests__/helpers/react-native-stub';
import { resetConsentClient } from '../../native/client';
import type { ConsentSnapshot, TrackingAuthorization } from '../../protocol';
import { ConsentProvider } from '../consent-provider';
import type { ConsentProviderProps } from '../consent-provider';
import { shouldRequestTracking } from '../tracking-sequence';

const URL = 'https://example.com/privacy';

const permissions = (marketing: boolean) => ({
	experience: false,
	functionality: true,
	marketing,
	measurement: false,
	necessary: true,
});

const owed = buildSnapshot({
	effectivePermissions: permissions(false),
	promptRequirement: { kind: 'choice', reason: 'missing' },
	resolution: { fingerprint: 'policy-a', policyId: 'p', status: 'matched' },
	revision: 1,
});

const saved = (marketing: boolean, revision = 2): ConsentSnapshot =>
	buildSnapshot({
		effectivePermissions: permissions(marketing),
		promptRequirement: { kind: 'none' },
		resolution: { fingerprint: 'policy-a', policyId: 'p', status: 'matched' },
		revision,
	});

/** Boot a fake on iOS with ATT enabled and Apple not yet asked. */
const boot = function boot(
	snapshot: ConsentSnapshot,
	authorization: TrackingAuthorization = 'not-determined'
): {
	readonly fake: FakeNativeModule;
	readonly order: string[];
	readonly preferences: ReturnType<typeof vi.fn>;
} {
	const fake = createFakeNativeModule({ snapshot });
	const order: string[] = [];
	fake.setTrackingAuthorization(authorization);
	fake.setTrackingRequestReply({ stage: 'final', status: 'authorized' });
	const request = fake.requestTrackingAuthorization;
	fake.requestTrackingAuthorization = vi.fn(() => {
		order.push('tracking');
		return request();
	});
	fake.presentConsentPrompt = vi.fn(() => {
		order.push('prompt');
		return Promise.resolve(
			JSON.stringify({ sessionId: 's1', status: 'presented' })
		);
	});
	const preferences = vi.fn(() => {
		order.push('preferences');
		return Promise.resolve(
			JSON.stringify({ sessionId: 's2', status: 'presented' })
		);
	});
	fake.presentPreferences = preferences;
	return { fake, order, preferences };
};

/** The native host closed a session: the prompt UI has fully animated away. */
const finish = function finish(
	fake: FakeNativeModule,
	next: ConsentSnapshot,
	kind = 'committed'
): void {
	fake.pushSnapshot(next);
	emitNativeEvent(
		'onConsentPresenterOutcome',
		JSON.stringify({ kind, revision: next.revision, sessionId: 's1' })
	);
};

const App = (
	props: Partial<ConsentProviderProps> & { readonly children?: ReactNode }
): ReactNode => (
	<ConsentProvider
		{...(props as ConsentProviderProps)}
		privacyPolicyURL={URL}
	/>
);

afterEach(() => {
	setAppState('active');
	resetConsentClient();
	resetNativeStub();
});

describe('shouldRequestTracking', () => {
	test.each([
		['afterConsent', 'afterPrompt', 'not-determined', 'granted', true],
		['afterConsent', 'afterPrompt', 'not-determined', 'denied', false],
		['afterConsent', 'afterPrompt', 'not-determined', 'pending', false],
		['afterConsent', 'afterPrompt', 'authorized', 'granted', false],
		['afterConsent', 'afterPrompt', 'denied', 'granted', false],
		['afterConsent', 'afterPrompt', 'restricted', 'granted', false],
		['afterConsent', 'afterPrompt', 'unsupported', 'granted', false],
		['afterConsent', 'beforePrompt', 'not-determined', 'granted', false],
		['beforeConsent', 'beforePrompt', 'not-determined', 'pending', true],
		['beforeConsent', 'beforePrompt', 'denied', 'pending', false],
		['beforeConsent', 'afterPrompt', 'not-determined', 'granted', false],
		['manual', 'afterPrompt', 'not-determined', 'granted', false],
		['manual', 'beforePrompt', 'not-determined', 'granted', false],
	] as const)(
		'%s at %s with %s and marketing %s: %s',
		(timing, stage, authorization, marketing, expected) => {
			expect(
				shouldRequestTracking(timing, stage, authorization, marketing)
			).toBe(expected);
		}
	);
});

describe('afterConsent (default)', () => {
	test('asks once, after the prompt closes with marketing granted', async () => {
		const { fake, order } = boot(owed);
		const tree = renderTree(<App />);
		await flushPromises();
		expect(order).toStrictEqual(['prompt']);

		finish(fake, saved(true));
		await flushPromises();
		expect(order).toStrictEqual(['prompt', 'tracking']);

		// Apple answered; a later session asks nothing.
		finish(fake, saved(true, 3));
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(1);
		tree.unmount();
	});

	test('does not ask when marketing was denied', async () => {
		const { fake } = boot(owed);
		const tree = renderTree(<App />);
		await flushPromises();

		finish(fake, saved(false));
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(0);
		tree.unmount();
	});

	test('asks when marketing is later granted in settings', async () => {
		const { fake } = boot(owed);
		const tree = renderTree(<App />);
		await flushPromises();
		finish(fake, saved(false));
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(0);

		finish(fake, saved(true, 3));
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(1);
		tree.unmount();
	});

	test.each(['authorized', 'denied', 'restricted'] as const)(
		'does not ask when Apple already answered %s',
		async (status) => {
			const { fake } = boot(owed, status);
			const tree = renderTree(<App />);
			await flushPromises();
			finish(fake, saved(true));
			await flushPromises();
			expect(fake.trackingRequestCalls).toBe(0);
			tree.unmount();
		}
	);

	test('does nothing when the app did not enable ATT, or on Android', async () => {
		const { fake } = boot(owed, 'unsupported');
		const tree = renderTree(<App />);
		await flushPromises();
		finish(fake, saved(true));
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(0);
		tree.unmount();
	});

	test('asks at launch when a stored choice grants marketing and no prompt is owed', async () => {
		const { fake, order } = boot(saved(true));
		const tree = renderTree(<App />);
		await flushPromises();
		expect(order).toStrictEqual(['tracking']);

		setAppState('background');
		setAppState('active');
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(1);
		tree.unmount();
	});

	test('does not ask at launch when the stored choice denies marketing', async () => {
		const { fake } = boot(saved(false));
		const tree = renderTree(<App />);
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(0);
		tree.unmount();
	});

	test('waits until the app is active', async () => {
		const { fake } = boot(owed);
		const tree = renderTree(<App />);
		await flushPromises();
		setAppState('inactive');
		finish(fake, saved(true));
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(0);

		setAppState('active');
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(1);
		tree.unmount();
	});

	test('opens settings when Apple pauses on Additional Information', async () => {
		const { fake, order } = boot(owed);
		fake.setTrackingRequestReply({
			presentation: 'expanded',
			stage: 'additional-information',
			status: 'not-determined',
		});
		const tree = renderTree(<App />);
		await flushPromises();
		finish(fake, saved(true));
		await flushPromises();
		expect(order).toStrictEqual(['prompt', 'tracking', 'preferences']);
		tree.unmount();
	});

	test('with autoPresent off, asks after a prompt the app opened but not at launch', async () => {
		const { fake } = boot(saved(true));
		const tree = renderTree(<ConsentProvider autoPresent={false} />);
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(0);

		finish(fake, saved(true, 3));
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(1);
		tree.unmount();
	});

	test('ignores an outcome that recorded nothing because policy was unavailable', async () => {
		const { fake } = boot(owed);
		const tree = renderTree(<App />);
		await flushPromises();
		finish(fake, saved(true), 'unavailable');
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(0);
		tree.unmount();
	});
});

describe('beforeConsent', () => {
	test('asks first, then presents the prompt', async () => {
		const { fake, order } = boot(owed);
		const tree = renderTree(<App trackingRequest="beforeConsent" />);
		await flushPromises();
		expect(order).toStrictEqual(['tracking', 'prompt']);

		finish(fake, saved(true));
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(1);
		tree.unmount();
	});

	test('presents the prompt without asking when Apple already answered', async () => {
		const { order } = boot(owed, 'denied');
		const tree = renderTree(<App trackingRequest="beforeConsent" />);
		await flushPromises();
		expect(order).toStrictEqual(['prompt']);
		tree.unmount();
	});
});

describe('manual', () => {
	test('asks nothing by itself', async () => {
		const { fake, order } = boot(owed);
		const tree = renderTree(<App trackingRequest="manual" />);
		await flushPromises();
		finish(fake, saved(true));
		await flushPromises();
		expect(order).toStrictEqual(['prompt']);
		tree.unmount();
	});
});

describe('stored consent', () => {
	test('an ATT denial commits nothing', async () => {
		const { fake } = boot(owed);
		fake.setTrackingRequestReply({ stage: 'final', status: 'denied' });
		const tree = renderTree(<App />);
		await flushPromises();
		finish(fake, saved(true));
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(1);
		expect(fake.commitIntents).toStrictEqual([]);
		tree.unmount();
	});
});
