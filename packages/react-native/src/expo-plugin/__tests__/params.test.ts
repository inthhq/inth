import { describe, expect, it } from 'vitest';

import { InthPluginError } from '../inth-plugin-error';
import { resolveParams } from '../params';
import type { InthIabPluginProps } from '../params';

const BACKEND = 'https://acme.inth.app';

describe('resolveParams', () => {
	it('defaults a hosted install', () => {
		expect(resolveParams({ projectUrl: BACKEND })).toMatchObject({
			appTrackingTransparency: {
				enabled: false,
				skAdNetworkIdentifiers: [],
				usageDescription: null,
			},
			autoBootstrap: true,
			backendHost: 'acme.inth.app',
			dryRun: false,
			forceGPC: false,
			projectUrl: BACKEND,
			property: null,
			skipNativeBuildCheck: false,
		});
	});

	it('writes the project URL in its normal form', () => {
		expect(resolveParams({ projectUrl: ' Acme.Inth.App/// ' })).toMatchObject({
			backendHost: 'acme.inth.app',
			projectUrl: BACKEND,
		});
	});

	it.each([
		[
			'a host that is not an Inth project',
			'https://consent.example.com',
			'host',
		],
		['plain http', 'http://acme.inth.app', 'scheme'],
		['a loopback backend', 'http://localhost:8787', 'scheme'],
		['a path', `${BACKEND}/api/c15t`, 'path'],
		['a port', `${BACKEND}:8443`, 'port'],
		['credentials', 'https://user:pass@acme.inth.app', 'credentials'],
		['a query string', `${BACKEND}?key=leaked`, 'query'],
		['an empty string', '', 'empty'],
	])('rejects %s: %s', (_label, value, reason) => {
		const refused = () => resolveParams({ projectUrl: value });
		expect(refused).toThrowError(InthPluginError);
		expect(refused).toThrowError(
			expect.objectContaining({
				message: expect.stringContaining(
					`projectUrl must be the project URL from your Inth dashboard, such as https://your-project.inth.app. Got "${value}": `
				),
				reason,
			})
		);
	});

	it('requires projectUrl', () => {
		expect(() => resolveParams({} as never)).toThrowError(
			/projectUrl is required/u
		);
		expect(() => resolveParams({ dryRun: true } as never)).toThrowError(
			/projectUrl is required/u
		);
	});

	it.each([
		['hosted', /Hosted is the only mode: remove mode and keep projectUrl/u],
		['selfHosted', /has no replacement\. The mobile SDKs work only with Inth/u],
		['offline', /Use dryRun: true for development and CI/u],
		['custom', /Set autoBootstrap to false/u],
		['proxied', /mode was removed; got "proxied"/u],
	])(
		'refuses the retired mode %s and names what replaces it',
		(mode, message) => {
			const refused = () =>
				resolveParams({ mode, projectUrl: BACKEND } as never);
			expect(refused).toThrowError(InthPluginError);
			expect(refused).toThrowError(message);
		}
	);

	it('refuses the retired initURL and says where policy comes from', () => {
		expect(() =>
			resolveParams({
				initURL: `${BACKEND}/init`,
				projectUrl: BACKEND,
			} as never)
		).toThrowError(/initURL was removed.*Policy is fetched from projectUrl/u);
	});

	it('refuses the renamed domain option and names property instead', () => {
		expect(() =>
			resolveParams({ domain: 'acme.com', projectUrl: BACKEND } as never)
		).toThrowError(/domain was renamed to property/u);
		expect(
			resolveParams({ projectUrl: BACKEND, property: 'acme.com' }).property
		).toBe('acme.com');
	});

	describe('dryRun', () => {
		it('is off unless set, and must be a boolean', () => {
			expect(resolveParams({ projectUrl: BACKEND }).dryRun).toBe(false);
			expect(resolveParams({ dryRun: true, projectUrl: BACKEND }).dryRun).toBe(
				true
			);
			expect(() =>
				resolveParams({ dryRun: 'yes' as never, projectUrl: BACKEND })
			).toThrowError(/dryRun must be true or false/u);
		});

		it.each([
			['http://localhost:8787', 'http://localhost:8787', 'localhost'],
			[
				'http://127.0.0.1:3000/api/self-host/',
				'http://127.0.0.1:3000/api/self-host',
				'127.0.0.1',
			],
			[
				'https://staging.consent.example.com/',
				'https://staging.consent.example.com',
				'staging.consent.example.com',
			],
		])('relaxes the host rule: %s', (value, projectUrl, backendHost) => {
			expect(resolveParams({ dryRun: true, projectUrl: value })).toMatchObject({
				backendHost,
				projectUrl,
			});
			expect(() => resolveParams({ projectUrl: value })).toThrowError(
				InthPluginError
			);
		});

		it('still refuses http off loopback and credentials', () => {
			for (const [value, reason] of [
				['http://staging.consent.example.com', 'scheme'],
				['https://user:secret@consent.example.com', 'credentials'],
			]) {
				expect(() =>
					resolveParams({ dryRun: true, projectUrl: value as string })
				).toThrowError(expect.objectContaining({ reason }));
			}
		});
	});

	it('defaults to no declared category scope', () => {
		// Empty means "write nothing", which the cores read as no declaration.
		expect(
			resolveParams({ projectUrl: BACKEND }).consentCategories
		).toStrictEqual([]);
	});

	it('trims and de-duplicates a declared category scope', () => {
		expect(
			resolveParams({
				consentCategories: [' necessary ', 'necessary', 'marketing'],
				projectUrl: BACKEND,
			}).consentCategories
		).toStrictEqual(['necessary', 'marketing']);
	});

	it('rejects an unknown category with the list of real ones', () => {
		// The cores drop an unknown name rather than trusting it; a plugin that
		// wrote it anyway would ship rows the host never typed.
		expect(() =>
			resolveParams({
				consentCategories: ['marketing', 'experiance'],
				projectUrl: BACKEND,
			})
		).toThrowError(/unknown: "experiance"/u);
	});

	it('refuses an empty category list instead of meaning "everything"', () => {
		expect(() =>
			resolveParams({ consentCategories: [], projectUrl: BACKEND })
		).toThrowError(/Omit it entirely when the app declares no categories/u);
	});

	it('defaults no declared vendor scope to every served vendor', () => {
		// Empty means "write nothing", which both cores read as no scope rather
		// than as a drawer with nothing in it.
		expect(resolveParams({ projectUrl: BACKEND }).vendors).toStrictEqual([]);
	});

	it('de-duplicates a declared vendor scope and keeps the order written', () => {
		expect(
			resolveParams({ projectUrl: BACKEND, vendors: [755, 42, 8, 42] }).vendors
		).toStrictEqual([755, 42, 8]);
	});

	it('refuses an empty vendor list instead of meaning "everything"', () => {
		// Both cores read an empty scope as no scope, so writing one would ship the
		// widest possible disclosure under a name that reads like the narrowest.
		expect(() =>
			resolveParams({ projectUrl: BACKEND, vendors: [] })
		).toThrowError(/Omit it entirely to disclose every vendor/u);
	});

	it('refuses a vendor id that is not a positive whole number', () => {
		// The readers drop an entry they cannot name rather than trusting it, so a
		// plugin that wrote one anyway would ship a drawer the host never typed.
		expect(() =>
			resolveParams({ projectUrl: BACKEND, vendors: [42, 0, -3, 7.5] })
		).toThrowError(/invalid: 0, -3, 7\.5/u);
	});

	it('leaves IAB off when no iab settings are given', () => {
		expect(resolveParams({ projectUrl: BACKEND }).iab).toBeNull();
	});

	it('resolves IAB settings and uppercases the country code', () => {
		expect(
			resolveParams({
				iab: { cmpId: 1234, cmpVersion: 7, publisherCountryCode: ' de ' },
				projectUrl: BACKEND,
			}).iab
		).toStrictEqual({
			cmpId: 1234,
			cmpVersion: 7,
			consentScreen: null,
			publisherCountryCode: 'DE',
		});
		expect(
			resolveParams({
				iab: {
					cmpId: 4095,
					cmpVersion: 0,
					consentScreen: 0,
					publisherCountryCode: 'GB',
				},
				projectUrl: BACKEND,
			}).iab?.consentScreen
		).toBe(0);
	});

	it.each([
		[
			{ cmpVersion: 1, publisherCountryCode: 'DE' },
			/iab\.cmpId .*There is no default/u,
		],
		[{ cmpId: 1, cmpVersion: 1, publisherCountryCode: 'DE' }, /iab\.cmpId/u],
		[{ cmpId: 4096, cmpVersion: 1, publisherCountryCode: 'DE' }, /iab\.cmpId/u],
		[{ cmpId: 12.5, cmpVersion: 1, publisherCountryCode: 'DE' }, /iab\.cmpId/u],
		[
			{ cmpId: '1234', cmpVersion: 1, publisherCountryCode: 'DE' },
			/iab\.cmpId/u,
		],
		[{ cmpId: 1234, publisherCountryCode: 'DE' }, /iab\.cmpVersion/u],
		[
			{ cmpId: 1234, cmpVersion: -1, publisherCountryCode: 'DE' },
			/iab\.cmpVersion/u,
		],
		[
			{ cmpId: 1234, cmpVersion: 4096, publisherCountryCode: 'DE' },
			/iab\.cmpVersion/u,
		],
		[{ cmpId: 1234, cmpVersion: 1 }, /iab\.publisherCountryCode/u],
		[
			{ cmpId: 1234, cmpVersion: 1, publisherCountryCode: 'DEU' },
			/iab\.publisherCountryCode/u,
		],
		[
			{ cmpId: 1234, cmpVersion: 1, publisherCountryCode: 'D1' },
			/iab\.publisherCountryCode/u,
		],
		[
			{
				cmpId: 1234,
				cmpVersion: 1,
				consentScreen: 64,
				publisherCountryCode: 'DE',
			},
			/iab\.consentScreen/u,
		],
	])('refuses IAB settings %j at prebuild', (iab, message) => {
		expect(() =>
			resolveParams({
				iab: iab as unknown as InthIabPluginProps,
				projectUrl: BACKEND,
			})
		).toThrowError(message);
	});

	it('refuses a property with a space in it', () => {
		expect(() =>
			resolveParams({ projectUrl: BACKEND, property: 'two words' })
		).toThrowError(/property must be a single non-empty token/u);
	});

	it('refuses a tracking domain spelled as a URL', () => {
		expect(() =>
			resolveParams({
				enableAppTrackingTransparency: true,
				privacyTrackingDomains: ['https://ads.example.com/'],
				projectUrl: BACKEND,
				trackingUsageDescription: 'Relevant ads.',
			})
		).toThrowError(/bare hostnames/u);
	});

	it('lowercases and dedupes tracking domains', () => {
		const resolved = resolveParams({
			enableAppTrackingTransparency: true,
			privacyTrackingDomains: [
				'ADS.example.com',
				'ads.example.com',
				'acme.inth.app',
			],
			projectUrl: BACKEND,
			trackingUsageDescription: 'Relevant ads.',
		});

		expect(resolved.privacyTrackingDomains).toStrictEqual([
			'ads.example.com',
			'acme.inth.app',
		]);
	});

	it('starts the core at launch unless the native app installs it', () => {
		expect(resolveParams({ projectUrl: BACKEND }).autoBootstrap).toBe(true);
		expect(
			resolveParams({ autoBootstrap: false, projectUrl: BACKEND }).autoBootstrap
		).toBe(false);
	});

	it('names the app.json shape when given no parameters at all', () => {
		expect(() => resolveParams(undefined)).toThrowError(
			/"plugins": \[\["@inth\/react-native", \{ "projectUrl"/u
		);
	});
});
