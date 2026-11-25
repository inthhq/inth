import type { ConsentManifest } from '@inth/sdk-schema/types';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { hosted, manifest } from '../../modes';
import {
	buildSnapshotSkipReason,
	needsBuildSnapshot,
	resolveServerMode,
} from '../server-mode.model';

const BUILT = { revision: 'built' } as unknown as ConsentManifest;
const OWN = { revision: 'own' } as unknown as ConsentManifest;
const BACKEND = 'https://consent.example.com';

const resolve = (
	options: Partial<Parameters<typeof resolveServerMode>[0]> = {}
) =>
	resolveServerMode({
		adapter: '@inth/test',
		buildSnapshot: BUILT,
		mode: undefined,
		projectUrl: BACKEND,
		...options,
	});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('resolveServerMode: manifest()', () => {
	test('no mode resolves from the build snapshot', () => {
		const { consent, route } = resolve();
		expect(consent).toMatchObject({
			manifest: BUILT,
			manifestUrl: undefined,
			mode: 'manifest',
			ownRoutes: ['/api/inth'],
			projectUrl: BACKEND,
		});
		expect(consent.gvlRoute).toBeUndefined();
		expect(route).toEqual({
			manifest: BUILT,
			manifestUrl: undefined,
			projectUrl: BACKEND,
		});
	});

	test('the route prefix is the guarded route and serves vendor lists', () => {
		const { consent } = resolve({ routePrefix: '/api/consent' });
		expect(consent.ownRoutes).toEqual(['/api/consent']);
		expect(consent.gvlRoute).toBe('/api/consent/v1/consent/init');
	});

	test("a snapshot of the mode's own wins over the build's", () => {
		const { consent, route } = resolve({ mode: manifest({ snapshot: OWN }) });
		expect(consent.manifest).toBe(OWN);
		expect(route.manifest).toBe(OWN);
	});

	test.each([
		['source: runtime', manifest({ source: 'runtime' }), undefined],
		[
			'an absolute manifestUrl',
			manifest({ manifestUrl: 'https://cdn.example/m.json' }),
			'https://cdn.example/m.json',
		],
	])('%s reads the manifest at runtime', (_name, mode, manifestUrl) => {
		const { consent, route } = resolve({ mode });
		expect(consent.manifest).toBeUndefined();
		expect(consent.manifestUrl).toBe(manifestUrl);
		expect(route.manifest).toBeUndefined();
		expect(route.manifestUrl).toBe(manifestUrl);
		expect(needsBuildSnapshot(mode)).toBe(false);
	});

	test('a relative manifestUrl on the consent route reads what the route reads', () => {
		const mode = manifest({ manifestUrl: '/api/inth/v1/consent/manifest' });
		const { consent, route } = resolve({ mode, routePrefix: '/api/inth' });
		expect(consent.manifest).toBe(BUILT);
		expect(consent.manifestUrl).toBeUndefined();
		expect(route.manifestUrl).toBeUndefined();
		expect(needsBuildSnapshot(mode)).toBe(true);
	});

	test('another relative manifestUrl is read when there is no build snapshot', () => {
		const mode = manifest({ manifestUrl: '/policy.json' });
		const { consent, route } = resolve({ buildSnapshot: undefined, mode });
		expect(consent.manifest).toBeUndefined();
		expect(consent.manifestUrl).toBe('/policy.json');
		expect(route.manifestUrl).toBe('/policy.json');
	});

	test("resolve: 'browser' resolves nothing on the server", () => {
		const mode = manifest({
			manifestUrl: 'https://cdn.example/m.json',
			resolve: 'browser',
		});
		const server = resolve({ mode });
		expect(server.consent).toEqual({ ownRoutes: ['/api/inth'] });
		// The browser reads that URL instead of the route.
		expect(server.route.manifestUrl).toBeUndefined();
		expect(server.browser.mode).toBe(mode);
	});

	test("serverResolvesBrowserMode resolves resolve: 'browser' as manifest() on the server", () => {
		const mode = manifest({
			manifestUrl: '/api/inth/v1/consent/manifest',
			resolve: 'browser',
		});
		const server = resolve({ mode, serverResolvesBrowserMode: true });
		expect(server.consent).toMatchObject({
			manifest: BUILT,
			manifestUrl: undefined,
			mode: 'manifest',
			projectUrl: BACKEND,
		});
		expect(server.browser.mode).toBe(mode);
	});

	test('without a backend or a manifest nothing resolves', () => {
		const { consent } = resolve({
			buildSnapshot: undefined,
			projectUrl: undefined,
		});
		expect(consent.mode).toBeUndefined();
	});

	test('the browser gets the mode without snapshot or source', () => {
		expect(resolve({ mode: manifest({ snapshot: OWN }) }).browser.mode).toEqual(
			{
				type: 'manifest',
			}
		);
		expect(
			resolve({ mode: manifest({ geoUrl: '/geo', source: 'runtime' }) }).browser
				.mode
		).toEqual({ geoUrl: '/geo', type: 'manifest' });
	});
});

