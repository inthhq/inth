/**
 * The provider asks for App Tracking Transparency in step with the consent
 * prompt: after it by default and only with marketing granted, before it with
 * `beforeConsent`, and never by itself with `manual`.
 */

import { StrictMode, useEffect, useLayoutEffect } from 'react';
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
import { getConsentClient, resetConsentClient } from '../../native/client';
import {
	presentConsentPrompt,
	presentPreferences,
} from '../../native/presenter';
import type { ConsentSnapshot, TrackingAuthorization } from '../../protocol';
import { ConsentProvider } from '../consent-provider';
import type { ConsentProviderProps } from '../consent-provider';
import {
	isRepromptDue,
	shouldRequestTracking,
	TRACKING_REPROMPT_INTERVAL_MS,
} from '../tracking-sequence';

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
				shouldRequestTracking(timing, stage, {
					authorization,
					marketing,
					marketingRefused: false,
					repromptDue: false,
				})
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

describe('a configuration that changed while a step waited', () => {
	test('an unmounted provider neither asks nor presents when the app returns', async () => {
		const { fake, order } = boot(owed);
		setAppState('inactive');
		const tree = renderTree(<App trackingRequest="beforeConsent" />);
		await flushPromises();
		tree.unmount();

		setAppState('active');
		await flushPromises();
		expect(order).toStrictEqual([]);
		expect(fake.trackingRequestCalls).toBe(0);
	});

	test('switching to manual cancels an ask waiting for the app to return', async () => {
		const { fake } = boot(owed);
		const tree = renderTree(<App />);
		await flushPromises();
		setAppState('inactive');
		finish(fake, saved(true));
		await flushPromises();

		tree.rerender(<App trackingRequest="manual" />);
		setAppState('active');
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(0);
	});

	test('switching to manual while Apple answers does not open settings', async () => {
		const { fake, order } = boot(owed);
		let answer = (): void => undefined;
		const request = fake.requestTrackingAuthorization;
		fake.requestTrackingAuthorization = vi.fn(
			() =>
				new Promise<string>((resolve) => {
					answer = () => {
						resolve(
							JSON.stringify({
								presentation: 'expanded',
								stage: 'additional-information',
								status: 'not-determined',
							})
						);
					};
					void request();
				})
		);
		const tree = renderTree(<App />);
		await flushPromises();
		finish(fake, saved(true));
		await flushPromises();
		expect(fake.requestTrackingAuthorization).toHaveBeenCalledTimes(1);

		tree.rerender(<App trackingRequest="manual" />);
		answer();
		await flushPromises();
		expect(order).not.toContain('preferences');
	});

	test('strict mode still asks once before the prompt with beforeConsent', async () => {
		const { order } = boot(owed);
		const tree = renderTree(
			<StrictMode>
				<App trackingRequest="beforeConsent" />
			</StrictMode>
		);
		await flushPromises();
		expect(order).toStrictEqual(['tracking', 'prompt']);
		tree.unmount();
	});

	test('strict mode still asks at launch for a stored marketing grant', async () => {
		const { order } = boot(saved(true));
		const tree = renderTree(
			<StrictMode>
				<App />
			</StrictMode>
		);
		await flushPromises();
		expect(order).toStrictEqual(['tracking']);
		tree.unmount();
	});
});

describe('Additional Information without a provider URL', () => {
	test('a launch-time ask opens settings with the provider URL', async () => {
		const { fake, preferences } = boot(saved(true));
		fake.setTrackingRequestReply({
			presentation: 'expanded',
			stage: 'additional-information',
			status: 'not-determined',
		});
		const tree = renderTree(<App />);
		await flushPromises();
		expect(preferences).toHaveBeenCalledWith(URL);
		tree.unmount();
	});

	test('opens settings with the URL the app passed when it opened the prompt', async () => {
		const { fake, preferences } = boot(owed);
		fake.setTrackingRequestReply({
			presentation: 'expanded',
			stage: 'additional-information',
			status: 'not-determined',
		});
		const tree = renderTree(<ConsentProvider autoPresent={false} />);
		await flushPromises();
		await presentConsentPrompt('https://app.example/privacy');

		finish(fake, saved(true));
		await flushPromises();
		expect(preferences).toHaveBeenCalledWith('https://app.example/privacy');
		tree.unmount();
	});
});

/** A prompt owed again for a person whose stored choice refuses marketing. */
const owedAfterRefusal = buildSnapshot({
	...owed,
	explicitChoice: {
		categories: {
			marketing: {
				basis: { fingerprint: 'policy-a', kind: 'choice-v1' },
				confirmedAt: 1,
				value: false,
			},
		},
		version: 3,
	},
	promptRequirement: { kind: 'choice', reason: 'policy-changed' },
});

