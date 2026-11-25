import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { getCompiledManifest } from '../../resolve';
import { runtimeTimestampValue, vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { resolveScriptUrl } from '../_shared/script-url';

interface TikTokPixelFunction {
	grantConsent: () => void;
	revokeConsent: () => void;
	page: () => void;
	track: (eventName: string, properties?: Record<string, unknown>) => void;
	identify: (properties?: Record<string, unknown>) => void;
	instances: (...args: unknown[]) => void;
	debug: (...args: unknown[]) => void;
	on: (...args: unknown[]) => void;
	off: (...args: unknown[]) => void;
	once: (...args: unknown[]) => void;
	ready: (...args: unknown[]) => void;
	alias: (...args: unknown[]) => void;
	group: (...args: unknown[]) => void;
	enableCookie: (...args: unknown[]) => void;
	disableCookie: (...args: unknown[]) => void;
	holdConsent: (...args: unknown[]) => void;
}

declare global {
	interface Window {
		ttq: TikTokPixelFunction;
	}
}

/**
 * TikTok Pixel vendor manifest.
 *
 * Reproduces TikTok's base code: the `ttq` method queue, the pixel record
 * that `ttq.load(pixelId)` keeps in `ttq._i`, `ttq._t`, and `ttq._o`, and a
 * queued `page()`. The pixel only loads with marketing consent, so setup
 * queues one `grantConsent()`. Later changes call `ttq.grantConsent()` or
 * `ttq.revokeConsent()`.
 */
export const tiktokPixelManifest = {
	...vendorManifestContract,
	bootstrap: [
		{
			name: 'TiktokAnalyticsObject',
			type: 'setGlobal',
			value: 'ttq',
		},
		{
			ifUndefined: true,

			name: 'ttq',
			type: 'setGlobal',
			value: [],
		},
		{
			methods: [
				'page',
				'track',
				'identify',
				'instances',
				'debug',
				'on',
				'off',
				'once',
				'ready',
				'alias',
				'group',
				'enableCookie',
				'disableCookie',
				'holdConsent',
				'revokeConsent',
				'grantConsent',
			],

			target: 'ttq',
			type: 'defineQueueMethods',
		},
	],
	category: 'marketing',
	install: [
		// Mirror the bookkeeping `ttq.load(pixelId)` does in TikTok's base code.
		// Inth appends events.js itself, so it records the pixel directly
		// instead of calling `load`, which would insert a second loader.
		{
			ifGlobalIsQueue: true,
			ifUndefined: true,
			path: ['ttq', '_i'],
			type: 'setGlobalPath',
			value: {},
		},
		{
			ifGlobalIsQueue: true,
			path: ['ttq', '_i', '{{pixelId}}'],
			type: 'setGlobalPath',
			value: [],
		},
		{
			ifGlobalIsQueue: true,
			path: ['ttq', '_i', '{{pixelId}}', '_u'],
			type: 'setGlobalPath',
			value: '{{scriptSrc}}',
		},
		{
			ifGlobalIsQueue: true,
			ifUndefined: true,
			path: ['ttq', '_t'],
			type: 'setGlobalPath',
			value: {},
		},
		{
			ifGlobalIsQueue: true,
			path: ['ttq', '_t', '{{pixelId}}'],
			type: 'setGlobalPath',
			value: runtimeTimestampValue,
		},
		{
			ifGlobalIsQueue: true,
			ifUndefined: true,
			path: ['ttq', '_o'],
			type: 'setGlobalPath',
			value: {},
		},
		{
			ifGlobalIsQueue: true,
			path: ['ttq', '_o', '{{pixelId}}'],
			type: 'setGlobalPath',
			value: {},
		},
		{
			global: 'ttq',
			method: 'grantConsent',

			type: 'callGlobal',
		},
		{
			global: 'ttq',
			method: 'page',

			type: 'callGlobal',
		},
		{
			async: true,

			src: '{{scriptSrc}}?sdkid={{pixelId}}&lib=ttq',
			type: 'loadScript',
		},
	],
	onConsentDenied: [
		{
			global: 'ttq',
			method: 'revokeConsent',

			type: 'callGlobal',
		},
	],
	onConsentGranted: [
		{
			global: 'ttq',
			method: 'grantConsent',

			type: 'callGlobal',
		},
	],
	persistAfterConsentRevoked: true,
	vendor: 'tiktok-pixel',
	vendorDetails: {
		homepageUrl: 'https://business.tiktok.com/',
		name: 'TikTok Pixel',
		privacyPolicyUrl: 'https://www.tiktok.com/legal/privacy-policy',
	},
} as const satisfies VendorManifest;

export interface TikTokPixelOptions {
	/**
	 * Your TikTok Pixel ID
	 * @example `123456789012345`
	 */
	pixelId: string;

	/** TikTok Pixel loader base URL. */
	scriptSrc?: string;
}

/**
 * Builds the serializable manifest behind {@link tiktokPixel}. `pixelId`
 * must already be a trimmed, non-empty pixel ID.
 */
export const resolveTiktokPixelManifest = function resolveTiktokPixelManifest({
	pixelId,
	scriptSrc,
}: TikTokPixelOptions): ResolvedManifest {
	return getCompiledManifest(tiktokPixelManifest, {
		pixelId,
		scriptSrc: resolveScriptUrl(
			scriptSrc,
			'https://analytics.tiktok.com/i18n/pixel/events.js'
		),
	});
};

/**
 * Creates a Tiktok Pixel script.
 * This script is persistent after consent is revoked because it has built-in functionality to opt into and out of tracking based on consent, which allows us to not need to load the script again when consent is revoked.
 *
 * @remarks When `pixelId` is missing or blank, the
 *   helper logs `tiktokPixel: missing or invalid pixelId` with
 *   `console.error` and returns a script that never loads.
 *
 * @example
 * ```ts
 * const tiktokPixelScript = tiktokPixel({
 *   pixelId: '123456789012345',
 * });
 * ```
 *
 * @see {@link https://ads.tiktok.com/help/article/tiktok-pixel} TikTok Pixel documentation
 */
export const tiktokPixel = function tiktokPixel(
	options: TikTokPixelOptions
): Script {
	const normalizedPixelId = readId(options.pixelId);
	if (normalizedPixelId === undefined) {
		return skipMissingId('tiktokPixel', 'pixelId', {
			category: 'marketing',
			manifest: tiktokPixelManifest,
		});
	}

	return resolvedManifestToScript(
		resolveTiktokPixelManifest({ ...options, pixelId: normalizedPixelId })
	);
};
