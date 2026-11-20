import { createStaticConsentResolver } from '@inth/nextjs/static';
import type { StaticConsentResolverOptions } from '@inth/nextjs/static';
import {
	createV1RecordTransport,
	mapInitOutputToInitResponse,
} from '@inth/sdk/transports';
import type { KernelTransport } from '@inth/sdk/transports';

/**
 * The manifest shape `@inth/nextjs/static` resolves from. Taken from the
 * package so the fixture needs no direct `@inth/sdk/schema` dependency.
 */
export type CompatManifest = StaticConsentResolverOptions['manifest'];

export interface StaticTransportOptions {
	/** Absolute project URL used for `POST /v1/consent/records`. */
	projectUrl: string;
	/** Manifest generated at build time by `createStaticManifestModule`. */
	manifest: CompatManifest;
	/**
	 * Optional geo endpoint for `createStaticConsentResolver`. Without one,
	 * init resolves to the manifest's unknown-location policy.
	 */
	geoUrl?: string;
}

/**
 * The `output: 'export'` path: init comes from the manifest bundled into the
 * app through `createStaticConsentResolver`, so the browser fetches nothing
 * to show the banner; only saves reach the backend.
 */
export const createStaticTransport = function createStaticTransport({
	projectUrl,
	manifest,
	geoUrl,
}: StaticTransportOptions): KernelTransport {
	const resolution = createStaticConsentResolver({ geoUrl, manifest });
	const records = createV1RecordTransport({ projectUrl });

	return {
		async init() {
			return mapInitOutputToInitResponse(await resolution.resolved, {});
		},
		save: records.save,
	};
};
