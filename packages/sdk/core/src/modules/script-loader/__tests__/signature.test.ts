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

const signed = (overrides: Partial<Parameters<typeof signRelease>[0]> = {}) =>
	signRelease({ integrity: INTEGRITY, url: URL_, ...overrides });

describe('verifyReleaseSignature', () => {
	test('accepts a signature the registry made, over the bytes it signs', async () => {
		const statement = releaseStatement({
			integrity: REGISTRY_FIXTURE.integrity,
			sha256: REGISTRY_FIXTURE.signature.sha256,
			signedAt: REGISTRY_FIXTURE.signature.signedAt,
			url: REGISTRY_FIXTURE.url,
		});
		expect(new TextDecoder().decode(statement ?? undefined)).toBe(
			[
				'inth-script-registry-v1',
				'released',
				REGISTRY_FIXTURE.url,
				REGISTRY_FIXTURE.integrity,
				'a'.repeat(64),
				'2026-11-18T10:00:00.000Z',
			].join('\n')
		);
		expect(
			await verifyReleaseSignature({
				integrity: REGISTRY_FIXTURE.integrity,
				signature: REGISTRY_FIXTURE.signature,
				url: REGISTRY_FIXTURE.url,
			})
		).toBe(true);
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

	test('reads signedAt in any ISO form that names the same instant', async () => {
		const signature = { ...signed(), signedAt: '2026-11-19T09:30:00Z' };
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
			{ ...signed(), signedAt: '2026-11-19T09:30:00.001Z' },
		],
		['a time that does not parse', { ...signed(), signedAt: 'yesterday' }],
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
				integrity: `${INTEGRITY}\n${'a'.repeat(64)}`,
				sha256: 'a'.repeat(64),
				signedAt: '2026-11-18T10:00:00.000Z',
				url: URL_,
			})
		).toBeNull();
	});
});

describe('parseRegistrySignature', () => {
	test('reads four strings and ignores fields it does not know', () => {
		const signature = signed();
		expect(parseRegistrySignature({ ...signature, extra: 1 })).toEqual(
			signature
		);
	});

	test('reads anything else as malformed', () => {
		expect(parseRegistrySignature('signature')).toBeNull();
		expect(parseRegistrySignature({ ...signed(), sha256: 1 })).toBeNull();
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

describe('the pinned keys', () => {
	test('pin one production and one preview key, each in its own environment', async () => {
		const { SIGNING_KEYS } =
			await vi.importActual<typeof SigningKeys>('../signing-keys');
		expect([...SIGNING_KEYS.production.keys()]).toEqual([
			'c8a6463e-b429-4962-a93c-1e81f9b9ea1a',
		]);
		expect([...SIGNING_KEYS.preview.keys()]).toEqual([
			'3cdc334c-86f8-4164-8f54-c8144b1d7196',
		]);
	});
});
