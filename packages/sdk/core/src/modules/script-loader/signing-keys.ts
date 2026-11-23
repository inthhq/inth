/**
 * The Inth script registry's public signing keys. A new key must be listed
 * here before it signs anything clients load.
 */

/** Whose signing keys Inth trusts. */
export type RegistrySigningKeys = 'production' | 'preview';

/**
 * The registry's public signing keys by key id, as SubjectPublicKeyInfo in
 * base64. Each environment trusts its own keys alone, so a preview
 * signature never passes in production.
 *
 * Each environment pins two keys. The first signs today. The second is a
 * standby that the signing service cannot reach; it signs only after the
 * first is rotated out or leaks, so that needs no new SDK. A retired key
 * can go once the release signatures it made have expired, 14 days after it
 * last signed.
 */
export const SIGNING_KEYS: Readonly<
	Record<RegistrySigningKeys, ReadonlyMap<string, string>>
> = {
	preview: new Map([
		[
			'3cdc334c-86f8-4164-8f54-c8144b1d7196',
			'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEbQLWWtlM5w6BBfAeUN+n6d0JX0IcTIfiyM4tHYFNttCtkGdRhpkVDiQRkhgF1nRpI0b9SZKuDLRXGRdPaVboyA==',
		],
		// Standby
		[
			'031a64eb-ac16-4383-9cd5-54ff358d4b0b',
			'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEHCg/djhoeKOI5WdEEWlqUfCjqWELZiHTbYH8NfSdkocXs2KCQPt+zFyLlQ3wR20M5A2IitHPuERm3cqgIVRQ9Q==',
		],
	]),
	production: new Map([
		[
			'c8a6463e-b429-4962-a93c-1e81f9b9ea1a',
			'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEFlSX0P3rj6dAi/AyLDrIzHKMCOOmbemduQYDnFeGaCzupC5uYz1eFcrbN4B8kRohXWKRNSW1PfP7yIw3Ytu0JQ==',
		],
		// Standby
		[
			'0c87a4ce-e4b5-44bf-aa5e-4a306153ab14',
			'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE9iUKSP3xg80apNGOtHBNQoKvvRZnr4EqQi7EPxw7oGQrWC/z5mR1Y8GwgTOQ2Dwjgd3R2TlcL+Cf/C9qQ+QbcA==',
		],
	]),
};
