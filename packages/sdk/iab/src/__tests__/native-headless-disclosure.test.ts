/**
 * Holds `packages/native-protocol/iab/headless-disclosure-cases.json` to this package's
 * web code. The fixture is what a React Native screen drawing its own TCF UI
 * reads and commits through the native bridge under publisher restrictions and
 * Google Additional Consent providers:
 *
 * - `disclosure`: each vendor's legal bases after the restrictions, from
 *   {@link applyPublisherRestrictionsToGVL}, the partner counts per purpose,
 *   and the first-layer summary from `resolveIABBannerSummary`.
 * - `cases`: the TC String {@link generateTCString} encodes and the AC string
 *   {@link additionalConsentFor} builds for a selection.
 * - `conflicts`: vendor signals the restrictions rule out, which the native
 *   headless commit refuses.
 *
 * Swift (`IABHeadlessDisclosureTests`, `C15tPayloadTests`) and Kotlin
 * (`IabHeadlessDisclosureTest`, `C15tPayloadTest`) assert the same values from
 * the native model, the stock save path and the bridge's headless commit, so
 * web, iOS and Android cannot drift apart without one suite failing.
 *
 * Run with `UPDATE_NATIVE_FIXTURES=1` to rewrite the fixture.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { GlobalVendorList, PublisherRestriction } from '@inth/sdk-core';
import { resolveIABBannerSummary } from '@inth/sdk-core';
import { describe, expect, test } from 'vitest';

import { applyPublisherRestrictionsToGVL } from '../headless/effective-vendor-list';
import { additionalConsentFor } from '../tcf/additional-consent';
import { generateTCString } from '../tcf/tc-string';

const IAB = resolve(import.meta.dirname, '../../../../native-protocol/iab');
const FIXTURE = resolve(IAB, 'headless-disclosure-cases.json');
const VENDOR_LIST = 'accept-all-declared-signals.json';

/** Purposes TCF allows only with consent. */
const NEVER_LI = new Set([1, 3, 4, 5, 6]);
/** Purposes Google requires consent to before a provider's consent counts. */
const AD_TECH_PROVIDER_PURPOSES = [1, 3, 4];

interface Choices {
	adTechProviderConsents?: number[] | null;
	purposeConsents: number[];
	purposeLegitimateInterests: number[];
	purposeObjections: number[];
	vendorConsents: number[];
	vendorLegitimateInterests: number[];
	vendorObjections: number[];
	specialFeatureOptIns: number[];
	publisherConsents: number[];
	publisherLegitimateInterests: number[];
	publisherCustomConsents: number[];
	publisherCustomLegitimateInterests: number[];
	customVendorConsents?: string[];
	customVendorLegitimateInterests?: string[];
}

interface NativeRestriction {
	purposeId: number;
	type: number;
	vendorIds: number[];
}

interface Provider {
	id: number;
	name: string;
	policyUrl: string;
}

const NONE: Choices = {
	publisherConsents: [],
	publisherCustomConsents: [],
	publisherCustomLegitimateInterests: [],
	publisherLegitimateInterests: [],
	purposeConsents: [],
	purposeLegitimateInterests: [],
	purposeObjections: [],
	specialFeatureOptIns: [],
	vendorConsents: [],
	vendorLegitimateInterests: [],
	vendorObjections: [],
};

// A real GVL (v183) and Google's providers 89 and 2572, shared with the
// Accept all fixture so both pin the same list.
const vendorList = JSON.parse(
	readFileSync(resolve(IAB, VENDOR_LIST), 'utf8')
) as { gvl: GlobalVendorList; adTechProviders: Provider[] };
const { gvl, adTechProviders } = vendorList;

const now = 1_758_100_000_000;

// Test-only CMP identity. Restrictions that move every consent purpose of
// vendor 10 off consent, and every legitimate-interest purpose of vendor 21 off
// legitimate interest, beside the ones the Accept all fixture already uses.
const configuration = {
	cmpId: 53,
	cmpVersion: 7,
	consentLanguage: 'EN',
	consentScreen: 1,
	numCustomPurposes: 0,
	publisherCountryCode: 'GB',
	publisherRestrictions: [
		{ purposeId: 1, type: 0, vendorIds: [10] },
		{ purposeId: 2, type: 0, vendorIds: [21] },
		{ purposeId: 2, type: 2, vendorIds: [10] },
		{ purposeId: 4, type: 0, vendorIds: [10] },
		{ purposeId: 7, type: 1, vendorIds: [21] },
		{ purposeId: 7, type: 2, vendorIds: [10] },
		{ purposeId: 9, type: 0, vendorIds: [755] },
		// Not 52: the web encoder writes vendors that sit next to each other in
		// the narrowed list (21 and 52 here) as one range, which decoders read as
		// covering 22 to 51 as well. Native writes each vendor. 21 and 755 have
		// 52 and 91 between them, so both encoders write them alike.
		{ purposeId: 10, type: 1, vendorIds: [21, 755] },
		{ purposeId: 10, type: 2, vendorIds: [10] },
	] satisfies NativeRestriction[],
};

