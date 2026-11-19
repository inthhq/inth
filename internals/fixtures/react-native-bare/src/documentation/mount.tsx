// #region docs:app-entry title="App.tsx"
import { InthProvider } from '@inth/react-native';
import { Text, View } from 'react-native';

import { PrivacySettingsButton } from './setup';

const App = () => (
	<InthProvider privacyPolicyUrl="https://example.com/privacy">
		<View>
			<Text>My app</Text>
			<PrivacySettingsButton />
		</View>
	</InthProvider>
);

export default App;
// #endregion docs:app-entry
