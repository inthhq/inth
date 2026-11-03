// #region docs:app-entry title="App.tsx"
import { Text, View } from 'react-native';

import { PrivacyApp } from './setup';

const App = () => (
	<PrivacyApp privacyPolicyURL="https://example.com/privacy">
		<View>
			<Text>My app</Text>
		</View>
	</PrivacyApp>
);

export default App;
// #endregion docs:app-entry
