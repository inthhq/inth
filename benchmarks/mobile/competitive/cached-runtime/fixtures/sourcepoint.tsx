import type { SPError, SPUserData } from '@sourcepoint/react-native-cmp';
import SPConsentManager, {
	SPMessageLanguage,
} from '@sourcepoint/react-native-cmp';
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import type { PropsWithChildren } from 'react';
import { NativeModules } from 'react-native';

import { benchmarkConfig } from './benchmark-config';
import type { RuntimeConsent, RuntimeRead } from './runtime-types';

const initial: RuntimeConsent = {
	open: () => {
		throw new Error('Sourcepoint is not initialized');
	},
	ready: false,
	reload: () =>
		Promise.resolve({ ready: false, snapshot: null, targetId: null }),
	snapshot: null,
	targetId: null,
};
const State = createContext(initial);
export const ConsentBoundary = ({ children }: PropsWithChildren) => {
	const manager = useRef<SPConsentManager | null>(null);
	const errors = useRef<SPError[]>([]);
	const finished = useRef(false);
	const [state, setState] = useState<RuntimeRead>(initial);
	// Every cached policy/consent gate must pass before the common Ready view.
	// oxlint-disable-next-line complexity
	const read = useCallback(async (): Promise<RuntimeRead> => {
		const sdk = manager.current;
		if (!sdk) {
			throw new Error('Sourcepoint is not initialized');
		}
		const data: SPUserData = await sdk.getUserData();
		const stored =
			await NativeModules.CmpBenchmark.readDefaultPreference('sp.state');
		const cache = typeof stored === 'string' ? JSON.parse(stored) : null;
		const cached = cache?.gdpr?.consents;
		const web =
			typeof cached?.webConsentPayload === 'string'
				? JSON.parse(cached.webConsentPayload)
				: null;
		const meta = cache?.gdpr?.metaData;
		const g = data.gdpr;
		let target: string | null = null;
		for (const vendor of Object.keys(g?.vendorGrants ?? {}).sort()) {
			const grant = g?.vendorGrants[vendor];
			if (grant?.granted !== false) {
				continue;
			}
			const purpose = Object.keys(grant.purposes)
				.sort()
				.find((id) => grant.purposes[id] === false);
			if (purpose) {
				target = `${vendor}:${purpose}`;
				break;
			}
		}
		const transport = errors.current.every(
			(e) =>
				e.name === 'NoInternetConnection' &&
				e.description === 'No Internet connection.'
		);
		const [targetVendor, targetPurpose] = target?.split(':') ?? [];
		const cacheValid =
			cache?.propertyId === benchmarkConfig.sourcepoint.propertyId &&
			cache?.accountId === benchmarkConfig.sourcepoint.accountId &&
			cached?.applies === true &&
			cached?.consentStatus?.hasConsentData === true &&
			cached?.consentStatus?.granularStatus?.defaultConsent === false &&
			cached?.uuid === g?.uuid &&
			cached?.euconsent === g?.euconsent &&
			cached?.dateCreated === g?.createdDate &&
			web?.euconsent === g?.euconsent &&
			typeof web?.expirationDate === 'string' &&
			Date.parse(web.expirationDate) > Date.now() &&
			typeof meta?.vendorListId === 'string' &&
			Date.parse(meta.legalBasisChangeDate) <= Date.parse(cached.dateCreated) &&
			Date.parse(meta.additionsChangeDate) <= Date.parse(cached.dateCreated) &&
			typeof targetVendor === 'string' &&
			typeof targetPurpose === 'string' &&
			cached?.grants?.[targetVendor]?.vendorGrant === false &&
			cached?.grants?.[targetVendor]?.purposeGrants?.[targetPurpose] ===
				false &&
			web?.grants?.[targetVendor]?.vendorGrant === false &&
			web?.grants?.[targetVendor]?.purposeGrants?.[targetPurpose] === false;
		const ready =
			cacheValid &&
			transport &&
			g?.applies === true &&
			typeof g.uuid === 'string' &&
			g.uuid.length > 0 &&
			typeof g.euconsent === 'string' &&
			g.euconsent.length > 0 &&
			(g.expirationDate === null ||
				g.expirationDate === undefined ||
				(typeof g.expirationDate === 'string' &&
					Date.parse(g.expirationDate) > Date.now())) &&
			g.statuses?.rejectedAny === true &&
			g.statuses.consentedAll === false &&
			target !== null;
		const next: RuntimeRead = {
			ready,
			snapshot: {
				cacheEvidence: cache,
				campaignFinished: finished.current,
				expiryObservability:
					g?.expirationDate === null || g?.expirationDate === undefined
						? 'not-exposed'
						: 'exposed',
				refreshErrors: errors.current,
				userData: data,
			},
			targetId: target,
		};
		setState(next);
		return next;
	}, []);
	useEffect(() => {
		const refresh = async () => {
			try {
				await read();
			} catch (error) {
				console.error(error);
			}
		};
		const sdk = new SPConsentManager();
		manager.current = sdk;
		sdk.build(
			benchmarkConfig.sourcepoint.accountId,
			benchmarkConfig.sourcepoint.propertyId,
			benchmarkConfig.sourcepoint.propertyName,
			{ gdpr: {} },
			{ language: SPMessageLanguage.ENGLISH, messageTimeoutInSeconds: 20 }
		);
		sdk.onFinished(() => {
			finished.current = true;
			void NativeModules.CmpBenchmark.actionStart(
				'SOURCEPOINT_CAMPAIGN_FINISHED'
			);
			void refresh();
		});
		// SDK callbacks deliver refresh failures; a fresh read must preserve them.
		// oxlint-disable-next-line promise/prefer-await-to-callbacks
		sdk.onError((error) => {
			errors.current = [...errors.current, error];
			console.error(error);
			void refresh();
		});
		sdk.onSPUIReady(() => {
			void NativeModules.CmpBenchmark.actionStart('SOURCEPOINT_UI_READY');
		});
		sdk.onAction((action) => {
			console.log('SOURCEPOINT_ACTION', JSON.stringify(action));
		});
		void refresh();
		sdk.loadMessage();
		return () => {
			manager.current = null;
		};
	}, [read]);
	const context = useMemo(
		() => ({
			...state,
			open: () =>
				manager.current?.loadGDPRPrivacyManager(
					benchmarkConfig.sourcepoint.privacyManagerId
				),
			reload: read,
		}),
		[state, read]
	);
	return <State.Provider value={context}>{children}</State.Provider>;
};
export const useRuntimeConsent = () => useContext(State);
