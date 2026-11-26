import type { Script } from '@inth/sdk/engine';
import { gorgiasScript } from '@inth/sdk/manifest-runtime/adapters/gorgias';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';

interface GorgiasChatApi {
	init: () => Promise<unknown>;
	disableSegment: () => void;
}

declare global {
	interface Window {
		GorgiasChat?: GorgiasChatApi;
	}
}

/**
 * Gorgias Chat loader, gated on functionality consent. The Gorgias adapter
 * in `@inth/sdk` waits for the chat and disables Segment while measurement
 * is denied.
 */
export const gorgiasChatManifest = {
	...vendorManifestContract,
	category: 'functionality',
	install: [
		{
			async: true,
			src: 'https://config.gorgias.chat/{{loaderPath}}',
			type: 'loadScript',
		},
	],
	target: 'body',
	vendor: 'gorgias',
	vendorDetails: {
		homepageUrl: 'https://www.gorgias.com/',
		legalName: 'Gorgias Inc.',
		name: 'Gorgias Chat',
		privacyPolicyUrl: 'https://www.gorgias.com/legal/privacy',
	},
} as const satisfies VendorManifest;

export interface GorgiasChatOptions {
	/** Public v3 app key, or the legacy v2 application ID from your snippet. */
	appKey: string;
	/** Installation snippet version. @default 3 */
	version?: 2 | 3;
}

/**
 * The manifest for Gorgias Chat: the bundle loader for the app key and
 * snippet version, and the Gorgias adapter. The app key must already be
 * trimmed and non-empty. The npm helper and the Inth server both build it
 * here.
 */
export const resolveGorgiasChatManifest = function resolveGorgiasChatManifest({
	appKey,
	version = 3,
}: GorgiasChatOptions): ResolvedManifest {
	const encodedKey = encodeURIComponent(appKey);
	return {
		...getCompiledManifest(gorgiasChatManifest, {
			loaderPath:
				version === 2
					? `gorgias-chat-bundle-loader.js?applicationId=${encodedKey}`
					: `bundle-loader/${encodedKey}`,
		}),
		adapter: { id: 'gorgias', options: {} },
		requires: 4,
	};
};

/**
 * What the Inth server may set for Gorgias Chat: the app key and the
 * snippet version, as text since a dashboard enum holds strings.
 * Marked pure so a bundler drops it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'gorgiasChat',
		{
			appKey: {
				example: '01HABCDEFGHJKMNPQRSTVWXYZ0',
				kind: 'id',
				label: 'App key (v3), or application ID (v2)',
				pattern: '^[A-Za-z0-9_-]{1,64}$',
				required: true,
			},
			version: {
				default: '3',
				kind: 'enum',
				label: 'Installation snippet version',
				values: ['3', '2'],
			},
		},
		({ appKey, version }) =>
			resolveGorgiasChatManifest({ appKey, version: version === '2' ? 2 : 3 })
	);

/**
 * Loads Gorgias Chat after its mapped consent gate allows it.
 *
 * Disables Segment when measurement is denied, using Gorgias's documented
 * readiness wrapper. Gorgias has no documented analytics re-enable or full
 * shutdown API. Keep Inth's default reload on consent revocation enabled.
 *
 * @remarks Missing or blank `appKey` values log an error and return a script
 *   that never loads. Remove existing Gorgias installation snippets before
 *   registering this helper. Once disabled, Segment stays disabled until a
 *   page reload, even if measurement consent is granted again.
 * @example
 * gorgiasChat({ appKey: 'YOUR_GORGIAS_APP_KEY' });
 * @see https://docs.gorgias.com/en-US/customize-the-chat-widget-with-HTML-and-JavaScript-286032
 */
export const gorgiasChat = function gorgiasChat(
	options: GorgiasChatOptions
): Script {
	const appKey = readId(options?.appKey);
	if (appKey === undefined) {
		return skipMissingId('gorgiasChat', 'appKey', {
			category: 'functionality',
			manifest: gorgiasChatManifest,
		});
	}
	const { adapter: _adapter, ...manifest } = resolveGorgiasChatManifest({
		...options,
		appKey,
	});
	return gorgiasScript(resolvedManifestToScript(manifest));
};
