import type { Script, ScriptCallbackInfo } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { runtimeConsentGateValue, vendorManifestContract } from '../../types';
import type {
	ManifestStep,
	ResolvedManifest,
	VendorManifest,
} from '../../types';
import { trimToUndefined, withScriptUrl } from '../_shared/script-url';

export type VercelSpeedInsightsMode = 'auto' | 'development' | 'production';

/** Web Vitals report the collector passes to `beforeSend`. */
export interface VercelSpeedInsightsEvent {
	type: 'vital';
	url: string;
	route?: string;
}

/**
 * Edits or drops a report before the collector sends it. Return the event,
 * possibly with a changed `url`, or `null` to drop it.
 */
export type VercelSpeedInsightsBeforeSend = (
	event: VercelSpeedInsightsEvent
) => VercelSpeedInsightsEvent | null | undefined | false;

// `@vercel/speed-insights` declares `window.si` with its own type, so a global
// augmentation here would conflict for apps that still install it.
type SpeedInsightsWindow = Window & {
	si?: (action: 'beforeSend', handler: VercelSpeedInsightsBeforeSend) => void;
};

/**
 * Hands the collector the script's consent gate as its `beforeSend`, which
 * drops every report while measurement is not allowed and after the script
 * is disposed. The collector holds one `beforeSend`, and another
 * registration may have set its own, so the gate is set again on every
 * consent change. A server render leaves this step to hydration: the gate
 * is the browser's own function.
 */
const registerConsentGate = {
	args: ['beforeSend', runtimeConsentGateValue],
	global: 'si',
	type: 'callGlobal',
} as const satisfies ManifestStep;

/**
 * Vercel Speed Insights vendor manifest.
 *
 * Seeds the `si` queue the collector replays when it starts, registers the
 * consent gate, then loads the collector.
 */
export const vercelSpeedInsightsManifest = {
	...vendorManifestContract,
	bootstrap: [
		{
			ifUndefined: true,

			name: 'siq',
			type: 'setGlobal',
			value: [],
		},
		{
			ifUndefined: true,

			name: 'si',
			queue: {
				global: 'siq',
			},
			queueFormat: 'array',
			type: 'defineStubFunction',
		},
	],
	category: 'measurement',
	install: [
		registerConsentGate,
		{
			attributes: {
				'data-dsn': '{{dsn}}',
				'data-endpoint': '{{endpoint}}',
				'data-sample-rate': '{{sampleRate}}',

				'data-sdkn': 'inth',
			},

			defer: true,
			src: 'https://va.vercel-scripts.com/v1/speed-insights/{{scriptFile}}',
			type: 'loadScript',
		},
	],
	onConsentChange: [registerConsentGate],
	vendor: 'vercel-speed-insights',
	vendorDetails: {
		homepageUrl: 'https://vercel.com/products/speed-insights',
		legalName: 'Vercel Inc.',
		name: 'Vercel Speed Insights',
		privacyPolicyUrl: 'https://vercel.com/legal/privacy-notice',
	},
} as const satisfies VendorManifest;

/**
 * {@link vercelSpeedInsightsManifest} without the consent gate, for the npm
 * helper with a site's `beforeSend`, which registers its own gate around it.
 */
const siteGateManifest = {
	...vercelSpeedInsightsManifest,
	install: [vercelSpeedInsightsManifest.install[1]],
	onConsentChange: [],
} as const satisfies VendorManifest;

export interface VercelSpeedInsightsOptions {
	/** Project DSN for self-hosted or non-Vercel deployments. */
	dsn?: string;
	/** Preferred script mode. */
	mode?: VercelSpeedInsightsMode;
	/** Load Vercel's debug bundle when set to `true`. */
	debug?: boolean;
	/** Custom vitals endpoint. */
	endpoint?: string;
	/** Custom loader URL. */
	scriptUrl?: string;
	/**
	 * Share of page loads that report, from `0` to `1`.
	 * @default 1
	 */
	sampleRate?: number;
	/**
	 * Edits or drops reports while measurement is allowed. Use this instead of
	 * calling `window.si('beforeSend', ...)`, which would replace the
	 * helper's consent check.
	 */
	beforeSend?: VercelSpeedInsightsBeforeSend;
}

const getSampleRateAttribute = function getSampleRateAttribute(
	sampleRate: number | undefined
): string | undefined {
	if (sampleRate === undefined) {
		return undefined;
	}
	if (!Number.isFinite(sampleRate) || sampleRate < 0 || sampleRate > 1) {
		throw new TypeError(
			'vercelSpeedInsights: sampleRate must be a number from 0 to 1'
		);
	}

	return String(sampleRate);
};

