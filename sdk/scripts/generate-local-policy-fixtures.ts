/**
 * Writes `native/protocol/local-policy/parity.json`: author policy rules in the
 * backend's `PolicyRule` vocabulary, the canonical rule `normalizePolicyRule`
 * makes from each, and the rule `resolvePolicyRules` picks for each location.
 *
 * The Swift and Kotlin in-code policies normalize and match the same rules
 * natively in no-backend mode, and their tests read this file. Fingerprints are
 * left out: in no-backend mode they never leave the device, so the native
 * cores hash locally instead of porting the backend's canonical encoding.
 *
 * Usage: `bun scripts/generate-local-policy-fixtures.ts [output-dir]`
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolvePolicyRules } from '../packages/schema/src/shared/policy-resolution';
import { normalizePolicyRule } from '../packages/schema/src/shared/policy-rule';
import type { PolicyRule } from '../packages/schema/src/shared/policy-rule';

const rules: PolicyRule[] = [
	{
		actions: ['accept', 'reject'],
		categories: ['measurement', 'marketing'],
		id: 'quebec',
		match: { regions: [{ country: 'CA', region: 'QC' }] },
		model: 'opt-in',
		prompt: 'choice',
		scopeMode: 'strict',
	},
	{
		id: 'germany',
		match: { countries: ['DE'] },
		model: 'opt-in',
		prompt: 'choice',
	},
	{
		id: 'california',
		match: { regions: [{ country: 'US', region: 'CA' }] },
		model: 'opt-out',
		privacySignals: { gpc: { denyCategories: ['marketing'] } },
		prompt: 'notice',
		validity: { noticeDays: 30 },
	},
	{
		id: 'united_states',
		match: { countries: ['US'] },
		model: 'none',
		prompt: 'none',
	},
	{
		categories: ['functionality', 'measurement'],
		id: 'canada',
		match: { regionFallbacks: ['CA'] },
		model: 'opt-in',
		preselectedCategories: ['functionality'],
		prompt: 'choice',
		scopeMode: 'strict',
		validity: { choiceDays: 180 },
	},
	{
		copyRevision: '2026-11',
		id: 'everywhere_else',
		match: { fallback: true, isDefault: true },
		model: 'opt-in',
		prompt: 'choice',
	},
];

const locations: [string | null, string | null][] = [
	[null, null],
	['DE', null],
	['de', null],
	['CA', 'QC'],
	['CA', 'CA-QC'],
	['CA', null],
	['CA', 'ON'],
	['US', 'CA'],
	['US', 'NY'],
	['US', null],
	['FR', null],
];

const fixture = {
	cases: locations.map(([country, region]) => {
		const resolution = resolvePolicyRules({
			countryCode: country,
			regionCode: region,
			rules,
		});
		if (resolution.status !== 'matched') {
			throw new Error(`No rule for ${country ?? '-'} ${region ?? '-'}`);
		}
		return {
			expected: {
				matchedBy: resolution.matchedBy,
				policyId: resolution.policy.id,
			},
			inputs: { country, region },
		};
	}),
	resolved: Object.fromEntries(
		rules.map((rule) => [rule.id, normalizePolicyRule(rule)])
	),
	rules,
};

const output =
	process.argv[2] ??
	fileURLToPath(new URL('../native/protocol/local-policy', import.meta.url));
mkdirSync(output, { recursive: true });
writeFileSync(
	join(output, 'parity.json'),
	`${JSON.stringify(fixture, null, '\t')}\n`
);
