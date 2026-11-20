/**
 * The Svelte `manifest()` defaults to what `consentManifest()` downloaded.
 */
import {
	createConsentManifestPolicyPack,
	policyRulePresets,
} from '@inth/sdk/schema/types';
import type { ConsentManifest } from '@inth/sdk/schema/types';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { manifest } from '../transports/manifest';
import { setGenerated } from './generated';

const BUILT: ConsentManifest = {
	branding: 'inth',
	revision: 'built',
	schemaVersion: 2,
};

beforeEach(() => {
	setGenerated({ projectUrl: 'https://consent.example.com', snapshot: BUILT });
});

afterEach(() => {
	setGenerated({});
});

describe('manifest()', () => {
	test("uses the build's snapshot and backend URL", () => {
		expect({ ...manifest() }).toMatchObject({
			kind: 'manifest',
			projectUrl: 'https://consent.example.com',
			snapshot: BUILT,
			type: 'manifest',
		});
	});

	test("source: 'runtime' leaves the build's snapshot out", () => {
		const mode = manifest({ source: 'runtime' });
		expect(mode.snapshot).toBeUndefined();
		expect(mode.projectUrl).toBe('https://consent.example.com');
	});

	test("a manifestUrl on a CDN still saves to the build's backend", () => {
		for (const options of [
			{ manifestUrl: 'https://cdn.example/policy.json' },
			// As from an unset `import.meta.env` variable.
			{ manifestUrl: 'https://cdn.example/policy.json', projectUrl: undefined },
		]) {
			const mode = manifest(options);
			expect(mode.projectUrl).toBe('https://consent.example.com');
			expect(mode.snapshot).toBeUndefined();
		}
	});

	test('options replace the defaults', () => {
		const own: ConsentManifest = { ...BUILT, revision: 'own' };
		expect({
			...manifest({ projectUrl: 'https://other.example', snapshot: own }),
		}).toMatchObject({ projectUrl: 'https://other.example', snapshot: own });
	});

	test("a manifestUrl is fetched at runtime and wins over the build's snapshot", async () => {
		const manifestUrl = 'https://cdn.example.com/v1/consent/manifest';
		const withPolicy = (id: string): ConsentManifest => ({
			...BUILT,
			policyPacks: [
				createConsentManifestPolicyPack({
					...policyRulePresets.europeOptIn(),
					id,
					match: { isDefault: true },
				}),
			],
		});
		setGenerated({
			projectUrl: 'https://consent.example.com',
			snapshot: withPolicy('bundled'),
		});
		const fetch = vi.fn<typeof globalThis.fetch>(() =>
			Promise.resolve(new Response(JSON.stringify(withPolicy('from-url'))))
		);

		const transport = manifest({ fetch, manifestUrl })();
		const init = await transport.init?.({
			overrides: {},
			user: null,
		} as unknown as Parameters<NonNullable<typeof transport.init>>[0]);

		expect(init?.policyResolution?.policy?.id).toBe('from-url');
		expect(fetch.mock.calls.map(([input]) => String(input))).toEqual([
			manifestUrl,
		]);
	});
});