describe('beforeConsent and screens the app opens', () => {
	test('a prompt the app opens waits for Apple first', async () => {
		const { order } = boot(owed);
		const tree = renderTree(
			<ConsentProvider
				autoPresent={false}
				trackingRequest="beforeConsent"
			/>
		);
		await flushPromises();
		expect(order).toStrictEqual([]);

		await presentConsentPrompt(URL);
		expect(order).toStrictEqual(['tracking', 'prompt']);
		tree.unmount();
	});

	test('settings the person opens are not delayed', async () => {
		const { order } = boot(owed);
		const tree = renderTree(
			<ConsentProvider
				autoPresent={false}
				trackingRequest="beforeConsent"
			/>
		);
		await flushPromises();
		await presentPreferences(URL);
		expect(order).toStrictEqual(['preferences']);
		tree.unmount();
	});

	test('a stored marketing refusal asks nothing, in either order', async () => {
		const { fake, order } = boot(owedAfterRefusal);
		const tree = renderTree(<App trackingRequest="beforeConsent" />);
		await flushPromises();
		expect(order).toStrictEqual(['prompt']);
		finish(fake, saved(false));
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(0);
		tree.unmount();
	});
});

describe('never over a c15t screen', () => {
	test('waits for a prompt that opens as settings close', async () => {
		const { fake, order } = boot(saved(false));
		const tree = renderTree(<App />);
		await flushPromises();
		await presentPreferences(URL);
		// A prompt becomes owed while settings are open; marketing is granted.
		fake.pushSnapshot(
			buildSnapshot({
				...owed,
				effectivePermissions: permissions(true),
				revision: 3,
			})
		);
		await flushPromises();
		emitNativeEvent(
			'onConsentPresenterOutcome',
			JSON.stringify({ kind: 'committed', revision: 3, sessionId: 's2' })
		);
		await flushPromises();
		expect(order).toStrictEqual(['preferences', 'prompt']);

		finish(fake, saved(true, 4));
		await flushPromises();
		expect(order).toStrictEqual(['preferences', 'prompt', 'tracking']);
		tree.unmount();
	});
});

/** Children that open the prompt from their own mount effect, before the provider's run. */
const PresentsInEffect = (): ReactNode => {
	useEffect(() => {
		void presentConsentPrompt(URL);
	}, []);
	return null;
};

const PresentsInLayoutEffect = (): ReactNode => {
	useLayoutEffect(() => {
		void presentConsentPrompt(URL);
	}, []);
	return null;
};

describe('beforeConsent when a child presents as it mounts', () => {
	test.each([
		['useEffect', false, false],
		['useEffect', true, false],
		['useLayoutEffect', false, true],
		['useLayoutEffect', true, true],
	] as const)(
		'%s, strict mode %s: Apple first',
		async (_name, strict, layout) => {
			const { fake, order } = boot(owed);
			const app = (
				<ConsentProvider
					autoPresent={false}
					trackingRequest="beforeConsent"
				>
					{layout ? <PresentsInLayoutEffect /> : <PresentsInEffect />}
				</ConsentProvider>
			);
			const tree = renderTree(strict ? <StrictMode>{app}</StrictMode> : app);
			await flushPromises();
			expect(order[0]).toBe('tracking');
			expect(order).toContain('prompt');
			expect(fake.trackingRequestCalls).toBe(1);
			tree.unmount();
		}
	);

	test('a provider that unmounts stops holding the next prompt', async () => {
		const { order } = boot(owed);
		const tree = renderTree(
			<ConsentProvider
				autoPresent={false}
				trackingRequest="beforeConsent"
			/>
		);
		await flushPromises();
		tree.unmount();
		await flushPromises();
		await presentConsentPrompt(URL);
		expect(order).toStrictEqual(['prompt']);
	});
});

