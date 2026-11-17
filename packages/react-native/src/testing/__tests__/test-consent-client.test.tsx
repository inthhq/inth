/**
 * The public test kit, driven the way an app's component test drives it: a
 * screen gated on a category, rendered under a provider, with the app's own
 * button, the simulated native prompt, and a change from the native side.
 */

import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { flushPromises, renderTree } from '../../__tests__/helpers/fake-native';
import type { RenderHandle } from '../../__tests__/helpers/fake-native';
import { resetNativeStub } from '../../__tests__/helpers/react-native-stub';
import { useConsent } from '../../hooks/use-consent';
import { useSaveConsents } from '../../hooks/use-consent-actions';
import type { SaveConsentsInput } from '../../hooks/use-consent-actions';
import { useConsentDecision } from '../../hooks/use-consent-decision';
import { getConsentClient, resetConsentClient } from '../../native/client';
import { getNativeInth, NativeInthUnavailableError } from '../../native/module';
import {
	onConsentPresenterOutcome,
	presentConsentPrompt,
	presentPreferences,
} from '../../native/presenter';
import type { ConsentPresenterOutcome } from '../../native/presenter';
import { isConsentScreenBusy } from '../../provider/auto-present';
import { ConsentProvider } from '../../provider/consent-provider';
import { createTestConsentClient } from '../index';
import type { TestConsentClient } from '../index';

const PRIVACY_URL = 'https://example.com/privacy';

/** A screen gated on measurement, with the app's own save button. */
const AnalyticsScreen = ({
	save = 'all',
}: {
	readonly save?: SaveConsentsInput;
}): ReactNode => {
	const allowed = useConsent('measurement');
	const decision = useConsentDecision('marketing');
	const saveConsents = useSaveConsents();

	return (
		<>
			<span>{allowed ? 'Analytics on' : 'Analytics off'}</span>
			<span>{`marketing:${decision}`}</span>
			<button
				onClick={() => {
					void saveConsents(save);
				}}
				type="button"
			>
				Save
			</button>
		</>
	);
};

const press = async function press(handle: RenderHandle): Promise<void> {
	handle.container().querySelector('button')?.click();
	await flushPromises();
};

/** Render the screen under a provider that publishes the test client. */
const renderScreen = function renderScreen(
	consent: TestConsentClient,
	screen: ReactNode = <AnalyticsScreen />
): RenderHandle {
	return renderTree(
		<ConsentProvider
			autoPresent={false}
			client={consent.client}
		>
			{screen}
		</ConsentProvider>
	);
};

let handle: RenderHandle | null = null;

afterEach(() => {
	handle?.unmount();
	handle = null;
	resetConsentClient();
	resetNativeStub();
});

describe('starting state', () => {
	test('unset owes the prompt and denies optional categories', () => {
		const consent = createTestConsentClient();

		handle = renderScreen(consent);

		expect(handle.text()).toContain('Analytics off');
		expect(handle.text()).toContain('marketing:denied');
		expect(consent.client.getSnapshot().promptRequirement.kind).toBe('choice');
	});

	test('granted, denied and a per-category choice are stored choices', () => {
		const granted = createTestConsentClient({ consent: 'granted' });
		expect(granted.client.isAllowed('marketing')).toBe(true);
		expect(granted.client.getSnapshot().promptRequirement).toEqual({
			kind: 'none',
		});

		const denied = createTestConsentClient({ consent: 'denied' });
		expect(denied.client.decision('measurement')).toBe('denied');
		expect(denied.client.getSnapshot().explicitChoice).not.toBeNull();

		const some = createTestConsentClient({ consent: { measurement: true } });
		handle = renderScreen(some);
		expect(handle.text()).toContain('Analytics on');
		expect(handle.text()).toContain('marketing:denied');
	});

	test('ready: false reads pending until setReady', () => {
		const consent = createTestConsentClient({
			consent: 'granted',
			ready: false,
		});

		handle = renderScreen(consent);
		expect(handle.text()).toContain('marketing:pending');

		consent.setReady();

		expect(handle.text()).toContain('marketing:granted');
	});

	test('snapshot fields override the state', () => {
		const consent = createTestConsentClient({
			snapshot: { model: 'opt-out' },
		});

		expect(consent.client.getSnapshot().model).toBe('opt-out');
	});
});

