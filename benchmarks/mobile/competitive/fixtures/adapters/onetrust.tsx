import { useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import OneTrust from 'react-native-onetrust-cmp';

import { benchmarkConfig } from './benchmark-config';

export const ConsentBoundary = ({ children }: PropsWithChildren) => children;
export const useSizeConsent = () => {
	const [ready, setReady] = useState(false);
	const [measurement, setMeasurement] = useState(false);
	useEffect(() => {
		const initialize = async () => {
			try {
				await OneTrust.startSDK(
					benchmarkConfig.onetrust.cdn,
					benchmarkConfig.onetrust.appId,
					'en',
					{},
					false
				);
				setMeasurement(
					(await OneTrust.getConsentStatusForCategory(
						benchmarkConfig.onetrust.category
					)) === 1
				);
				setReady(true);
			} catch (error) {
				console.error(error);
			}
		};
		void initialize();
	}, []);
	return {
		measurement,
		open: () => OneTrust.showPreferenceCenterUI({}),
		ready,
	};
};
