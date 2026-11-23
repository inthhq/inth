/**
 * Framework-agnostic IAB dialog data processing.
 *
 * Processes GVL data into UI-ready structures for the consent dialog.
 * This keeps the O(purposes x vendors) derivation out of framework
 * components and gives every framework wrapper the same result.
 *
 * @packageDocumentation
 */

import type {
	AdTechProvider,
	GlobalVendorList,
	NonIABVendor,
} from '@inth/sdk-core';
import { applyPublisherRestrictionsToGVL } from '@inth/sdk-core/iab-support';
import {
	AD_TECH_PROVIDER_PURPOSES,
	permittedLegitimateInterestPurposes,
} from '@inth/sdk-schema/types';

import type {
	HeadlessIABDialogData,
	HeadlessIABProcessedFeature,
	HeadlessIABProcessedPurpose,
	HeadlessIABProcessedSpecialFeature,
	HeadlessIABProcessedStack,
	HeadlessIABProcessedVendor,
	HeadlessIABStateInput,
} from './headless-iab.model';
import { resolveIABSafeUrl, resolveIABVendorUrls } from './vendor-urls.model';

const STANDALONE_PURPOSE_ID = 1;

const EMPTY_DIALOG_DATA: HeadlessIABDialogData = {
	features: [],
	isLoading: true,
	isReady: false,
	purposes: [],
	specialFeatures: [],
	specialPurposes: [],
	stacks: [],
	standalonePurposes: [],
	totalVendors: 0,
};

type GvlVendor = GlobalVendorList['vendors'][number];

/**
 * A vendor from the Global Vendor List as the dialog renders it.
 *
 * @param vendorId - The vendor's key in `gvl.vendors`.
 * @param language - The UI language, which picks the vendor's privacy links.
 * @param purposeId - The purpose the vendor is listed under, which sets
 * `usesLegitimateInterest`.
 */
export const mapGvlVendor = function mapGvlVendor(
	vendorId: string | number,
	vendor: GvlVendor,
	language: string | undefined,
	purposeId?: number
): HeadlessIABProcessedVendor {
	const { legitimateInterestUrl, policyUrl } = resolveIABVendorUrls(
		vendor,
		language
	);
	return {
		cookieMaxAgeSeconds: vendor.cookieMaxAgeSeconds,
		cookieRefresh: vendor.cookieRefresh,
		// The GVL sends the data category ids as `dataDeclaration`.
		dataDeclaration:
			(vendor as GvlVendor & { dataDeclaration?: number[] }).dataDeclaration ??
			vendor.dataCategories ??
			[],
		dataRetention: vendor.dataRetention,
		deviceStorageDisclosureUrl: resolveIABSafeUrl(
			vendor.deviceStorageDisclosureUrl
		),
		features: vendor.features || [],
		id: Number(vendorId),
		isCustom: false,
		legIntPurposes: vendor.legIntPurposes || [],
		legitimateInterestUrl,
		name: vendor.name,
		policyUrl,
		purposes: vendor.purposes || [],
		specialFeatures: vendor.specialFeatures || [],
		specialPurposes: vendor.specialPurposes || [],
		usesCookies: vendor.usesCookies,
		usesLegitimateInterest: purposeId
			? (vendor.legIntPurposes?.includes(purposeId) ?? false)
			: false,
		usesNonCookieAccess: vendor.usesNonCookieAccess,
	};
};

/**
 * A custom (non-IAB) vendor as the dialog renders it. Its legitimate
 * interest purposes keep only those TCF permits, so the dialog never
 * offers an objection on a consent-only purpose.
 *
 * @param purposeId - The purpose the vendor is listed under, which sets
 * `usesLegitimateInterest`.
 */
export const mapCustomVendor = function mapCustomVendor(
	vendor: NonIABVendor,
	purposeId?: number
): HeadlessIABProcessedVendor {
	const legIntPurposes = permittedLegitimateInterestPurposes(
		vendor.legIntPurposes
	);
	return {
		cookieMaxAgeSeconds: vendor.cookieMaxAgeSeconds ?? null,
		cookieRefresh: undefined,
		dataDeclaration: vendor.dataCategories ?? [],
		dataRetention: undefined,
		deviceStorageDisclosureUrl: null,
		features: vendor.features || [],
		id: vendor.id,
		isCustom: true,
		legIntPurposes,
		legitimateInterestUrl: null,
		name: vendor.name,
		policyUrl: resolveIABSafeUrl(vendor.privacyPolicyUrl) ?? '',
		purposes: vendor.purposes || [],
		specialFeatures: vendor.specialFeatures || [],
		specialPurposes: [],
		usesCookies: vendor.usesCookies ?? false,
		usesLegitimateInterest: purposeId
			? legIntPurposes.includes(purposeId)
			: false,
		usesNonCookieAccess: vendor.usesNonCookieAccess ?? false,
	};
};

