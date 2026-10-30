import {
	C15tProvider,
	presentPreferences,
	useConsent,
} from '@c15t/react-native';
import type { PropsWithChildren } from 'react';

import { benchmarkConfig } from './benchmark-config';
import type { RuntimeConsent } from './runtime-types';

export const ConsentBoundary = ({ children }: PropsWithChildren) => (
	<C15tProvider>{children}</C15tProvider>
);
export const useRuntimeConsent = (): RuntimeConsent => {
	const raw = useConsent();
	const choice = raw.explicitChoice?.categories.measurement;
	const ready =
		raw.ready &&
		!raw.policyPending &&
		raw.error === null &&
		raw.consentCategories?.includes('measurement') === true &&
		choice?.value === false &&
		choice.confirmedAt > 0 &&
		raw.effectivePermissions.measurement === false;
	return {
		open: () => {
			void presentPreferences(benchmarkConfig.c15t.privacyUrl);
		},
		ready,
		snapshot: raw,
		targetId: 'measurement',
	};
};
