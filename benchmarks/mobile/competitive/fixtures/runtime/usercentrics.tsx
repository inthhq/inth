import {
	Usercentrics,
	UsercentricsOptions,
	UsercentricsConsentType,
} from '@usercentrics/react-native-sdk';
import { createContext, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { benchmarkConfig } from './benchmark-config';
import type { RuntimeConsent } from './runtime-types';

const initial: RuntimeConsent = {
	open: () => {
		void Usercentrics.showSecondLayer();
	},
	ready: false,
	snapshot: null,
	targetId: null,
};
const State = createContext<RuntimeConsent | null>(null);
export const ConsentBoundary = ({ children }: PropsWithChildren) => {
	const [state, setState] = useState(initial);
	useEffect(() => {
		const initialize = async () => {
			try {
				Usercentrics.configure(
					new UsercentricsOptions({
						consentMediation: false,
						settingsId: benchmarkConfig.usercentrics.settingsId,
					})
				);
				const raw = await Usercentrics.status();
				const service = raw.consents.find(
					(s) => s.templateId === benchmarkConfig.usercentrics.target
				);
				const ready =
					raw.shouldCollectConsent === false &&
					service !== undefined &&
					service.isEssential === false &&
					service.status === false &&
					service.type === UsercentricsConsentType.explicit &&
					service.history.some(
						(h) =>
							h.status === false &&
							h.type === UsercentricsConsentType.explicit &&
							Number.isInteger(h.timestampInMillis) &&
							h.timestampInMillis >= -2147483648 &&
							h.timestampInMillis <= 2147483647
					);
				setState({
					open: initial.open,
					ready,
					snapshot: raw,
					targetId: service?.templateId ?? null,
				});
			} catch (error) {
				console.error(error);
			}
		};
		void initialize();
	}, []);
	return <State.Provider value={state}>{children}</State.Provider>;
};
export const useRuntimeConsent = () => {
	const value = useContext(State);
	if (!value) {
		throw new Error('Missing consent boundary');
	}
	return value;
};
