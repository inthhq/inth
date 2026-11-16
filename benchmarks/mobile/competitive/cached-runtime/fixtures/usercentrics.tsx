import {
	Usercentrics,
	UsercentricsOptions,
	UsercentricsConsentType,
} from '@usercentrics/react-native-sdk';
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
		void Usercentrics.showSecondLayer();
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
		const next: RuntimeRead = {
			ready,
			snapshot: raw,
			targetId: service?.templateId ?? null,
		};
		setState(next);
		return next;
	}, []);
	useEffect(() => {
		Usercentrics.configure(
			new UsercentricsOptions({
				consentMediation: false,
				settingsId: benchmarkConfig.usercentrics.settingsId,
			})
		);
		const initialize = async () => {
			try {
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
