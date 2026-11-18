import type { ConsentManifest } from '@inth/sdk/schema/types';
import { createConsentManifestPolicyPack } from '@inth/sdk/schema/types';

/** Shared manifest fixture for the promoted Next.js adapter tests. */
export const MANIFEST_FIXTURE = {
	branding: 'inth',
	policyPacks: [
		createConsentManifestPolicyPack({
			categories: ['measurement', 'marketing'],
			id: 'eu-opt-in',
			match: { countries: ['DE'] },
			model: 'opt-in',
			prompt: 'choice',
			scopeMode: 'strict',
			validity: { choiceDays: 365 },
		}),
		createConsentManifestPolicyPack({
			categories: ['marketing'],
			id: 'us-ca-opt-out',
			match: { regions: [{ country: 'US', region: 'CA' }] },
			model: 'opt-out',
			privacySignals: { gpc: { denyCategories: ['marketing'] } },
			prompt: 'choice',
			scopeMode: 'permissive',
			validity: { choiceDays: 365 },
		}),
		createConsentManifestPolicyPack({
			categories: [],
			id: 'notice-default',
			match: { isDefault: true },
			model: 'opt-out',
			prompt: 'none',
			scopeMode: 'permissive',
			validity: { choiceDays: 30 },
		}),
	],
	revision: 'manifest-revision',
	schemaVersion: 2,
	translations: {
		i18n: {
			defaultProfile: 'default',
			messages: {
				default: {
					fallbackLanguage: 'en',
					translations: {
						de: {
							common: {
								acceptAll: 'Alle akzeptieren',
							},
						},
						en: {
							common: {
								acceptAll: 'Accept all',
							},
						},
					},
				},
			},
		},
	},
} satisfies ConsentManifest;

/**
 * A manifest whose packs are `rules`, for tests that need the server to
 * resolve a policy the recommended pack has no rule for.
 *
 * @param rules - The rules, in match order.
 * @returns A snapshot for `resolveConsent({ mode: manifest(), snapshot })`.
 */
export const manifestOf = function manifestOf(
	rules: Parameters<typeof createConsentManifestPolicyPack>[0][]
): ConsentManifest {
	return {
		...MANIFEST_FIXTURE,
		policyPacks: rules.map((rule) => createConsentManifestPolicyPack(rule)),
	};
};
