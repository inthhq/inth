import { Didomi } from '@didomi/react-native';
import { createContext, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { benchmarkConfig } from './benchmark-config';
import type { RuntimeConsent } from './runtime-types';

const initial: RuntimeConsent = {
	open: () => {
		void Didomi.showPreferences();
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
				const raw = await Didomi.getCurrentUserStatus();
				const ids = await Didomi.getRequiredPurposeIds();
				const shouldCollect = await Didomi.shouldUserStatusBeCollected();
				const id = benchmarkConfig.didomi.target;
				const purpose = raw.purposes[id];
				const ready =
					shouldCollect === false &&
					ids.includes(id) &&
					purpose?.id === id &&
					purpose.enabled === false &&
					typeof raw.consent_string === 'string' &&
					raw.consent_string.length > 0 &&
					typeof raw.updated === 'string' &&
					Date.parse(raw.updated) > 0;
				setState({
					open: initial.open,
					ready,
					snapshot: {
						currentUserStatus: raw,
						requiredPurposeIds: ids,
						shouldUserStatusBeCollected: shouldCollect,
					},
					targetId: purpose?.id ?? null,
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
