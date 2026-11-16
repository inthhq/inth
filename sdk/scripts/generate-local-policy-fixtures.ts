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
import { writePolicyResolutionWire } from '../packages/schema/src/shared/policy-resolution-wire';
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

/**
 * Every field of `PolicyRule`, crossed with every kind of value it could hold.
 * The backend decides which of these it refuses; the rest must be accepted by
 * every validator too, so none is stricter than the backend.
 */
const CATEGORY_LIST_VALUES: unknown[] = [
	null,
	'measurement',
	7,
	{},
	[7],
	[null],
	[''],
	['ads'],
	['Measurement'],
	['*'],
	['necessary'],
	[],
	['measurement', 'measurement'],
	[' measurement '],
	['measurement', '*'],
	['*', 'ads'],
	['*', null],
	['*', ''],
];
const COUNTRY_LIST_VALUES: unknown[] = [
	null,
	'DE',
	7,
	{},
	[7],
	[null],
	[''],
	[' '],
	[],
	['de'],
	['DE', 'DE'],
];
const FLAG_VALUES: unknown[] = [null, 'true', 1, {}, false];
const fieldMatrix: [string, unknown[]][] = [
	['id', [undefined, null, 7, '', '  ', ' x ', {}]],
	['match', [undefined, null, 'DE', 7, [], {}]],
	['match.countries', COUNTRY_LIST_VALUES],
	['match.regionFallbacks', COUNTRY_LIST_VALUES],
	[
		'match.regions',
		[
			null,
			'CA',
			{},
			[],
			[null],
			['CA'],
			[{}],
			[{ country: 'CA' }],
			[{ region: 'QC' }],
			[{ country: 'CA', region: '' }],
			[{ country: 7, region: 'QC' }],
			[{ country: 'CA', extra: 1, region: 'QC' }],
			[{ country: 'ca', region: 'qc' }],
		],
	],
	['match.fallback', FLAG_VALUES],
	['match.isDefault', FLAG_VALUES],
	['match.continent', ['EU']],
	['model', [undefined, null, 7, '', 'OPT-IN', 'implied', 'opt-out', 'none']],
	['prompt', [undefined, null, 7, '', 'Choice', 'banner', 'notice', 'none']],
	['categories', CATEGORY_LIST_VALUES],
	['scopeMode', [null, 7, '', 'loose', 'STRICT', 'strict', 'permissive']],
	['preselectedCategories', CATEGORY_LIST_VALUES],
	[
		'actions',
		[
			null,
			'accept',
			7,
			{},
			[],
			[7],
			[null],
			['maybe'],
			['accept'],
			['reject'],
			['accept', 'reject'],
			['accept', 'reject', 'reject'],
			['ACCEPT', 'reject'],
			['accept', 'reject', 'dismiss'],
		],
	],
	['validity', [null, 7, [], 'x', {}]],
	['validity.choiceDays', [null, '30', true, [], 0, -1, 1e300, 0.5, 30]],
	['validity.noticeDays', [null, '30', true, [], 0, -1, 1e300, 0.5, 30]],
	['validity.years', [1]],
	['privacySignals', [null, 7, [], {}, { dnt: {} }]],
	['privacySignals.gpc', [null, 7, [], {}, { allow: [] }]],
	['privacySignals.gpc.denyCategories', CATEGORY_LIST_VALUES],
	['copyRevision', [null, 7, true, {}, '', '  ', ' r2 ']],
	['review', [null, 'x', 7, {}, { status: 'bogus' }, { status: 'reviewed' }]],
];

const setPath = (
	target: Record<string, unknown>,
	path: string,
	value: unknown
) => {
	const keys = path.split('.');
	let node: Record<string, unknown> = target;
	for (const key of keys.slice(0, -1)) {
		if (
			typeof node[key] !== 'object' ||
			node[key] === null ||
			Array.isArray(node[key])
		) {
			node[key] = {};
		}
		node = node[key] as Record<string, unknown>;
	}
	const last = keys.at(-1) as string;
	if (value === undefined) {
		Reflect.deleteProperty(node, last);
	} else {
		node[last] = value;
	}
};

