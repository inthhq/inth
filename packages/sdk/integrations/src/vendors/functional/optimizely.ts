import type { AllConsentNames, HasCondition, Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { trimToUndefined, withScriptUrl } from '../_shared/script-url';

declare global {
	interface Window {
		optimizely?: {
			push: (command: Record<string, unknown>) => unknown;
			get?: (module: string) => unknown;
		};
	}
}

/** Optimizely Web Experimentation and Personalization snippet. */
export const optimizelyWebManifest = {
	...vendorManifestContract,
	category: 'experience',
	install: [
		{
			async: false,
			src: 'https://cdn.optimizely.com/js/{{projectId}}.js',
			type: 'loadScript',
		},
	],
	vendor: 'optimizely',
	vendorDetails: {
		homepageUrl: 'https://www.optimizely.com/',
		legalName: 'Optimizely North America Inc.',
		name: 'Optimizely Web Experimentation',
		privacyPolicyUrl: 'https://www.optimizely.com/legal/privacy-notice',
	},
} as const satisfies VendorManifest;

export interface OptimizelyWebOptions {
	/**
	 * Public project number immediately before `.js` in the snippet URL.
	 * Use a string for IDs larger than `Number.MAX_SAFE_INTEGER`.
	 */
	projectId: string | number;
	/**
	 * Consent condition required before the snippet loads.
	 * @default 'experience'
	 */
	category?: HasCondition<AllConsentNames>;
	/**
	 * Custom or proxied Optimizely snippet URL. The project ID remains required.
	 */
	scriptSrc?: string;
	/** CSP nonce for the loader element. */
	nonce?: string;
}

const PROJECT_ID_PATTERN = /^\d+$/u;

/**
 * Builds the serializable manifest behind {@link optimizelyWeb}. The project
 * ID must already be a trimmed project number.
 */
export const resolveOptimizelyWebManifest =
	function resolveOptimizelyWebManifest({
		projectId,
	}: {
		projectId: string;
	}): ResolvedManifest {
		return getCompiledManifest(optimizelyWebManifest, { projectId });
	};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; a custom consent condition, `scriptSrc` and the CSP nonce stay
 * npm-only. Marked pure so a bundler drops it from an npm bundle that never
 * reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'optimizelyWeb',
		{
			projectId: {
				example: '12345678',
				kind: 'id',
				label: 'Project ID',
				pattern: '^[0-9]+$',
				required: true,
			},
		},
		resolveOptimizelyWebManifest
	);

/**
 * Creates an Optimizely Web snippet gated on experience consent.
 *
 * The snippet runs experiments when it executes. Loading it after consent can
 * cause page flicker. `async: false` on a dynamic script does not reproduce
 * Optimizely's recommended parser-blocking snippet at the start of `<head>`.
 * Keep the provider's `reloadOnConsentRevoked` enabled to unload an already-running
 * SDK. A standalone core script loader needs application-owned reload handling.
 *
 * @remarks When `projectId` is missing, blank or not a project number, the
 *   helper logs `optimizelyWeb: missing or invalid projectId` with
 *   `console.error` and returns a script that never loads.
 * @example
 * optimizelyWeb({ projectId: '12345678' });
 * @see https://docs.optimizely.com/web-experimentation/docs/implement-the-one-line-javascript-snippet
 */
export const optimizelyWeb = function optimizelyWeb(
	options: OptimizelyWebOptions
): Script {
	const category = options?.category ?? 'experience';
	const projectId = readId(options?.projectId);
	if (
		projectId === undefined ||
		!PROJECT_ID_PATTERN.test(projectId) ||
		(typeof options.projectId === 'number' &&
			!Number.isSafeInteger(options.projectId))
	) {
		return skipMissingId('optimizelyWeb', 'projectId', {
			category,
			manifest: optimizelyWebManifest,
		});
	}

	return {
		...withScriptUrl(
			resolvedManifestToScript(resolveOptimizelyWebManifest({ projectId })),
			options.scriptSrc
		),
		category,
		nonce: trimToUndefined(options.nonce),
	};
};

/**
 * Requests Optimizely's persistent visitor opt-out through an existing API.
 *
 * Optimizely stores a ten-year `optimizelyOptOut` cookie. To opt back in after
 * consent, the application must delete that cookie or set it to `false`,
 * then reload so the permitted snippet can run. An API command alone cannot
 * restart a blocked snippet. Neither helper resets the opt-out cookie.
 * This utility is never called by `optimizelyWeb` on ordinary revocation.
 * Reload to unload code that already ran; this does not undo page changes.
 * Does nothing during SSR or when no Optimizely API or queue exists.
 *
 * @example
 * optOutOptimizely();
 * @see https://docs.optimizely.com/web-experimentation/api/d8Gy-opt-out
 */
export const optOutOptimizely = function optOutOptimizely(): void {
	if (
		typeof window !== 'undefined' &&
		typeof window.optimizely?.push === 'function'
	) {
		window.optimizely.push({ isOptOut: true, type: 'optOut' });
	}
};
