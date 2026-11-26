import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { withScriptUrl } from '../_shared/script-url';

/** Vector's consent-gated pixel loader and nested argument queue. */
export const vectorManifest = {
	...vendorManifestContract,
	category: 'marketing',
	install: [
		{
			ifUndefined: true,
			name: 'vector',
			type: 'setGlobal',
			value: { loaded: true, q: [] },
		},
		{
			methods: ['load', 'identify', 'on'],
			preserveExisting: true,
			queue: { property: 'q' },
			queueFormat: 'nameAndArgs',
			target: 'vector',
			type: 'defineQueueMethods',
		},
		{
			args: ['{{pixelId}}'],
			global: 'vector',
			method: 'load',
			type: 'callGlobal',
		},
		{
			async: true,
			src: 'https://cdn.vector.co/pixel.js',
			type: 'loadScript',
		},
	],
	persistAfterConsentRevoked: true,
	vendor: 'vector',
	vendorDetails: {
		homepageUrl: 'https://www.vector.co/',
		legalName: 'GetVector, Inc.',
		name: 'Vector',
		privacyPolicyUrl: 'https://www.vector.co/legal/privacy',
	},
} as const satisfies VendorManifest;

/** Public configuration from Vector's Settings > Pixel page. */
export interface VectorOptions {
	/** Pixel ID passed to vector.load in your account's install snippet. */
	pixelId: string;
	/** Override the SDK URL. Blank values use https://cdn.vector.co/pixel.js. */
	scriptUrl?: string;
}

/**
 * Builds the serializable manifest behind {@link vector}. `pixelId` must
 * already be a trimmed, non-empty pixel ID.
 */
export const resolveVectorManifest = function resolveVectorManifest({
	pixelId,
}: Omit<VectorOptions, 'scriptUrl'>): ResolvedManifest {
	return getCompiledManifest(vectorManifest, { pixelId });
};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; its other options stay npm-only. Marked pure so a bundler drops
 * it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'vector',
		{
			pixelId: {
				example: '6a3c2f1e-8b4d-4c7a-9e5f-0d1b2c3a4e5f',
				kind: 'id',
				label: 'Pixel ID',
				pattern: '^[A-Za-z0-9_-]+$',
				required: true,
			},
		},
		resolveVectorManifest
	);

/**
 * Loads Vector after marketing consent, once per page.
 *
 * @returns A consent-gated script, or a skipped script for an invalid ID.
 * @remarks A missing or blank pixelId logs an error and skips loading.
 * Vector has no documented stop API. Keep reload on revocation enabled;
 * without a reload, running or in-flight vendor code can continue.
 * @example vector({ pixelId: 'YOUR_VECTOR_PIXEL_ID' });
 * @see https://learn.vector.co/articles/5402074849-adding-the-pixel-to-your-site
 */
export const vector = function vector(options: VectorOptions): Script {
	const pixelId = readId(options?.pixelId);
	if (pixelId === undefined) {
		return skipMissingId('vector', 'pixelId', {
			category: 'marketing',
			manifest: vectorManifest,
		});
	}

	return withScriptUrl(
		resolvedManifestToScript(resolveVectorManifest({ pixelId })),
		options.scriptUrl
	);
};
