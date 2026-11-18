// #region docs:app-entry title="App.tsx"
import { ConsentProvider } from '@inth/react-native';
import { Text, View } from 'react-native';

import { PrivacySettingsButton } from './setup';

const App = () => (
	<ConsentProvider privacyPolicyURL="https://example.com/privacy">
		<View>
			<Text>My app</Text>
			<PrivacySettingsButton />
		</View>
	</ConsentProvider>
);

export default App;
// #endregion docs:app-entry
