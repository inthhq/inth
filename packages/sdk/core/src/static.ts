/**
 * `@inth/sdk/static` — consent resolution for statically rendered pages.
 *
 * A static page has no request, so no location headers. It resolves the
 * policy from a manifest bundled at build time: the manifest's
 * unknown-location policy for first paint, then optionally the visitor's
 * regional policy once a geo endpoint answers. Framework static entries
 * (`@inth/nextjs/static`, `@inth/tanstack-start/static`) re-export these.
 */
import type {
	ConsentManifest,
	InitOutput,
	ResolveInitFromManifestInputs,
} from '@inth/sdk-schema/types';
import { resolveInitFromManifest } from '@inth/sdk-schema/types';
import { baseTranslations } from '@inth/sdk-translations/all';

import { hasGlobalPrivacyControlSignal } from './libs/read-global-privacy-control';
import { fetchStaticGeo } from './static.api';
import { readGeoInputs } from './transports/manifest-browser-remote.model';

/** The manifest shape static resolvers and generated modules use. */
export type { ConsentManifest } from '@inth/sdk-schema/types';

/** Location returned by a geo endpoint. Either key spelling is accepted. */
export interface StaticGeoResult {
	country?: string | null;
	countryCode?: string | null;
	region?: string | null;
	regionCode?: string | null;
}

/** Options for {@link createStaticConsentResolver}. */
export interface StaticConsentResolverOptions {
	/** Manifest bundled at build time. */
	manifest: ConsentManifest;

	/** Known location. When set, `initial` already uses the regional policy. */
	geo?: StaticGeoResult | null;

	/**
	 * Endpoint returning {@link StaticGeoResult} JSON. Fetched once when `geo`
	 * is not set; `resolved` then carries the regional policy.
	 */
	geoUrl?: string;

	/** Language for translations. Defaults to the browser language, then `en`. */
	language?: string;

	/** Global Privacy Control signal. Defaults to the browser's value. */
	gpc?: boolean;

	/** Fetch implementation for `geoUrl`. Defaults to `globalThis.fetch`. */
	fetch?: typeof globalThis.fetch;
}

/** Result of {@link createStaticConsentResolver}. */
export interface StaticConsentResolution {
	/**
	 * Synchronous result for first paint. Without `geo`, this is the
	 * manifest's unknown-location policy, the same policy server rendering
	 * picks when location headers are missing.
	 */
	initial: InitOutput;

	/**
	 * Resolves to the regional result once `geo` or `geoUrl` supplies a
	 * location. Resolves to `initial` when neither does or the fetch fails.
	 */
	resolved: Promise<InitOutput>;
}

type LocationFreeInputs = Omit<
	ResolveInitFromManifestInputs,
	'country' | 'region'
>;

const readBrowserLanguage = function readBrowserLanguage(): string | undefined {
	if (typeof navigator === 'undefined') {
		return undefined;
	}
	return navigator.languages?.[0] ?? navigator.language;
};

/**
 * Resolves the init payload for a visitor whose location is unknown.
 *
 * Uses the manifest's configured unknown-location policy (the pack with
 * `match.fallback`, else the one with `match.isDefault`), as server
 * rendering does without location headers. Country and region packs never
 * apply, however strict. When the manifest has packs but neither matcher,
 * the resolution fails with `insufficient-inputs` and the client applies
 * its safe fallback.
 *
 * @param manifest - Manifest bundled at build time.
 * @param inputs - Language and GPC signal. Location is always unknown.
 * @returns The init payload for first paint.
 *
 * @example
 * ```ts
 * import { resolveUnknownLocationInit } from '@inth/sdk-core/static';
 *
 * const init = resolveUnknownLocationInit(consentManifest, { language: 'en' });
 * ```
 */
export const resolveUnknownLocationInit = function resolveUnknownLocationInit(
	manifest: ConsentManifest,
	inputs: LocationFreeInputs = {}
): InitOutput {
	return resolveInitFromManifest(
		manifest,
		{ ...inputs, country: null, region: null },
		{ baseTranslations }
	);
};

/**
 * Resolves consent for a statically rendered page from a bundled manifest.
 *
 * `initial` is available synchronously for first paint. With a `geoUrl`,
 * `resolved` fetches the visitor's location once and resolves the regional
 * policy; a failed or empty geo response keeps `initial`.
 *
 * @param options - Manifest, optional location or geo endpoint, language and
 * GPC signal.
 * @returns The first-paint result and a promise for the regional result.
 *
 * @example
 * ```ts
 * import { createStaticConsentResolver } from '@inth/sdk-core/static';
 *
 * const { initial, resolved } = createStaticConsentResolver({
 * 	manifest: consentManifest,
 * 	geoUrl: '/api/geo',
 * });
 * ```
 */
export const createStaticConsentResolver = function createStaticConsentResolver(
	options: StaticConsentResolverOptions
): StaticConsentResolution {
	const language = options.language ?? readBrowserLanguage() ?? 'en';
	const gpc = options.gpc ?? hasGlobalPrivacyControlSignal();
	const commonInputs = { gpc, language };
	const initialGeo = readGeoInputs(options.geo);
	const hasGeo = Boolean(initialGeo.country || initialGeo.region);
	const initial = hasGeo
		? resolveInitFromManifest(
				options.manifest,
				{ ...commonInputs, ...initialGeo },
				{ baseTranslations }
			)
		: resolveUnknownLocationInit(options.manifest, commonInputs);

	return {
		initial,
		resolved: (async () => {
			if (hasGeo || !options.geoUrl) {
				return initial;
			}
			const resolvedGeo = await fetchStaticGeo(options.geoUrl, options.fetch);
			if (!(resolvedGeo?.country || resolvedGeo?.region)) {
				return initial;
			}
			return resolveInitFromManifest(
				options.manifest,
				{ ...commonInputs, ...resolvedGeo },
				{ baseTranslations }
			);
		})(),
	};
};
