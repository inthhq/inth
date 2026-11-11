import {
	ConsentProvider,
	presentPreferences,
	useConsentStatus,
	useConsent,
} from '@c15t/react-native';
import type { PropsWithChildren } from 'react';

import { benchmarkConfig } from './benchmark-config';

export const ConsentBoundary = ({ children }: PropsWithChildren) => (
	<ConsentProvider>{children}</ConsentProvider>
);
export const useSizeConsent = () => {
	const status = useConsentStatus();
	const measurement = useConsent('measurement');
	return {
		measurement,
		open: () => presentPreferences(benchmarkConfig.c15t.privacyUrl),
		ready: status.ready,
	};
};
