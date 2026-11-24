/// <reference types="vite-plus/test/globals" />
/**
 * The component test the "Test your app" page shows, written for Jest with
 * `jest-expo` and React Native Testing Library. This fixture only type-checks
 * it: Vitest's global types stand in for Jest's, and the file name keeps the
 * fixture's own Vitest run away from it.
 */
// #region docs:testing-component-test title="analytics-screen.test.tsx"
import { InthProvider } from '@inth/react-native';
import { createTestConsentClient } from '@inth/react-native/testing';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { AnalyticsScreen } from './analytics-screen';

describe('AnalyticsScreen', () => {
	test('stays off until the person accepts', async () => {
		const consent = createTestConsentClient({ consent: 'unset' });

		await render(
			<InthProvider
				client={consent.client}
				autoPresent={false}
			>
				<AnalyticsScreen />
			</InthProvider>
		);
		expect(screen.getByText('Analytics off')).toBeTruthy();

		await fireEvent.press(screen.getByRole('button', { name: 'Accept all' }));

		expect(await screen.findByText('Analytics on')).toBeTruthy();
		expect(consent.commits).toEqual([{ action: 'all' }]);
	});

	test('follows a choice made outside JavaScript', async () => {
		const consent = createTestConsentClient({ consent: 'denied' });

		await render(
			<InthProvider
				client={consent.client}
				autoPresent={false}
			>
				<AnalyticsScreen />
			</InthProvider>
		);
		consent.setConsent({ measurement: true });

		expect(screen.getByText('Analytics on')).toBeTruthy();
	});

	test('the native prompt opens by itself, and accept all turns analytics on', async () => {
		const consent = createTestConsentClient({ consent: 'unset' });

		await render(
			<InthProvider
				client={consent.client}
				privacyPolicyUrl="https://example.com/privacy"
			>
				<AnalyticsScreen />
			</InthProvider>
		);
		expect(consent.prompt.isOpen).toBe(true);

		consent.prompt.acceptAll();

		expect(screen.getByText('Analytics on')).toBeTruthy();
		expect(consent.prompt.isOpen).toBe(false);
	});
});
// #endregion docs:testing-component-test
