import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { resolveScriptUrl } from '../_shared/script-url';

export interface LinkedInInsightsConversionEvent {
	conversion_id: string | number;
	[key: string]: unknown;
}

interface LinkedInInsightsFunction {
	(command: 'track', event: LinkedInInsightsConversionEvent): void;
	(command: string, ...args: unknown[]): void;
}

declare global {
	interface Window {
		lintrk: LinkedInInsightsFunction & { q?: unknown[][] };
		_linkedin_partner_id?: string;
		_linkedin_data_partner_ids?: string[];
		ORIBILI?: {
			_DEBUG?: {
				disableScript?: () => void;
			};
		};
	}
}

/**
 * LinkedIn Insight Tag vendor manifest.
 */
export const linkedinInsightsManifest = {
	...vendorManifestContract,
	category: 'marketing',
	install: [
		{
			ifUndefined: false,

			name: '_linkedin_partner_id',
			type: 'setGlobal',
			value: '{{id}}',
		},
		{
			ifUndefined: true,

			name: '_linkedin_data_partner_ids',
			type: 'setGlobal',
			value: [],
		},
		{
			queue: '_linkedin_data_partner_ids',
			type: 'pushToQueue',
			value: '{{id}}',
		},
		{
			ifUndefined: true,

			name: 'lintrk',
			queue: {
				property: 'q',
			},
			queueFormat: 'array',
			type: 'defineStubFunction',
		},
		{
			async: true,

			src: '{{scriptSrc}}',
			type: 'loadScript',
		},
	],
	vendor: 'linkedin-insights',
	vendorDetails: {
		homepageUrl: 'https://business.linkedin.com/advertise/ads/insight-tag',
		name: 'LinkedIn Insight Tag',
		privacyPolicyUrl: 'https://www.linkedin.com/legal/privacy-policy',
	},
} as const satisfies VendorManifest;

export interface LinkedInInsightsOptions {
	/**
	 * Your LinkedIn Insight Tag partner ID.
	 *
	 * LinkedIn shows this in Campaign Manager under Data -> Signals manager ->
	 * Insight Tag.
	 *
	 * @example `123456789012345`
	 */
	id: string;

	/** LinkedIn Insight Tag loader URL. */
	scriptSrc?: string;
}

/**
 * Builds the serializable manifest behind {@link linkedinInsights}. `id` must
 * already be a trimmed, non-empty partner ID.
 */
export const resolveLinkedinInsightsManifest =
	function resolveLinkedinInsightsManifest({
		id,
		scriptSrc,
	}: LinkedInInsightsOptions): ResolvedManifest {
		return getCompiledManifest(linkedinInsightsManifest, {
			id,
			scriptSrc: resolveScriptUrl(
				scriptSrc,
				'https://snap.licdn.com/li.lms-analytics/insight.min.js'
			),
		});
	};

/**
 * LinkedIn Insight Tag script.
 *
 * @remarks When `id` is missing or blank, the
 *   helper logs `linkedinInsights: missing or invalid id` with
 *   `console.error` and returns a script that never loads.
 *
 * @example
 * ```ts
 * const linkedinInsightsScript = linkedinInsights({
 *   id: '123456789012345',
 * });
 * ```
 *
 * @see {@link https://www.linkedin.com/help/lms/answer/a418880} Add the LinkedIn Insight Tag to your website
 */
export const linkedinInsights = function linkedinInsights(
	options: LinkedInInsightsOptions
): Script {
	const normalizedId = readId(options.id);
	if (normalizedId === undefined) {
		return skipMissingId('linkedinInsights', 'id', {
			category: 'marketing',
			manifest: linkedinInsightsManifest,
		});
	}

	return resolvedManifestToScript(
		resolveLinkedinInsightsManifest({ ...options, id: normalizedId })
	);
};
