// #region docs:commit-results title="privacy-actions.tsx"
import { useSaveConsents } from '@inth/react-native';
import { useState } from 'react';
import { Button, Text, View } from 'react-native';

export const RejectOptionalUse = ({ onSaved }: { onSaved: () => void }) => {
	const saveConsents = useSaveConsents();
	const [message, setMessage] = useState('');
	const [pending, setPending] = useState(false);
	const reject = async () => {
		setPending(true);
		let saved = false;
		try {
			const result = await saveConsents('none');
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
