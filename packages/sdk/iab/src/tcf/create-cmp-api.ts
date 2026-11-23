/**
 * The IAB TCF `__tcfapi` global.
 *
 * @packageDocumentation
 */

import type {
	CMPApi,
	CMPApiConfig,
	CMPStatus,
	DisplayStatus,
	EventStatus,
	GlobalVendorList,
	PingData,
	TCData,
	TCDataOutsideTCF,
	TCFApiCallback,
	TCFConsentData,
} from '@inth/sdk-core';

import { CMP_VERSION_NUMBER, createPingData } from './cmp-defaults.model';
import { assertValidCmpId } from './cmp-id.model';
import { clearStubQueue, getStubQueue } from './initialize-iab-stub';
import { toTCDataRestrictions } from './publisher-restrictions.model';
import {
	readStoredTCString,
	writeStoredTCString,
} from './tc-string-storage.store';
import { decodeTCString, getDisclosedVendorIds } from './tc-string.model';

/**
 * Copies consent data down to its vectors, so the API's copy is never
 * shared with the caller.
 */
const copyConsentData = function copyConsentData(
	consentData: TCFConsentData
): TCFConsentData {
	return {
		...consentData,
		publisherRestrictions: consentData.publisherRestrictions?.map(
			(restriction) => ({
				...restriction,
				vendorIds: [...restriction.vendorIds],
			})
		),
		purposeConsents: { ...consentData.purposeConsents },
		purposeLegitimateInterests: { ...consentData.purposeLegitimateInterests },
		specialFeatureOptIns: { ...consentData.specialFeatureOptIns },
		vendorConsents: { ...consentData.vendorConsents },
		vendorLegitimateInterests: { ...consentData.vendorLegitimateInterests },
		vendorsDisclosed: { ...consentData.vendorsDisclosed },
	};
};

/**
 * Installs the real `__tcfapi` on `window`, replays the calls the stub
 * queued, and returns the controls that publish consent through it.
 *
 * @public
 */
