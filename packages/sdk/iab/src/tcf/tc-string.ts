/**
 * Encodes and decodes IAB TCF TC Strings with `@iabtechlabtcf/core`.
 *
 * @packageDocumentation
 */

import type { PurposeRestrictionVector } from '@iabtechlabtcf/core';
import type {
	GlobalVendorList,
	PublisherRestriction,
	TCFConsentData,
} from '@inth/sdk-core';

import { getTCFCore } from './lazy-load';
import {
	PublisherRestrictionError,
	validatePublisherRestrictions,
} from './publisher-restrictions';

/**
 * The vendor IDs a disclosed-vendors record encodes.
 *
 * Shared by the encoder and the CMP API, so `vendor.disclosedVendors` in
 * TC data lists exactly the vendors in the TC string's disclosed vendors
 * segment.
 *
 * @internal
 */
export const getDisclosedVendorIds = function getDisclosedVendorIds(
	vendorsDisclosed: Record<string | number, boolean>
): number[] {
	return Object.entries(vendorsDisclosed)
		.filter(
			([vendorId, value]) =>
				value && /^\d+$/u.test(vendorId) && Number(vendorId) > 0
		)
		.map(([vendorId]) => Number(vendorId));
};

/**
 * Adds a stub vendor after each restricted vendor the list does not follow
 * with a vendor of its own.
 *
 * The encoder joins two restricted vendors into one range when the list has
 * no vendor between them, and a range covers every ID in it. The list can
 * leave out registered vendors (a `vendors` scope, an inline `gvl` or the
 * backend's `gvl.vendorIds`), so that gap can hold vendors the publisher
 * never restricted. Add the stubs for every list, scoped or not. They keep
 * each range to adjacent IDs and declare nothing, so the encoder gives them
 * no signal.
 */
const withRestrictionGapStubs = function withRestrictionGapStubs(
	gvl: GlobalVendorList,
	restrictions: readonly PublisherRestriction[]
): GlobalVendorList {
	if (restrictions.length === 0) {
		return gvl;
	}
	const vendors = { ...gvl.vendors };
	for (const { vendorIds } of restrictions) {
		for (const vendorId of vendorIds) {
			const id = vendorId + 1;
			vendors[id] ??= {
				cookieMaxAgeSeconds: null,
				cookieRefresh: false,
				features: [],
				flexiblePurposes: [],
				id,
				legIntPurposes: [],
				name: '',
				purposes: [],
				specialFeatures: [],
				specialPurposes: [],
				urls: [],
				usesCookies: false,
				usesNonCookieAccess: false,
			};
		}
	}
	return { ...gvl, vendors };
};

let warnedServiceSpecific = false;

/**
 * Resolve the deprecated `isServiceSpecific` option.
 *
 * TCF requires IsServiceSpecific=1: a string with 0 is invalid, and
 * group-specific scope is also encoded as 1. Inth therefore always encodes
 * `true` and warns once when a caller still passes `false`.
 *
 * @internal
 */
export const resolveIsServiceSpecific = function resolveIsServiceSpecific(
	value: boolean | undefined
): true {
	if (value === false && !warnedServiceSpecific) {
		warnedServiceSpecific = true;
		console.warn(
			'[inth] `isServiceSpecific: false` is deprecated and ignored. TCF requires IsServiceSpecific=1, so Inth always encodes TC strings as service-specific.'
		);
	}
	return true;
};

/**
 * Configuration for TC String generation.
 *
 * @public
 */
export interface TCStringConfig {
	/** Original confirmation time, captured before asynchronous codec loading. */
	confirmedAt?: number;
	/** CMP ID registered with IAB Europe. */
	cmpId: number;

	/** CMP version. A string is parsed as an integer; default `1`. */
	cmpVersion?: number | string;

	/** Consent screen ID. Default `1`. */
	consentScreen?: number;

	/** Consent language (2-letter code). Default `'EN'`. */
	consentLanguage?: string;

	/** Publisher country code (2-letter code). Default `'US'`. */
	publisherCountryCode?: string;

	/**
	 * Ignored: Inth always encodes IsServiceSpecific=1.
	 *
	 * @deprecated TCF requires IsServiceSpecific=1, and group-specific scope
	 * is also encoded as 1. Passing `false` logs a warning once.
	 */
	isServiceSpecific?: boolean;
}

