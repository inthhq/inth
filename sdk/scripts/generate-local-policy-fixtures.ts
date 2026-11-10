/**
 * Writes `native/protocol/local-policy/parity.json`: author policy rules in the
 * backend's `PolicyRule` vocabulary, the canonical rule `normalizePolicyRule`
 * makes from each, and the rule `resolvePolicyRules` picks for each location.
 *
 * The Swift and Kotlin in-code policies normalize and match the same rules
 * natively in no-backend mode, and their tests read this file. Fingerprint
 * hashes are left out: in no-backend mode they never leave the device, so the
 * native cores hash locally. The fingerprint inputs are included, so each
 * prompt is re-asked for exactly the changes the backend re-asks for.
 *
 * `invalid` lists policies every validator must refuse: the Expo prebuild check
 * and both native cores. Each one the backend can express is checked against
 * `inspectPolicyRules` here, so no validator is stricter than the backend.
 * `local` marks the few the backend accepts but no-backend mode cannot run.
 *
 * Usage: `bun scripts/generate-local-policy-fixtures.ts [output-dir]`
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolvePolicyRules } from '../packages/schema/src/shared/policy-resolution';
import {
	inspectPolicyRules,
	normalizePolicyRule,
} from '../packages/schema/src/shared/policy-rule';
import type { PolicyRule } from '../packages/schema/src/shared/policy-rule';
import {
	choicePromptFingerprintInput,
	noticePromptFingerprintInput,
	policyFingerprintInput,
} from '../packages/schema/src/shared/policy-rule-fingerprint';

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
		actions: ['customize', 'accept', 'reject'],
		categories: ['necessary', ' measurement ', 'marketing'],
		copyRevision: ' r1 ',
		id: 'japan',
		match: { countries: ['JP'], fallback: false },
		model: 'opt-in',
		preselectedCategories: ['necessary', 'measurement'],
		privacySignals: {},
		prompt: 'choice',
		review: { status: 'pending' },
		scopeMode: 'strict',
		validity: { choiceDays: 0.5, noticeDays: 1.25 },
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
	['JP', null],
];

const fallback = {
	id: 'fallback',
	match: { fallback: true, isDefault: true },
	model: 'opt-in',
	prompt: 'choice',
};
const rule = (extra: Record<string, unknown>) => ({
	id: 'x',
	match: { countries: ['DE'] },
	model: 'opt-in',
	prompt: 'choice',
	...extra,
});
const withFallback = (extra: Record<string, unknown>) => [
	fallback,
	rule(extra),
];

/** Policies the backend refuses. Every validator refuses them too. */
const backendInvalid: Record<string, unknown[]> = {
	'actions-not-a-list': withFallback({ actions: 'accept' }),
	'actions-on-notice-prompt': withFallback({
		actions: ['accept', 'reject'],
		model: 'opt-out',
		prompt: 'notice',
	}),
	'actions-without-reject': withFallback({ actions: ['accept'] }),
	'blank-id': withFallback({ id: '  ' }),
	'categories-not-a-list': withFallback({ categories: '*' }),
	'days-not-a-number': withFallback({ validity: { choiceDays: '30' } }),
	'days-too-large': withFallback({ validity: { noticeDays: 1e300 } }),
	'duplicate-ids': [fallback, rule({}), rule({ match: { countries: ['FR'] } })],
	'empty-countries': withFallback({ match: { countries: [] } }),
	'empty-match': withFallback({ match: {} }),
	'gpc-denies-necessary': withFallback({
		privacySignals: { gpc: { denyCategories: ['necessary'] } },
	}),
	'gpc-outside-scope': withFallback({
		categories: ['measurement'],
		privacySignals: { gpc: { denyCategories: ['marketing'] } },
		scopeMode: 'strict',
	}),
	'missing-match': withFallback({ match: undefined }),
	'non-string-copy-revision': withFallback({ copyRevision: 7 }),
	'non-string-country': withFallback({ match: { countries: [49] } }),
	'none-model-preselects': withFallback({
		model: 'none',
		preselectedCategories: ['measurement'],
		prompt: 'none',
	}),
	'null-copy-revision': withFallback({ copyRevision: null }),
	'opt-in-notice-prompt': withFallback({ prompt: 'notice' }),
	'partial-scope-without-scope-mode': withFallback({
		categories: ['measurement'],
	}),
	'preselected-outside-scope': withFallback({
		categories: ['measurement'],
		preselectedCategories: ['marketing'],
		scopeMode: 'strict',
	}),
	'region-without-code': withFallback({
		match: { regions: [{ country: 'CA' }] },
	}),
	'two-defaults': [fallback, rule({ match: { isDefault: true } })],
	'two-fallbacks': [fallback, rule({ match: { fallback: true } })],
	'unknown-action': withFallback({ actions: ['accept', 'reject', 'maybe'] }),
	'unknown-category': withFallback({ categories: ['ads'] }),
	'unknown-gpc-field': withFallback({
		privacySignals: { gpc: { allow: [], denyCategories: [] } },
	}),
	'unknown-match-field': withFallback({
		match: { continent: 'EU', countries: ['DE'] },
	}),
	'unknown-model': withFallback({ model: 'implied' }),
	'unknown-privacy-signal': withFallback({ privacySignals: { dnt: {} } }),
	'unknown-scope-mode': withFallback({ scopeMode: 'loose' }),
	'unknown-validity-field': withFallback({ validity: { years: 1 } }),
	'zero-days': withFallback({ validity: { choiceDays: 0 } }),
};

/** Policies the backend accepts but no-backend mode cannot run. */
const localInvalid: Record<string, unknown[]> = {
	// IAB TCF needs a backend to serve the Global Vendor List.
	'iab-model': withFallback({ model: 'iab' }),
	// Without a backend the device has no location, so an unknown one needs a rule.
	'no-rule-for-unknown-location': [rule({})],
	// Records never reach a backend, so rights, proof, i18n and legacyMaterial have no use.
	'unsupported-field': withFallback({ rights: ['opt-out'] }),
	// Shorter than a millisecond: no device can keep a zero-length validity.
	'validity-under-a-millisecond': withFallback({
		validity: { choiceDays: 1e-12 },
	}),
};

for (const [name, pack] of Object.entries(backendInvalid)) {
	if (inspectPolicyRules(pack).errors.length === 0) {
		throw new Error(
			`The backend accepts the "${name}" policy; it is not invalid.`
		);
	}
}
for (const [name, pack] of Object.entries(localInvalid)) {
	if (inspectPolicyRules(pack).errors.length > 0) {
		throw new Error(
			`The backend refuses the "${name}" policy; move it to backendInvalid.`
		);
	}
}

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
	fingerprintInputs: Object.fromEntries(
		rules.map((each) => {
			const normalized = normalizePolicyRule(each);
			return [
				each.id,
				{
					choice: choicePromptFingerprintInput(normalized),
					notice: noticePromptFingerprintInput(normalized),
					policy: policyFingerprintInput(normalized),
				},
			];
		})
	),
	invalid: [
		...Object.entries(backendInvalid).map(([name, pack]) => ({
			name,
			rules: JSON.parse(JSON.stringify(pack)),
		})),
		...Object.entries(localInvalid).map(([name, pack]) => ({
			local: true,
			name,
			rules: pack,
		})),
	],
	resolved: Object.fromEntries(
		rules.map((each) => [each.id, normalizePolicyRule(each)])
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
