import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	GVL,
	PurposeRestriction,
	TCModel,
	TCString,
} from '@iabtechlabtcf/core';

const definition = (id: number) => ({
	description: `Purpose ${id}`,
	id,
	name: `Purpose ${id}`,
});
const vendor = (id: number, purposes: number[], legIntPurposes: number[]) => ({
	cookieMaxAgeSeconds: 0,
	features: [],
	flexiblePurposes: [2],
	id,
	legIntPurposes,
	name: `Vendor ${id}`,
	policyUrl: 'https://vendor.example/privacy',
	purposes,
	specialFeatures: [],
	specialPurposes: [],
	usesCookies: false,
	usesNonCookieAccess: false,
});
const gvlData = {
	features: {},
	gvlSpecificationVersion: 2,
	lastUpdated: '2025-09-17T00:00:00Z',
	purposes: { 1: definition(1), 2: definition(2), 7: definition(7) },
	specialFeatures: { 1: definition(1) },
	specialPurposes: {},
	stacks: {},
	tcfPolicyVersion: 5,
	vendorListVersion: 42,
	vendors: { 1: vendor(1, [1, 2], [2]), 2: vendor(2, [], [2, 7]) },
};
const empty = {
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
// Test-only oracle identity. Production configuration must supply its approved ID.
const base = {
	cmpId: 53,
	cmpVersion: 7,
	consentLanguage: 'EN',
	consentScreen: 1,
	numCustomPurposes: 2,
	publisherCountryCode: 'GB',
	publisherRestrictions: [] as {
		purposeId: number;
		type: number;
		vendorIds: number[];
	}[],
};
const now = 1_758_100_000_000;
const cases = [
	// What Accept All grants for this list, as the web's `applyBlanket` does: no
	// vendor takes purpose 7 on consent or declares special feature 1, vendor 2
	// has no consent purpose, and publisher purposes are never shown.
	{
		choices: {
			...empty,
			purposeConsents: [1, 2],
			purposeLegitimateInterests: [2, 7],
			vendorConsents: [1],
			vendorLegitimateInterests: [1, 2],
		},
		configuration: base,
		id: 'accept',
	},
	{ choices: empty, configuration: base, id: 'reject' },
	{
		choices: {
			...empty,
			publisherCustomConsents: [2],
			purposeConsents: [1],
			purposeLegitimateInterests: [7],
			purposeObjections: [2],
			specialFeatureOptIns: [1],
			vendorConsents: [1],
			vendorObjections: [2],
		},
		configuration: base,
		id: 'custom',
	},
	{
		choices: {
			...empty,
			publisherConsents: [2],
			purposeConsents: [2],
			vendorConsents: [2],
		},
		configuration: {
			...base,
			publisherRestrictions: [{ purposeId: 2, type: 1, vendorIds: [2] }],
		},
		id: 'restriction',
	},
	{
		choices: empty,
		configuration: {
			...base,
			publisherRestrictions: [
				{ purposeId: 2, type: 0, vendorIds: [2] },
				{ purposeId: 2, type: 0, vendorIds: [1] },
				{ purposeId: 7, type: 0, vendorIds: [2] },
			],
		},
		id: 'restriction-ranges',
	},
	{
		choices: {
			...empty,
			publisherConsents: [1, 2, 7],
			publisherCustomConsents: [1, 2],
			publisherCustomLegitimateInterests: [1, 2],
			publisherLegitimateInterests: [2, 7],
			purposeConsents: [1, 2, 7],
			purposeLegitimateInterests: [2, 7],
			specialFeatureOptIns: [1],
			vendorConsents: [1],
			vendorLegitimateInterests: [1, 2],
		},
		configuration: base,
		id: 'publisher-purposes',
	},
];

/** Shared oracle cases exercise native authoring, not a JS production runtime. */
export const iabCommitFixtures = async function iabCommitFixtures() {
	const gvl = new GVL(gvlData);
	await gvl.readyPromise;
	return {
		cases: cases.map((input) => {
			const model = new TCModel(gvl);
			const c = input.configuration;
			const choice = input.choices;
			model.cmpId = c.cmpId;
			model.cmpVersion = c.cmpVersion;
			model.consentScreen = c.consentScreen;
			model.publisherCountryCode = c.publisherCountryCode;
			model.isServiceSpecific = true;
			model.created = new Date(Math.floor(now / 86_400_000) * 86_400_000);
			model.lastUpdated = model.created;
			for (const id of choice.purposeConsents) {
				model.purposeConsents.set(id);
			}
			for (const id of choice.purposeLegitimateInterests) {
				model.purposeLegitimateInterests.set(id);
			}
			for (const id of choice.vendorConsents) {
				model.vendorConsents.set(id);
			}
			for (const id of choice.vendorLegitimateInterests) {
				model.vendorLegitimateInterests.set(id);
			}
			for (const id of choice.specialFeatureOptIns) {
				model.specialFeatureOptins.set(id);
			}
			for (const id of [1, 2]) {
				model.vendorsDisclosed.set(id);
			}
			for (const id of choice.publisherConsents) {
				model.publisherConsents.set(id);
			}
			for (const id of choice.publisherLegitimateInterests) {
				model.publisherLegitimateInterests.set(id);
			}
			model.numCustomPurposes = c.numCustomPurposes;
			for (const id of choice.publisherCustomConsents) {
				model.publisherCustomConsents.set(id);
			}
			for (const id of choice.publisherCustomLegitimateInterests) {
				model.publisherCustomLegitimateInterests.set(id);
			}
			for (const r of c.publisherRestrictions) {
				for (const id of r.vendorIds) {
					model.publisherRestrictions.add(
						id,
						new PurposeRestriction(r.purposeId, r.type)
					);
				}
			}
			return { ...input, tcString: TCString.encode(model) };
		}),
		gvl: gvlData,
		invalidChoices: [
			{ ...empty, purposeConsents: [25] },
			{ ...empty, purposeLegitimateInterests: [1] },
			{ ...empty, vendorConsents: [999] },
			{ ...empty, purposeConsents: [2, 2] },
			{ ...empty, vendorLegitimateInterests: [1], vendorObjections: [1] },
			{ ...empty, purposeLegitimateInterests: [2], purposeObjections: [2] },
			{ ...empty, publisherCustomConsents: [3] },
		],
		invalidConfigurations: [
			{ ...base, cmpId: 0 },
			{ ...base, cmpId: 1 },
			{ ...base, cmpId: 4096 },
			{ ...base, consentLanguage: 'english' },
			{ ...base, publisherCountryCode: 'gB' },
			{
				...base,
				publisherRestrictions: [{ purposeId: 1, type: 2, vendorIds: [1] }],
			},
			{
				...base,
				publisherRestrictions: [{ purposeId: 7, type: 1, vendorIds: [2] }],
			},
			{
				...base,
				publisherRestrictions: [{ purposeId: 7, type: 0, vendorIds: [1] }],
			},
		],
		now,
		oracle: { package: '@iabtechlabtcf/core', version: '1.5.22' },
	};
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	mkdirSync(
		resolve(import.meta.dirname, '../../..', 'packages/native-protocol/iab'),
		{
			recursive: true,
		}
	);
	writeFileSync(
		resolve(
			import.meta.dirname,
			'../../..',
			'packages/native-protocol/iab/commit-cases.json'
		),
		`${JSON.stringify(await iabCommitFixtures(), null, 2)}\n`
	);
}