describe('beforeConsent re-checks each prompt', () => {
	test('asks before the next prompt once a stored refusal is gone', async () => {
		const { fake, order } = boot(owedAfterRefusal);
		// A new session id per prompt, as native gives: a closed id is never reused.
		let sessions = 0;
		fake.presentConsentPrompt = vi.fn(() => {
			order.push('prompt');
			sessions += 1;
			return Promise.resolve(
				JSON.stringify({
					sessionId: `s${String(sessions)}`,
					status: 'presented',
				})
			);
		});
		const tree = renderTree(<App trackingRequest="beforeConsent" />);
		await flushPromises();
		expect(order).toStrictEqual(['prompt']);
		// The person dismisses; a reset clears the refusal and owes a new prompt.
		finish(fake, saved(false), 'dismissed');
		await flushPromises();
		fake.pushSnapshot(
			buildSnapshot({
				...owed,
				promptRequirement: { kind: 'choice', reason: 'missing' },
				resolution: {
					fingerprint: 'policy-b',
					policyId: 'p',
					status: 'matched',
				},
				revision: 5,
			})
		);
		await flushPromises();
		expect(order).toStrictEqual(['prompt', 'tracking', 'prompt']);
		tree.unmount();
	});
});

describe('switching away from beforeConsent', () => {
	test('a prompt waiting on Apple opens when the provider switches to manual', async () => {
		const { fake, order } = boot(owed);
		setAppState('inactive');
		const tree = renderTree(<App trackingRequest="beforeConsent" />);
		await flushPromises();
		expect(order).toStrictEqual([]);

		tree.rerender(<App trackingRequest="manual" />);
		await flushPromises();
		expect(order).toStrictEqual(['prompt']);
		expect(fake.trackingRequestCalls).toBe(0);
		tree.unmount();
	});
});

describe('beforeConsent at a launch that owes no prompt', () => {
	test('asks once while Apple has not answered', async () => {
		const { fake, order } = boot(saved(true));
		const tree = renderTree(<App trackingRequest="beforeConsent" />);
		await flushPromises();
		expect(order).toStrictEqual(['tracking']);
		setAppState('background');
		setAppState('active');
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(1);
		tree.unmount();
	});

	test('asks with no stored choice about marketing either way', async () => {
		const { order } = boot(
			buildSnapshot({ ...saved(false), explicitChoice: null })
		);
		const tree = renderTree(<App trackingRequest="beforeConsent" />);
		await flushPromises();
		expect(order).toStrictEqual(['tracking']);
		tree.unmount();
	});

	test('does not ask when a stored choice refuses marketing', async () => {
		const { fake } = boot({
			...owedAfterRefusal,
			promptRequirement: { kind: 'none' },
		});
		const tree = renderTree(<App trackingRequest="beforeConsent" />);
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(0);
		tree.unmount();
	});

	test('does not ask when Apple already answered', async () => {
		const { fake } = boot(saved(true), 'authorized');
		const tree = renderTree(<App trackingRequest="beforeConsent" />);
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(0);
		tree.unmount();
	});
});

describe('yearly re-ask', () => {
	const NOW = 1_800_000_000_000;
	const DAY = 24 * 60 * 60 * 1000;

	afterEach(() => {
		vi.useRealTimers();
	});

	const answered = (
		ago: number | null,
		status: TrackingAuthorization = 'authorized'
	) => {
		vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
		const booted = boot(saved(true), status);
		booted.fake.setTrackingAnsweredAt(ago === null ? null : NOW - ago);
		return booted;
	};

	test('the rule: due a year after the last answer, never without one', () => {
		expect(
			isRepromptDue('yearly', NOW - TRACKING_REPROMPT_INTERVAL_MS, NOW)
		).toBe(true);
		expect(isRepromptDue('yearly', NOW - 364 * DAY, NOW)).toBe(false);
		expect(isRepromptDue('yearly', null, NOW)).toBe(false);
		expect(isRepromptDue('never', NOW - 800 * DAY, NOW)).toBe(false);
		const due = {
			authorization: 'denied' as const,
			marketing: 'granted' as const,
			marketingRefused: false,
			repromptDue: true,
		};
		expect(shouldRequestTracking('afterConsent', 'afterPrompt', due)).toBe(
			true
		);
		expect(shouldRequestTracking('beforeConsent', 'beforePrompt', due)).toBe(
			true
		);
		expect(shouldRequestTracking('manual', 'afterPrompt', due)).toBe(false);
		expect(
			shouldRequestTracking('afterConsent', 'afterPrompt', {
				...due,
				authorization: 'restricted',
			})
		).toBe(false);
		expect(
			shouldRequestTracking('afterConsent', 'afterPrompt', {
				...due,
				marketingRefused: true,
			})
		).toBe(false);
		expect(
			shouldRequestTracking('afterConsent', 'afterPrompt', {
				...due,
				marketing: 'denied',
			})
		).toBe(false);
	});

	test.each(['afterConsent', 'beforeConsent'] as const)(
		'%s: calls once per launch after a year',
		async (timing) => {
			const { fake } = answered(366 * DAY);
			const tree = renderTree(
				<App
					trackingRequest={timing}
					trackingReprompt="yearly"
				/>
			);
			await flushPromises();
			expect(fake.trackingRequestCalls).toBe(1);
			finish(fake, saved(true, 3));
			await flushPromises();
			expect(fake.trackingRequestCalls).toBe(1);
			tree.unmount();
		}
	);

	test('waits for the year', async () => {
		const { fake } = answered(364 * DAY);
		const tree = renderTree(<App trackingReprompt="yearly" />);
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(0);
		tree.unmount();
	});

	test('an answer with no stored time waits a year from now', async () => {
		const { fake } = answered(null);
		const tree = renderTree(<App trackingReprompt="yearly" />);
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(0);
		tree.unmount();
	});

	test('never is the default', async () => {
		const { fake } = answered(800 * DAY);
		const tree = renderTree(<App />);
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(0);
		tree.unmount();
	});

	test('never asks restricted, refused or manual', async () => {
		const restricted = answered(800 * DAY, 'restricted');
		let tree = renderTree(<App trackingReprompt="yearly" />);
		await flushPromises();
		expect(restricted.fake.trackingRequestCalls).toBe(0);
		tree.unmount();
		resetConsentClient();
		resetNativeStub();

		const manual = answered(800 * DAY);
		tree = renderTree(
			<App
				trackingRequest="manual"
				trackingReprompt="yearly"
			/>
		);
		await flushPromises();
		expect(manual.fake.trackingRequestCalls).toBe(0);
		tree.unmount();
		resetConsentClient();
		resetNativeStub();

		vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
		const refused = boot(
			{ ...owedAfterRefusal, promptRequirement: { kind: 'none' } },
			'denied'
		);
		refused.fake.setTrackingAnsweredAt(NOW - 800 * DAY);
		tree = renderTree(<App trackingReprompt="yearly" />);
		await flushPromises();
		expect(refused.fake.trackingRequestCalls).toBe(0);
		tree.unmount();
	});
});

