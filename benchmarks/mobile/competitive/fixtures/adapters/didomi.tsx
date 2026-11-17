import { Didomi } from '@didomi/react-native';
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
				await Didomi.initialize(
					benchmarkConfig.didomi.apiKey,
					undefined,
					undefined,
					undefined,
					false,
					undefined,
					benchmarkConfig.didomi.noticeId
				);
				await Didomi.onReady();
				await Didomi.setupUI();
				const state = await Didomi.getCurrentUserStatus();
				setMeasurement(
					state.purposes[benchmarkConfig.didomi.target]?.enabled === true
				);
				setReady(true);
			} catch (error) {
				console.error(error);
			}
		};
		void initialize();
	}, []);
	return { measurement, open: () => Didomi.showPreferences(), ready };
};