describe('what the app commits', () => {
	test('accept all is recorded and the gated screen rerenders', async () => {
		const consent = createTestConsentClient({ consent: 'unset' });
		handle = renderScreen(consent);

		await press(handle);

		expect(consent.commits).toEqual([{ action: 'all' }]);
		expect(handle.text()).toContain('Analytics on');
		expect(consent.client.getSnapshot().promptRequirement.kind).toBe('none');
	});

	test('reject all and a per-category save apply what they name', async () => {
		const consent = createTestConsentClient({ consent: 'granted' });
		handle = renderScreen(consent, <AnalyticsScreen save="none" />);

		await press(handle);
		expect(consent.commits).toEqual([{ action: 'necessary' }]);
		expect(handle.text()).toContain('Analytics off');

		handle.unmount();
		handle = renderScreen(
			consent,
			<AnalyticsScreen save={{ measurement: true }} />
		);
		await press(handle);

		expect(consent.commits.at(-1)).toEqual({
			action: 'explicit',
			consents: { measurement: true },
		});
		expect(handle.text()).toContain('Analytics on');
		expect(handle.text()).toContain('marketing:denied');
	});
});

describe('changes from the native side', () => {
	test('setConsent rerenders the hooks without act or a flush', () => {
		const consent = createTestConsentClient({ consent: 'denied' });
		handle = renderScreen(consent);

		consent.setConsent('granted');

		expect(handle.text()).toContain('Analytics on');
		expect(consent.commits).toEqual([]);

		consent.setConsent('unset');

		expect(handle.text()).toContain('Analytics off');
		expect(consent.client.getSnapshot().promptRequirement.kind).toBe('choice');
	});

	test('without an act environment the change still lands', () => {
		const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
		const consent = createTestConsentClient({ consent: 'denied' });
		environment.IS_REACT_ACT_ENVIRONMENT = false;
		try {
			consent.setConsent({ marketing: true });
		} finally {
			environment.IS_REACT_ACT_ENVIRONMENT = true;
		}

		expect(consent.client.decision('marketing')).toBe('granted');
	});
});

