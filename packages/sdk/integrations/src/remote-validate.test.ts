// @vitest-environment node
import { describe, expect, it } from 'vite-plus/test';

import type { RemoteOptionSpec } from './remote-define';
import { validateOptionValues } from './remote-validate';

const specs = {
	consent: {
		fields: {
			mode: {
				default: 'opt-in',
				kind: 'enum',
				label: 'Mode',
				values: ['opt-in', 'opt-out'],
			},
			region: {
				fields: {
					code: {
						example: 'EU',
						kind: 'id',
						label: 'Region code',
						pattern: '^[A-Z]{2}$',
						required: true,
					},
					strict: { default: false, kind: 'boolean', label: 'Strict' },
				},
				kind: 'object',
				label: 'Region',
				required: false,
			},
		},
		kind: 'object',
		label: 'Consent',
		required: false,
	},
	domain: {
		example: 'go.example.com',
		kind: 'hostname',
		label: 'Tracker domain',
		required: false,
	},
	ids: {
		example: 'A1',
		kind: 'idList',
		label: 'Tag IDs',
		maxItems: 3,
		pattern: '^[A-Z][0-9]$',
		required: false,
	},
	purposes: {
		keyExample: 'analytics',
		keyPattern: '^[a-z_]+$',
		kind: 'map',
		label: 'Purposes',
		maxEntries: 3,
		required: false,
		values: ['measurement', 'marketing'],
	},
	sampleRate: {
		example: 50,
		integer: true,
		kind: 'number',
		label: 'Sample rate',
		max: 100,
		min: 0,
		required: false,
	},
	trackPageView: { default: true, kind: 'boolean', label: 'Page views' },
} as const satisfies Record<string, RemoteOptionSpec>;

const validate = (input: unknown) => validateOptionValues('test', specs, input);

const issuesFor = (input: unknown): string[] => {
	const result = validate(input);
	return result.ok ? [] : result.issues;
};

