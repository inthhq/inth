/**
 * Writes `packages/native-protocol/iab/banner-summary-*.json`: the web's first-layer IAB
 * summary, computed by the real `resolveIABBannerSummary`, for the Swift and
 * Kotlin cores to match.
 *
 * Each fixture holds the served list, the publisher's vendor scope, and the
 * counts of ad tech providers and custom vendors. Native narrows the list to
 * the scope and leaves deleted vendors out before it summarizes, so this
 * script does the same before it calls the web function.
 *
 * The fixtures live under `packages/native-protocol/iab/` rather than the top level,
 * because every top-level fixture must be listed in `packages/native-protocol/index.json`.
 *
 * Usage: `bun scripts/generate-iab-banner-summary-fixtures.ts [output-dir]`
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { resolveIABBannerSummary as ResolveIABBannerSummary } from '../packages/sdk/core/src/libs/iab-banner-summary';
import { sdkSource } from './sdk-sources';

// `packages/sdk/core` maps workspace imports to type declarations through its
// tsconfig paths, so Bun cannot run the source as is. Bundle the one module
// with those imports pointed at their sources, then load the bundle.
const source = (path: string) =>
	fileURLToPath(new URL(`../packages/sdk/${path}`, import.meta.url));
const bundle = await Bun.build({
	entrypoints: [source('core/src/libs/iab-banner-summary.ts')],
	format: 'esm',
	plugins: [
		{
			name: 'workspace-sources',
			setup(build) {
				build.onResolve({ filter: /^@inth\/sdk-/u }, (args) => {
					const path = sdkSource(args.path);
					return path ? { path } : undefined;
				});
			},
		},
	],
	target: 'bun',
});
const [output] = bundle.outputs;
if (!bundle.success || !output) {
	throw new AggregateError(bundle.logs, 'Could not bundle the banner summary');
}
const { resolveIABBannerSummary } = (await import(
	URL.createObjectURL(
		new Blob([await output.text()], { type: 'text/javascript' })
	)
)) as { resolveIABBannerSummary: typeof ResolveIABBannerSummary };

interface Definition {
	id: number;
	name: string;
	description: string;
}
type Stack = Definition & { purposes: number[]; specialFeatures: number[] };
interface Vendor {
	id: number;
	name: string;
	purposes: number[];
	legIntPurposes: number[];
	specialFeatures: number[];
	deletedDate?: string;
	[key: string]: unknown;
}
interface Gvl {
	purposes: Record<string, Definition>;
	specialFeatures: Record<string, Definition>;
	stacks: Record<string, Stack>;
	vendors: Record<string, Vendor>;
	[key: string]: unknown;
}

const official = JSON.parse(
	readFileSync(
		new URL(
			'../packages/native-protocol/iab/official-gvl-excerpt.json',
			import.meta.url
		),
		'utf8'
	)
).gvl as Gvl;

const vendor = (
	id: number,
	{
		purposes = [] as number[],
		legIntPurposes = [] as number[],
		specialFeatures = [] as number[],
		deletedDate = undefined as string | undefined,
	} = {}
): Vendor => {
	const entry: Vendor = {
		cookieMaxAgeSeconds: 0,
		features: [],
		flexiblePurposes: [],
		id,
		legIntPurposes,
		name: `Vendor ${id}`,
		policyUrl: 'https://vendor.example/privacy',
		purposes,
		specialFeatures,
		specialPurposes: [],
		usesCookies: false,
		usesNonCookieAccess: false,
	};
	if (deletedDate) {
		entry.deletedDate = deletedDate;
	}
	return entry;
};

const stack = (
	id: number,
	purposes: number[],
	specialFeatures: number[] = []
): Stack => ({
	description: `Stack ${id}`,
	id,
	name: `Stack ${id}`,
	purposes,
	specialFeatures,
});

/** A list with the official definitions and stacks, and the given vendors. */
const listWith = (
	vendors: Vendor[],
	stacks: Record<string, Stack> = official.stacks
): Gvl => ({
	features: {},
	gvlSpecificationVersion: 3,
	lastUpdated: '2026-10-22T16:00:18Z',
	purposes: official.purposes,
	specialFeatures: official.specialFeatures,
	specialPurposes: {},
	stacks,
	tcfPolicyVersion: 5,
	vendorListVersion: 182,
	vendors: Object.fromEntries(vendors.map((entry) => [entry.id, entry])),
});

interface Case {
	id: string;
	description: string;
	gvl: Gvl;
	vendorIds: number[] | null;
	adTechProviderCount: number;
	customVendorCount: number;
}