// One partner outside the list, served beside the restrictions. Restrictions name
// IAB vendor IDs, so they never touch it; its purposes still count, as the web's
// `processPurposes` and `applyBlanket` count them. Purpose 3 sits in its
// legitimate-interest list to check that TCF's consent-only purposes stay out.
/** A custom vendor as `/init` serves it, `NonIABVendor` in `@inth/sdk/schema`. */
interface CustomVendor {
	id: string;
	name: string;
	privacyPolicyUrl: string;
	purposes: number[];
	legIntPurposes: number[];
	specialFeatures: number[];
	features: number[];
	dataCategories: number[];
	usesCookies: boolean;
	usesNonCookieAccess: boolean;
}

const customVendors: CustomVendor[] = [
	{
		dataCategories: [],
		features: [],
		id: 'publisher-measurement',
		legIntPurposes: [3, 10],
		name: 'Publisher measurement',
		privacyPolicyUrl: 'https://publisher.example/privacy',
		purposes: [1, 8],
		specialFeatures: [],
		usesCookies: false,
		usesNonCookieAccess: false,
	},
];
const customIds = customVendors.map((vendor) => vendor.id);

const webRestrictions: PublisherRestriction[] =
	configuration.publisherRestrictions.map(({ purposeId, type, vendorIds }) => ({
		purposeId,
		restrictionType: type as PublisherRestriction['restrictionType'],
		vendorIds,
	}));

const sorted = (ids: Iterable<number>): number[] =>
	[...new Set(ids)].sort((left, right) => left - right);
const record = (ids: readonly number[]): Record<number, boolean> =>
	Object.fromEntries(ids.map((id) => [id, true]));

const active = Object.values(gvl.vendors)
	.filter((vendor) => !vendor.deletedDate)
	.sort((left, right) => left.id - right.id);
const effective = applyPublisherRestrictionsToGVL(gvl, webRestrictions).vendors;
const purposeIds = Object.keys(gvl.purposes)
	.map(Number)
	.filter((id) => id >= 1 && id <= 24)
	.sort((left, right) => left - right);

/** One vendor's bases after restrictions, in the bridge's `iab.disclosure` shape. */
const vendorDisclosure = function vendorDisclosure(id: number) {
	const raw = gvl.vendors[id];
	const after = effective[id];
	if (!(raw && after)) {
		throw new Error(`vendor ${id} is not in the list`);
	}
	const consent = sorted(after.purposes);
	const interest = sorted(after.legIntPurposes).filter((p) => !NEVER_LI.has(p));
	const declared = new Set([...raw.purposes, ...raw.legIntPurposes]);
	return {
		consentPurposes: consent,
		consentRequiredPurposes: consent.filter((p) => !raw.purposes.includes(p)),
		legitimateInterestPurposes: interest,
		legitimateInterestRequiredPurposes: interest.filter(
			(p) => !raw.legIntPurposes.includes(p)
		),
		notAllowedPurposes: sorted(
			configuration.publisherRestrictions
				.filter(
					(r) =>
						r.type === 0 &&
						r.vendorIds.includes(id) &&
						declared.has(r.purposeId)
				)
				.map((r) => r.purposeId)
		),
	};
};

const vendors = Object.fromEntries(
	active.map((vendor) => [String(vendor.id), vendorDisclosure(vendor.id)])
);

const declaredPurposeIds = purposeIds.filter(
	(id) =>
		(adTechProviders.length > 0 && AD_TECH_PROVIDER_PURPOSES.includes(id)) ||
		active.some(
			(v) => v.purposes.includes(id) || v.legIntPurposes.includes(id)
		) ||
		customVendors.some(
			(v) => v.purposes.includes(id) || v.legIntPurposes.includes(id)
		)
);
const declaredSpecialFeatureIds = Object.keys(gvl.specialFeatures)
	.map(Number)
	.sort((left, right) => left - right)
	.filter(
		(id) =>
			active.some((v) => v.specialFeatures.includes(id)) ||
			customVendors.some((v) => v.specialFeatures.includes(id))
	);

const summary = resolveIABBannerSummary({
	adTechProviders,
	customVendors,
	gvl,
} as unknown as Parameters<typeof resolveIABBannerSummary>[0]);

