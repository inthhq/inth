// #region docs:commit-results title="privacy-actions.tsx"
import { useConsentActions } from '@c15t/react-native';
import { useState } from 'react';
import { Button, Text, View } from 'react-native';

export const RejectOptionalUse = ({ onSaved }: { onSaved: () => void }) => {
	const { rejectAll } = useConsentActions();
	const [message, setMessage] = useState('');
	const [pending, setPending] = useState(false);
	const reject = async () => {
		setPending(true);
		let saved = false;
		try {
			const result = await rejectAll();
			if (result.ok) {
				saved = true;
			} else {
				setMessage(`Nothing saved. Retry after resolving ${result.reason}.`);
			}
		} catch (error: unknown) {
			setMessage(`Could not confirm a local save: ${String(error)}`);
		}
		setPending(false);
		if (saved) {
			onSaved();
		}
	};
	return (
		<View>
			<Button
				title="Reject optional use"
				disabled={pending}
				onPress={() => {
					void reject();
				}}
			/>
			<Text accessibilityLiveRegion="polite">{message}</Text>
		</View>
	);
};
// #endregion docs:commit-results
