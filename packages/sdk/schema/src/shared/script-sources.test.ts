import * as v from 'valibot';
import { describe, expect, test } from 'vitest';

import { initOutputSchema } from '../api/init';
import { resolveInitFromManifest } from './consent-manifest';
import type { ConsentManifest } from './consent-manifest';
import { parseConsentManifest } from './consent-manifest-schema';

const scriptSources = {
	// Inth checks each entry when it loads the script, so the schema keeps
	// one it could not use and fields it does not know.
	broken: { src: 'http://acme.inth.app/scripts/broken.js' },
	held: null,
	vendor: {
		attributes: { 'data-api': 'https://vendor.example/api', 'data-key': null },
		integrity: 'sha384-abc',
		keyId: 'inth-2027-01',
		refuseIfSet: ['initOptions.sdkServer'],
		src: 'https://acme.inth.app/scripts/vendor@0123456789abcdef.js',
	},
};

const manifest = {
	branding: 'inth',
	revision: 'script-sources',
	schemaVersion: 2,
} satisfies ConsentManifest;

const initOutput = {
	branding: 'inth',
	location: { countryCode: null, regionCode: null },
	policyResolution: resolveInitFromManifest(manifest, {}).policyResolution,
	translations: {
		language: 'en',
		translations: {
			common: {},
			consentManagerDialog: {},
			consentTypes: {},
			cookieBanner: {},
		},
	},
};

describe('scriptRegistry', () => {
	const scriptRegistry = { sources: scriptSources };

	test('a manifest keeps its registry, and every init resolved from it carries it', () => {
		const parsed = parseConsentManifest({ ...manifest, scriptRegistry });

		expect(parsed.scriptRegistry).toEqual(scriptRegistry);
		expect(resolveInitFromManifest(parsed, {}).scriptRegistry).toEqual(
			scriptRegistry
		);
	});

	test('a manifest keeps the files loaders download, and init carries them, entries unchecked', () => {
		const withFiles = {
			...scriptRegistry,
			files: {
				// c15t checks each entry when a loader asks for the file.
				'https://cdn.vendor.example/broken.js': { src: 'http://broken' },
				'https://cdn.vendor.example/held.js': null,
				'https://cdn.vendor.example/logger.js': {
					integrity: 'sha384-def',
					src: 'https://acme.inth.app/scripts/vendor-logger@0123456789abcdef.js',
				},
			},
		};
		const parsed = parseConsentManifest({
			...manifest,
			scriptRegistry: withFiles,
		});

		expect(parsed.scriptRegistry).toEqual(withFiles);
		expect(resolveInitFromManifest(parsed, {}).scriptRegistry).toEqual(
			withFiles
		);
		expect(
			v.parse(initOutputSchema, { ...initOutput, scriptRegistry: withFiles })
				.scriptRegistry
		).toEqual(withFiles);
	});

	test('keeps fields it does not know, for a later backend', () => {
		const later = { ...scriptRegistry, scripts: [{ id: 'posthog' }] };
		expect(
			parseConsentManifest({ ...manifest, scriptRegistry: later })
				.scriptRegistry
		).toEqual(later);
	});

	test('a manifest without a registry resolves init without one', () => {
		expect(resolveInitFromManifest(manifest, {})).not.toHaveProperty(
			'scriptRegistry'
		);
	});

	test.each([
		['an array', []],
		['a string', 'https://acme.inth.app/scripts'],
		['null', null],
	])(
		'a registry that is %s reads as absent and rejects nothing else',
		(_case, value) => {
			const parsed = parseConsentManifest({
				...manifest,
				scriptRegistry: value,
			});

			expect(parsed.scriptRegistry).toBeUndefined();
			expect(parsed.revision).toBe('script-sources');
			expect(
				v.parse(initOutputSchema, { ...initOutput, scriptRegistry: value })
					.scriptRegistry
			).toBeUndefined();
		}
	);

	test('the /init output schema keeps the registry', () => {
		expect(
			v.parse(initOutputSchema, { ...initOutput, scriptRegistry })
				.scriptRegistry
		).toEqual(scriptRegistry);
	});
});