describe('the simulated native prompt', () => {
	test('a presenting provider opens the owed prompt, and accept all closes it', () => {
		const consent = createTestConsentClient({ consent: 'unset' });
		const outcomes: ConsentPresenterOutcome[] = [];
		const stop = onConsentPresenterOutcome((outcome) => {
			outcomes.push(outcome);
		});

		handle = renderTree(
			<ConsentProvider
				client={consent.client}
				privacyPolicyURL={PRIVACY_URL}
			>
				<AnalyticsScreen />
			</ConsentProvider>
		);

		expect(consent.prompt.isOpen).toBe(true);
		expect(consent.prompt.current).toMatchObject({
			automatic: true,
			presentation: 'prompt',
		});

		consent.prompt.acceptAll();
		stop();

		expect(consent.prompt.isOpen).toBe(false);
		expect(handle.text()).toContain('Analytics on');
		expect(outcomes).toEqual([expect.objectContaining({ kind: 'committed' })]);
		// The native screens save inside native, so nothing crossed the bridge.
		expect(consent.commits).toEqual([]);
	});

	test('a stored choice opens nothing', () => {
		const consent = createTestConsentClient({ consent: 'granted' });

		handle = renderTree(
			<ConsentProvider
				client={consent.client}
				privacyPolicyURL={PRIVACY_URL}
			>
				<AnalyticsScreen />
			</ConsentProvider>
		);

		expect(consent.prompt.isOpen).toBe(false);
	});

	test('the presenter calls reach the fake, and dismiss keeps the prompt owed', async () => {
		const consent = createTestConsentClient({ consent: 'unset' });
		handle = renderScreen(consent);

		expect(consent.prompt.isOpen).toBe(false);
		await expect(presentConsentPrompt(PRIVACY_URL)).resolves.toMatchObject({
			presentation: 'prompt',
			status: 'presented',
		});
		expect(consent.prompt.current?.automatic).toBe(false);
		await expect(presentPreferences(PRIVACY_URL)).resolves.toMatchObject({
			status: 'already-presented',
		});

		consent.prompt.dismiss();

		expect(consent.prompt.isOpen).toBe(false);
		expect(consent.client.getSnapshot().promptRequirement.kind).toBe('choice');

		await presentPreferences(PRIVACY_URL);
		consent.prompt.save({ marketing: true });

		expect(handle.text()).toContain('marketing:granted');
		expect(handle.text()).toContain('Analytics off');
		await expect(presentConsentPrompt(PRIVACY_URL)).resolves.toEqual({
			sessionId: null,
			status: 'not-required',
		});

		await presentPreferences(PRIVACY_URL);
		consent.prompt.rejectAll();
		expect(handle.text()).toContain('marketing:denied');
	});

	test('acknowledge answers an open notice without recording consent', async () => {
		const consent = createTestConsentClient({
			snapshot: { promptRequirement: { kind: 'notice', reason: 'missing' } },
		});
		await presentConsentPrompt(PRIVACY_URL);
		const outcomes: ConsentPresenterOutcome[] = [];
		const stop = onConsentPresenterOutcome((outcome) => {
			outcomes.push(outcome);
		});

		consent.prompt.acknowledge();
		stop();

		expect(consent.prompt.isOpen).toBe(false);
		expect(outcomes.map((outcome) => outcome.kind)).toEqual(['acknowledged']);
		expect(consent.client.getSnapshot().promptRequirement.kind).toBe('none');
		expect(consent.client.getSnapshot().explicitChoice).toBeNull();
		expect(consent.commits).toEqual([]);
	});

	test('dismissing a notice from code leaves standing preferences open', async () => {
		const consent = createTestConsentClient({
			snapshot: { promptRequirement: { kind: 'notice', reason: 'missing' } },
		});
		await presentPreferences(PRIVACY_URL);

		consent.client.dismissNotice();

		expect(consent.prompt.isOpen).toBe(true);
		expect(consent.client.getSnapshot().promptRequirement.kind).toBe('none');
	});

	test('a notice acknowledged after the policy went pending stays open', async () => {
		const consent = createTestConsentClient({
			snapshot: { promptRequirement: { kind: 'notice', reason: 'missing' } },
		});
		await presentConsentPrompt(PRIVACY_URL);
		consent.setReady(false);

		consent.prompt.acknowledge();

		expect(consent.prompt.isOpen).toBe(true);
		expect(consent.client.getSnapshot().promptRequirement.kind).toBe('notice');
	});

	test('a screen dismissed while the policy is pending ends as unavailable', async () => {
		const consent = createTestConsentClient({ consent: 'unset' });
		await presentPreferences(PRIVACY_URL);
		consent.setReady(false);
		const outcomes: ConsentPresenterOutcome[] = [];
		const stop = onConsentPresenterOutcome((outcome) => {
			outcomes.push(outcome);
		});

		consent.prompt.dismiss();
		stop();

		expect(outcomes.map((outcome) => outcome.kind)).toEqual(['unavailable']);
	});

	test('a choice answer on a notice prompt names the fix', async () => {
		const consent = createTestConsentClient({
			snapshot: { promptRequirement: { kind: 'notice', reason: 'missing' } },
		});
		await presentConsentPrompt(PRIVACY_URL);

		expect(() => consent.prompt.acceptAll()).toThrowError(/is a notice/u);
		expect(consent.commits).toEqual([]);
		expect(consent.prompt.isOpen).toBe(true);
	});

	test('acknowledge on the preferences screen names the fix', async () => {
		const consent = createTestConsentClient({
			snapshot: { promptRequirement: { kind: 'notice', reason: 'missing' } },
		});
		await presentPreferences(PRIVACY_URL);

		expect(() => consent.prompt.acknowledge()).toThrowError(/not a notice/u);
		expect(consent.client.getSnapshot().promptRequirement.kind).toBe('notice');
	});

	test('acknowledge on a choice prompt names the fix', async () => {
		const consent = createTestConsentClient({ consent: 'unset' });
		await presentConsentPrompt(PRIVACY_URL);

		expect(() => consent.prompt.acknowledge()).toThrowError(/not a notice/u);
	});

	test('answering with nothing open names the fix', () => {
		const consent = createTestConsentClient();

		expect(() => {
			consent.prompt.acceptAll();
		}).toThrow(/No consent prompt or preferences screen is open/u);
	});

	test('nativeUI: false presents nothing and needs no URL', () => {
		const consent = createTestConsentClient({ nativeUI: false });
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		handle = renderTree(
			<ConsentProvider client={consent.client}>
				<AnalyticsScreen />
			</ConsentProvider>
		);
		warn.mockRestore();

		expect(consent.prompt.isOpen).toBe(false);
		expect(handle.text()).toContain('Analytics off');
	});
});