/**
 * Generates an IAB TCF TC String from consent data.
 *
 * @throws {TypeError} When `config.confirmedAt` is not a past or current
 * timestamp.
 * @throws {PublisherRestrictionError} When a publisher restriction cannot
 * be encoded for the vendor list. See {@link validatePublisherRestrictions}.
 *
 * @example
 * ```typescript
 * const tcString = await generateTCString(
 *   {
 *     purposeConsents: { 1: true, 2: true, 7: true },
 *     purposeLegitimateInterests: { 9: true, 10: true },
 *     vendorConsents: { 1: true, 755: true },
 *     vendorLegitimateInterests: { 1: true },
 *     specialFeatureOptIns: { 1: false, 2: false },
 *   },
 *   gvl,
 *   { cmpId: 28, cmpVersion: 1 }
 * );
 * ```
 *
 * @public
 */
// oxlint-disable-next-line complexity -- Preserve established branch order and control flow.
export const generateTCString = async function generateTCString(
	consentData: TCFConsentData,
	gvlData: GlobalVendorList,
	config: TCStringConfig
): Promise<string> {
	const now = Date.now();
	const confirmedAt =
		config.confirmedAt === undefined ? now : config.confirmedAt;
	if (
		!Number.isSafeInteger(confirmedAt) ||
		confirmedAt < 0 ||
		confirmedAt > now
	) {
		throw new TypeError(
			'TC confirmation time must be a valid past or current timestamp.'
		);
	}
	const isServiceSpecific = resolveIsServiceSpecific(config.isServiceSpecific);
	const publisherRestrictions = validatePublisherRestrictions(
		consentData.publisherRestrictions,
		{ gvl: gvlData }
	);
	const { TCModel, TCString, GVL, PurposeRestriction } = await getTCFCore();

	const listData = withRestrictionGapStubs(gvlData, publisherRestrictions);
	// oxlint-disable-next-line typescript/no-explicit-any -- GVL library types don't match our domain types
	const gvl = new GVL(listData as any);

	const tcModel = new TCModel(gvl);
	const confirmedDay = new Date(
		Math.floor(confirmedAt / 86_400_000) * 86_400_000
	);
	tcModel.created = confirmedDay;
	tcModel.lastUpdated = confirmedDay;

	tcModel.cmpId = config.cmpId;
	tcModel.cmpVersion =
		typeof config.cmpVersion === 'number'
			? config.cmpVersion
			: Number.parseInt(String(config.cmpVersion ?? '1'), 10) || 1;
	tcModel.consentScreen = config.consentScreen ?? 1;
	tcModel.consentLanguage = config.consentLanguage ?? 'EN';
	tcModel.publisherCountryCode = config.publisherCountryCode ?? 'US';
	tcModel.isServiceSpecific = isServiceSpecific;

	for (const [purposeId, value] of Object.entries(
		consentData.purposeConsents
	)) {
		if (value) {
			tcModel.purposeConsents.set(Number(purposeId));
		}
	}

	for (const [purposeId, value] of Object.entries(
		consentData.purposeLegitimateInterests
	)) {
		if (value) {
			tcModel.purposeLegitimateInterests.set(Number(purposeId));
		}
	}

	for (const [vendorId, value] of Object.entries(consentData.vendorConsents)) {
		const numericVendorId = Number(vendorId);
		if (value && Number.isFinite(numericVendorId)) {
			tcModel.vendorConsents.set(numericVendorId);
		}
	}

	for (const [vendorId, value] of Object.entries(
		consentData.vendorLegitimateInterests
	)) {
		const numericVendorId = Number(vendorId);
		if (value && Number.isFinite(numericVendorId)) {
			tcModel.vendorLegitimateInterests.set(numericVendorId);
		}
	}

	for (const [featureId, value] of Object.entries(
		consentData.specialFeatureOptIns
	)) {
		if (value) {
			tcModel.specialFeatureOptins.set(Number(featureId));
		}
	}

	// TCF 2.3 requires the disclosed vendors segment: the vendors the CMP UI
	// showed the user.
	for (const vendorId of getDisclosedVendorIds(consentData.vendorsDisclosed)) {
		tcModel.vendorsDisclosed.set(vendorId);
	}

	// The encoder drops restrictions its vendor list does not allow. Those
	// were rejected above; confirm none was dropped anyway.
	for (const {
		purposeId,
		restrictionType,
		vendorIds,
	} of publisherRestrictions) {
		const restriction = new PurposeRestriction(purposeId, restrictionType);
		for (const vendorId of vendorIds) {
			tcModel.publisherRestrictions.add(vendorId, restriction);
			if (
				tcModel.publisherRestrictions.getRestrictionType(
					vendorId,
					purposeId
				) !== restrictionType
			) {
				throw new PublisherRestrictionError(
					`The TC string encoder rejected restriction type ${restrictionType} for vendor ${vendorId} and purpose ${purposeId}.`
				);
			}
		}
	}

	return TCString.encode(tcModel);
};