describe('ATT under IAB TCF', () => {
	const iab = (
		marketing: boolean,
		purposes: boolean | null,
		revision = 2
	): ConsentSnapshot =>
		({
			...saved(marketing, revision),
			iabMarketingPurposes: purposes,
			model: 'iab',
		}) as ConsentSnapshot;
	const owedIAB = { ...owed, model: 'iab' } as ConsentSnapshot;

	test('Accept all, with the TC String granting marketing, asks after the prompt', async () => {
		const { fake, order } = boot(owedIAB);
		const tree = renderTree(<App />);
		await flushPromises();
		finish(fake, iab(true, true));
		await flushPromises();
		expect(order).toStrictEqual(['prompt', 'tracking']);
		tree.unmount();
	});

	test('Reject all never asks', async () => {
		const { fake } = boot(owedIAB);
		const tree = renderTree(<App />);
		await flushPromises();
		finish(fake, iab(false, false));
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(0);
		tree.unmount();
	});

	test('the marketing category without the TC String purposes does not ask', async () => {
		const { fake } = boot(owedIAB);
		const tree = renderTree(<App />);
		await flushPromises();
		finish(fake, iab(true, false));
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(0);
		tree.unmount();
	});

	test('an older binary that does not say asks nothing under IAB', async () => {
		const { fake } = boot(owedIAB);
		const tree = renderTree(<App />);
		await flushPromises();
		finish(fake, iab(true, null));
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(0);
		tree.unmount();
	});

	test.each([true, false])(
		'Additional Information opens TCF settings; purposes kept %s',
		async (kept) => {
			const { fake, order, preferences } = boot(owedIAB);
			let sessions = 0;
			fake.presentConsentPrompt = vi.fn(() => {
				order.push('prompt');
				sessions += 1;
				return Promise.resolve(
					JSON.stringify({
						sessionId: `p${String(sessions)}`,
						status: 'presented',
					})
				);
			});
			fake.queueTrackingRequestReplies([
				{
					presentation: 'expanded',
					stage: 'additional-information',
					status: 'not-determined',
				},
				{ stage: 'final', status: 'authorized' },
			]);
			const tree = renderTree(<App />);
			await flushPromises();
			fake.pushSnapshot(iab(true, true));
			emitNativeEvent(
				'onConsentPresenterOutcome',
				JSON.stringify({ kind: 'committed', revision: 2, sessionId: 'p1' })
			);
			await flushPromises();
			expect(preferences).toHaveBeenCalledTimes(1);
			expect(order).toStrictEqual(['prompt', 'tracking', 'preferences']);

			// The native host opens the IAB preferences for an IAB policy; the person saves them.
			fake.pushSnapshot(iab(kept, kept, 3));
			emitNativeEvent(
				'onConsentPresenterOutcome',
				JSON.stringify({ kind: 'committed', revision: 3, sessionId: 's2' })
			);
			await flushPromises();
			expect(fake.trackingRequestCalls).toBe(kept ? 2 : 1);
			tree.unmount();
		}
	);
});