describe('installation', () => {
	test('an app that renders its own provider reaches the test client', async () => {
		const consent = createTestConsentClient({ consent: 'unset' });

		expect(getConsentClient()).toBe(consent.client);

		const App = (): ReactNode => (
			<ConsentProvider autoPresent={false}>
				<AnalyticsScreen />
			</ConsentProvider>
		);
		handle = renderTree(<App />);
		await press(handle);

		expect(consent.commits).toEqual([{ action: 'all' }]);
		expect(handle.text()).toContain('Analytics on');
	});

	test('a nested provider given a client still never presents', () => {
		const consent = createTestConsentClient({ consent: 'unset' });

		handle = renderTree(
			<ConsentProvider
				autoPresent={false}
				client={consent.client}
			>
				<ConsentProvider
					client={consent.client}
					privacyPolicyURL={PRIVACY_URL}
				>
					<AnalyticsScreen />
				</ConsentProvider>
			</ConsentProvider>
		);

		expect(handle.text()).toContain('Analytics off');
		expect(consent.prompt.isOpen).toBe(false);
	});

	test('the next test client replaces the last, and dispose uninstalls it', () => {
		const first = createTestConsentClient({ consent: 'denied' });
		const second = createTestConsentClient({ consent: 'granted' });

		first.setConsent('granted');
		expect(getConsentClient()).toBe(second.client);
		expect(getNativeInth()).not.toBeNull();

		second.dispose();
		second.dispose();

		expect(() => getNativeInth()).toThrow(NativeInthUnavailableError);
	});
});

describe('disposal', () => {
	test("a disposed client does not hear the next client's screens", async () => {
		const first = createTestConsentClient({ consent: 'unset' });
		handle = renderTree(
			<ConsentProvider
				autoPresent={false}
				client={first.client}
			>
				<AnalyticsScreen />
			</ConsentProvider>
		);
		handle.unmount();
		handle = null;

		const second = createTestConsentClient({ consent: 'unset' });
		await presentPreferences(PRIVACY_URL);

		expect(second.prompt.isOpen).toBe(true);
		expect(isConsentScreenBusy(first.client)).toBe(false);
	});
});

