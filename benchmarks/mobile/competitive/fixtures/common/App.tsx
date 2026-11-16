import { Button, Text, View } from 'react-native';

import { ConsentBoundary, useSizeConsent } from './consent-adapter';

const Screen = () => {
	const { measurement, open: handleOpen, ready } = useSizeConsent();
	return (
		<View style={{ padding: 32 }}>
			<Text>{ready ? 'Ready' : 'Starting'}</Text>
			<Text>{measurement ? 'Measurement allowed' : 'Measurement denied'}</Text>
			<Button
				disabled={!handleOpen}
				title="Privacy settings"
				onPress={handleOpen}
			/>
		</View>
	);
};
const App = () => (
	<ConsentBoundary>
		<Screen />
	</ConsentBoundary>
);
export default App;
