// #region docs:category-preferences title="category-preferences.tsx"
import {
	useConsent,
	useConsentActions,
	useIsAllowed,
} from '@c15t/react-native';
import { useState } from 'react';
import { Switch, Text, View } from 'react-native';

export const MeasurementPreference = () => {
	const snapshot = useConsent();
	const allowed = useIsAllowed('measurement');
	const { save } = useConsentActions();
	const [pending, setPending] = useState(false);
	const [message, setMessage] = useState('');
	const restrictions = snapshot.restrictions.measurement ?? [];
	const enforced = restrictions.some((reason) => reason !== 'explicit-denial');

	if (!snapshot.consentCategories?.includes('measurement')) {
		return null;
	}

	const changeMeasurement = async (enabled: boolean) => {
		setPending(true);
		setMessage('');
		try {
			const result = await save({ measurement: enabled });
			setMessage(
				result.ok ? 'Saved on this device.' : `Nothing saved: ${result.reason}.`
			);
		} catch (error: unknown) {
			setMessage(`Could not save: ${String(error)}`);
		}
		setPending(false);
	};

	return (
		<View>
			<Text>Analytics</Text>
			<Text>Allow us to measure how you use the app.</Text>
			<Switch
				accessibilityLabel="Allow analytics"
				disabled={
					pending ||
					!snapshot.ready ||
					snapshot.policyPending ||
					(enforced && !allowed)
				}
				value={allowed}
				onValueChange={(enabled) => {
					void changeMeasurement(enabled);
				}}
			/>
			{restrictions.includes('gpc') && (
				<Text>Your privacy signal keeps analytics off.</Text>
			)}
			<Text accessibilityLiveRegion="polite">{message}</Text>
		</View>
	);
};
// #endregion docs:category-preferences