describe('resolveServerMode: hosted() and testing()', () => {
	test("hosted() asks the backend's init with the mode's headers", () => {
		const mode = {
			headers: { 'x-inth-country': 'DE' },
			type: 'hosted' as const,
		};
		expect(resolve({ mode }).consent).toMatchObject({
			initHeaders: { 'x-inth-country': 'DE' },
			mode: 'hosted',
			projectUrl: BACKEND,
		});
	});

	test('hosted() without a backend resolves nothing', () => {
		expect(
			resolve({ mode: hosted(), projectUrl: undefined }).consent.mode
		).toBeUndefined();
	});

	test("testing() is left to the browser unless the adapter knows the provider's IAB setting", () => {
		const mode = { type: 'testing' as const };
		expect(resolve({ mode }).consent.mode).toBeUndefined();
		const offline = resolve({ iab: false, mode }).consent;
		expect(offline.mode).toBe('offline');
		expect(offline.offline?.policyRules?.length).toBeGreaterThan(0);
	});

	test('testing() never resolves in production', () => {
		vi.stubEnv('NODE_ENV', 'production');
		expect(() => resolve({ iab: false, mode: { type: 'testing' } })).toThrow(
			/does not run in production/u
		);
	});
});

describe('resolveServerMode: checks', () => {
	test('rejects a transport without mode data', () => {
		expect(() => resolve({ mode: (() => undefined) as never })).toThrow(
			TypeError
		);
	});

	test("snapshotShipsSeparately keeps a browser-resolved mode's snapshot off browser.mode", () => {
		const mode = manifest({ resolve: 'browser', snapshot: OWN });
		expect(resolve({ mode }).browser.mode).toHaveProperty('snapshot', OWN);
		expect(
			resolve({ mode, snapshotShipsSeparately: true }).browser.mode
		).toEqual({
			resolve: 'browser',
			type: 'manifest',
		});
	});

	test('browserTransports leaves a transport without mode data to the browser', () => {
		const { consent } = resolve({
			browserTransports: true,
			mode: (() => undefined) as never,
		});
		expect(consent).toEqual({ ownRoutes: ['/api/inth'] });
	});

	test('reads the data a transport factory carries', () => {
		const factory = Object.assign(() => undefined, {
			kind: 'manifest',
			type: 'manifest' as const,
		});
		expect(resolve({ mode: factory }).mode).toEqual({ type: 'manifest' });
	});

	test('proxy needs routePrefix', () => {
		expect(() => resolve({ proxy: true })).toThrow(/needs `routePrefix`/u);
		expect(
			resolve({ proxy: true, routePrefix: '/api/inth' }).browser.projectUrl
		).toBe('/api/inth');
	});

	test('checkBackend names what is missing', () => {
		const check = (options: Partial<Parameters<typeof resolve>[0]>) => () =>
			resolve({
				backendHint: 'Set THE_URL.',
				checkBackend: true,
				projectUrl: undefined,
				...options,
			});
		expect(check({})).toThrow(/manifest\(\) needs a backend URL.*THE_URL/u);
		expect(check({ mode: manifest({ snapshot: OWN }) })).toThrow(
			/manifest\(\{ snapshot \}\) still needs a backend URL/u
		);
		expect(check({ mode: hosted() })).toThrow(/hosted\(\) needs a backend/u);
		expect(check({ mode: { type: 'testing' } })).not.toThrow();
		expect(check({ projectUrl: '' })).toThrow(
			/gives the server no manifest to fetch/u
		);
		expect(
			check({ mode: manifest({ manifestUrl: '/m.json' }), projectUrl: '' })
		).not.toThrow();
	});
});

describe('buildSnapshotSkipReason', () => {
	test.each([
		[undefined],
		[manifest()],
		[manifest({ manifestUrl: '/api/inth/v1/consent/manifest' })],
	])('%j needs a build snapshot', (mode) => {
		expect(buildSnapshotSkipReason(mode)).toBeUndefined();
	});

	test.each([
		[hosted(), 'sets hosted()'],
		[{ type: 'testing' as const }, 'sets testing()'],
		[manifest({ snapshot: OWN }), 'manifest({ snapshot })'],
		[manifest({ source: 'runtime' }), "manifest({ source: 'runtime' })"],
		[
			manifest({ manifestUrl: 'https://cdn.example/m.json' }),
			'absolute manifest({ manifestUrl })',
		],
	])('%j reads none', (mode, reason) => {
		expect(buildSnapshotSkipReason(mode)).toContain(reason);
	});
});