/** The vendor list copy {@link formatVendorMaxAge} reads. */
export interface VendorMaxAgeCopy {
	/** Uses the `{days}` placeholder. */
	maxAge: string;
	/** Appended when the vendor refreshes the cookie. */
	maxAgeRefreshes?: string;
}

/**
 * A vendor's cookie max age as the dialog shows it, such as "Max Age:
 * 30d (refreshes)".
 *
 * @remarks
 * Days round up: a max age is an upper bound, so a cookie that lives 36
 * hours reads "2d", and one that lives an hour reads "1d", not "0d".
 *
 * @param seconds - `cookieMaxAgeSeconds`.
 * @param refresh - `cookieRefresh`.
 * @param copy - `iab.preferenceCenter.vendorList`.
 * @returns The text, or `null` when the vendor declares no max age.
 */
export const formatVendorMaxAge = function formatVendorMaxAge(
	seconds: number | null | undefined,
	refresh: boolean | undefined,
	copy: VendorMaxAgeCopy
): string | null {
	if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
		return null;
	}
	const age = copy.maxAge.replace('{days}', String(Math.ceil(seconds / 86400)));
	return refresh && copy.maxAgeRefreshes
		? `${age} ${copy.maxAgeRefreshes}`
		: age;
};

/**
 * Purposes some vendor declares. Listed ad tech providers declare the
 * purposes Google needs before it counts their consent, so Accept All can
 * grant only what this list shows.
 */
const processPurposes = function processPurposes(
	gvl: GlobalVendorList,
	customVendors: NonIABVendor[],
	language: string | undefined,
	adTechProviders: AdTechProvider[]
): HeadlessIABProcessedPurpose[] {
	const providerPurposes = new Set<number>(
		adTechProviders.length > 0 ? AD_TECH_PROVIDER_PURPOSES : []
	);
	return Object.entries(gvl.purposes)
		.map(([id, purpose]) => {
			const purposeId = Number(id);
			const iabVendorsForPurpose = Object.entries(gvl.vendors)
				.filter(
					([, vendor]) =>
						vendor.purposes?.includes(purposeId) ||
						vendor.legIntPurposes?.includes(purposeId)
				)
				.map(([vendorId, vendor]) =>
					mapGvlVendor(vendorId, vendor, language, purposeId)
				);

			const customVendorsForPurpose = customVendors
				.map((vendor) => mapCustomVendor(vendor, purposeId))
				.filter(
					(vendor) =>
						vendor.purposes.includes(purposeId) ||
						vendor.legIntPurposes.includes(purposeId)
				);

			return {
				description: purpose.description,
				descriptionLegal: purpose.descriptionLegal,
				id: purposeId,
				illustrations: purpose.illustrations || [],
				name: purpose.name,
				vendors: [...iabVendorsForPurpose, ...customVendorsForPurpose],
				...(providerPurposes.has(purposeId) && {
					adTechProviders,
					neededByAdTechProviders: true,
				}),
			};
		})
		.filter(
			(purpose) => purpose.vendors.length > 0 || purpose.neededByAdTechProviders
		);
};

const processSpecialPurposes = function processSpecialPurposes(
	gvl: GlobalVendorList,
	language: string | undefined
): HeadlessIABProcessedPurpose[] {
	return Object.entries(gvl.specialPurposes || {})
		.map(([id, purpose]) => {
			const purposeId = Number(id);
			const vendorsForPurpose = Object.entries(gvl.vendors)
				.filter(([, vendor]) => vendor.specialPurposes?.includes(purposeId))
				.map(([vendorId, vendor]) => mapGvlVendor(vendorId, vendor, language));

			return {
				description: purpose.description,
				descriptionLegal: purpose.descriptionLegal,
				id: purposeId,
				illustrations: purpose.illustrations || [],
				isSpecialPurpose: true,
				name: purpose.name,
				vendors: vendorsForPurpose,
			};
		})
		.filter((purpose) => purpose.vendors.length > 0);
};

const processSpecialFeatures = function processSpecialFeatures(
	gvl: GlobalVendorList,
	language: string | undefined
): HeadlessIABProcessedSpecialFeature[] {
	return Object.entries(gvl.specialFeatures || {})
		.map(([id, feature]) => {
			const featureId = Number(id);
			const vendorsForFeature = Object.entries(gvl.vendors)
				.filter(([, vendor]) => vendor.specialFeatures?.includes(featureId))
				.map(([vendorId, vendor]) => mapGvlVendor(vendorId, vendor, language));

			return {
				description: feature.description,
				descriptionLegal: feature.descriptionLegal,
				id: featureId,
				illustrations: feature.illustrations || [],
				name: feature.name,
				vendors: vendorsForFeature,
			};
		})
		.filter((feature) => feature.vendors.length > 0);
};