const cases: Case[] = [
	{
		adTechProviderCount: 0,
		customVendorCount: 0,
		description:
			'The official GVL 182 excerpt, with its real stacks. Two of its vendors are deleted.',
		gvl: official,
		id: 'official-excerpt',
		vendorIds: null,
	},
	{
		adTechProviderCount: 0,
		customVendorCount: 0,
		description:
			'Overlapping stacks: the widest is chosen first, a stack left with one new purpose is skipped, and of two equal stacks the lower id wins.',
		gvl: listWith(
			[
				vendor(1, { purposes: [1, 2, 3, 4, 5] }),
				vendor(2, { legIntPurposes: [6, 7, 8, 9] }),
			],
			{
				10: stack(10, [2, 3, 4]),
				11: stack(11, [3, 4, 5, 6]),
				12: stack(12, [2, 7]),
				13: stack(13, [8, 9]),
				14: stack(14, [9, 8]),
				15: stack(15, [10, 11]),
			}
		),
		id: 'overlapping-stacks',
		vendorIds: null,
	},
	{
		adTechProviderCount: 0,
		customVendorCount: 0,
		description:
			'Every vendor declares purpose 1 only, so no stack covers two declared purposes.',
		gvl: listWith([vendor(1, { purposes: [1] }), vendor(2, { purposes: [1] })]),
		id: 'purpose-one-only',
		vendorIds: null,
	},
	{
		adTechProviderCount: 0,
		customVendorCount: 0,
		description:
			'No stacks and nine declared items, so five are listed and four are counted.',
		gvl: listWith(
			[
				vendor(1, { purposes: [1, 2, 5], specialFeatures: [1] }),
				vendor(2, {
					legIntPurposes: [7, 8, 10, 11],
					specialFeatures: [2],
				}),
			],
			{}
		),
		id: 'more-than-five',
		vendorIds: null,
	},
	{
		adTechProviderCount: 3,
		customVendorCount: 0,
		description:
			'Vendors declare purposes 2 and 7 only. Listed ad tech providers add purposes 1, 3 and 4 and count as vendors.',
		gvl: listWith([
			vendor(1, { purposes: [2] }),
			vendor(2, { legIntPurposes: [7] }),
		]),
		id: 'ad-tech-providers',
		vendorIds: null,
	},
	{
		adTechProviderCount: 0,
		customVendorCount: 2,
		description: 'Two custom, non-IAB vendors count as vendors.',
		gvl: listWith([
			vendor(1, { purposes: [1, 2, 3, 4] }),
			vendor(2, { purposes: [7], specialFeatures: [1] }),
		]),
		id: 'custom-vendors',
		vendorIds: null,
	},
	{
		adTechProviderCount: 0,
		customVendorCount: 0,
		description:
			'The scope drops vendor 4, and vendor 2 is deleted. Purposes and special features only they declare are not listed.',
		gvl: listWith([
			vendor(1, { purposes: [1, 2] }),
			vendor(2, {
				deletedDate: '2025-01-01T00:00:00Z',
				purposes: [5, 6],
				specialFeatures: [1],
			}),
			vendor(3, { legIntPurposes: [7], specialFeatures: [2] }),
			vendor(4, { purposes: [9, 10] }),
		]),
		id: 'scope-and-deleted',
		vendorIds: [1, 2, 3],
	},
];

/** What native summarizes: the scoped list without deleted vendors. */
const narrowed = (gvl: Gvl, vendorIds: number[] | null): Gvl => ({
	...gvl,
	vendors: Object.fromEntries(
		Object.entries(gvl.vendors).filter(
			([key, entry]) =>
				(!vendorIds?.length || vendorIds.includes(Number(key))) &&
				!entry.deletedDate
		)
	),
});

const placeholders = (count: number, prefix: string) =>
	Array.from({ length: count }, (_, index) => ({
		id: `${prefix}-${index + 1}`,
		name: `${prefix} ${index + 1}`,
	}));

/**
 * Declared purpose and special-feature ids, read off the web function: with no
 * stacks and no cap it lists exactly the declared purposes, then the declared
 * special features.
 */
const declaredIds = (gvl: Gvl, adTechProviders: unknown[]) => {
	const { displayItems } = resolveIABBannerSummary(
		{ adTechProviders, gvl: { ...gvl, stacks: {} } } as never,
		{ maxItems: Number.MAX_SAFE_INTEGER }
	);
	const purposeByName = new Map(
		Object.values(gvl.purposes).map((entry) => [entry.name, entry.id])
	);
	const featureByName = new Map(
		Object.values(gvl.specialFeatures).map((entry) => [entry.name, entry.id])
	);
	const purposeIds: number[] = [];
	const specialFeatureIds: number[] = [];
	for (const name of displayItems) {
		const purpose = purposeByName.get(name);
		const feature = featureByName.get(name);
		if (purpose === undefined || specialFeatureIds.length > 0) {
			if (feature === undefined) {
				throw new Error(`"${name}" names no purpose or special feature`);
			}
			specialFeatureIds.push(feature);
		} else {
			purposeIds.push(purpose);
		}
	}
	return {
		declaredPurposeIds: purposeIds.sort((a, b) => a - b),
		declaredSpecialFeatureIds: specialFeatureIds,
	};
};

const outputDirectory =
	process.argv[2] ??
	fileURLToPath(new URL('../packages/native-protocol/iab', import.meta.url));
mkdirSync(outputDirectory, { recursive: true });

for (const entry of cases) {
	const gvl = narrowed(entry.gvl, entry.vendorIds);
	const adTechProviders = placeholders(entry.adTechProviderCount, 'Provider');
	const summary = resolveIABBannerSummary({
		adTechProviders,
		customVendors: placeholders(entry.customVendorCount, 'Custom'),
		gvl,
	} as never);
	const fixture = {
		description: entry.description,
		expected: {
			...declaredIds(gvl, adTechProviders),
			displayItems: summary.displayItems,
			remainingCount: summary.remainingCount,
			vendorCount: summary.vendorCount,
		},
		generatedBy: 'bun scripts/generate-iab-banner-summary-fixtures.ts',
		id: entry.id,
		input: {
			adTechProviderCount: entry.adTechProviderCount,
			customVendorCount: entry.customVendorCount,
			gvl: entry.gvl,
			vendorIds: entry.vendorIds,
		},
		oracle: 'packages/sdk/core/src/libs/iab-banner-summary.ts',
	};
	writeFileSync(
		join(outputDirectory, `banner-summary-${entry.id}.json`),
		`${JSON.stringify(fixture, null, '\t')}\n`
	);
}
