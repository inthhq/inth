// #region docs:testing-screen title="analytics-screen.tsx"
import { useConsent, useSaveConsents } from '@c15t/react-native';
import { Pressable, Text, View } from 'react-native';

export const AnalyticsScreen = () => {
	const measurement = useConsent('measurement');
	const saveConsents = useSaveConsents();

	return (
		<View>
			<Text>{measurement ? 'Analytics on' : 'Analytics off'}</Text>
			<Pressable
				accessibilityRole="button"
				onPress={() => {
					void saveConsents('all');
				}}
			>
				<Text>Accept all</Text>
			</Pressable>
		</View>
	);
};
// #endregion docs:testing-screen
