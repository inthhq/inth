/**
 * Browser-resolved manifest transport for the `client-manifest` arm.
 *
 * The SvelteKit layer resolves manifests on the server by default
 * (`inthHandle` with `manifest()`, plus `createConsentRoute`). This arm
 * exists so the suite can price the alternative: fetch the CDN-cacheable
 * manifest once and resolve `/init` in the page, trading an `/init`
 * round-trip for the resolver plus the translation catalogue.
 *
 * It mirrors what `@inth/vue` does for `manifest: 'client'` — the resolver,
 * the catalogue and the manifest all load lazily and in parallel with
 * hydration, so the import cost is not serialized behind it.
 */
import { createV1HostedTransport } from '@inth/sdk/engine';
import type { KernelTransport } from '@inth/sdk/engine';
import type { ConsentManifest } from '@inth/sdk/schema/types';

const BACKEND_URL = '/api/bench-consent';
const MANIFEST_URL = '/api/bench-consent/v1/consent/manifest';

type Settled<Value> =
	| { ok: true; value: Value }
	| { ok: false; error: unknown };

const settle = async function settle<Value>(
	promise: Promise<Value>
): Promise<Settled<Value>> {
	try {
		return { ok: true, value: await promise };
	} catch (error) {
		return { error, ok: false };
	}
};

const fetchManifest = async function fetchManifest(): Promise<ConsentManifest> {
	const response = await fetch(MANIFEST_URL, {
		headers: { accept: 'application/json' },
		method: 'GET',
	});
	if (!response.ok) {
		throw new Error(
			`sveltekit-browser-bench: /manifest responded ${response.status}`
		);
	}
	return (await response.json()) as ConsentManifest;
};

/**
 * Build the browser manifest transport for the `client-manifest` arm.
 *
 * @returns A transport that resolves `/init` from a fetched manifest and
 * posts consent to the fixture backend.
 */
export const createBrowserManifestTransport =
	function createBrowserManifestTransport(): KernelTransport {
		const hostedTransport = createV1HostedTransport({
			projectUrl: BACKEND_URL,
		});
		let manifestTransport: KernelTransport | undefined;

		// Started eagerly so the resolver, the catalogue and the manifest
		// fetch overlap hydration instead of queueing behind it.
		const loadResources = () =>
			settle(
				Promise.all([
					import('@inth/sdk/transports/manifest'),
					import('@inth/sdk/translations/all'),
					fetchManifest(),
				])
			);

		let resources = typeof window === 'undefined' ? undefined : loadResources();

		return {
			async init(context) {
				if (typeof window === 'undefined') {
					return {};
				}
				resources ??= loadResources();
				const loaded = await resources;
				if (!loaded.ok) {
					resources = undefined;
					throw loaded.error;
				}
				const [{ createManifestTransport }, { baseTranslations }, manifest] =
					loaded.value;
				manifestTransport ??= createManifestTransport({
					baseTranslations,
					manifestUrl: MANIFEST_URL,
					projectUrl: BACKEND_URL,
					snapshot: manifest,
				});
				return (await manifestTransport.init?.(context)) ?? {};
			},
			save: (payload) => hostedTransport.save(payload),
		};
	};