export const createCMPApi = function createCMPApi(
	config: CMPApiConfig
): CMPApi {
	// Vendors read these two fields from `__tcfapi` ping, so an unusable CMP ID
	// must fail here rather than be reported as if it were valid.
	const cmpId = assertValidCmpId(config.cmpId);
	const cmpVersion = config.cmpVersion ?? CMP_VERSION_NUMBER;
	let { gvl } = config;
	/**
	 * Whether the visitor's policy uses IAB TCF. `__tcfapi` reports it as
	 * `gdprApplies`, the CMP API's name for it.
	 */
	let tcfApplies = config.gdprApplies ?? true;

	let tcString = '';
	/** The AC string confirmed with `tcString`, if any. */
	let addtlConsent: string | undefined;
	const addtlConsentFor = (string: string): string | undefined =>
		string ? config.getAddtlConsent?.(string) : undefined;
	let cmpStatus: CMPStatus = 'loading';
	let displayStatus: DisplayStatus = 'hidden';
	const eventListeners = new Map<
		number,
		TCFApiCallback<TCData | TCDataOutsideTCF>
	>();
	let nextListenerId = 0;

	let cachedTCData: TCData | null = null;
	/** Counts changes to the published state, so answers can detect them. */
	let stateRevision = 0;
	let currentConsentData: TCFConsentData | null = null;
	const cmpVersionNumber =
		typeof cmpVersion === 'number'
			? cmpVersion
			: Number.parseInt(String(cmpVersion), 10) || 1;
	/**
	 * Builds TC Data for one TC string and the consent data published with it.
	 */
	const composeTCData = async function composeTCData(
		string: string,
		consentData: TCFConsentData | null,
		additional: string | undefined,
		eventStatus?: EventStatus,
		listenerId?: number
	): Promise<TCData> {
		let purposeConsents: Record<number, boolean> =
			consentData?.purposeConsents ?? {};
		let purposeLegitInterests: Record<number, boolean> =
			consentData?.purposeLegitimateInterests ?? {};
		let vendorConsents: Record<number, boolean> = Object.fromEntries(
			Object.entries(consentData?.vendorConsents ?? {}).map(([id, value]) => [
				Number(id),
				value,
			])
		);
		let vendorLegitInterests: Record<number, boolean> = Object.fromEntries(
			Object.entries(consentData?.vendorLegitimateInterests ?? {}).map(
				([id, value]) => [Number(id), value]
			)
		);
		let specialFeatureOptins: Record<number, boolean> =
			consentData?.specialFeatureOptIns ?? {};
		let disclosedVendorIds = getDisclosedVendorIds(
			consentData?.vendorsDisclosed ?? {}
		);
		// Restrictions always come from the string vendors receive.
		let restrictions: Record<number, Record<number, number>> = {};

		if (string) {
			try {
				const decoded = await decodeTCString(string);
				restrictions = toTCDataRestrictions(decoded.publisherRestrictions);
				if (!consentData) {
					// oxlint-disable-next-line prefer-destructuring -- Preserve declaration order, interface shape, and public compatibility.
					purposeConsents = decoded.purposeConsents;
					purposeLegitInterests = decoded.purposeLegitimateInterests;
					// oxlint-disable-next-line prefer-destructuring -- Preserve declaration order, interface shape, and public compatibility.
					vendorConsents = decoded.vendorConsents;
					vendorLegitInterests = decoded.vendorLegitimateInterests;
					specialFeatureOptins = decoded.specialFeatureOptIns;
					disclosedVendorIds = getDisclosedVendorIds(decoded.vendorsDisclosed);
				}
			} catch {
				// Invalid TC string, use empty values
			}
		}

		const tcData: TCData = {
			cmpId,
			cmpStatus,
			cmpVersion: cmpVersionNumber,
			eventStatus,
			gdprApplies: true,
			isServiceSpecific: true,
			listenerId,
			publisher: {
				consents: {},
				customPurpose: {
					consents: {},
					legitimateInterests: {},
				},
				legitimateInterests: {},
				restrictions,
			},
			publisherCC: 'US',
			purpose: {
				consents: purposeConsents,
				legitimateInterests: purposeLegitInterests,
			},
			purposeOneTreatment: false,
			specialFeatureOptins,
			tcString: string,
			tcfPolicyVersion: gvl.tcfPolicyVersion,
			useNonStandardTexts: false,
			vendor: {
				consents: vendorConsents,
				disclosedVendors: Object.fromEntries(
					disclosedVendorIds.map((vendorId) => [vendorId, true])
				),
				legitimateInterests: vendorLegitInterests,
			},
		};
		// Google discards an AC string sent without a TC string.
		if (string && additional) {
			tcData.addtlConsent = additional;
		}

		return tcData;
	};

	const buildTCData = async function buildTCData(
		eventStatus?: EventStatus,
		listenerId?: number
	): Promise<TCData | TCDataOutsideTCF> {
		// CMP API v2: when TCF does not apply, only these fields exist. The
		// visitor's policy decides that, not their jurisdiction. Listeners
		// still get their status and ID, which removeEventListener needs.
		if (!tcfApplies) {
			const outside: TCDataOutsideTCF = {
				cmpId,
				cmpStatus,
				cmpVersion: cmpVersionNumber,
				gdprApplies: false,
				tcfPolicyVersion: gvl.tcfPolicyVersion,
			};
			if (eventStatus) {
				outside.eventStatus = eventStatus;
			}
			if (listenerId !== undefined) {
				outside.listenerId = listenerId;
			}
			return outside;
		}
		// Callers get their own copy, down to the nested maps, so changing a
		// result never changes the next one.
		if (
			cachedTCData &&
			cachedTCData.tcString === tcString &&
			cachedTCData.addtlConsent === addtlConsent &&
			!eventStatus
		) {
			return { ...structuredClone(cachedTCData), listenerId };
		}
		const string = tcString;
		const consentData = currentConsentData;
		const additional = addtlConsent;
		const tcData = await composeTCData(
			string,
			consentData,
			additional,
			eventStatus,
			listenerId
		);
		// An update can land while the string decodes. Never pair its string
		// with the earlier vectors, or publish it once the policy stops using
		// TCF: build again from the newer state.
		if (
			!tcfApplies ||
			tcString !== string ||
			currentConsentData !== consentData ||
			addtlConsent !== additional
		) {
			return buildTCData(eventStatus, listenerId);
		}

		if (!eventStatus) {
			cachedTCData = structuredClone(tcData);
		}

		return tcData;
	};

	/**
	 * Sends TC data that is still current when the callback runs. The state
	 * can change while any build is pending, cached or not, so build again
	 * until none landed, then call back in the same task as the check.
	 */
	const sendCurrentTCData = async function sendCurrentTCData(
		handler: TCFApiCallback<TCData | TCDataOutsideTCF>,
		eventStatus: () => EventStatus | undefined,
		listenerId?: number
	): Promise<void> {
		const revision = stateRevision;
		const tcData = await buildTCData(eventStatus(), listenerId);
		if (revision !== stateRevision) {
			return sendCurrentTCData(handler, eventStatus, listenerId);
		}
		handler(tcData, true);
	};

	const handlePing = function handlePing(
		handler: TCFApiCallback<PingData>
	): void {
		handler(
			createPingData({
				cmpId,
				cmpStatus,
				cmpVersion,
				displayStatus,
				gdprApplies: tcfApplies,
				gvlVersion: gvl.vendorListVersion,
				tcfPolicyVersion: gvl.tcfPolicyVersion,
			}),
			true
		);
	};

	const handleGetTCData = async function handleGetTCData(
		handler: TCFApiCallback<TCData | TCDataOutsideTCF>,
		_vendorIds?: number[]
	): Promise<void> {
		await sendCurrentTCData(handler, () => undefined);
	};

	const handleGetInAppTCData = function handleGetInAppTCData(
		handler: TCFApiCallback<TCData | TCDataOutsideTCF>
	): Promise<void> {
		return handleGetTCData(handler);
	};

	const handleGetVendorList = function handleGetVendorList(
		handler: TCFApiCallback<GlobalVendorList>,
		_vendorListVersion?: number
	): void {
		handler(cmpStatus === 'loaded' ? gvl : null, cmpStatus === 'loaded');
	};

	/**
	 * Whether vendors can act on the published state without the visitor:
	 * a TC string is available, or the visitor's policy does not use TCF.
	 */
	const hasSignal = (): boolean => tcString !== '' || !tcfApplies;

	/**
	 * The status a new listener is told. TCF CMP API v2: `tcloaded` means a
	 * valid TC string is available and no UI will be shown, and the CMP must
	 * not send it when it shows the UI instead. While the UI is up the
	 * status is `cmpuishown`. Without either there is no status yet.
	 */
	const currentStatus = (): EventStatus | undefined => {
		if (cmpStatus !== 'loaded') {
			return undefined;
		}
		if (displayStatus === 'visible') {
			return 'cmpuishown';
		}
		return hasSignal() ? 'tcloaded' : undefined;
	};

	const handleAddEventListener = async function handleAddEventListener(
		handler: TCFApiCallback<TCData | TCDataOutsideTCF>
	): Promise<void> {
		nextListenerId += 1;
		const listenerId = nextListenerId;
		eventListeners.set(listenerId, handler);

		// Registration always returns its ID, including while the list is loading.
		await sendCurrentTCData(handler, currentStatus, listenerId);
	};

	const handleRemoveEventListener = function handleRemoveEventListener(
		handler: TCFApiCallback<boolean>,
		listenerId: number
	): void {
		const existed = eventListeners.has(listenerId);
		eventListeners.delete(listenerId);
		handler(existed, true);
	};

	const notifyEventListeners = async function notifyEventListeners(
		eventStatus: EventStatus | undefined
	): Promise<void> {
		for (const [listenerId, listener] of eventListeners) {
			// oxlint-disable-next-line no-await-in-loop -- Listeners hear each change in registration order.
			await sendCurrentTCData(listener, () => eventStatus, listenerId);
		}
	};

	const initializeAPI = function initializeAPI(): void {
		if (typeof window === 'undefined') {
			return;
		}

		const queuedCalls = getStubQueue();

		window.__tcfapi = ((
			command: string,
			version: number,
			handler: TCFApiCallback<unknown>,
			parameter?: unknown
		) => {
			switch (command) {
				case 'ping':
					handlePing(handler as TCFApiCallback<PingData>);
					break;
				case 'getTCData':
					handleGetTCData(
						handler as TCFApiCallback<TCData | TCDataOutsideTCF>,
						parameter as number[] | undefined
					);
					break;
				case 'getInAppTCData':
					handleGetInAppTCData(
						handler as TCFApiCallback<TCData | TCDataOutsideTCF>
					);
					break;
				case 'getVendorList':
					handleGetVendorList(
						handler as TCFApiCallback<GlobalVendorList>,
						parameter as number | undefined
					);
					break;
				case 'addEventListener':
					handleAddEventListener(
						handler as TCFApiCallback<TCData | TCDataOutsideTCF>
					);
					break;
				case 'removeEventListener':
					handleRemoveEventListener(
						handler as TCFApiCallback<boolean>,
						parameter as number
					);
					break;
				default:
					return handler(null, false);
			}
		}) as typeof window.__tcfapi;

		clearStubQueue();

		// The real API is created with a list. Replayed calls can read it now.
		cmpStatus = 'loaded';

		for (const args of queuedCalls) {
			window.__tcfapi?.(...args);
		}
	};

	initializeAPI();

	return {
		destroy: () => {
			eventListeners.clear();
			cachedTCData = null;

			if (typeof window !== 'undefined') {
				delete (window as { __tcfapi?: unknown }).__tcfapi;
			}
		},

		getTcString: () => tcString,

		loadFromStorage: (): string | null => {
			const storedValue = readStoredTCString();
			if (storedValue) {
				tcString = storedValue;
				addtlConsent = addtlConsentFor(storedValue);
				cachedTCData = null;
				stateRevision += 1;
				notifyEventListeners('tcloaded');
				return storedValue;
			}

			return null;
		},

		saveToStorage: (newTcString: string) => {
			writeStoredTCString(newTcString, addtlConsentFor(newTcString));
		},

		setDisplayStatus: (status: DisplayStatus) => {
			displayStatus = status;
			if (status === 'visible') {
				notifyEventListeners('cmpuishown');
			}
		},

		updateConsent: (
			newTcString: string,
			consentData?: TCFConsentData,
			applies?: boolean
		) => {
			const additional = addtlConsentFor(newTcString);
			const changed =
				newTcString !== tcString ||
				additional !== addtlConsent ||
				(applies !== undefined && applies !== tcfApplies);
			tcfApplies = applies ?? tcfApplies;
			tcString = newTcString;
			addtlConsent = additional;
			// Keep a private copy: a caller changing its object in place must
			// not change, or half change, the vectors published for this string.
			currentConsentData =
				newTcString && consentData ? copyConsentData(consentData) : null;
			cachedTCData = null;
			stateRevision += 1;
			if (cmpStatus !== 'loaded') {
				return;
			}
			if (consentData) {
				notifyEventListeners('useractioncomplete');
				return;
			}
			// Authority can expire or change in another tab while the UI is up.
			// Report those changes too, without calling them tcloaded.
			if (!changed) {
				return;
			}
			// A withdrawn string is no `tcloaded`: listeners still hear that
			// it is gone, with no status.
			notifyEventListeners(hasSignal() ? currentStatus() : undefined);
		},

		updateVendorList: (nextGvl) => {
			if (nextGvl) {
				gvl = nextGvl;
			}
			cmpStatus = nextGvl ? 'loaded' : 'loading';
			tcString = '';
			addtlConsent = undefined;
			currentConsentData = null;
			cachedTCData = null;
			stateRevision += 1;
			// The owner publishes current confirmed TC data with updateConsent.
		},
	};
};
