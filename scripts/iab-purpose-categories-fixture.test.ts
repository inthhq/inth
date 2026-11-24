/**
 * Native derives Inth categories from an IAB TCF decision with the web's
 * function, not a second one. `packages/native-protocol/iab/purpose-categories.json`
 * holds the shared cases, custom (non-IAB) vendors included; this runs them
 * against `iabPurposesToInthConsents`. `IABPurposeCategoriesTests` in
 * `packages/swift/Tests/InthCoreTests` and `IabPurposeCategoriesTest` in
 * `packages/android/inth-core` run the same cases against Swift and Kotlin.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vite-plus/test';

import { iabPurposesToInthConsents } from '../packages/sdk/iab/src/tcf/purpose-mapping';

const root = fileURLToPath(new URL('..', import.meta.url));

interface FixtureCase {
	readonly name: string;
	readonly purposeConsents: readonly number[];
	readonly vendors: Readonly<Record<string, readonly number[]>>;
	readonly customVendors: Readonly<Record<string, readonly number[]>>;
	readonly adTechProvidersListed: boolean;
	readonly expected: Readonly<Record<string, boolean>>;
}

const fixture = JSON.parse(
	readFileSync(
		join(root, 'packages/native-protocol/iab/purpose-categories.json'),
		'utf8'
	)
) as { readonly cases: readonly FixtureCase[] };

/**
 * `consentBasisPurposes` in `packages/sdk/iab/src/index.ts`: registered vendors'
 * consent purposes, custom vendors' purposes, and 1, 3 and 4 when ad tech
 * providers are listed.
 */
const basisOf = (fixtureCase: FixtureCase): Set<number> =>
	new Set([
		...Object.values(fixtureCase.vendors).flat(),
		...Object.values(fixtureCase.customVendors).flat(),
		...(fixtureCase.adTechProvidersListed ? [1, 3, 4] : []),
	]);

describe('IAB purpose categories fixture: native derives what the web does', () => {
	test.each(
		fixture.cases.map((fixtureCase) => [fixtureCase.name, fixtureCase] as const)
	)('%s', (_name, fixtureCase) => {
		const purposeConsents = Object.fromEntries(
			fixtureCase.purposeConsents.map((id) => [id, true])
		);
		const { necessary, ...categories } = iabPurposesToInthConsents(
			purposeConsents,
			basisOf(fixtureCase)
		);
		expect(necessary).toBe(true);
		expect(categories).toEqual(fixtureCase.expected);
	});

	test('a custom vendor changes the answer in at least one case', () => {
		expect(
			fixture.cases.some((fixtureCase) => {
				const purposeConsents = Object.fromEntries(
					fixtureCase.purposeConsents.map((id) => [id, true])
				);
				const without = iabPurposesToInthConsents(
					purposeConsents,
					basisOf({ ...fixtureCase, customVendors: {} })
				);
				const { necessary: _necessary, ...categories } = without;
				return (
					JSON.stringify(categories) !== JSON.stringify(fixtureCase.expected)
				);
			})
		).toBe(true);
	});
});