describe('what a commit records', () => {
	test('accept all with nothing optional in scope keeps the stored choice', async () => {
		const consent = createTestConsentClient({
			consent: 'unset',
			snapshot: { consentCategories: ['necessary'] },
		});

		const result = await consent.client.commit({ action: 'all' });

		expect(result.confirmed).toEqual([]);
		expect(consent.client.getSnapshot().explicitChoice).toBeNull();
		expect(consent.client.getSnapshot().promptRequirement.kind).toBe('none');
	});

	test('a save leaves an owed notice to its own acknowledgement', async () => {
		const consent = createTestConsentClient({
			snapshot: { promptRequirement: { kind: 'notice', reason: 'missing' } },
		});

		await consent.client.commit({ action: 'all' });

		expect(consent.client.getSnapshot().promptRequirement.kind).toBe('notice');
	});

	test('receipts removed by setConsent no longer count toward the prompt', async () => {
		const consent = createTestConsentClient({
			consent: { experience: true, functionality: true, measurement: true },
			// Already owed, so setConsent('unset') keeps the same owed prompt.
			snapshot: {
				promptOwedSince: 1,
				promptRequirement: { kind: 'choice', reason: 'missing' },
			},
		});
		consent.setConsent('unset');

		await consent.client.commit({
			action: 'explicit',
			consents: { marketing: false },
		});

		expect(consent.client.getSnapshot().promptRequirement.kind).toBe('choice');
	});

	test('saving unchanged preferences with nothing owed writes nothing', async () => {
		const consent = createTestConsentClient({ consent: 'granted' });
		const { revision } = consent.client.getSnapshot();
		await presentPreferences(PRIVACY_URL);
		const outcomes: ConsentPresenterOutcome[] = [];
		const stop = onConsentPresenterOutcome((outcome) => {
			outcomes.push(outcome);
		});

		consent.prompt.save({});
		stop();

		expect(outcomes.map((outcome) => outcome.kind)).toEqual(['dismissed']);
		expect(consent.client.getSnapshot().revision).toBe(revision);
	});

	test('a restricted category stays denied after accept all', async () => {
		const consent = createTestConsentClient({
			consent: 'unset',
			snapshot: { restrictions: { marketing: ['gpc'] } },
		});

		await consent.client.commit({ action: 'all' });

		expect(consent.client.isAllowed('measurement')).toBe(true);
		expect(consent.client.isAllowed('marketing')).toBe(false);
	});

	test('the simulated save starts untouched toggles from the stored choice', async () => {
		const consent = createTestConsentClient({
			consent: 'unset',
			snapshot: {
				effectivePermissions: {
					experience: true,
					functionality: true,
					marketing: true,
					measurement: true,
					necessary: true,
				},
			},
		});
		await presentPreferences(PRIVACY_URL);

		consent.prompt.save({ measurement: true });

		expect(consent.client.isAllowed('measurement')).toBe(true);
		expect(consent.client.isAllowed('marketing')).toBe(false);
	});

	test('valid receipts count toward a prompt owed for missing categories', async () => {
		const consent = createTestConsentClient({
			consent: { experience: true, functionality: true, measurement: true },
			snapshot: { promptRequirement: { kind: 'choice', reason: 'missing' } },
		});

		await consent.client.commit({
			action: 'explicit',
			consents: { marketing: false },
		});

		expect(consent.client.getSnapshot().promptRequirement.kind).toBe('none');
	});

	test('receipts a re-consent prompt replaced do not settle it', async () => {
		const consent = createTestConsentClient({
			consent: 'granted',
			snapshot: {
				promptRequirement: { kind: 'choice', reason: 'policy-changed' },
			},
		});
		expect(consent.client.getSnapshot().explicitChoice).not.toBeNull();

		await consent.client.commit({
			action: 'explicit',
			consents: { measurement: true },
		});

		expect(consent.client.getSnapshot().promptRequirement.kind).toBe('choice');
	});

	test('an IAB save confirms only the categories it names', async () => {
		const consent = createTestConsentClient({ consent: 'unset' });

		const result = await consent.client.commit({
			action: 'iab',
			choices: {} as never,
			consents: { measurement: true },
		});

		expect(result.confirmed).toEqual(['measurement']);
		expect(consent.client.getSnapshot().promptRequirement.kind).toBe('choice');
	});

	test('dismissing a notice closes it and publishes the next snapshot', () => {
		const consent = createTestConsentClient({
			snapshot: { promptRequirement: { kind: 'notice', reason: 'missing' } },
		});
		const before = consent.client.getSnapshot();
		expect(before.promptRequirement.kind).toBe('notice');

		consent.client.dismissNotice();

		const after = consent.client.getSnapshot();
		expect(after.promptRequirement.kind).toBe('none');
		expect(after.revision).toBe(before.revision + 1);
	});

	test('an explicit save records a category outside the scope for later', async () => {
		const consent = createTestConsentClient({
			consent: 'unset',
			snapshot: { consentCategories: ['necessary', 'measurement'] },
		});

		const result = await consent.client.commit({
			action: 'explicit',
			consents: { marketing: true, measurement: true },
		});

		expect(result.confirmed).toEqual(['measurement', 'marketing']);
		expect(
			consent.client.getSnapshot().explicitChoice?.categories.marketing?.value
		).toBe(true);
		// The policy still governs a category outside its scope.
		expect(consent.client.isAllowed('marketing')).toBe(false);
	});

	test('reject all acts only on the categories in scope', async () => {
		const consent = createTestConsentClient({
			consent: 'granted',
			snapshot: { consentCategories: ['necessary', 'measurement'] },
		});

		const result = await consent.client.commit({ action: 'necessary' });

		expect(result.confirmed).toEqual(['measurement']);
		expect(consent.client.isAllowed('measurement')).toBe(false);
		// Outside the scope, the policy's value stands.
		expect(consent.client.isAllowed('marketing')).toBe(true);
	});

	test('a save that names one category leaves the prompt owed for the rest', async () => {
		const consent = createTestConsentClient({ consent: 'unset' });

		const result = await consent.client.commit({
			action: 'explicit',
			consents: { measurement: true },
		});

		expect(result.confirmed).toEqual(['measurement']);
		expect(consent.client.isAllowed('measurement')).toBe(true);
		expect(consent.client.isAllowed('marketing')).toBe(false);
		expect(consent.client.getSnapshot().promptRequirement.kind).toBe('choice');

		await consent.client.commit({ action: 'all' });
		expect(consent.client.getSnapshot().promptRequirement.kind).toBe('none');
	});

	test('confirmed lists every category the action recorded, granted or denied', async () => {
		const consent = createTestConsentClient({ consent: 'granted' });

		const rejected = await consent.client.commit({ action: 'necessary' });
		const explicit = await consent.client.commit({
			action: 'explicit',
			consents: { marketing: false },
		});

		expect(rejected.confirmed).toEqual([
			'functionality',
			'experience',
			'measurement',
			'marketing',
		]);
		expect(explicit.confirmed).toEqual(['marketing']);
	});
});

