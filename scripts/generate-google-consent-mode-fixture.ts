/**
 * Writes `packages/native-protocol/google-consent-mode/consent-mode-v2.json`: the web's
 * Google Consent Mode v2 mapping, and what the web runtime sends for every
 * combination of optional categories, for the Swift, Kotlin and React Native
 * helpers to match.
 *
 * The mapping comes from `GOOGLE_CONSENT_MODE_V2_DEFAULT_MAPPING`, which the
 * gtag.js and Google Tag Manager helpers use. Each case's expected signals come
 * from `mapConsentState`, the function the web runtime calls before it sends
 * `gtag('consent', ...)`.
 *
 * The fixture lives under `packages/native-protocol/google-consent-mode/` rather than
 * the top level, because every top-level fixture must be listed in
 * `packages/native-protocol/index.json`.
 *
 * Usage: `bun scripts/generate-google-consent-mode-fixture.ts [output-dir]`
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mapConsentState } from '../packages/sdk/integrations/src/engine/consent-mapping';
import {
	GOOGLE_CONSENT_MODE_V2_DEFAULT_MAPPING,
	GOOGLE_CONSENT_TYPES,
} from '../packages/sdk/integrations/src/vendors/_shared/google-consent';

/** Optional categories in `OPTIONAL_CONSENT_CATEGORIES` order. */
const OPTIONAL = [
	'functionality',
	'experience',
	'measurement',
	'marketing',
] as const;

const categoryOf = (type: string): string => {
	const entry = Object.entries(GOOGLE_CONSENT_MODE_V2_DEFAULT_MAPPING).find(
		([, types]) => types.includes(type)
	);
	if (!entry) {
		throw new Error(`${type} has no category in the default mapping`);
	}
	return entry[0];
};

// Every subset of the optional categories. `necessary` is always granted.
const subsets: string[][] = [[]];
for (const category of OPTIONAL) {
	for (const subset of subsets.slice()) {
		subsets.push([...subset, category]);
	}
}
const cases = subsets.map((granted) => {
	const consents = {
		necessary: true,
		...Object.fromEntries(
			OPTIONAL.map((category) => [category, granted.includes(category)])
		),
	} as Parameters<typeof mapConsentState>[1];
	const sent = mapConsentState(
		GOOGLE_CONSENT_MODE_V2_DEFAULT_MAPPING,
		consents
	);
	return {
		consents,
		expected: Object.fromEntries(
			GOOGLE_CONSENT_TYPES.map((type) => [type, sent[type]])
		),
		id: granted.length === 0 ? 'necessary-only' : granted.join('+'),
	};
});

const fixture = {
	cases,
	description:
		'Google Consent Mode v2: the c15t category that grants each consent type, and the signals the web sends for every combination of optional categories.',
	generatedBy: 'bun scripts/generate-google-consent-mode-fixture.ts',
	mapping: GOOGLE_CONSENT_MODE_V2_DEFAULT_MAPPING,
	oracle: 'packages/sdk/integrations/src/vendors/_shared/google-consent.ts',
	types: GOOGLE_CONSENT_TYPES.map((type) => ({
		category: categoryOf(type),
		type,
	})),
};

const outputDirectory =
	process.argv[2] ??
	fileURLToPath(
		new URL('../packages/native-protocol/google-consent-mode', import.meta.url)
	);
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(
	join(outputDirectory, 'consent-mode-v2.json'),
	`${JSON.stringify(fixture, null, '\t')}\n`
);
