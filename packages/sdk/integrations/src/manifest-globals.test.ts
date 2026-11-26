// @vitest-environment node
/**
 * `compileManifest` fills in `globals` from a vendor manifest's steps, so no
 * vendor file lists them. Each root it finds must be one a manifest may
 * declare: no platform or built-in global. `remote.test.ts` parses each
 * remote manifest built from real options.
 */
import { isDeclarableGlobal, manifestRoots } from '@inth/sdk/manifest-runtime';
import { describe, expect, it } from 'vite-plus/test';

// Every name on Chromium's window, written by the core package's generator.
import chromiumGlobals from '../../core/src/manifest-runtime/__tests__/fixtures/chromium-globals.json';
import { compileManifest } from './engine/compile';
import { vendorModules } from './remote-catalogue';
import { VENDOR_MANIFEST_KIND } from './types';
import type { VendorManifest } from './types';

/** Any `{{option}}` reads as a vendor-like name. */
const anyOptions = new Proxy(
	{},
	{ get: () => 'inthOption', has: () => true }
) as Record<string, unknown>;

const isVendorManifest = (value: unknown): value is VendorManifest =>
	typeof value === 'object' &&
	value !== null &&
	(value as { kind?: unknown }).kind === VENDOR_MANIFEST_KIND &&
	!Object.hasOwn(value, 'bootstrapSteps');

const manifests = Object.entries(vendorModules).flatMap(([key, module]) =>
	Object.entries(module as Record<string, unknown>)
		.filter((entry): entry is [string, VendorManifest] =>
			isVendorManifest(entry[1])
		)
		.map(([name, manifest]) => [`${key}.${name}`, manifest] as const)
);

describe('globals compileManifest derives', () => {
	it('finds the vendor manifests', () => {
		expect(manifests.length).toBeGreaterThan(40);
	});

	it.each(manifests)('%s declares every root it uses', (_name, manifest) => {
		const compiled = compileManifest(manifest, anyOptions);

		expect(compiled.globals).toEqual(manifestRoots(compiled));
		expect(
			compiled.globals.filter(
				(root) =>
					!isDeclarableGlobal(root) || Object.hasOwn(chromiumGlobals, root)
			)
		).toEqual([]);
	});

	it('lists the consent signal target, which no step names', () => {
		const compiled = compileManifest({
			category: 'measurement',
			consentMapping: { measurement: ['analytics_storage'] },
			consentSignal: 'gtag',
			install: [{ src: 'https://cdn.example/vendor.js', type: 'loadScript' }],
			kind: VENDOR_MANIFEST_KIND,
			schemaVersion: 1,
			vendor: 'vendor',
		});

		expect(compiled.globals).toEqual(['gtag']);
	});
});
