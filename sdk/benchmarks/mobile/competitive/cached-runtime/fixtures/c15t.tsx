import {
	C15tProvider,
	useConsent,
	presentPreferences,
	getConsentClient,
} from '@c15t/react-native';
import type { PropsWithChildren } from 'react';

import { benchmarkConfig } from './benchmark-config';
import type { RuntimeConsent, RuntimeRead } from './runtime-types';

const read = (raw: ReturnType<typeof useConsent>): RuntimeRead => {
	const choice = raw.explicitChoice?.categories.measurement;
	const { error } = raw;
	const transport =
		error === null ||
		(error.code === 'transport' &&
			/Unable to resolve host|No address associated|ENETUNREACH|Network is unreachable|Failed to connect|Connection refused/iu.test(
				JSON.stringify(error)
			));
	const ready =
		raw.ready &&
		!raw.policyPending &&
		transport &&
		raw.resolution.status === 'matched' &&
		raw.promptRequirement.kind === 'none' &&
		raw.nextDeadline !== null &&
		raw.nextDeadline > Date.now() &&
		raw.consentCategories?.includes('measurement') === true &&
		choice?.value === false &&
		choice.confirmedAt > 0 &&
		raw.effectivePermissions.measurement === false &&
		raw.restrictions.measurement?.includes('explicit-denial') === true;
	return { ready, snapshot: raw, targetId: 'measurement' };
};
export const ConsentBoundary = ({ children }: PropsWithChildren) => (
	<C15tProvider>{children}</C15tProvider>
);
export const useRuntimeConsent = (): RuntimeConsent => {
	const raw = useConsent();
	return {
		...read(raw),
		open: () => {
			void presentPreferences(benchmarkConfig.c15t.privacyUrl);
		},
		reload: () => Promise.resolve(read(getConsentClient().getSnapshot())),
	};
};