const disclosure = {
	adTechProviderPurposeIds: AD_TECH_PROVIDER_PURPOSES,
	adTechProviders,
	bannerSummary: {
		displayItems: summary.displayItems,
		remainingCount: summary.remainingCount,
		vendorCount: summary.vendorCount,
	},
	declaredPurposeIds,
	declaredSpecialFeatureIds,
	language: configuration.consentLanguage,
	purposes: Object.fromEntries(
		declaredPurposeIds.map((id) => [
			String(id),
			{
				consentPartnerCount:
					Object.values(vendors).filter((v) => v.consentPurposes.includes(id))
						.length +
					(AD_TECH_PROVIDER_PURPOSES.includes(id)
						? adTechProviders.length
						: 0) +
					customVendors.filter((v) => v.purposes.includes(id)).length,
				legitimateInterestPartnerCount:
					Object.values(vendors).filter((v) =>
						v.legitimateInterestPurposes.includes(id)
					).length +
					(NEVER_LI.has(id)
						? 0
						: customVendors.filter((v) => v.legIntPurposes.includes(id))
								.length),
			},
		])
	),
	vendors,
};

// Accept all, as `applyBlanket` grants it: what some vendor uses on each basis
// after restrictions, the provider purposes, and every declared special feature.
const consentUsed = new Set(
	Object.values(vendors).flatMap((v) => v.consentPurposes)
);
for (const id of AD_TECH_PROVIDER_PURPOSES) {
	consentUsed.add(id);
}
for (const id of customVendors.flatMap((v) => v.purposes)) {
	consentUsed.add(id);
}
const interestUsed = new Set(
	Object.values(vendors).flatMap((v) => v.legitimateInterestPurposes)
);
for (const id of customVendors.flatMap((v) => v.legIntPurposes)) {
	if (!NEVER_LI.has(id)) {
		interestUsed.add(id);
	}
}
const acceptAll: Choices = {
	...NONE,
	adTechProviderConsents: adTechProviders.map((p) => p.id),
	customVendorConsents: customVendors
		.filter((v) => v.purposes.length > 0)
		.map((v) => v.id),
	customVendorLegitimateInterests: customVendors
		.filter((v) => v.legIntPurposes.length > 0)
		.map((v) => v.id),
	purposeConsents: purposeIds.filter((id) => consentUsed.has(id)),
	purposeLegitimateInterests: purposeIds.filter((id) => interestUsed.has(id)),
	specialFeatureOptIns: declaredSpecialFeatureIds,
	vendorConsents: active
		.filter((v) => vendors[v.id]?.consentPurposes.length)
		.map((v) => v.id),
	vendorLegitimateInterests: active
		.filter((v) => vendors[v.id]?.legitimateInterestPurposes.length)
		.map((v) => v.id),
};

const selections: { id: string; choices: Choices }[] = [
	{ choices: acceptAll, id: 'accept-all' },
	{
		choices: {
			...NONE,
			adTechProviderConsents: [89],
			purposeConsents: [1, 3, 4, 7, 9],
			purposeLegitimateInterests: [2],
			purposeObjections: [10],
			specialFeatureOptIns: [1],
			vendorConsents: [21, 91],
			vendorLegitimateInterests: [10],
			vendorObjections: [52, 755],
		},
		id: 'custom',
	},
	{
		// Providers stay off unless purposes 1, 3 and 4 are all consented.
		choices: {
			...NONE,
			adTechProviderConsents: [89, 2572],
			purposeConsents: [1, 3],
		},
		id: 'providers-without-prerequisites',
	},
	{ choices: { ...NONE, adTechProviderConsents: [] }, id: 'reject' },
	{
		// A custom vendor's ids ride beside restricted IAB vendors: the strict
		// restriction check reads IAB vendor IDs only, so this commit passes.
		choices: {
			...NONE,
			customVendorConsents: customIds,
			customVendorLegitimateInterests: customIds,
			purposeConsents: [1, 8],
			purposeLegitimateInterests: [10],
			vendorConsents: [21],
		},
		id: 'custom-vendor-beside-restrictions',
	},
];

// Vendor signals no stock switch offers: vendor 10 has no consent purpose left
// and vendor 21 no legitimate-interest purpose.
const conflicting: { id: string; choices: Choices }[] = [
	{
		choices: { ...NONE, purposeConsents: [1, 3, 4], vendorConsents: [10, 91] },
		id: 'consent-for-a-vendor-restricted-off-consent',
	},
	{
		choices: {
			...NONE,
			purposeLegitimateInterests: [2],
			vendorLegitimateInterests: [21, 52],
		},
		id: 'legitimate-interest-for-a-vendor-restricted-off-legitimate-interest',
	},
	{
		// A custom vendor's consent does not excuse a restricted IAB vendor's.
		choices: {
			...NONE,
			customVendorConsents: customIds,
			purposeConsents: [1, 3, 4, 8],
			vendorConsents: [10],
		},
		id: 'consent-for-a-restricted-vendor-beside-a-custom-vendor',
	},
];