const readPublisherRestrictions = function readPublisherRestrictions(
	vector: PurposeRestrictionVector,
	isServiceSpecific: boolean,
	policyVersion: number
): PublisherRestriction[] {
	const restrictions = vector.getRestrictions();
	// The spec allows publisher restrictions only in service-specific
	// strings. Inth never writes another scope, but a stored string may
	// come from elsewhere.
	if (restrictions.length > 0 && !isServiceSpecific) {
		throw new PublisherRestrictionError(
			'Publisher restrictions are only allowed in service-specific TC strings.'
		);
	}
	return validatePublisherRestrictions(
		restrictions.map((restriction) => ({
			purposeId: restriction.purposeId,
			restrictionType: restriction.restrictionType,
			vendorIds: vector.getVendors(restriction),
		})),
		// Judge the string by the policy it was written under.
		{ policyVersion }
	);
};

/**
 * Decoded TC String data.
 *
 * @public
 */
export interface DecodedTCString {
	cmpId: number;
	cmpVersion: number;
	consentLanguage: string;
	isServiceSpecific: boolean;
	purposeConsents: Record<number, boolean>;
	purposeLegitimateInterests: Record<number, boolean>;
	vendorConsents: Record<number, boolean>;
	vendorLegitimateInterests: Record<number, boolean>;
	specialFeatureOptIns: Record<number, boolean>;
	/** Vendors that were disclosed to the user in the CMP UI (TCF 2.3+) */
	vendorsDisclosed: Record<number, boolean>;
	created: Date;
	lastUpdated: Date;
	vendorListVersion: number;
	policyVersion: number;

	/**
	 * Publisher restrictions, ordered by purpose then type. Vendor ranges are
	 * expanded; a range may include IDs missing from the vendor list.
	 */
	publisherRestrictions: PublisherRestriction[];
}

/**
 * Decodes an IAB TCF TC String.
 *
 * @throws {Error} When the string is not a valid TC string, including a
 * restriction with the reserved type `3`, purpose ID `0` or a vendor range
 * that ends before it starts.
 * @throws {PublisherRestrictionError} When the string carries a
 * restriction Inth does not support: vendor ID `0`, legitimate interest
 * required for a purpose that is consent-only under the string's policy
 * version, two types for one vendor and
 * purpose, or any restriction in a string that is not service-specific.
 *
 * @example
 * ```typescript
 * const decoded = await decodeTCString(tcString);
 * console.log(decoded.purposeConsents); // { 1: true, 2: true, ... }
 * console.log(decoded.vendorConsents); // { 1: true, 755: true, ... }
 * ```
 *
 * @public
 */
export const decodeTCString = async function decodeTCString(
	tcString: string
): Promise<DecodedTCString> {
	const { TCString } = await getTCFCore();

	const tcModel = TCString.decode(tcString);

	const vectorToRecord = (
		vector: { has: (id: number) => boolean },
		maxId: number
	): Record<number, boolean> => {
		const record: Record<number, boolean> = {};
		for (let i = 1; i <= maxId; i += 1) {
			if (vector.has(i)) {
				record[i] = true;
			}
		}
		return record;
	};

	return {
		cmpId: tcModel.cmpId as number,
		cmpVersion: tcModel.cmpVersion as number,
		consentLanguage: tcModel.consentLanguage,
		created: tcModel.created,
		isServiceSpecific: tcModel.isServiceSpecific,
		lastUpdated: tcModel.lastUpdated,
		policyVersion: tcModel.policyVersion as number,
		publisherRestrictions: readPublisherRestrictions(
			tcModel.publisherRestrictions,
			tcModel.isServiceSpecific,
			tcModel.policyVersion as number
		),
		purposeConsents: vectorToRecord(tcModel.purposeConsents, 11),
		purposeLegitimateInterests: vectorToRecord(
			tcModel.purposeLegitimateInterests,
			11
		),
		specialFeatureOptIns: vectorToRecord(tcModel.specialFeatureOptins, 2),
		vendorConsents: vectorToRecord(
			tcModel.vendorConsents,
			tcModel.vendorConsents.maxId
		),
		vendorLegitimateInterests: vectorToRecord(
			tcModel.vendorLegitimateInterests,
			tcModel.vendorLegitimateInterests.maxId
		),
		vendorListVersion: tcModel.vendorListVersion as number,
		vendorsDisclosed: vectorToRecord(
			tcModel.vendorsDisclosed,
			tcModel.vendorsDisclosed.maxId
		),
	};
};
