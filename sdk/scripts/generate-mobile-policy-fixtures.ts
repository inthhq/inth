import { writeFile, mkdir } from 'node:fs/promises';

import {
	buildConsentManifestFromConfig,
	policyRulePresets,
	resolvePolicyResolutionFromManifest,
	writePolicyResolutionWire,
	resolveInitFromManifest,
} from '../packages/schema/dist/index.js';
import { enTranslations } from '../packages/translations/dist/index.js';
import { exportMobilePolicy } from './export-mobile-policy';

const now = Date.parse('2026-10-29T00:00:00Z');
const endpoint = 'https://mobile-fixture.example.test';
const fallback = {
	...policyRulePresets.europeOptIn(),
	id: 'offline_default',
	match: { fallback: true, isDefault: true },
	scopeMode: 'strict' as const,
};
const manifest = await buildConsentManifestFromConfig({
	customTranslations: { fr: { common: { acceptAll: 'Accepter' } } },
	policyRules: [
		{
			...fallback,
			id: 'quebec',
			match: { regions: [{ country: 'CA', region: 'QC' }] },
		},
		{ ...fallback, id: 'germany', match: { countries: ['DE'] } },
		{
			...fallback,
			id: 'canada_missing_region',
			match: { regionFallbacks: ['CA'] },
		},
		{
			...policyRulePresets.worldOptOutNoPrompt(),
			id: 'us_permissive',
			match: { countries: ['US'] },
		},
		fallback,
	],
});
const fetcher: typeof fetch = () =>
	Promise.resolve(new Response(JSON.stringify(manifest)));
const resource = JSON.parse(
	await exportMobilePolicy({
		endpoint,
		expiresAt: now + 604800000,
		fetch: fetcher,
		languages: ['en', 'fr'],
		now,
	})
);
const cases = [
	{ country: null, language: 'fr-CA', region: null },
	{ country: 'ca', language: 'zz', region: 'CA-QC' },
	{ country: 'de', language: 'en', region: null },
	{ country: 'CA', language: 'fr', region: null },
	{ country: 'US', language: 'en', region: 'CA' },
].map((inputs) => ({
	expected: writePolicyResolutionWire(
		resolvePolicyResolutionFromManifest(manifest, {
			countryCode: inputs.country,
			regionCode: inputs.region,
		})
	),
	expectedLanguage: resolveInitFromManifest(manifest, inputs, {
		baseTranslations: { en: enTranslations },
	}).translations.language,
	inputs,
}));
await mkdir('native/protocol/bundled-policy', { recursive: true });
await writeFile(
	'native/protocol/bundled-policy/parity.json',
	`${JSON.stringify({ cases, endpoint, now, resource }, null, 2)}\n`
);

// Disclosure fixtures use authored source dates. Native launch must retain these dates.
const { readFile } = await import('node:fs/promises');
const source = JSON.parse(
	await readFile('native/protocol/iab/additional-consent-cases.json', 'utf8')
);
const gvl = { ...source.gvl, lastUpdated: new Date(now - 1000).toISOString() };
const iabManifest = await buildConsentManifestFromConfig({
	iab: {
		additionalConsent: {
			endpoint: 'https://lists.example.test/atp',
			providers: [1, 2],
		},
		customVendors: [
			{
				id: 'internal-ads',
				legIntPurposes: [],
				name: 'Internal ads',
				privacyPolicyUrl: 'https://example.com/ads-privacy',
				purposes: [1],
			},
		],
		enabled: true,
		endpoint: 'https://lists.example.test/gvl',
	},
	policyRules: [policyRulePresets.europeIab()],
});
const iabResource = JSON.parse(
	await exportMobilePolicy({
		endpoint,
		expiresAt: now + 604800000,
		fetch: (url) => {
			if (String(url).endsWith('/manifest')) {
				return Promise.resolve(new Response(JSON.stringify(iabManifest)));
			}
			return Promise.resolve(
				String(url).includes('/gvl')
					? new Response(JSON.stringify(gvl))
					: new Response(JSON.stringify({ providers: source.providers }), {
							headers: { 'last-modified': new Date(now - 2000).toUTCString() },
						})
			);
		},
		now,
		vendors: [1],
	})
);
await writeFile(
	'native/protocol/bundled-policy/iab.json',
	`${JSON.stringify(
		{
			configuration: source.configuration,
			endpoint,
			now,
			resource: iabResource,
		},
		null,
		2
	)}\n`
);
