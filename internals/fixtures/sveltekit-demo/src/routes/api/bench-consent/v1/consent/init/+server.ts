import { writePolicyResolutionWire } from '@inth/sdk/engine';
import type { InitOutput } from '@inth/sdk/engine';
import { translations } from '@inth/sdk/translations/en';
import type { RequestHandler } from '@sveltejs/kit';

import { BENCHMARK_POLICY_RESOLUTION } from '#lib/bench/policy.js';

const response = {
	branding: 'inth',
	location: {
		countryCode: 'DE',
		regionCode: 'BE',
	},
	policyResolution: writePolicyResolutionWire(BENCHMARK_POLICY_RESOLUTION),
	policySnapshotToken: 'svelte-browser-bench',
	translations: {
		language: 'en',
		translations: {
			common: {
				acceptAll: 'Accept All',
				customize: 'Customize',
				rejectAll: 'Reject All',
				save: 'Save',
			},
			consentManagerDialog: {
				description: 'Benchmark preferences description.',
				title: 'Benchmark Preferences',
			},
			consentTypes: translations.consentTypes,
			cookieBanner: {
				description: 'Deterministic benchmark fixture.',
				title: 'Benchmark Consent Banner',
			},
		},
	},
} satisfies InitOutput;

const headers = {
	'cache-control': 'no-store',
};

export const GET: RequestHandler = () => Response.json(response, { headers });

export const POST: RequestHandler = () => Response.json(response, { headers });
