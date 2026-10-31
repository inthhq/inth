import {
	C15tProvider,
	presentPreferences,
	useConsentStatus,
	useIsAllowed,
} from '@c15t/react-native';
import type { PropsWithChildren } from 'react';

import { benchmarkConfig } from './benchmark-config';

export const ConsentBoundary = ({ children }: PropsWithChildren) => (
	<C15tProvider>{children}</C15tProvider>
);
export const useSizeConsent = () => {
	const status = useConsentStatus();
	const measurement = useIsAllowed('measurement');
	return {
		measurement,
		open: () => presentPreferences(benchmarkConfig.c15t.privacyUrl),
		ready: status.ready,
	};
};
