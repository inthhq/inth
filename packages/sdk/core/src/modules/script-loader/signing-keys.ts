/**
 * The Inth script registry's public signing keys. A new key must be listed
 * here before it signs anything clients load.
 */

/** Whose signing keys Inth trusts. */
export type RegistrySigningKeys = 'production' | 'preview';

/**
 * The registry's public signing keys by key id, as SubjectPublicKeyInfo in
 * base64. Each environment trusts its own keys alone, so a preview
 * signature never passes in production. Keep a retired key while versions
 * it signed are served.
 */
export const SIGNING_KEYS: Readonly<
	Record<RegistrySigningKeys, ReadonlyMap<string, string>>
> = {
	preview: new Map([
		[
			'3cdc334c-86f8-4164-8f54-c8144b1d7196',
			'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEbQLWWtlM5w6BBfAeUN+n6d0JX0IcTIfiyM4tHYFNttCtkGdRhpkVDiQRkhgF1nRpI0b9SZKuDLRXGRdPaVboyA==',
		],
	]),
	production: new Map([
		[
			'c8a6463e-b429-4962-a93c-1e81f9b9ea1a',
			'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEFlSX0P3rj6dAi/AyLDrIzHKMCOOmbemduQYDnFeGaCzupC5uYz1eFcrbN4B8kRohXWKRNSW1PfP7yIw3Ytu0JQ==',
		],
	]),
};
