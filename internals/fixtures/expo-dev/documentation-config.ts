// #region docs:expo-config title="app.config.ts"
import type { InthPluginProps } from '@inth/react-native/expo-plugin';
import type { ExpoConfig } from 'expo/config';

const consent: InthPluginProps = {
	androidMavenRepository: {
		credentials: {
			passwordEnvironmentVariable: 'INTH_MAVEN_TOKEN',
			usernameEnvironmentVariable: 'INTH_MAVEN_USERNAME',
		},
		url: 'https://maven.pkg.github.com/inthhq/inth',
	},
	consentCategories: ['necessary', 'measurement', 'marketing'],
	policyResource: './inth-policy.json',
	projectUrl: 'https://example-inth.inth.app/',
};

const config: ExpoConfig = {
	name: 'My app',
	platforms: ['ios', 'android'],
	plugins: [['@inth/react-native', consent]],
	runtimeVersion: { policy: 'fingerprint' },
	slug: 'my-app',
};
export default config;
// #endregion docs:expo-config
