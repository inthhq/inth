// #region docs:native-root title="setup.tsx"
import {
	ConsentProvider,
	onConsentPresenterOutcome,
	presentConsentPrompt,
	presentPreferences,
	useConsentStatus,
} from '@c15t/react-native';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Text, View } from 'react-native';

const PrivacyEntry = ({ privacyPolicyURL }: { privacyPolicyURL: string }) => {
	const status = useConsentStatus();
	const [message, setMessage] = useState('');
	useEffect(
		() => onConsentPresenterOutcome((outcome) => setMessage(outcome.kind)),
		[]
	);
	useEffect(() => {
		if (status.policyPending || status.promptRequirement.kind === 'none') {
			return;
		}
		const present = async () => {
			try {
				await presentConsentPrompt(privacyPolicyURL);
			} catch (error: unknown) {
				setMessage(String(error));
			}
		};
		void present();
	}, [privacyPolicyURL, status.policyPending, status.promptRequirement.kind]);
	const openPreferences = async () => {
		try {
			await presentPreferences(privacyPolicyURL);
		} catch (error: unknown) {
			setMessage(String(error));
		}
	};
	return (
		<View>
			<Button
				title="Privacy settings"
				onPress={() => {
					void openPreferences();
				}}
			/>
			<Text accessibilityLiveRegion="polite">{message}</Text>
		</View>
	);
};

export const PrivacyApp = ({
	children,
	privacyPolicyURL,
}: {
	children: ReactNode;
	privacyPolicyURL: string;
}) => (
	<ConsentProvider>
		{children}
		<PrivacyEntry privacyPolicyURL={privacyPolicyURL} />
	</ConsentProvider>
);
// #endregion docs:native-root
