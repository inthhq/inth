import { readFileSync, writeFileSync } from 'node:fs';

import {
	GVL,
	TCModel,
	TCString,
	PurposeRestriction,
} from '@iabtechlabtcf/core';

// Development oracle only. Native production code owns TCF authoring.
const def = (id) => ({ description: `P${id}`, id, name: `P${id}` });
const vendor = (
	id,
	purposes,
	legIntPurposes,
	flexiblePurposes,
	deletedDate
) => {
	const entry = {
		cookieMaxAgeSeconds: 0,
		features: [],
		flexiblePurposes,
		id,
		legIntPurposes,
		name: `V${id}`,
		policyUrl: 'https://v.example',
		purposes,
		specialFeatures: [],
		specialPurposes: [],
		usesCookies: false,
		usesNonCookieAccess: false,
	};
	if (deletedDate) {
		entry.deletedDate = deletedDate;
	}
	return entry;
};
const gvlData = {
	features: {},
	gvlSpecificationVersion: 3,
	lastUpdated: '2025-09-17T00:00:00Z',
	purposes: { 1: def(1), 2: def(2), 7: def(7) },
	specialFeatures: { 1: def(1) },
	specialPurposes: {},
	stacks: {},
	tcfPolicyVersion: 5,
	vendorListVersion: 42,
	vendors: {
		1: vendor(1, [1, 2], [], [2]),
		3: vendor(3, [2], [], [], '2025-01-01T00:00:00Z'),
		40: vendor(40, [1], [7], []),
		5: vendor(5, [2], [], [2]),
		8: vendor(8, [], [2, 7], [2]),
	},
};
const day = 86_400_000;
const now = Date.UTC(2026, 9, 28);
const make = async (opts) => {
	const gvl = new GVL(opts.gvl ?? gvlData);
	await gvl.readyPromise;
	const m = new TCModel(gvl);
	Object.assign(m, {
		cmpId: 53,
		cmpVersion: 7,
		consentScreen: 1,
		isServiceSpecific: true,
		publisherCountryCode: 'GB',
	});
	// TCF requires Created == LastUpdated, both the confirmation day, as
	// `packages/sdk/iab/src/tcf/tc-string.ts` writes. `createdDaysAgo` only tells
	// the native tests to save an earlier decision first; it never moves Created.
	m.lastUpdated = new Date(Math.floor(now / day) * day);
	m.created = m.lastUpdated;
	for (const k of [
		'purposeConsents',
		'purposeLegitimateInterests',
		'vendorConsents',
		'vendorLegitimateInterests',
	]) {
		for (const id of opts[k] ?? []) {
			m[k].set(id);
		}
	}
	for (const value of Object.values(opts.gvl?.vendors ?? gvlData.vendors)) {
		if (!value.deletedDate) {
			m.vendorsDisclosed.set(value.id);
		}
	}
	for (const r of opts.restrictions ?? []) {
		for (const id of r.vendorIds) {
			m.publisherRestrictions.add(
				id,
				new PurposeRestriction(r.purposeId, r.type)
			);
		}
	}
	return TCString.encode(m);
};
const largerGvl = {
	...gvlData,
	vendorListVersion: 318,
	vendors: {
		...gvlData.vendors,
		...Object.fromEntries(
			Array.from({ length: 128 }, (_, i) => {
				const id = 100 + i * 13;
				return [
					id,
					vendor(id, i % 2 ? [1, 2] : [1], i % 2 ? [7] : [2, 7], [2]),
				];
			})
		),
	},
};
const officialGvl = JSON.parse(
	readFileSync(
		new URL(
			'../../native-protocol/iab/official-gvl-excerpt.json',
			import.meta.url
		),
		'utf8'
	)
).gvl;
const cases = [
	{
		createdDaysAgo: 3,
		gvl: officialGvl,
		id: 'official-tcf24-gvl182',
		purposeConsents: [1, 2, 3, 4, 7, 8, 9, 10],
		purposeLegitimateInterests: [2, 7, 8, 9, 10],
		vendorConsents: [1, 9, 755],
		vendorLegitimateInterests: [9, 755],
	},
	{
		id: 'gap-range',
		restrictions: [{ purposeId: 2, type: 0, vendorIds: [1, 5] }],
	},
	{
		createdDaysAgo: 3,
		id: 'multi-day',
		purposeConsents: [1, 2],
		purposeLegitimateInterests: [7],
		vendorConsents: [1, 5, 40],
		vendorLegitimateInterests: [8, 40],
	},
	{
		createdDaysAgo: 365,
		gvl: largerGvl,
		id: 'larger-tcf24',
		purposeConsents: [1, 2],
		purposeLegitimateInterests: [2, 7],
		vendorConsents: [1, 5, 100, 113, 1751],
		vendorLegitimateInterests: [8, 40, 100, 113, 1751],
	},
	{
		id: 'prune',
		purposeConsents: [1, 2, 7],
		purposeLegitimateInterests: [2, 7],
		vendorConsents: [1, 5, 8, 40],
		vendorLegitimateInterests: [1, 5, 8, 40],
	},
];
const output = {
	cases: await Promise.all(
		cases.map(async (c) => ({ ...c, tcString: await make(c) }))
	),
	gvl: gvlData,
	now,
	oracle: '@iabtechlabtcf/core@1.5.22',
};
writeFileSync(
	process.argv[2] ??
		new URL('../../native-protocol/iab/authority-oracle.json', import.meta.url),
	`${JSON.stringify(output, null, '\t')}\n`
);
