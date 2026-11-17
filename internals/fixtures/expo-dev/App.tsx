/**
 * Root component: attach a consent core, then render the shell.
 *
 * Nothing Expo-specific appears below this file. `src/` is the same fixture the bare
 * React Native example runs, on purpose: the two apps should fail in the same place
 * when the package does, so a difference between them points at the native wiring
 * rather than at the consent code.
 */

import { StatusBar } from 'react-native';

import { App as Shell, UnavailableScreen } from './src/app';
import { VendorJourneyApp } from './src/e2e/vendor-journey-app';
import { config } from './src/inth/config';
import {
	ConsentSourceProvider,
	useConsentSource,
} from './src/inth/consent-source';

const Root = () => {
	const { nativeError } = useConsentSource();
	// App E2E builds only: real vendor SDKs under the native presenter.
	const Host = config.e2e.enabled ? VendorJourneyApp : Shell;

	return (
		<>
			<StatusBar barStyle="dark-content" />
			{nativeError === null ? <Host /> : <UnavailableScreen />}
		</>
	);
};

const App = () => (
	<ConsentSourceProvider>
		<Root />
	</ConsentSourceProvider>
);

export default App;
