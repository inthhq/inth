/**
 * App E2E only: the host the real-vendor consent journey drives.
 *
 * The vendor SDKs, their Inth connections and the probe are the bare fixture's
 * (`react-native-bare/src/vendors`), imported unchanged so both apps prove the
 * same code. Consent controls belong to the stock native presenter. This screen
 * only presents it, sends vendor probes and shows the prompt state and the
 * measurement decision that the native journeys wait on before they probe.
 */

import {
	presentConsentPrompt,
	presentPreferences,
	useConsentStatus,
	useConsent,
} from '@inth/react-native';
import { useEffect, useState } from 'react';
import { Button, Text, View } from 'react-native';

import { useE2eVendorProbe } from '../../../react-native-bare/src/vendors/e2e-vendor-probe';
import { config } from '../inth/config';

const privacyPolicyUrl = 'https://c15t.com/privacy';

const present = async (
	preferences: boolean,
	onError: (message: string) => void
): Promise<void> => {
	try {
		await (preferences
			? presentPreferences(privacyPolicyUrl)
			: presentConsentPrompt(privacyPolicyUrl));
	} catch (failure: unknown) {
		onError(String(failure));
	}
};

/** Render the vendor journey host. */
export const VendorJourneyApp = () => {
	const vendors = useE2eVendorProbe(config.e2e);
	const status = useConsentStatus();
	const measurement = useConsent('measurement');
	const [error, setError] = useState('');

	const handleProbe = vendors.probe;

	// The startup probe goes first: it shows what an app that tracks at launch
	// sends before any decision, and Android pauses JavaScript timers while the
	// prompt's Activity is in front.
	useEffect(() => {
		if (
			!vendors.startupSettled ||
			status.policyPending ||
			status.promptRequirement.kind === 'none'
		) {
			return;
		}
		void present(false, setError);
	}, [
		status.policyPending,
		status.promptRequirement.kind,
		vendors.startupSettled,
	]);

	return (
		<View style={{ flex: 1, gap: 24, padding: 32, paddingTop: 80 }}>
			<Text accessibilityRole="header">Inth vendor journey</Text>
			<Button
				testID="fixture.open-preferences"
				title="Privacy settings"
				onPress={() => {
					void present(true, setError);
				}}
			/>
			<Button
				testID="fixture.vendor-probe"
				title="Send a vendor probe"
				onPress={handleProbe}
			/>
			<Text testID="fixture.prompt">
				{`prompt:${status.promptRequirement.kind}`}
			</Text>
			<Text testID="fixture.measurement">
				{measurement ? 'measurement:granted' : 'measurement:denied'}
			</Text>
			<Text testID="fixture.vendors-started">
				{vendors.startupSettled ? 'vendors:started' : 'vendors:starting'}
			</Text>
			<Text>{error}</Text>
		</View>
	);
};
