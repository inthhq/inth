/**
 * Writes `packages/native-protocol/bundled-policy/parity.json` and `iab.json`:
 * bundled policy resources from the real exporter, and what the web resolves
 * for them, for the native cores to match.
 *
 * Usage: `bun scripts/generate-mobile-policy-fixtures.ts [--check]`. With
 * `--check` it writes nothing and fails when a committed fixture differs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import {
	buildConsentManifestFromConfig,
	policyRulePresets,
	resolvePolicyResolutionFromManifest,
	writePolicyResolutionWire,
	resolveInitFromManifest,
} from '../packages/sdk/schema/src/index.ts';
import { enTranslations } from '../packages/sdk/translations/src/index.ts';
import { exportMobilePolicy } from './export-mobile-policy';

const ROOT = join(import.meta.dirname, '..');
const FIXTURE_DIR = 'packages/native-protocol/bundled-policy';

const now = Date.parse('2026-10-29T00:00:00Z');
const endpoint = 'https://mobile-fixture.example.test';
/** The fixture files by name, as the generator writes them. */
export const mobilePolicyFixtures =
	async function mobilePolicyFixtures(): Promise<Record<string, string>> {
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

		// Disclosure fixtures use authored source dates. Native launch must retain these dates.
		const source = JSON.parse(
			readFileSync(
				join(
					ROOT,
					'packages/native-protocol/iab/additional-consent-cases.json'
				),
				'utf8'
			)
		);
		const gvl = {
			...source.gvl,
			lastUpdated: new Date(now - 1000).toISOString(),
		};
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
									headers: {
										'last-modified': new Date(now - 2000).toUTCString(),
									},
								})
					);
				},
				now,
				vendors: [1],
			})
		);
		return {
			'iab.json': `${JSON.stringify(
				{
					configuration: source.configuration,
					endpoint,
					now,
					resource: iabResource,
				},
				null,
				2
			)}\n`,
			'parity.json': `${JSON.stringify({ cases, endpoint, now, resource }, null, 2)}\n`,
		};
	};

/**
 * Fixture names whose committed data differs from what the generator writes.
 * The repository formatter rewrites the committed JSON, so this compares
 * values, not text.
 */
export const staleMobilePolicyFixtures =
	async function staleMobilePolicyFixtures(): Promise<string[]> {
		const fixtures = await mobilePolicyFixtures();
		return Object.keys(fixtures).filter(
			(name) =>
				!isDeepStrictEqual(
					JSON.parse(readFileSync(join(ROOT, FIXTURE_DIR, name), 'utf8')),
					JSON.parse(fixtures[name] as string)
				)
		);
	};

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	if (process.argv.includes('--check')) {
		const stale = await staleMobilePolicyFixtures();
		if (stale.length > 0) {
			console.error(
				`${FIXTURE_DIR}: ${stale.join(', ')} out of date. Run \`bun scripts/generate-mobile-policy-fixtures.ts\`.`
			);
			process.exit(1);
		}
	} else {
		for (const [name, content] of Object.entries(
			await mobilePolicyFixtures()
		)) {
			writeFileSync(join(ROOT, FIXTURE_DIR, name), content);
		}
	}
}