type ManifestOptions = Omit<
	VercelSpeedInsightsOptions,
	'scriptUrl' | 'beforeSend'
>;

const compile = (
	manifest: VendorManifest,
	{ dsn, mode, debug, endpoint, sampleRate }: ManifestOptions
): ResolvedManifest =>
	getCompiledManifest(manifest, {
		dsn: trimToUndefined(dsn),
		endpoint: trimToUndefined(endpoint),
		sampleRate: getSampleRateAttribute(sampleRate),
		scriptFile:
			mode === 'development' || debug ? 'script.debug.js' : 'script.js',
	});

/**
 * Builds the serializable manifest behind {@link vercelSpeedInsights}
 * without a `beforeSend`. `mode` and `endpoint` stay npm-only.
 *
 * @throws {TypeError} When `sampleRate` is not a number from 0 to 1.
 */
export const resolveVercelSpeedInsightsManifest =
	function resolveVercelSpeedInsightsManifest(
		options: ManifestOptions
	): ResolvedManifest {
		return compile(vercelSpeedInsightsManifest, options);
	};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; its other options stay npm-only. Marked pure so a bundler drops
 * it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'vercelSpeedInsights',
		{
			debug: {
				default: false,
				kind: 'boolean',
				label: 'Load the debug bundle',
			},
			dsn: {
				example: 'prj_AbC123dEf456',
				kind: 'id',
				label: 'Project DSN',
				pattern: '^[A-Za-z0-9_-]+$',
				required: false,
			},
			sampleRate: {
				example: 0.5,
				kind: 'number',
				label: 'Share of page loads that report',
				max: 1,
				min: 0,
				required: false,
			},
		},
		resolveVercelSpeedInsightsManifest
	);

/**
 * The site's `beforeSend` behind a consent gate of its own, an npm-only
 * extra: a manifest cannot carry the site's function. Registered on every
 * callback the manifest's gate would be.
 */
const withSiteBeforeSend = function withSiteBeforeSend(
	script: Script,
	beforeSend: VercelSpeedInsightsBeforeSend
): Script {
	let hasConsent = false;
	const gate: VercelSpeedInsightsBeforeSend = (event) =>
		hasConsent ? beforeSend(event) : null;
	const applyConsent = ({ hasConsent: allowed }: ScriptCallbackInfo): void => {
		hasConsent = allowed;
		(window as SpeedInsightsWindow).si?.('beforeSend', gate);
	};
	const { onBeforeLoad, onConsentChange } = script;
	return {
		...script,
		// oxlint-disable-next-line integrations/no-vendor-callbacks -- npm-only: gates the site's beforeSend function
		onBeforeLoad(info) {
			onBeforeLoad?.(info);
			applyConsent(info);
		},
		onConsentChange(info) {
			onConsentChange?.(info);
			applyConsent(info);
		},
		// Disposing the loader calls no consent callback, and the collector
		// keeps running. Close this gate without registering it again: a
		// replacement may already have registered its own.
		onDispose() {
			hasConsent = false;
		},
		// A `beforeSend` must see every report, and the HTML would start the
		// collector before hydration registers the gate, so the script loader
		// starts it after hydration.
		serverStart: undefined,
	};
};

/**
 * Creates a Vercel Speed Insights script.
 *
 * @see https://vercel.com/docs/speed-insights
 *
 * @throws {TypeError} When `sampleRate` is not a number from 0 to 1.
 * @remarks The collector keeps measuring after its script element is
 * removed, so the helper also registers a `beforeSend` callback that drops
 * every report while measurement is not allowed or after the script loader
 * is disposed. Create the helper once, outside render functions: a new
 * helper object replaces the script element.
 *
 * @example
 * ```ts
 * import { vercelSpeedInsights } from '@inth/integrations/vercel-speed-insights';
 *
 * vercelSpeedInsights({ sampleRate: 0.5 });
 * ```
 */
export const vercelSpeedInsights = function vercelSpeedInsights({
	beforeSend,
	scriptUrl,
	...options
}: VercelSpeedInsightsOptions = {}): Script {
	if (!beforeSend) {
		return withScriptUrl(
			resolvedManifestToScript(resolveVercelSpeedInsightsManifest(options)),
			scriptUrl
		);
	}
	return withSiteBeforeSend(
		withScriptUrl(
			resolvedManifestToScript(compile(siteGateManifest, options)),
			scriptUrl
		),
		beforeSend
	);
};