const matrixPacks: [string, unknown[]][] = fieldMatrix.flatMap(
	([path, values]) =>
		values.map((value): [string, unknown[]] => {
			const candidate: Record<string, unknown> = JSON.parse(
				JSON.stringify(rule({}))
			);
			setPath(candidate, path, value);
			return [
				`${path} = ${value === undefined ? 'missing' : JSON.stringify(value)}`,
				[fallback, candidate],
			];
		})
);

/** Rules that depend on two fields at once. */
const crossFieldMatrix: [string, unknown[]][] = [
	[
		'model none with preselectedCategories = []',
		[
			fallback,
			rule({ model: 'none', preselectedCategories: [], prompt: 'none' }),
		],
	],
	[
		'model none with preselectedCategories = ["necessary"]',
		[
			fallback,
			rule({
				model: 'none',
				preselectedCategories: ['necessary'],
				prompt: 'none',
			}),
		],
	],
	[
		'model none with actions = ["accept","reject"]',
		[
			fallback,
			rule({ actions: ['accept', 'reject'], model: 'none', prompt: 'none' }),
		],
	],
	[
		'notice prompt with actions = []',
		[fallback, rule({ actions: [], model: 'opt-out', prompt: 'notice' })],
	],
	[
		'strict scope with preselectedCategories inside it',
		[
			fallback,
			rule({
				categories: ['measurement'],
				preselectedCategories: ['measurement'],
				scopeMode: 'strict',
			}),
		],
	],
	[
		'strict scope with gpc.denyCategories inside it',
		[
			fallback,
			rule({
				categories: ['measurement'],
				privacySignals: { gpc: { denyCategories: ['measurement'] } },
				scopeMode: 'strict',
			}),
		],
	],
	[
		'wildcard scope with preselectedCategories = ["marketing"]',
		[
			fallback,
			rule({ categories: ['*'], preselectedCategories: ['marketing'] }),
		],
	],
	[
		'review with every field',
		[
			fallback,
			rule({
				review: {
					assumptions: ['a'],
					reviewBy: '2027-01-01',
					reviewedOn: '2026-01-01',
					sources: ['s'],
					status: 'reviewed',
				},
			}),
		],
	],
	[
		'review with a numeric reviewedOn',
		[fallback, rule({ review: { reviewedOn: 2026, status: 'pending' } })],
	],
	[
		'review with sources that are not strings',
		[fallback, rule({ review: { sources: [1], status: 'pending' } })],
	],
	[
		'review with an unknown field',
		[fallback, rule({ review: { status: 'pending', verdict: 'ok' } })],
	],
];

/** Pack shapes rather than field values. */
const packMatrix: [string, unknown][] = [
	['rules = a rule that is not an object', [fallback, 7]],
	['rules = a null rule', [fallback, null]],
	[
		'rules = the same id twice',
		[fallback, rule({}), rule({ match: { countries: ['FR'] } })],
	],
	[
		'rules = two isDefault rules',
		[fallback, rule({ match: { isDefault: true } })],
	],
	[
		'rules = two fallback rules',
		[fallback, rule({ match: { fallback: true } })],
	],
];

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

/**
 * Packs where a location can match nothing, so every matcher outcome the
 * backend has (`matched`, `no-match`, `insufficient-inputs`) is pinned. An
 * unmatched outcome carries the exact wire the backend sends for it.
 */
const outcomePacks: Record<string, PolicyRule[]> = {
	'fallback without a default': [
		{
			id: 'germany',
			match: { countries: ['DE'] },
			model: 'opt-in',
			prompt: 'choice',
		},
		{
			id: 'unknown',
			match: { fallback: true },
			model: 'opt-in',
			prompt: 'choice',
		},
	],
	'region rules and a default without a fallback': [
		{
			id: 'california',
			match: { regions: [{ country: 'US', region: 'CA' }] },
			model: 'opt-out',
			prompt: 'notice',
		},
		{
			id: 'default',
			match: { isDefault: true },
			model: 'none',
			prompt: 'none',
		},
	],
	'region rules and a fallback without a default': [
		{
			id: 'california',
			match: { regions: [{ country: 'US', region: 'CA' }] },
			model: 'opt-out',
			prompt: 'notice',
		},
		{
			id: 'unknown',
			match: { fallback: true },
			model: 'opt-in',
			prompt: 'choice',
		},
	],
};
const outcomeLocations: [string | null, string | null][] = [
	[null, null],
	['DE', null],
	['FR', null],
	['US', null],
	['US', 'CA'],
	['US', 'NY'],
];
const outcomes = Object.entries(outcomePacks).flatMap(([pack, packRules]) =>
	outcomeLocations.map(([country, region]) => {
		const resolution = resolvePolicyRules({
			countryCode: country,
			regionCode: region,
			rules: packRules,
		});
		return {
			expected:
				resolution.status === 'matched'
					? {
							matchedBy: resolution.matchedBy,
							policyId: resolution.policy.id,
							status: 'matched',
						}
					: {
							status: resolution.status,
							wire: writePolicyResolutionWire(resolution),
						},
			inputs: { country, region },
			pack,
			rules: packRules,
		};
	})
);

