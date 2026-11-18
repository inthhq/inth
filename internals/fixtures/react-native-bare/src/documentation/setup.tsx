// #region docs:native-root title="setup.tsx"
import { presentPreferences } from '@inth/react-native';
import { Button } from 'react-native';

export const PrivacySettingsButton = () => (
	<Button
		title="Privacy settings"
		onPress={() => {
			void presentPreferences('https://example.com/privacy');
		}}
	/>
);
// #endregion docs:native-root