describe('validateOptionValues', () => {
	it('fills boolean defaults and leaves optional values out', () => {
		expect(validate({})).toEqual({
			ok: true,
			options: { trackPageView: true },
		});
	});

	it('returns every kind as JSON, sharing nothing with the input', () => {
		const input = {
			consent: { mode: 'opt-out', region: { code: 'EU', strict: true } },
			domain: 'go.example.com',
			ids: ['A1', 'B2'],
			purposes: { ads: 'marketing', analytics: 'measurement' },
			sampleRate: 25,
			trackPageView: false,
		};
		const result = validate(input);

		expect(result).toEqual({ ok: true, options: input });
		const options = result.ok ? result.options : {};
		expect(options.ids).not.toBe(input.ids);
		expect(options.consent).not.toBe(input.consent);
		expect(options.purposes).not.toBe(input.purposes);
	});

	it('prefixes each issue with the integration key', () => {
		expect(issuesFor({ trackPageView: 'yes' })).toEqual([
			"test: 'trackPageView' must be true or false",
		]);
	});

	describe('hostname', () => {
		it.each([
			'https://go.example.com',
			'go.example.com:8443',
			'go.example.com/pd.js',
			'user@go.example.com',
			'10.0.0.1',
			'Go.Example.com',
			'localhost',
		])('refuses %s', (domain) => {
			expect(issuesFor({ domain })).toEqual([
				expect.stringContaining("'domain'"),
			]);
		});
	});

	describe('number', () => {
		it.each([
			[-1, 'at least 0'],
			[101, 'at most 100'],
			[2.5, 'an integer'],
			['50', 'a number'],
			[Number.NaN, 'a number'],
			[Number.POSITIVE_INFINITY, 'a number'],
		])('refuses %s', (sampleRate, message) => {
			expect(issuesFor({ sampleRate })).toEqual([
				expect.stringContaining(message),
			]);
		});

		it('accepts both bounds', () => {
			expect(validate({ sampleRate: 0 }).ok).toBe(true);
			expect(validate({ sampleRate: 100 }).ok).toBe(true);
		});
	});

	describe('idList', () => {
		it.each([
			[['A1', 'B2', 'C3', 'D4'], 'at most 3 IDs'],
			[['A1', 'a1'], "'ids[1]' must match"],
			[['A1', 'A1'], "'ids[1]' repeats 'A1'"],
			[['A1', 7], "'ids[1]' must be a string"],
			['A1', 'must be a list'],
		])('refuses %j', (ids, message) => {
			expect(issuesFor({ ids })).toEqual([expect.stringContaining(message)]);
		});

		it('requires at least one ID when required', () => {
			const required = {
				ids: { ...specs.ids, required: true },
			} satisfies Record<string, RemoteOptionSpec>;

			expect(validateOptionValues('test', required, { ids: [] })).toEqual({
				issues: ["test: 'ids' must have at least one ID"],
				ok: false,
			});
		});
	});

	describe('object', () => {
		it('fills defaults inside nested objects', () => {
			expect(validate({ consent: { region: { code: 'US' } } })).toEqual({
				ok: true,
				options: {
					consent: { mode: 'opt-in', region: { code: 'US', strict: false } },
					trackPageView: true,
				},
			});
		});

		it('refuses keys it does not declare, at both levels', () => {
			expect(
				issuesFor({
					consent: { extra: 1, region: { code: 'US', script: 'x' } },
				})
			).toEqual([
				"test: unknown option 'consent.extra'",
				"test: unknown option 'consent.region.script'",
			]);
		});

		it.each(['__proto__', 'constructor', 'prototype'])(
			'refuses the prototype key %s',
			(key) => {
				const consent = JSON.parse(`{"${key}": {"polluted": true}}`) as unknown;

				expect(issuesFor({ consent })).toEqual([
					`test: unknown option 'consent.${key}'`,
				]);
				expect(({} as Record<string, unknown>).polluted).toBeUndefined();
			}
		);

		it('reports a missing required field by its path', () => {
			expect(issuesFor({ consent: { region: {} } })).toEqual([
				"test: 'consent.region.code' is required",
			]);
		});

		it.each([null, [], 'opt-in'])('refuses %j as an object', (consent) => {
			expect(issuesFor({ consent })).toEqual([
				"test: 'consent' must be an object",
			]);
		});
	});

	describe('map', () => {
		it.each([
			[{ Ads: 'marketing' }, "key 'Ads' must match"],
			[{ ads: 'necessary' }, "'purposes.ads' must be one of"],
			[{ ads: true }, "'purposes.ads' must be a string"],
			[
				{ a: 'marketing', b: 'marketing', c: 'marketing', d: 'marketing' },
				'at most 3 entries',
			],
		])('refuses %j', (purposes, message) => {
			expect(issuesFor({ purposes })).toEqual([
				expect.stringContaining(message),
			]);
		});

		it.each(['__proto__', 'constructor', 'prototype'])(
			'refuses the key %s even when it matches the key pattern',
			(key) => {
				const purposes = JSON.parse(`{"${key}": "marketing"}`) as unknown;

				expect(issuesFor({ purposes })).toEqual([
					`test: 'purposes' must not have the key '${key}'`,
				]);
			}
		);
	});

	describe('plain data', () => {
		const getter = (value: unknown) =>
			Object.defineProperty({}, 'trackPageView', {
				enumerable: true,
				get: () => value,
			});
		const throwing = () =>
			Object.defineProperty({}, 'code', {
				enumerable: true,
				get: () => {
					throw new Error('read');
				},
			});

		it.each([
			['a Date', Object.assign(new Date(0), { trackPageView: true }), ''],
			['a class instance', new URLSearchParams(), ''],
			['an object with a getter', getter(true), ''],
			['an object with a symbol key', { [Symbol('x')]: 1 }, ''],
			[
				'an object with a hidden key',
				Object.defineProperty({}, 'trackPageView', { value: true }),
				'',
			],
			[
				'a nested object with a getter',
				{ consent: { region: throwing() } },
				'consent.region',
			],
			[
				'a nested class instance',
				{ consent: Object.assign(new Date(0), { mode: 'opt-in' }) },
				'consent',
			],
			[
				'a map with a getter',
				{
					purposes: Object.defineProperty({}, 'ads', {
						enumerable: true,
						get: () => 'marketing',
					}),
				},
				'purposes',
			],
			[
				'a list with a getter',
				{
					ids: Object.defineProperty(['A1'], 0, {
						get: () => 'A1',
					}),
				},
				'ids',
			],
			[
				'a list with another prototype',
				{
					ids: Object.setPrototypeOf(['A1'], Object.create(Array.prototype)),
				},
				'ids',
			],
		])('refuses %s without reading it', (_label, input, path) => {
			const issues = issuesFor(input);

			expect(issues).toEqual([
				path === ''
					? 'test: options must be plain data'
					: `test: '${path}' must be plain data`,
			]);
		});

		it('refuses an object with a throwing getter instead of throwing', () => {
			expect(() => validate(throwing())).not.toThrow();
			expect(validate({ consent: { region: throwing() } }).ok).toBe(false);
		});

		it('refuses a proxy that throws instead of throwing', () => {
			const proxy = new Proxy(
				{},
				{
					getPrototypeOf: () => {
						throw new Error('trap');
					},
					ownKeys: () => {
						throw new Error('trap');
					},
				}
			);

			expect(validate(proxy)).toEqual({
				issues: ['test: options must be plain data'],
				ok: false,
			});
		});

		it('reads a proxied list without running its get trap', () => {
			const ids = new Proxy(['A1'], {
				get: () => {
					throw new Error('get trap ran');
				},
			});

			expect(validate({ ids })).toMatchObject({
				ok: true,
				options: { ids: ['A1'] },
			});
		});

		it('accepts objects with a null prototype', () => {
			const input = Object.assign(Object.create(null) as object, {
				consent: Object.assign(Object.create(null) as object, {
					mode: 'opt-out',
				}),
				purposes: Object.assign(Object.create(null) as object, {
					ads: 'marketing',
				}),
			});

			expect(validate(input)).toEqual({
				ok: true,
				options: {
					consent: { mode: 'opt-out' },
					purposes: { ads: 'marketing' },
					trackPageView: true,
				},
			});
		});
	});

	describe('URL-shaped strings', () => {
		const url = 'https://evil.example/x.js';

		it.each([
			['an ID inside an object', { consent: { region: { code: url } } }],
			['an enum inside an object', { consent: { mode: url } }],
			['a hostname', { domain: url }],
			['a list item', { ids: [url] }],
			['a map key', { purposes: { [url]: 'marketing' } }],
			['a map value', { purposes: { ads: url } }],
		])('are refused as %s', (_label, input) => {
			expect(issuesFor(input)).toContainEqual(
				expect.stringContaining('must not be a URL')
			);
		});
	});
});
