import * as v from 'valibot';
import { describe, expect, test } from 'vite-plus/test';

import { initOutputSchema } from '../api/init';
import { resolveInitFromManifest } from './consent-manifest';
import type { ConsentManifest } from './consent-manifest';
import { parseConsentManifest } from './consent-manifest-schema';
import {
	registryForManifestLevel,
	runsAtManifestLevel,
} from './script-sources';
import type { ScriptRegistryWire } from './script-sources';

const scriptSources = {
	// Inth checks each entry when it loads the script, so the schema keeps
	// one it could not use and fields it does not know.
	broken: { src: 'http://acme.inth.app/scripts/broken.js' },
	held: null,
	vendor: {
		attributes: { 'data-api': 'https://vendor.example/api', 'data-key': null },
		integrity: 'sha384-abc',
		keyId: 'inth-2027-01',
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

	describe('remote scripts by manifest level', () => {
		const entry = (id: string, requires?: unknown) => ({
			id,
			integration: id,
			manifest: {
				category: 'measurement',
				vendor: id,
				...(requires !== undefined && { requires }),
			},
		});
		const listed = {
			load: [
				entry('level-one'),
				entry('needs-one', 1),
				entry('needs-two', 2),
				entry('needs-half', 1.5),
				entry('needs-text', '1'),
			],
		};

		test('init resolved from a manifest keeps only the entries level 1 runs, without a level', () => {
			const parsed = parseConsentManifest({
				...manifest,
				scriptRegistry: listed,
			});

			expect(
				resolveInitFromManifest(parsed, {}).scriptRegistry?.load?.map(
					({ id }) => id
				)
			).toEqual(['level-one', 'needs-one']);
		});

		test('a higher level keeps the entries it runs', () => {
			expect(
				resolveInitFromManifest(
					{ ...manifest, scriptRegistry: listed },
					{ manifestLevel: 2 }
				).scriptRegistry?.load?.map(({ id }) => id)
			).toEqual(['level-one', 'needs-one', 'needs-two']);
		});

		test('a registry with nothing to drop is passed on as it is', () => {
			const registry = { load: [entry('level-one')], sources: scriptSources };
			expect(registryForManifestLevel(registry, 1)).toBe(registry);
			expect(registryForManifestLevel(undefined, 1)).toBeUndefined();
		});

		test('a malformed entry stays for the loader to report', () => {
			const registry = { load: [null, 'x', entry('needs-two', 2)] };
			expect(
				registryForManifestLevel(registry as unknown as ScriptRegistryWire, 1)
					.load
			).toEqual([null, 'x']);
		});

		test.each([
			[undefined, 1, true],
			[1, 1, true],
			[2, 1, false],
			[2, 2, true],
			[0, 1, false],
			[-1, 1, false],
			[1.5, 2, false],
			['1', 1, false],
			[null, 1, false],
		])('requires %j at level %i runs: %s', (requires, level, runs) => {
			expect(runsAtManifestLevel({ requires }, level)).toBe(runs);
		});
	});
});