describe('the automatic prompt across snapshot changes', () => {
	const renderPresenting = (consent: TestConsentClient): RenderHandle =>
		renderTree(
			<ConsentProvider
				client={consent.client}
				privacyPolicyURL={PRIVACY_URL}
			>
				<AnalyticsScreen />
			</ConsentProvider>
		);

	test('a clean first layer follows a policy refresh and still saves', () => {
		const consent = createTestConsentClient({ consent: 'unset' });
		handle = renderPresenting(consent);
		expect(consent.prompt.isOpen).toBe(true);

		consent.setReady(false);
		consent.setReady(true);
		consent.prompt.acceptAll();

		expect(consent.prompt.isOpen).toBe(false);
		expect(consent.client.isAllowed('measurement')).toBe(true);
	});

	test('closing standing preferences presents a prompt still owed', async () => {
		const consent = createTestConsentClient({ consent: 'unset' });
		await presentPreferences(PRIVACY_URL);
		handle = renderPresenting(consent);
		expect(consent.prompt.current?.presentation).toBe('preferences');

		consent.prompt.dismiss();

		expect(consent.prompt.current).toMatchObject({
			automatic: true,
			presentation: 'prompt',
		});
	});

	test('a dismissed prompt opens again once it is owed again', () => {
		const consent = createTestConsentClient({ consent: 'unset' });
		handle = renderPresenting(consent);
		consent.prompt.dismiss();

		consent.setConsent('granted');
		consent.setConsent('unset');

		expect(consent.prompt.isOpen).toBe(true);
	});

	test('the first layer follows a save the app made while it was open', async () => {
		const consent = createTestConsentClient({ consent: 'unset' });
		handle = renderPresenting(consent);
		expect(consent.prompt.isOpen).toBe(true);

		await consent.client.commit({
			action: 'explicit',
			consents: { measurement: true },
		});
		consent.prompt.rejectAll();

		expect(consent.prompt.isOpen).toBe(false);
		expect(consent.client.isAllowed('measurement')).toBe(false);
	});

	test('a dismissed notice opens again by itself', () => {
		const consent = createTestConsentClient({
			snapshot: { promptRequirement: { kind: 'notice', reason: 'missing' } },
		});
		handle = renderPresenting(consent);
		expect(consent.prompt.isOpen).toBe(true);
		consent.prompt.dismiss();

		handle.unmount();
		handle = renderPresenting(consent);

		expect(consent.prompt.isOpen).toBe(true);
	});

	test('a dismissed prompt is not opened again by itself until it changes', () => {
		const consent = createTestConsentClient({ consent: 'unset' });
		handle = renderPresenting(consent);
		consent.prompt.dismiss();
		expect(consent.prompt.isOpen).toBe(false);

		handle.unmount();
		handle = renderPresenting(consent);

		expect(consent.prompt.isOpen).toBe(false);
	});
});

