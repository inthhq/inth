/**
 * The ATT sequence reads IAB TCF consent through the web's category derivation,
 * not a second one. `packages/native-protocol/att/iab-marketing.json` holds the shared
 * cases; this runs their purpose half against `iabPurposesToInthConsents`, and
 * `IABMarketingFixtureTests` in `packages/swift/Tests/InthAppleTests` runs all
 * of them against Swift.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vite-plus/test';

import { iabPurposesToInthConsents } from '../packages/sdk/iab/src/tcf/purpose-mapping.model';

const root = fileURLToPath(new URL('..', import.meta.url));

interface FixtureCase {
	readonly name: string;
	readonly purposeConsents: readonly number[];
	readonly vendors: Readonly<Record<string, readonly number[]>>;
	readonly vendorConsents: readonly number[];
	readonly adTechProvidersListed: boolean;
	readonly adTechProviderConsents: readonly number[];
	readonly customVendors: Readonly<Record<string, readonly number[]>>;
	readonly customVendorConsents: readonly string[];
	readonly expected: {
		readonly purposes: boolean;
		readonly marketing: boolean;
	};
}

const fixture = JSON.parse(
	readFileSync(
		join(root, 'packages/native-protocol/att/iab-marketing.json'),
		'utf8'
	)
) as { readonly cases: readonly FixtureCase[] };

/**
 * The web's consent basis: registered and custom vendor purposes, plus 1, 3
 * and 4 for ad tech providers.
 */
const basisOf = (fixtureCase: FixtureCase): Set<number> =>
	new Set([
		...Object.values(fixtureCase.vendors).flat(),
		...Object.values(fixtureCase.customVendors).flat(),
		...(fixtureCase.adTechProvidersListed ? [1, 3, 4] : []),
	]);

describe('ATT IAB marketing fixture: the purpose half is the web derivation', () => {
	test.each(
		fixture.cases.map((fixtureCase) => [fixtureCase.name, fixtureCase] as const)
	)('%s', (_name, fixtureCase) => {
		const purposeConsents = Object.fromEntries(
			fixtureCase.purposeConsents.map((id) => [id, true])
		);
		expect(
			iabPurposesToInthConsents(purposeConsents, basisOf(fixtureCase)).marketing
		).toBe(fixtureCase.expected.purposes);
	});

	test('the fixture covers the cases the gate depends on', () => {
		const names = fixture.cases.map((fixtureCase) => fixtureCase.name);
		expect(names).toContain(
			'purposes 1 to 4 consented but every vendor refused'
		);
		expect(
			fixture.cases.some((c) => c.expected.purposes && !c.expected.marketing)
		).toBe(true);
		expect(fixture.cases.some((c) => c.expected.marketing)).toBe(true);
		// A custom vendor can be the one who could track, and refusing it is a refusal.
		expect(names).toContain(
			'the only consented marketing vendor is a custom one'
		);
		expect(names).toContain(
			'the only marketing vendor is a custom one and it is refused'
		);
	});
});