/** The rule the native headless commit applies, read from the web's restricted list. */
const conflictsOf = function conflictsOf(choices: Choices): string[] {
	const check = (
		ids: number[],
		name: string,
		declared: (id: number) => number[],
		disclosed: (id: number) => number[]
	) =>
		sorted(ids)
			.filter((id) => disclosed(id).length === 0 && declared(id).length > 0)
			.map((id) => `${name}:${id}`);
	return [
		...check(
			choices.vendorConsents,
			'vendorConsents',
			(id) => gvl.vendors[id]?.purposes ?? [],
			(id) => vendors[id]?.consentPurposes ?? []
		),
		...check(
			choices.vendorLegitimateInterests,
			'vendorLegitimateInterests',
			(id) =>
				(gvl.vendors[id]?.legIntPurposes ?? []).filter((p) => !NEVER_LI.has(p)),
			(id) => vendors[id]?.legitimateInterestPurposes ?? []
		),
	];
};

const encode = async function encode(choices: Choices) {
	const tcString = await generateTCString(
		{
			publisherRestrictions: webRestrictions,
			purposeConsents: record(choices.purposeConsents),
			purposeLegitimateInterests: record(choices.purposeLegitimateInterests),
			specialFeatureOptIns: record(choices.specialFeatureOptIns),
			vendorConsents: record(choices.vendorConsents),
			vendorLegitimateInterests: record(choices.vendorLegitimateInterests),
			vendorsDisclosed: record(active.map((v) => v.id)),
		},
		gvl,
		{
			cmpId: configuration.cmpId,
			cmpVersion: configuration.cmpVersion,
			confirmedAt: now,
			consentLanguage: configuration.consentLanguage,
			consentScreen: configuration.consentScreen,
			publisherCountryCode: configuration.publisherCountryCode,
		}
	);
	const addtlConsent = additionalConsentFor(
		Object.fromEntries(
			adTechProviders.map((p) => [
				String(p.id),
				choices.adTechProviderConsents?.includes(p.id) === true,
			])
		),
		record(choices.purposeConsents)
	);
	return { addtlConsent: addtlConsent ?? null, tcString };
};

const build = async function build() {
	return {
		acceptAll,
		cases: await Promise.all(
			selections.map(async ({ id, choices }) => ({
				choices,
				id,
				...(await encode(choices)),
			}))
		),
		configuration,
		conflicts: conflicting.map(({ id, choices }) => ({
			choices,
			conflicts: conflictsOf(choices),
			id,
		})),
		customVendors,
		description:
			'A React Native screen that draws its own TCF UI under publisher restrictions, Google Additional Consent providers and one custom (non-IAB) vendor. `customVendors` is what `/init` serves and the bridge sends as `iab.customVendors`; `disclosure` is what the bridge sends as `iab.disclosure` (consentStorageMaxDays left out: it comes from the policy), with the custom vendor in the partner counts, the declared purposes and the summary. `cases` are the TC and AC strings the stock save and the headless commit must both write for a selection; `conflicts` are selections the headless commit refuses as invalid-iab-choices.',
		disclosure,
		now,
		source: `Generated by packages/sdk/iab/src/__tests__/native-headless-disclosure.test.ts with UPDATE_NATIVE_FIXTURES=1 from the web code. gvl and adTechProviders come from ${VENDOR_LIST}.`,
		vendorList: VENDOR_LIST,
	};
};

describe('native headless IAB disclosure fixture', () => {
	test('matches what the web code derives and encodes', async () => {
		const expected = await build();
		if (process.env.UPDATE_NATIVE_FIXTURES === '1') {
			writeFileSync(FIXTURE, `${JSON.stringify(expected, null, '\t')}\n`);
		}
		const committed = JSON.parse(readFileSync(FIXTURE, 'utf8')) as unknown;
		expect(committed).toEqual(expected);
	});

	test('every conflict case names a conflict and no committed case does', async () => {
		const fixture = await build();
		for (const row of fixture.conflicts) {
			expect(row.conflicts, row.id).not.toEqual([]);
		}
		for (const row of fixture.cases) {
			expect(conflictsOf(row.choices), row.id).toEqual([]);
		}
	});
});
