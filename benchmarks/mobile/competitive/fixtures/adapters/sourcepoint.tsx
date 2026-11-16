import SPConsentManager, {
	SPMessageLanguage,
} from '@sourcepoint/react-native-cmp';
import { useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { benchmarkConfig } from './benchmark-config';

export const ConsentBoundary = ({ children }: PropsWithChildren) => children;
export const useSizeConsent = () => {
	const manager = useRef<SPConsentManager | null>(null);
	const [ready, setReady] = useState(false);
	const [measurement, setMeasurement] = useState(false);
	useEffect(() => {
		const sdk = new SPConsentManager();
		manager.current = sdk;
		sdk.build(
			benchmarkConfig.sourcepoint.accountId,
			benchmarkConfig.sourcepoint.propertyId,
			benchmarkConfig.sourcepoint.propertyName,
			{ gdpr: {} },
			{ language: SPMessageLanguage.ENGLISH, messageTimeoutInSeconds: 20 }
		);
		const read = async () => {
			try {
				const data = await sdk.getUserData();
				setMeasurement(
					Object.values(data.gdpr?.vendorGrants ?? {}).some((g) => g.granted)
				);
				setReady(true);
			} catch (error) {
				console.error(error);
			}
		};
		const finished = sdk.onFinished(() => {
			void read();
		});
		sdk.onError(console.error);
		sdk.loadMessage();
		return () => {
			finished.remove();
			manager.current = null;
		};
	}, []);
	return {
		measurement,
		open: () =>
			manager.current?.loadGDPRPrivacyManager(
				benchmarkConfig.sourcepoint.privacyManagerId
			),
		ready,
	};
};