describe('what the native cores refuse', () => {
	test('an answer on a screen opened before consent moved stores nothing', async () => {
		const consent = createTestConsentClient({ consent: 'unset' });
		await presentPreferences(PRIVACY_URL);
		consent.setConsent('denied');

		consent.prompt.acceptAll();

		expect(consent.prompt.isOpen).toBe(true);
		expect(consent.client.isAllowed('measurement')).toBe(false);
	});

	test('dismissing a notice closes the notice screen that shows it', async () => {
		const consent = createTestConsentClient({
			snapshot: { promptRequirement: { kind: 'notice', reason: 'missing' } },
		});
		await presentConsentPrompt(PRIVACY_URL);
		expect(consent.prompt.isOpen).toBe(true);

		const outcomes: ConsentPresenterOutcome[] = [];
		const stop = onConsentPresenterOutcome((outcome) => {
			outcomes.push(outcome);
		});

		consent.client.dismissNotice();
		stop();

		expect(consent.prompt.isOpen).toBe(false);
		expect(outcomes.map((outcome) => outcome.kind)).toEqual(['dismissed']);
	});

	test('finishing start-up after a reset that began pending resolves the policy', async () => {
		const consent = createTestConsentClient({ consent: 'granted' });
		const before = consent.client.getSnapshot();
		consent.setReady(false);

		await consent.client.reset();
		consent.setReady();

		expect(consent.client.getSnapshot().resolution).toEqual(before.resolution);
		expect(consent.client.getSnapshot().promptRequirement.kind).toBe('choice');
	});

	test('finishing start-up after reset resolves the policy and owes the prompt', async () => {
		const consent = createTestConsentClient({ consent: 'granted' });
		const before = consent.client.getSnapshot();

		await consent.client.reset();
		consent.setReady();

		const after = consent.client.getSnapshot();
		expect(after.ready).toBe(true);
		expect(after.resolution).toEqual(before.resolution);
		expect(after.promptRequirement.kind).toBe('choice');
	});

	test('reset returns the policy model to the cold-start default', async () => {
		const consent = createTestConsentClient({
			consent: 'granted',
			snapshot: { model: 'opt-out' },
		});

		await consent.client.reset();

		expect(consent.client.getSnapshot().model).toBe('opt-in');
	});

	test('reset ends a screen still showing as unavailable', async () => {
		const consent = createTestConsentClient({ consent: 'unset' });
		await presentPreferences(PRIVACY_URL);
		const outcomes: ConsentPresenterOutcome[] = [];
		const stop = onConsentPresenterOutcome((outcome) => {
			outcomes.push(outcome);
		});

		await consent.client.reset();
		stop();

		expect(consent.prompt.isOpen).toBe(false);
		expect(outcomes.map((outcome) => outcome.kind)).toEqual(['unavailable']);
	});

	test('reset wipes consent and keeps overrides, subject and scope', async () => {
		const consent = createTestConsentClient({
			consent: 'granted',
			snapshot: {
				consentCategories: ['necessary', 'measurement'],
				overrides: { country: 'DE', gpc: null, language: 'de', region: null },
			},
		});
		const before = consent.client.getSnapshot();

		await consent.client.reset();

		const after = consent.client.getSnapshot();
		expect(after.consentCategories).toEqual(['necessary', 'measurement']);
		expect(after.overrides).toEqual(before.overrides);
		expect(after.subject).toEqual(before.subject);
		expect(after.explicitChoice).toBeNull();
		// The resolved policy goes too, until the next init.
		expect(after.location).toBeNull();
		expect(after.resolution.status).toBe('unconfigured');
		expect(consent.client.isAllowed('measurement')).toBe(false);
	});

	test('an answer on an open screen while the policy is pending stores nothing', async () => {
		const consent = createTestConsentClient({ consent: 'unset' });
		await presentPreferences(PRIVACY_URL);
		consent.setReady(false);

		consent.prompt.acceptAll();

		expect(consent.prompt.isOpen).toBe(true);
		expect(consent.client.isAllowed('measurement')).toBe(false);
	});

	test('a save before the policy resolves is refused and changes nothing', async () => {
		const consent = createTestConsentClient({ consent: 'unset', ready: false });

		const result = await consent.client.commit({ action: 'all' });

		expect(result).toMatchObject({ ok: false, reason: 'policy-pending' });
		expect(consent.client.isAllowed('measurement')).toBe(false);
	});

	test('a draft opened before the consent moved is refused and changes nothing', async () => {
		const consent = createTestConsentClient({ consent: 'unset' });
		const openedOn = consent.client.getSnapshot().revision;
		consent.setConsent('denied');

		const result = await consent.client.commit({
			action: 'explicit',
			consents: { measurement: true },
			revision: openedOn,
		});

		expect(result).toMatchObject({ ok: false, reason: 'concurrent-change' });
		expect(consent.client.isAllowed('measurement')).toBe(false);
	});

	test('a build without the stock screens refuses to present them', async () => {
		createTestConsentClient({ consent: 'unset', nativeUI: false });

		await expect(presentConsentPrompt(PRIVACY_URL)).rejects.toMatchObject({
			code: 'INTH_NATIVE_UI_EXCLUDED',
		});
		await expect(presentPreferences(PRIVACY_URL)).rejects.toMatchObject({
			code: 'INTH_NATIVE_UI_EXCLUDED',
		});
	});

	test.each([
		'http://example.com/privacy',
		'/privacy',
		'https://',
		' https://example.com/privacy',
		'https://exämple.com/privacy',
	])('presenting with %s is refused as an invalid URL', async (url) => {
		createTestConsentClient({ consent: 'unset' });

		await expect(presentPreferences(url)).rejects.toMatchObject({
			code: 'INTH_PRESENTER_INVALID_URL',
		});
	});
});