describe('final review round', () => {
	const iabSaved = (
		marketing: boolean,
		purposes: boolean | null,
		revision = 2
	): ConsentSnapshot =>
		({
			...saved(marketing, revision),
			iabMarketingPurposes: purposes,
			model: 'iab',
		}) as ConsentSnapshot;

	test('IAB: purposes consented but every vendor refused asks nothing (native sends false)', async () => {
		const { fake } = boot({ ...owed, model: 'iab' } as ConsentSnapshot);
		const tree = renderTree(<App />);
		await flushPromises();
		finish(fake, iabSaved(true, false));
		await flushPromises();
		expect(fake.trackingRequestCalls).toBe(0);
		tree.unmount();
	});

	test.each([true, false])(
		'beforeConsent: a pause before the prompt asks again after it only with marketing granted (%s)',
		async (granted) => {
			const { fake, order } = boot(owed);
			fake.queueTrackingRequestReplies([
				{
					presentation: 'expanded',
					stage: 'additional-information',
					status: 'not-determined',
				},
				{ stage: 'final', status: 'authorized' },
			]);
			const tree = renderTree(<App trackingRequest="beforeConsent" />);
			await flushPromises();
			expect(order).toStrictEqual(['tracking', 'prompt']);
			finish(fake, saved(granted));
			await flushPromises();
			expect(fake.trackingRequestCalls).toBe(granted ? 2 : 1);
			tree.unmount();
		}
	);

	test.each(['gpc', 'explicit-denial'] as const)(
		'beforeConsent: a %s restriction on marketing is a refusal at launch',
		async (reason) => {
			const { fake } = boot(
				buildSnapshot({
					...saved(false),
					explicitChoice: null,
					restrictions: { marketing: [reason] },
				})
			);
			const tree = renderTree(<App trackingRequest="beforeConsent" />);
			await flushPromises();
			expect(fake.trackingRequestCalls).toBe(0);
			tree.unmount();
		}
	);

	test('the provider asks Apple for the Additional Information button when the stock screens can open', async () => {
		const { fake } = boot(owed);
		const tree = renderTree(<App />);
		await flushPromises();
		finish(fake, saved(true));
		await flushPromises();
		expect(fake.trackingRequestOptions).toStrictEqual([
			JSON.stringify({ additionalInformation: true }),
		]);
		tree.unmount();
	});

	test('a build without the stock screens and no handler gets no button', async () => {
		const { fake } = boot(owed);
		Object.assign(getConsentClient().bootstrap, { nativeUI: false });
		const tree = renderTree(<ConsentProvider autoPresent={false} />);
		await flushPromises();
		finish(fake, saved(true));
		await flushPromises();
		expect(fake.trackingRequestOptions).toStrictEqual([null]);
		tree.unmount();
	});

	test('onTrackingAdditionalInformation gives the button and runs on a pause', async () => {
		const { fake, preferences } = boot(owed);
		Object.assign(getConsentClient().bootstrap, { nativeUI: false });
		fake.setTrackingRequestReply({
			presentation: 'expanded',
			stage: 'additional-information',
			status: 'not-determined',
		});
		const controls = vi.fn();
		const tree = renderTree(
			<ConsentProvider
				autoPresent={false}
				onTrackingAdditionalInformation={controls}
			/>
		);
		await flushPromises();
		finish(fake, saved(true));
		await flushPromises();
		expect(fake.trackingRequestOptions).toStrictEqual([
			JSON.stringify({ additionalInformation: true }),
		]);
		expect(controls).toHaveBeenCalledTimes(1);
		expect(preferences).not.toHaveBeenCalled();
		tree.unmount();
	});

	test("the app's own requestTrackingAuthorization() offers no button", async () => {
		const { fake } = boot(saved(false));
		const tree = renderTree(
			<ConsentProvider
				autoPresent={false}
				trackingRequest="manual"
			/>
		);
		await flushPromises();
		await getConsentClient().requestTrackingAuthorization();
		expect(fake.trackingRequestOptions).toStrictEqual([null]);
		tree.unmount();
	});
});
