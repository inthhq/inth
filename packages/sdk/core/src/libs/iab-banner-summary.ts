/**
 * Framework-agnostic IAB banner summary logic.
 *
 * Extracted from the React useHeadlessIABConsentUI hook to be
 * shared across React, Svelte, Vue, Solid, and Astro.
 *
 * @packageDocumentation
 */

import { AD_TECH_PROVIDER_PURPOSES } from '@inth/sdk-schema/types';

import type { KernelIABState } from '../types';
import type { ResolvedIABCopy } from './consent-copy';

type HeadlessIABStateInput = Pick<KernelIABState, 'gvl'> &
	Partial<Pick<KernelIABState, 'customVendors' | 'adTechProviders'>> & {
		/** Server summary and list location, used while gvl is absent. */
		gvlReference?: KernelIABState['gvlReference'];
		nonIABVendors?: KernelIABState['customVendors'];
	};

/** Banner copy derived from a full list or a deferred server summary. */
export interface HeadlessIABBannerState {
	/** Whether sufficient vendor data is available to display the summary. */
	isReady: boolean;
	/**
	 * Number of registered vendors, custom vendors and Google ad tech
	 * providers disclosed by the banner.
	 */
	vendorCount: number;
	/** Names of applicable purposes, stacks and special features. */
	displayItems: string[];
	/** Number of disclosure items omitted by the display limit. */
	remainingCount: number;
}

/**
 * How many summary items the banner lists before it collapses the rest
 * into "and {count} more". Exported so an adapter that wants to say how
 * many it dropped does not re-guess the number.
 */
export const IAB_BANNER_MAX_DISPLAY_ITEMS = 5;

const STANDALONE_PURPOSE_ID = 1;

/** Options for {@link resolveIABBannerSummary}. */
export interface ResolveIABBannerSummaryOptions {
	/**
	 * How many items to list before collapsing the rest into the
	 * "and {count} more" line. Defaults to {@link IAB_BANNER_MAX_DISPLAY_ITEMS}.
	 */
	maxItems?: number;
}

const referencedSummary = (
	iab: HeadlessIABStateInput | null,
	maxItems: number
): HeadlessIABBannerState => {
	if (iab?.gvlReference?.summary) {
		const { items, vendorCount } = iab.gvlReference.summary;
		return {
			displayItems: items.slice(0, maxItems),
			isReady: true,
			remainingCount: Math.max(0, items.length - maxItems),
			vendorCount:
				vendorCount +
				(iab.nonIABVendors ?? iab.customVendors ?? []).length +
				(iab.adTechProviders?.length ?? 0),
		};
	}
	return {
		displayItems: [],
		isReady: false,
		remainingCount: 0,
		vendorCount: 0,
	};
};

/**
 * Purposes some registered vendor declares, plus the purposes listed ad tech
 * providers need, which Accept All grants for them.
 */
const declaredPurposes = (
	gvl: NonNullable<HeadlessIABStateInput['gvl']>,
	adTechProviders: HeadlessIABStateInput['adTechProviders']
): { id: number; name: string }[] => {
	const providerPurposes = new Set<number>(
		adTechProviders?.length ? AD_TECH_PROVIDER_PURPOSES : []
	);
	return Object.entries(gvl.purposes)
		.filter(
			([id]) =>
				providerPurposes.has(Number(id)) ||
				Object.values(gvl.vendors).some(
					(vendor) =>
						vendor.purposes?.includes(Number(id)) ||
						vendor.legIntPurposes?.includes(Number(id))
				)
		)
		.map(([id, purpose]) => ({ id: Number(id), name: purpose.name }));
};

/**
 * Resolves the IAB banner summary from the current IAB state.
 *
 * Pure function — no framework reactivity. Each framework package
 * wraps this in its own reactive primitive (useMemo, $derived, computed, etc.).
 *
 * @param iab - IAB state carrying the GVL and any custom vendors.
 * @param options - The item cap, when a caller wants its own.
 * @returns The names the banner lists, how many it left out, and the
 * vendor count.
 */
