/* oxlint-disable unicorn/no-thenable -- `if` steps have a `then` field. */
import type { Script } from '@inth/sdk/engine';

import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { listDataAttribute } from '../_shared/attributes';
import { levelThreeScript } from '../_shared/level-three';
import { readId, skipMissingId } from '../_shared/required-id';
import { trimToUndefined, withScriptUrl } from '../_shared/script-url';

declare global {
	interface Window {
		pirsch?: (
			eventName: string,
			options?: {
				duration?: number;
				meta?: Record<string, unknown>;
				non_interactive?: boolean;
			}
		) => Promise<null | undefined>;
		pirschClearSession?: () => void;
		pirschInit?: () => void;
		pirschNotFound?: () => void;
	}
}

/**
 * Pirsch vendor manifest.
 *
 * Configures Pirsch through script attributes. Pirsch finds the script element
 * by a fixed element id, so the `id` attribute is part of the loader contract.
 *
 * pa.js runs `pirschInit()` only from a DOMContentLoaded listener, but Inth
 * usually inserts the script after that event fired (consent granted after
 * the page loaded), so custom event bindings would never start. The manifest
 * calls it once the file loads, exactly when the native listener can no
 * longer fire.
 */
export const pirschManifest = {
	...vendorManifestContract,
	afterLoad: [
		{
			then: [{ global: 'pirschInit', type: 'callGlobal' }],
			type: 'if',
			when: { documentReady: true },
		},
	],
	category: 'measurement',
	install: [
		{
			attributes: {
				'data-code': '{{identificationCode}}',
				'data-dev': '{{dev}}',
				'data-disable-page-views': '{{disablePageViews}}',

				'data-domain': '{{domain}}',
				'data-event-endpoint': '{{eventEndpoint}}',
				'data-hit-endpoint': '{{hitEndpoint}}',
				id: '{{scriptElementId}}',
			},

			defer: true,
			src: 'https://api.pirsch.io/{{scriptFile}}',
			type: 'loadScript',
		},
	],
	vendor: 'pirsch',
	vendorDetails: {
		homepageUrl: 'https://pirsch.io/',
		legalName: 'Emvi Software GmbH',
		name: 'Pirsch Analytics',
		privacyPolicyUrl: 'https://pirsch.io/privacy',
	},
} as const satisfies VendorManifest;

export interface PirschOptions {
	/**
	 * Your Pirsch identification code.
	 */
	identificationCode: string;

	/**
	 * Additional dashboard domains, optionally including per-domain codes.
	 *
	 * Arrays are serialized as Pirsch's comma-separated `data-domain` value.
	 */
	domain?: string | string[];

	/**
	 * Enable localhost testing by rewriting the tracked hostname.
	 */
	dev?: string;

	/**
	 * Custom pageview endpoint.
	 */
	hitEndpoint?: string;

	/**
	 * Custom event endpoint.
	 */
	eventEndpoint?: string;

	/**
	 * Disable automatic pageview tracking.
	 */
	disablePageViews?: boolean;

	/**
	 * Load Pirsch's extended script variant.
	 */
	extended?: boolean;

	/**
	 * Custom loader URL.
	 */
	scriptUrl?: string;
}

const presenceDataAttribute = function presenceDataAttribute(
	value: boolean | undefined
): string | undefined {
	if (value === true) {
		return '';
	}

	return undefined;
};

/**
 * Builds the serializable manifest behind {@link pirsch}. The identification
 * code must already be trimmed and non-empty.
 */
export const resolvePirschManifest = function resolvePirschManifest(
	options: Omit<PirschOptions, 'scriptUrl'>
): ResolvedManifest {
	const extended = options.extended === true;
	return getCompiledManifest(pirschManifest, {
		dev: trimToUndefined(options.dev),
		disablePageViews: presenceDataAttribute(options.disablePageViews),
		domain: listDataAttribute(options.domain),
		eventEndpoint: trimToUndefined(options.eventEndpoint),
		hitEndpoint: trimToUndefined(options.hitEndpoint),
		identificationCode: options.identificationCode,
		scriptElementId: extended ? 'pirschextendedjs' : 'pianjs',
		scriptFile: extended ? 'pirsch-extended.js' : 'pa.js',
	});
};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; `dev`, the endpoint overrides and `scriptUrl` stay npm-only.
 * Marked pure so a bundler drops it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'pirsch',
		{
			disablePageViews: {
				default: false,
				kind: 'boolean',
				label: 'Disable automatic page views',
			},
			domain: {
				example: 'rollup.example.com',
				kind: 'idList',
				label: 'Additional dashboard domains',
				maxItems: 20,
				pattern:
					'^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$',
				required: false,
			},
			extended: {
				default: false,
				kind: 'boolean',
				label: 'Load the extended script',
			},
			identificationCode: {
				example: 'abcdefghijklmnopqrstuvwxyz012345',
				kind: 'id',
				label: 'Identification code',
				pattern: '^[A-Za-z0-9_-]{1,64}$',
				required: true,
			},
		},
		resolvePirschManifest
	);

/**
 * Creates a Pirsch Analytics script.
 *
 * @see https://docs.pirsch.io/get-started/frontend-integration
 *
 * @remarks When `identificationCode` is missing or blank, the helper logs
 *   `pirsch: missing or invalid identificationCode` with `console.error`
 *   and returns a script that never loads.
 *
 * @example
 * ```ts
 * import { pirsch } from '@inth/integrations/pirsch';
 *
 * pirsch({
 *   identificationCode: 'YOUR_IDENTIFICATION_CODE',
 *   domain: 'rollup.example.com:ROLLUP_CODE',
 * });
 * ```
 */
export const pirsch = function pirsch(options: PirschOptions): Script {
	const identificationCode = readId(options.identificationCode);
	if (identificationCode === undefined) {
		return skipMissingId('pirsch', 'identificationCode', {
			category: 'measurement',
			manifest: pirschManifest,
		});
	}

	return withScriptUrl(
		levelThreeScript(resolvePirschManifest({ ...options, identificationCode })),
		options.scriptUrl
	);
};
