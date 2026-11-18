import { createStaticConsentResolver } from '@inth/nextjs/static';
import type { StaticConsentResolverOptions } from '@inth/nextjs/static';
import {
	buildSubjectPostBody,
	c15tVersionHeaders,
	mapInitOutputToInitResponse,
} from '@inth/sdk/transports';
import type { KernelTransport } from '@inth/sdk/transports';

/**
 * The manifest shape `@inth/nextjs/static` resolves from. Taken from the
 * package so the fixture needs no direct `@inth/sdk/schema` dependency.
 */
export type CompatManifest = StaticConsentResolverOptions['manifest'];

export interface StaticTransportOptions {
	/** Absolute backend URL used for `POST /subjects`. */
	projectUrl: string;
	/** Manifest generated at build time by `createStaticManifestModule`. */
	manifest: CompatManifest;
	/**
	 * Optional geo endpoint for `createStaticConsentResolver`. Without one,
	 * init resolves to the manifest's unknown-location policy.
	 */
	geoUrl?: string;
}

const resolveDomain = function resolveDomain(projectUrl: string): string {
	if (typeof window !== 'undefined' && window.location?.hostname) {
		return window.location.hostname;
	}
	try {
		return new URL(projectUrl).hostname;
	} catch {
		return 'localhost';
	}
};

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
	const base = projectUrl.endsWith('/') ? projectUrl.slice(0, -1) : projectUrl;

	return {
		async init() {
			return mapInitOutputToInitResponse(await resolution.resolved, {});
		},
		async save(payload) {
			const response = await fetch(`${base}/subjects`, {
				body: JSON.stringify(
					buildSubjectPostBody(payload, { domain: resolveDomain(base) })
				),
				credentials: 'include',
				headers: {
					accept: 'application/json',
					'content-type': 'application/json',
					...c15tVersionHeaders,
				},
				method: 'POST',
			});
			if (!response.ok) {
				throw new Error(
					`next-compat static transport: /subjects responded ${response.status} ${response.statusText}`
				);
			}
			return (await response.json()) as { ok: boolean; subjectId?: string };
		},
	};
};