export const resolveIABBannerSummary = function resolveIABBannerSummary(
	iab: HeadlessIABStateInput | null,
	options: ResolveIABBannerSummaryOptions = {}
): HeadlessIABBannerState {
	const maxItems = options.maxItems ?? IAB_BANNER_MAX_DISPLAY_ITEMS;
	if (!iab?.gvl) {
		return referencedSummary(iab, maxItems);
	}

	const { gvl } = iab;
	const customVendors = iab.nonIABVendors ?? iab.customVendors ?? [];
	const vendorCount =
		Object.keys(gvl.vendors).length +
		customVendors.length +
		(iab.adTechProviders?.length ?? 0);

	const purposesWithVendors = declaredPurposes(gvl, iab.adTechProviders);

	const standalonePurpose = purposesWithVendors.find(
		(purpose) => purpose.id === STANDALONE_PURPOSE_ID
	);
	const otherPurposes = purposesWithVendors.filter(
		(purpose) => purpose.id !== STANDALONE_PURPOSE_ID
	);
	const otherPurposeIds = new Set(otherPurposes.map((purpose) => purpose.id));

	const stackScores: {
		name: string;
		coveredPurposeIds: number[];
		score: number;
	}[] = [];

	for (const stack of Object.values(gvl.stacks || {})) {
		const coveredPurposeIds = stack.purposes.filter((purposeId) =>
			otherPurposeIds.has(purposeId)
		);
		if (coveredPurposeIds.length >= 2) {
			stackScores.push({
				coveredPurposeIds,
				name: stack.name,
				score: coveredPurposeIds.length,
			});
		}
	}

	stackScores.sort((a, b) => b.score - a.score);

	const selectedStacks: string[] = [];
	const assignedPurposeIds = new Set<number>();
	for (const { name, coveredPurposeIds } of stackScores) {
		const unassignedPurposes = coveredPurposeIds.filter(
			(purposeId) => !assignedPurposeIds.has(purposeId)
		);
		if (unassignedPurposes.length >= 2) {
			selectedStacks.push(name);
			for (const purposeId of unassignedPurposes) {
				assignedPurposeIds.add(purposeId);
			}
		}
	}

	const uncoveredPurposes = otherPurposes.filter(
		(purpose) => !assignedPurposeIds.has(purpose.id)
	);

	const specialFeaturesWithVendors = Object.entries(gvl.specialFeatures || {})
		.filter(([id]) =>
			Object.values(gvl.vendors).some((vendor) =>
				vendor.specialFeatures?.includes(Number(id))
			)
		)
		.map(([, feature]) => feature.name);

	const items: string[] = [];
	if (standalonePurpose) {
		items.push(standalonePurpose.name);
	}
	for (const stackName of selectedStacks) {
		items.push(stackName);
	}
	for (const purpose of uncoveredPurposes) {
		items.push(purpose.name);
	}
	for (const featureName of specialFeaturesWithVendors) {
		items.push(featureName);
	}

	return {
		displayItems: items.slice(0, maxItems),
		isReady: true,
		remainingCount: Math.max(0, items.length - maxItems),
		vendorCount,
	};
};

/** The banner copy with the partner counts filled in. */
export interface IABBannerCopy {
	/** Description text before the partners link. */
	descriptionBefore: string;
	/** The partners link text, with the vendor count. */
	partnersLink: string;
	/** Description text after the partners link. */
	descriptionAfter: string;
	/**
	 * The "and N more" item after the listed purposes, or `undefined` when
	 * every purpose is listed.
	 */
	andMore: string | undefined;
}

/**
 * The banner description split around its partners link, with the counts
 * filled in. The link sits inside the sentence, so the copy is split around
 * it rather than concatenated: a translation is free to put it anywhere. A
 * description that does not contain the link text keeps it whole, and the
 * link follows it.
 *
 * @param iab - The IAB copy, from `resolveIABCopy`.
 * @param summary - Counts from `resolveIABBannerSummary`.
 * @param description - A description to use in place of the translated one.
 *
 * @example
 * ```ts
 * const copy = resolveIABBannerCopy(resolveIABCopy(t), summary);
 * `${copy.descriptionBefore}[${copy.partnersLink}]${copy.descriptionAfter}`;
 * ```
 * @public
 */
export const resolveIABBannerCopy = function resolveIABBannerCopy(
	iab: Pick<ResolvedIABCopy, 'banner'>,
	summary: { vendorCount: number; remainingCount: number },
	description: string = iab.banner.description
): IABBannerCopy {
	const vendorCount = String(summary.vendorCount);
	const text = description.replace('{partnerCount}', vendorCount);
	const partnersLink = iab.banner.partnersLink.replace('{count}', vendorCount);
	const at = partnersLink ? text.indexOf(partnersLink) : -1;
	return {
		andMore:
			summary.remainingCount > 0
				? iab.banner.andMore.replace('{count}', String(summary.remainingCount))
				: undefined,
		descriptionAfter: at === -1 ? '' : text.slice(at + partnersLink.length),
		descriptionBefore: at === -1 ? text : text.slice(0, at),
		partnersLink,
	};
};
