import { describe, expect, test, vi } from 'vitest';

import {
	createRegistryVerifier,
	parseRegistrySignature,
	releaseStatement,
	verifyReleaseSignature,
} from '../signature';
import type { SignedRegistryEntry } from '../signature';
import type * as SigningKeys from '../signing-keys';
import {
	REGISTRY_FIXTURE,
	PREVIEW_KEY,
	PRODUCTION_KEY,
	signRelease,
} from './signing-fixtures';

// oxlint-disable-next-line anti-slop/no-module-mocking -- The tests cannot sign with Inth's keys, so they trust test keys in their place; the verifier is the real one.
vi.mock('../signing-keys', async () => ({
	SIGNING_KEYS: (await import('./signing-fixtures')).TEST_SIGNING_KEYS,
}));

const URL_ = 'https://cdn.vendor.example/vendor.js';
const INTEGRITY =
	'sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC';

const DAY_MS = 24 * 60 * 60 * 1000;

const signed = (overrides: Partial<Parameters<typeof signRelease>[0]> = {}) =>
	signRelease({ integrity: INTEGRITY, url: URL_, ...overrides });

describe('verifyReleaseSignature', () => {
	test('accepts a signature the registry made, over the bytes it signs, until it expires', async () => {
		const statement = releaseStatement({
			expiresAt: REGISTRY_FIXTURE.signature.expiresAt,
			integrity: REGISTRY_FIXTURE.integrity,
			sha256: REGISTRY_FIXTURE.signature.sha256,
			signedAt: REGISTRY_FIXTURE.signature.signedAt,
			url: REGISTRY_FIXTURE.url,
		});
		expect(new TextDecoder().decode(statement ?? undefined)).toBe(
			[
				'inth-script-registry-v2',
				'released',
				REGISTRY_FIXTURE.url,
				REGISTRY_FIXTURE.integrity,
				'a'.repeat(64),
				'2026-11-18T10:00:00.000Z',
				'2026-12-02T10:00:00.000Z',
			].join('\n')
		);
		const input = {
			integrity: REGISTRY_FIXTURE.integrity,
			signature: REGISTRY_FIXTURE.signature,
			url: REGISTRY_FIXTURE.url,
		};
		vi.useFakeTimers({ toFake: ['Date'] });
		try {
			vi.setSystemTime(new Date('2026-12-02T09:59:59.999Z'));
			expect(await verifyReleaseSignature(input)).toBe(true);
			vi.setSystemTime(new Date('2026-12-02T10:00:00.000Z'));
			expect(await verifyReleaseSignature(input)).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});

	test('accepts a release signature from a pinned key', async () => {
		expect(
			await verifyReleaseSignature({
				integrity: INTEGRITY,
				signature: signed(),
				url: URL_,
			})
		).toBe(true);
	});

	test('reads a protocol-relative vendor URL as https', async () => {
		expect(
			await verifyReleaseSignature({
				integrity: INTEGRITY,
				signature: signed({ url: 'https://bat.bing.com/bat.js' }),
				url: '//bat.bing.com/bat.js',
			})
		).toBe(true);
	});

	test('ignores a fragment and a trailing dot on the vendor host', async () => {
		expect(
			await verifyReleaseSignature({
				integrity: INTEGRITY,
				signature: signed(),
				url: 'https://cdn.vendor.example./vendor.js#loaded',
			})
		).toBe(true);
	});

	test('ignores an empty query, as the registry signs the URL without it', async () => {
		expect(
			await verifyReleaseSignature({
				integrity: INTEGRITY,
				signature: signed(),
				url: 'https://cdn.vendor.example/vendor.js?',
			})
		).toBe(true);
	});

	test("resolves a path against the page's base URL, as the browser does", async () => {
		vi.stubGlobal('location', { href: 'https://shop.example/cart' });
		vi.stubGlobal('document', { baseURI: 'https://assets.example/' });
		const input = { integrity: INTEGRITY, url: '/scripts/at.js' };
		try {
			expect(
				await verifyReleaseSignature({
					...input,
					signature: signed({ url: 'https://assets.example/scripts/at.js' }),
				})
			).toBe(true);
			expect(
				await verifyReleaseSignature({
					...input,
					signature: signed({ url: 'https://shop.example/scripts/at.js' }),
				})
			).toBe(false);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	test('accepts a release signed up to a day ahead, as a slow clock sees one signed just now', async () => {
		expect(
			await verifyReleaseSignature({
				integrity: INTEGRITY,
				signature: signed({
					expiresAt: new Date(Date.now() + 14 * DAY_MS).toISOString(),
					signedAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
				}),
				url: URL_,
			})
		).toBe(true);
	});

	test('reads signedAt in any ISO form that names the same instant', async () => {
		const original = signed();
		const signature = {
			...original,
			signedAt: original.signedAt.replace('.000Z', 'Z'),
		};
		expect(
			await verifyReleaseSignature({
				integrity: INTEGRITY,
				signature,
				url: URL_,
			})
		).toBe(true);
	});

	test.each([
		[
			'a key other than the one its id pins',
			{
				...signed(),
				keyId: PRODUCTION_KEY.id,
				value: signed({ key: PREVIEW_KEY }).value,
			},
		],
		['an unknown key id', { ...signed(), keyId: 'unknown-key' }],
		['the preview key, in production', signed({ key: PREVIEW_KEY })],
		['a fetched statement', signed({ statement: 'fetched' })],
		[
			'a signature over other bytes',
			signed({ integrity: `sha384-${'B'.repeat(64)}` }),
		],
		[
			'a signature for another vendor URL',
			signed({ url: 'https://evil.example/vendor.js' }),
		],
		['another sha256', { ...signed(), sha256: 'c'.repeat(64) }],
		[
			'another signing time',
			{
				...signed(),
				signedAt: new Date(Date.parse(signed().signedAt) + 1).toISOString(),
			},
		],
		[
			'another expiry',
			{
				...signed(),
				expiresAt: new Date(Date.parse(signed().expiresAt) - 1).toISOString(),
			},
		],
		['a time that does not parse', { ...signed(), signedAt: 'yesterday' }],
		['an expiry that does not parse', { ...signed(), expiresAt: 'soon' }],
		[
			'an expired signature',
			signed({
				expiresAt: new Date(Date.now() - 1000).toISOString(),
				signedAt: new Date(Date.now() - DAY_MS).toISOString(),
			}),
		],
		[
			'a signature valid for longer than 14 days',
			signed({
				expiresAt: new Date(Date.now() + 14 * DAY_MS).toISOString(),
				signedAt: new Date(Date.now() - 1000).toISOString(),
			}),
		],
		[
			'an expiry before the signing time',
			signed({
				expiresAt: new Date(Date.now() + DAY_MS).toISOString(),
				signedAt: new Date(Date.now() + 2 * DAY_MS).toISOString(),
			}),
		],
		[
			'a release signed more than a day from now',
			signed({
				expiresAt: new Date(Date.now() + 15 * DAY_MS).toISOString(),
				signedAt: new Date(Date.now() + DAY_MS + 60_000).toISOString(),
			}),
		],
		['the previous format', signed({ format: 'inth-script-registry-v1' })],
		['a signature that is not 64 bytes', { ...signed(), value: 'AAAA' }],
		['a signature that is not base64', { ...signed(), value: 'not base64 !' }],
	])('refuses %s', async (_name, signature) => {
		expect(
			await verifyReleaseSignature({
				integrity: INTEGRITY,
				signature,
				url: URL_,
			})
		).toBe(false);
	});

	test('trusts the preview key only when asked to, and then not the production key', async () => {
		const preview = signed({ key: PREVIEW_KEY });
		const input = { integrity: INTEGRITY, url: URL_ };
		expect(
			await verifyReleaseSignature({ ...input, signature: preview }, 'preview')
		).toBe(true);
		expect(
			await verifyReleaseSignature({ ...input, signature: signed() }, 'preview')
		).toBe(false);
	});

	test('refuses a line break that would move one field into the next', () => {
		expect(
			releaseStatement({
				expiresAt: '2026-12-02T10:00:00.000Z',
				integrity: `${INTEGRITY}\n${'a'.repeat(64)}`,
				sha256: 'a'.repeat(64),
				signedAt: '2026-11-18T10:00:00.000Z',
				url: URL_,
			})
		).toBeNull();
	});
});

describe('parseRegistrySignature', () => {
	test('reads five strings and ignores fields it does not know', () => {
		const signature = signed();
		expect(parseRegistrySignature({ ...signature, extra: 1 })).toEqual(
			signature
		);
	});

	test('reads anything else as malformed', () => {
		expect(parseRegistrySignature('signature')).toBeNull();
		expect(parseRegistrySignature({ ...signed(), sha256: 1 })).toBeNull();
		const { expiresAt: _expiresAt, ...withoutExpiry } = signed();
		expect(parseRegistrySignature(withoutExpiry)).toBeNull();
	});
});

describe('createRegistryVerifier', () => {
	/** The verdict for `entry` before and after its check finishes. */
	const verdicts = async (
		entry: SignedRegistryEntry,
		requireSignatures: boolean,
		url = URL_
	) => {
		let calls = 0;
		let done: () => void = () => undefined;
		const settled = new Promise<void>((resolve) => {
			done = resolve;
		});
		const verify = createRegistryVerifier({
			keys: 'production',
			onSettled: () => {
				calls += 1;
				done();
			},
			requireSignatures,
		});
		const first = verify(url, entry);
		if (first === 'wait') {
			await settled;
		}
		return { after: verify(url, entry), calls, first };
	};

	describe.each([true, false])('with requireSignatures: %s', (required) => {
		test('waits on a valid signature, then loads it', async () => {
			const { calls, first, after } = await verdicts(
				{ integrity: INTEGRITY, signature: signed() },
				required
			);
			expect([first, after]).toEqual(['wait', 'load']);
			expect(calls).toBe(1);
		});

		test.each([
			['from another key', () => ({ ...signed(), keyId: 'unknown-key' })],
			['over a fetched statement', () => signed({ statement: 'fetched' })],
		])('refuses a signature %s', async (_name, signature) => {
			const { first, after } = await verdicts(
				{ integrity: INTEGRITY, signature: signature() },
				required
			);
			expect([first, after]).toEqual(['wait', 'refuse']);
		});

		test("refuses a signature over another integrity than the entry's", async () => {
			const { after } = await verdicts(
				{ integrity: `sha384-${'B'.repeat(64)}`, signature: signed() },
				required
			);
			expect(after).toBe('refuse');
		});

		test('refuses a signature for another vendor URL', async () => {
			const { after } = await verdicts(
				{ integrity: INTEGRITY, signature: signed() },
				required,
				'https://cdn.other.example/vendor.js'
			);
			expect(after).toBe('refuse');
		});

		test('refuses a malformed signature at once', async () => {
			const { first } = await verdicts(
				{ integrity: INTEGRITY, signature: null },
				required
			);
			expect(first).toBe('refuse');
		});

		test(`${required ? 'refuses' : 'loads'} an entry with no signature`, async () => {
			const { first } = await verdicts({ integrity: INTEGRITY }, required);
			expect(first).toBe(required ? 'refuse' : 'load');
		});
	});

	test('refuses an entry its verdict loaded once its signature expires', async () => {
		const url = 'https://cdn.vendor.example/expiring.js';
		const expiresAt = new Date(Date.now() + DAY_MS).toISOString();
		const entry = {
			integrity: INTEGRITY,
			signature: signed({
				expiresAt,
				signedAt: new Date(Date.now() - DAY_MS).toISOString(),
				url,
			}),
		};
		let done: () => void = () => undefined;
		const settled = new Promise<void>((resolve) => {
			done = resolve;
		});
		const verify = createRegistryVerifier({
			keys: 'production',
			onSettled: () => done(),
			requireSignatures: false,
		});
		expect(verify(url, entry)).toBe('wait');
		await settled;
		expect(verify(url, entry)).toBe('load');
		vi.useFakeTimers({ toFake: ['Date'] });
		try {
			vi.setSystemTime(new Date(expiresAt));
			expect(verify(url, entry)).toBe('refuse');
			expect(
				createRegistryVerifier({
					keys: 'production',
					requireSignatures: false,
				})(url, entry)
			).toBe('refuse');
		} finally {
			vi.useRealTimers();
		}
	});

	test('checks each entry once, across verifiers', async () => {
		const verify = vi.spyOn(crypto.subtle, 'verify');
		const url = 'https://cdn.vendor.example/once.js';
		const entry = { integrity: INTEGRITY, signature: signed({ url }) };
		let done: () => void = () => undefined;
		const settled = new Promise<void>((resolve) => {
			done = resolve;
		});
		const a = createRegistryVerifier({
			keys: 'production',
			onSettled: () => done(),
			requireSignatures: true,
		});
		const b = createRegistryVerifier({
			keys: 'production',
			requireSignatures: true,
		});
		expect([a(url, entry), b(url, entry)]).toEqual(['wait', 'wait']);
		await settled;
		expect([a(url, entry), b(url, entry)]).toEqual(['load', 'load']);
		expect(verify).toHaveBeenCalledOnce();
		verify.mockRestore();
	});
});

describe('a cache that starts over', () => {
	/** Calls `verify` on one unknown-key entry per URL; resolves once all settle. */
	const settleAll = async (count: number, prefix: string) => {
		let done = 0;
		let resolveAll: () => void = () => undefined;
		const all = new Promise<void>((resolve) => {
			resolveAll = resolve;
		});
		const verify = createRegistryVerifier({
			keys: 'production',
			onSettled: () => {
				done += 1;
				if (done === count) {
					resolveAll();
				}
			},
			requireSignatures: true,
		});
		const entry = {
			integrity: INTEGRITY,
			signature: { ...signed(), keyId: 'unknown-key' },
		};
		const urls = Array.from(
			{ length: count },
			(_, index) => `https://cdn.vendor.example/${prefix}/${index}.js`
		);
		for (const url of urls) {
			expect(verify(url, entry)).toBe('wait');
		}
		await all;
		return urls.map((url) => verify(url, entry));
	};

	test('a verifier keeps every verdict for a list longer than the cache', async () => {
		const verdicts = await settleAll(513, 'long');
		expect(verdicts.filter((verdict) => verdict !== 'refuse')).toEqual([]);
	});

	test('a verifier keeps its verdict for an entry the cache dropped; a new one checks again', async () => {
		const url = 'https://cdn.vendor.example/dropped.js';
		const entry = { integrity: INTEGRITY, signature: signed({ url }) };
		let resolveSettled: () => void = () => undefined;
		const settled = new Promise<void>((resolve) => {
			resolveSettled = resolve;
		});
		const first = createRegistryVerifier({
			keys: 'production',
			onSettled: () => resolveSettled(),
			requireSignatures: true,
		});
		expect(first(url, entry)).toBe('wait');
		await settled;

		await settleAll(512, 'fill');

		expect(first(url, entry)).toBe('load');
		const later = createRegistryVerifier({
			keys: 'production',
			requireSignatures: true,
		});
		expect(later(url, entry)).toBe('wait');
	});
});

// The registry signs with these key ids; a change here must
// match the keys the registry signs with
describe('the pinned keys', () => {
	test('pin an active and a standby key in each environment, and none in both', async () => {
		const { SIGNING_KEYS } =
			await vi.importActual<typeof SigningKeys>('../signing-keys');
		expect([...SIGNING_KEYS.production.keys()]).toEqual([
			'c8a6463e-b429-4962-a93c-1e81f9b9ea1a',
			'0c87a4ce-e4b5-44bf-aa5e-4a306153ab14',
		]);
		expect([...SIGNING_KEYS.preview.keys()]).toEqual([
			'3cdc334c-86f8-4164-8f54-c8144b1d7196',
			'031a64eb-ac16-4383-9cd5-54ff358d4b0b',
		]);
	});
});
