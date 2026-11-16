import { Didomi } from '@didomi/react-native';
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from 'react';
import type { PropsWithChildren } from 'react';

import { benchmarkConfig } from './benchmark-config';
import type { RuntimeConsent, RuntimeRead } from './runtime-types';

const initial: RuntimeConsent = {
	open: () => {
		void Didomi.showPreferences();
	},
	ready: false,
	reload: () =>
		Promise.resolve({ ready: false, snapshot: null, targetId: null }),
	snapshot: null,
	targetId: null,
};
const State = createContext(initial);
export const ConsentBoundary = ({ children }: PropsWithChildren) => {
	const [state, setState] = useState<RuntimeRead>(initial);
	const read = useCallback(async (): Promise<RuntimeRead> => {
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
		const next: RuntimeRead = {
			ready,
			snapshot: {
				currentUserStatus: raw,
				requiredPurposeIds: ids,
				shouldUserStatusBeCollected: shouldCollect,
			},
			targetId: purpose?.id ?? null,
		};
		setState(next);
		return next;
	}, []);
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
				await read();
			} catch (error) {
				console.error(error);
			}
		};
		void initialize();
	}, [read]);
	const context = useMemo(
		() => ({ ...initial, ...state, reload: read }),
		[state, read]
	);
	return <State.Provider value={context}>{children}</State.Provider>;
};
export const useRuntimeConsent = () => useContext(State);
