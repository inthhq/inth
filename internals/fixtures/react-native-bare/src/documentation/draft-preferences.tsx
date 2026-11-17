// #region docs:draft-preferences title="privacy-settings.tsx"
import { useConsentDraft } from '@c15t/react-native';
import type { AllConsentNames } from '@c15t/react-native';
import { useState } from 'react';
import { Button, Switch, Text, View } from 'react-native';

const LABELS: Record<AllConsentNames, string> = {
	experience: 'Personalization',
	functionality: 'Preferences',
	marketing: 'Marketing',
	measurement: 'Analytics',
	necessary: 'Required',
};

export const PrivacySettings = ({ onSaved }: { onSaved: () => void }) => {
	const draft = useConsentDraft();
	const [message, setMessage] = useState('');

	const save = async () => {
		const result = await draft.save();
		if (result.ok) {
			onSaved();
		} else {
			setMessage(`Nothing saved: ${result.reason}.`);
		}
	};

	return (
		<View>
			{draft.displayedCategories.map((category) => (
				<View key={category}>
					<Text>{LABELS[category]}</Text>
					<Switch
						accessibilityLabel={`Allow ${LABELS[category]}`}
						disabled={category === 'necessary'}
						value={draft.values[category]}
						onValueChange={(value) => draft.set(category, value)}
					/>
				</View>
			))}
			{draft.isStale ? (
				<>
					<Text>The privacy policy changed. Review your choices again.</Text>
					<Button
						title="Review again"
						onPress={() => {
							draft.reset();
						}}
					/>
				</>
			) : (
				<Button
					title="Save choices"
					onPress={() => {
						void save();
					}}
				/>
			)}
			<Button
				title="Accept all"
				onPress={() => {
					draft.acceptAll();
				}}
			/>
			<Button
				title="Reject all"
				onPress={() => {
					draft.rejectAll();
				}}
			/>
			<Text accessibilityLiveRegion="polite">{message}</Text>
		</View>
	);
};
// #endregion docs:draft-preferences