/**
 * What a core does as the location moves under one in-code policy. The resolution
 * fields come from the backend matcher; `policyPending` and `optionalAllowed` are the
 * core contract: a local answer is final, so a location the policy cannot answer
 * fails closed instead of keeping the last rule's grants, and the saved choice comes
 * back when the policy answers again.
 */
const transitionRules: PolicyRule[] = [
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
		prompt: 'notice',
	},
	{
		id: 'default',
		match: { isDefault: true },
		model: 'opt-in',
		prompt: 'choice',
	},
];
const transitionSteps: {
	country: string | null;
	optionalAllowed: boolean;
	policyPending: boolean;
	region: string | null;
	saveAll: boolean;
}[] = [
	{
		country: 'DE',
		optionalAllowed: true,
		policyPending: false,
		region: null,
		saveAll: true,
	},
	{
		country: 'US',
		optionalAllowed: false,
		policyPending: true,
		region: null,
		saveAll: false,
	},
	{
		country: 'DE',
		optionalAllowed: true,
		policyPending: false,
		region: null,
		saveAll: false,
	},
];
const transitions = [
	{
		name: 'a location the policy cannot answer fails closed and keeps the saved choice',
		rules: transitionRules,
		steps: transitionSteps.map((step) => {
			const resolution = resolvePolicyRules({
				countryCode: step.country,
				regionCode: step.region,
				rules: transitionRules,
			});
			return {
				expected: {
					optionalAllowed: step.optionalAllowed,
					policyId:
						resolution.status === 'matched' ? resolution.policy.id : null,
					policyPending: step.policyPending,
					reason: resolution.status === 'failed' ? resolution.reason : null,
					status: resolution.status,
				},
				inputs: { country: step.country, region: step.region },
				saveAll: step.saveAll,
			};
		}),
	},
];

/** Sort the matrix by the backend's own answer. */
const localNames = new Set(['model = "iab"']);
const classified = {
	accepted: [] as { name: string; rules: unknown[]; resolved: unknown }[],
	refused: [] as { name: string; rules: unknown }[],
};
for (const [name, pack] of [
	...matrixPacks,
	...crossFieldMatrix,
	...packMatrix,
]) {
	const candidates = JSON.parse(JSON.stringify(pack)) as unknown;
	if (localNames.has(name)) {
		continue;
	}
	if (inspectPolicyRules(candidates).errors.length > 0) {
		classified.refused.push({ name, rules: candidates });
	} else {
		const candidate = (candidates as PolicyRule[])[1] as PolicyRule;
		classified.accepted.push({
			name,
			resolved: normalizePolicyRule(candidate),
			rules: candidates as unknown[],
		});
	}
}

const fixture = {
	accepted: classified.accepted,
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
		...classified.refused,
		...Object.entries(localInvalid).map(([name, pack]) => ({
			local: true,
			name,
			rules: pack,
		})),
	],
	outcomes,
	resolved: Object.fromEntries(
		rules.map((each) => [each.id, normalizePolicyRule(each)])
	),
	rules,
	transitions,
};

const output =
	process.argv[2] ??
	fileURLToPath(new URL('../native/protocol/local-policy', import.meta.url));
mkdirSync(output, { recursive: true });
writeFileSync(
	join(output, 'parity.json'),
	`${JSON.stringify(fixture, null, '\t')}\n`
);
