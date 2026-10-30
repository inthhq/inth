import { Usercentrics } from '@usercentrics/react-native-sdk';
import { useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { benchmarkConfig } from './benchmark-config';

export const ConsentBoundary = ({ children }: PropsWithChildren) => children;
export const useSizeConsent = () => {
	const [ready, setReady] = useState(false);
	const [measurement, setMeasurement] = useState(false);
	useEffect(() => {
		const initialize = async () => {
			try {
				Usercentrics.configure({
					consentMediation: false,
					settingsId: benchmarkConfig.usercentrics.settingsId,
				});
				await Usercentrics.status();
				const consents = await Usercentrics.getConsents();
				setMeasurement(
					consents.some((c) => c.category === 'functional' && c.status)
				);
				setReady(true);
			} catch (error) {
				console.error(error);
			}
		};
		void initialize();
	}, []);
	return { measurement, open: () => Usercentrics.showSecondLayer(), ready };
};