const processFeatures = function processFeatures(
	gvl: GlobalVendorList,
	language: string | undefined
): HeadlessIABProcessedFeature[] {
	return Object.entries(gvl.features || {})
		.map(([id, feature]) => {
			const featureId = Number(id);
			const vendorsForFeature = Object.entries(gvl.vendors)
				.filter(([, vendor]) => vendor.features?.includes(featureId))
				.map(([vendorId, vendor]) => mapGvlVendor(vendorId, vendor, language));

			return {
				description: feature.description,
				descriptionLegal: feature.descriptionLegal,
				id: featureId,
				illustrations: feature.illustrations || [],
				name: feature.name,
				vendors: vendorsForFeature,
			};
		})
		.filter((feature) => feature.vendors.length > 0);
};

const groupPurposesIntoStacks = function groupPurposesIntoStacks(
	gvl: GlobalVendorList,
	purposes: HeadlessIABProcessedPurpose[]
): Pick<HeadlessIABDialogData, 'stacks' | 'standalonePurposes'> {
	const standalonePurpose = purposes.find(
		(purpose) => purpose.id === STANDALONE_PURPOSE_ID
	);
	const otherPurposes = purposes.filter(
		(purpose) => purpose.id !== STANDALONE_PURPOSE_ID
	);
	const otherPurposeIds = new Set(otherPurposes.map((purpose) => purpose.id));
	const gvlStacks = gvl.stacks || {};

	const stackScores: {
		stackId: number;
		stack: (typeof gvlStacks)[number];
		coveredPurposeIds: number[];
		score: number;
	}[] = [];

	for (const [stackIdStr, stack] of Object.entries(gvlStacks)) {
		const coveredPurposeIds = stack.purposes.filter((purposeId) =>
			otherPurposeIds.has(purposeId)
		);
		if (coveredPurposeIds.length >= 2) {
			stackScores.push({
				coveredPurposeIds,
				score: coveredPurposeIds.length,
				stack,
				stackId: Number(stackIdStr),
			});
		}
	}

	stackScores.sort((a, b) => b.score - a.score);

	const stacks: HeadlessIABProcessedStack[] = [];
	const assignedPurposeIds = new Set<number>();
	for (const { stackId, stack, coveredPurposeIds } of stackScores) {
		const unassignedPurposeIds = coveredPurposeIds.filter(
			(purposeId) => !assignedPurposeIds.has(purposeId)
		);
		if (unassignedPurposeIds.length >= 2) {
			const stackPurposes = otherPurposes.filter((purpose) =>
				unassignedPurposeIds.includes(purpose.id)
			);
			stacks.push({
				description: stack.description,
				id: stackId,
				name: stack.name,
				purposes: stackPurposes,
			});
			for (const purposeId of unassignedPurposeIds) {
				assignedPurposeIds.add(purposeId);
			}
		}
	}

	const uncoveredPurposes = otherPurposes.filter(
		(purpose) => !assignedPurposeIds.has(purpose.id)
	);
	const standalonePurposes = standalonePurpose
		? [standalonePurpose, ...uncoveredPurposes]
		: uncoveredPurposes;

	return { stacks, standalonePurposes };
};

/**
 * Processes GVL data into a format suitable for the consent dialog UI.
 *
 * @param iab - IAB state with GVL, optional custom vendors, and the UI
 * language that picks each vendor's privacy links.
 */
export const processGVLForDialog = function processGVLForDialog(
	iab: HeadlessIABStateInput | null
): HeadlessIABDialogData {
	if (!iab?.gvl) {
		return {
			...EMPTY_DIALOG_DATA,
			isLoading: Boolean(iab?.isLoadingGVL ?? true),
		};
	}

	const gvl = applyPublisherRestrictionsToGVL(
		iab.gvl,
		iab.publisherRestrictions
	);
	// A custom vendor with a registered vendor's id is dropped, as
	// `createIAB()` drops it, so the two never share a row.
	const customVendors = (iab.nonIABVendors ?? iab.customVendors ?? []).filter(
		(vendor) => !Object.hasOwn(iab.gvl?.vendors ?? {}, String(vendor.id))
	);
	const { language } = iab;
	const purposes = processPurposes(
		gvl,
		customVendors,
		language,
		iab.adTechProviders ?? []
	);
	const specialPurposes = processSpecialPurposes(gvl, language);
	const specialFeatures = processSpecialFeatures(gvl, language);
	const features = processFeatures(gvl, language);
	const { stacks, standalonePurposes } = groupPurposesIntoStacks(gvl, purposes);

	return {
		features,
		isLoading: Boolean(iab.isLoadingGVL || !iab.gvl),
		isReady: true,
		purposes,
		specialFeatures,
		specialPurposes,
		stacks,
		standalonePurposes,
		totalVendors:
			Object.keys(gvl.vendors).length +
			customVendors.length +
			(iab.adTechProviders?.length ?? 0),
	};
};

export type {
	HeadlessIABDialogData as ProcessedGVLData,
	HeadlessIABProcessedFeature as ProcessedFeature,
	HeadlessIABProcessedPurpose as ProcessedPurpose,
	HeadlessIABProcessedSpecialFeature as ProcessedSpecialFeature,
	HeadlessIABProcessedStack as ProcessedStack,
	HeadlessIABProcessedVendor as ProcessedVendor,
};
