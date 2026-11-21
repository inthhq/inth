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

import type { RegistrySignature } from '../signature';

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
 * an entry carries. Over:
 *
 * ```
 * inth-script-registry-v1
 * released
 * https://cdn.vendor.example/vendor.js
 * sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC
 * aaaa…aaaa (64)
 * 2026-11-18T10:00:00.000Z
 * ```
 */
export const REGISTRY_FIXTURE = {
	integrity:
		'sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC',
	publicKey:
		'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEHLaZfMQjAGV1pt+BeJTnhI0W/Rboli9dKaD0hn64aGYcWpSfFXHrOzME+Bs1OhIDxOSf6ilKk1rjpNltjq1cgA==',
	signature: {
		keyId: 'registry-fixture-key',
		sha256: 'a'.repeat(64),
		signedAt: '2026-11-18T10:00:00.000Z',
		value:
			'PkxXv2QrpfgdCdoiOWpyLHJJQpPiA/0TD6DwSdhD+ow0Z65gpZSutp6nB+cxtFfKeZEl6H3NFu0SY69gxcsK+g==',
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

/**
 * A signature over `url` and `integrity` in the registry's signing format,
 * built here and not by Inth, as the registry would make it. `statement` signs
 * another statement than `released`.
 */
export const signRelease = (input: {
	url: string;
	integrity: string;
	key?: { id: string; privateKey: KeyObject };
	statement?: string;
}): RegistrySignature => {
	const key = input.key ?? PRODUCTION_KEY;
	const sha256 = 'b'.repeat(64);
	const signedAt = '2026-11-19T09:30:00.000Z';
	const bytes = new TextEncoder().encode(
		[
			'inth-script-registry-v1',
			input.statement ?? 'released',
			new URL(input.url).href,
			input.integrity,
			sha256,
			signedAt,
		].join('\n')
	);
	return {
		keyId: key.id,
		sha256,
		signedAt,
		value: sign('sha256', bytes, {
			dsaEncoding: 'ieee-p1363',
			key: key.privateKey,
		}).toString('base64'),
	};
};
