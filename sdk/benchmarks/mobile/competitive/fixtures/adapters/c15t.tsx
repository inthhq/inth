import {
	C15tProvider,
	presentPreferences,
	useConsent,
	useConsentStatus,
	useIsAllowed,
} from '@c15t/react-native';
import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';

import { benchmarkConfig } from './benchmark-config';

export const ConsentBoundary = ({ children }: PropsWithChildren) => (
	<C15tProvider>{children}</C15tProvider>
);
export const useSizeConsent = () => {
	const snapshot = useConsent();
	useEffect(() => {
		console.info(
			'CMP_SIZE_C15T_STATE',
			JSON.stringify({
				consentCategories: snapshot.consentCategories,
				effectivePermissions: snapshot.effectivePermissions,
				error: snapshot.error,
				explicitChoice: snapshot.explicitChoice,
				policyPending: snapshot.policyPending,
				ready: snapshot.ready,
			})
		);
	}, [snapshot]);
	const status = useConsentStatus();
	const measurement = useIsAllowed('measurement');
	return {
		measurement,
		open: () => presentPreferences(benchmarkConfig.c15t.privacyUrl),
		ready: status.ready,
	};
};
