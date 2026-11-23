/**
 * Test keys for the script registry's release signatures. A test file
 * trusts them in place of Inth's keys with:
 *
 * ```ts
 * vi.mock('<path>/modules/script-loader/signing-keys', async () => ({
 * 	SIGNING_KEYS: (await import('<path>/signing-fixtures')).TEST_SIGNING_KEYS,
 * }));
 * ```
 */
import { generateKeyPairSync, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

import type { RegistrySignature } from '../script-signature.model';

const keyPair = () => {
	const { privateKey, publicKey } = generateKeyPairSync('ec', {
		namedCurve: 'P-256',
	});
	return {
		privateKey,
		publicKey: publicKey
			.export({ format: 'der', type: 'spki' })
			.toString('base64'),
	};
};

export const PRODUCTION_KEY = { id: 'production-test-key', ...keyPair() };
export const PREVIEW_KEY = { id: 'preview-test-key', ...keyPair() };

/**
 * A release signature made by the registry's signing code: it built the
 * bytes, signed them in DER and converted the result to the 64-byte form
 * an entry carries. Valid from 18 November to 2 December 2026; a test that
 * checks it sets the clock inside that time. Over:
 *
 * ```
 * inth-script-registry-v2
 * released
 * https://cdn.vendor.example/vendor.js
 * sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC
 * aaaa…aaaa (64)
 * 2026-11-18T10:00:00.000Z
 * 2026-12-02T10:00:00.000Z
 * ```
 */
export const REGISTRY_FIXTURE = {
	integrity:
		'sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC',
	publicKey:
		'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEj8on8BZQxo8ZR2Tqn4e6+Ju3IfUdweJJ+GHYHPFZ1f6Rxa9JCKQ6TD4sNqww6PaShbPwLJPTOVOx5s+mbaZ11A==',
	signature: {
		expiresAt: '2026-12-02T10:00:00.000Z',
		keyId: 'registry-fixture-key',
		sha256: 'a'.repeat(64),
		signedAt: '2026-11-18T10:00:00.000Z',
		value:
			'5NUvCjq5F6yj6RXJjVS6wLpx5m05DsIVliOaYLWiADS/CeWO32lfYB+MoIZLCJmNlbIS/MlyZQoa9AwJvE+Kig==',
	} satisfies RegistrySignature,
	url: 'https://cdn.vendor.example/vendor.js',
};

/** The keys the tests trust: production with the fixture's, and preview. */
export const TEST_SIGNING_KEYS = {
	preview: new Map([[PREVIEW_KEY.id, PREVIEW_KEY.publicKey]]),
	production: new Map([
		[PRODUCTION_KEY.id, PRODUCTION_KEY.publicKey],
		[REGISTRY_FIXTURE.signature.keyId, REGISTRY_FIXTURE.publicKey],
	]),
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * A signature over `url` and `integrity` in the registry's signing format,
 * built here and not by Inth, as the registry would make it. By default it
 * was signed an hour ago, on a whole second, and runs 14 days from then.
 * `statement` signs another statement than `released`; `format` another
 * format line.
 */
export const signRelease = (input: {
	url: string;
	integrity: string;
	key?: { id: string; privateKey: KeyObject };
	statement?: string;
	format?: string;
	signedAt?: string;
	expiresAt?: string;
}): RegistrySignature => {
	const key = input.key ?? PRODUCTION_KEY;
	const sha256 = 'b'.repeat(64);
	const signedAt =
		input.signedAt ??
		new Date(Math.floor((Date.now() - HOUR_MS) / 1000) * 1000).toISOString();
	const expiresAt =
		input.expiresAt ??
		new Date(Date.parse(signedAt) + 14 * DAY_MS).toISOString();
	const bytes = new TextEncoder().encode(
		[
			input.format ?? 'inth-script-registry-v2',
			input.statement ?? 'released',
			new URL(input.url).href,
			input.integrity,
			sha256,
			signedAt,
			...(input.statement === 'fetched' ? [] : [expiresAt]),
		].join('\n')
	);
	return {
		expiresAt,
		keyId: key.id,
		sha256,
		signedAt,
		value: sign('sha256', bytes, {
			dsaEncoding: 'ieee-p1363',
			key: key.privateKey,
		}).toString('base64'),
	};
};
