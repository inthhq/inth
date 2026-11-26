import type { Script } from '@inth/sdk/engine';
import { zendeskScript } from '@inth/sdk/manifest-runtime/adapters/zendesk';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { runtimeTimestampValue, vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import {
	createScriptReuse,
	getScriptRegistrations,
} from '../_shared/reuse-script';

interface ZendeskWidgetApi {
	(...args: unknown[]): void;
	_?: IArguments[];
	s?: HTMLScriptElement;
	t?: number;
}

declare global {
	interface Window {
		zE?: ZendeskWidgetApi;
		zEmbed?: ZendeskWidgetApi;
	}
}

/**
 * Zendesk Messaging loader and the vendor's pre-load command queue. The
 * Zendesk adapter in `@inth/sdk` points the loader at Inth's element and
 * sets the cookie range.
 */
export const zendeskWidgetManifest = {
	...vendorManifestContract,
	category: 'functionality',
	install: [
		{
			aliases: ['zEmbed'],
			name: 'zE',
			properties: { t: runtimeTimestampValue },
			queue: { property: '_' },
			queueFormat: 'arguments',
			type: 'defineStubFunction',
		},
		{
			async: true,
			src: 'https://static.zdassets.com/ekr/snippet.js?key={{encodedKey}}',
			type: 'loadScript',
		},
	],
	resourceKey: 'zendesk:{{key}}',
	vendor: 'zendesk',
	vendorDetails: {
		homepageUrl: 'https://www.zendesk.com/',
		legalName: 'Zendesk, Inc.',
		name: 'Zendesk Messaging',
		privacyPolicyUrl:
			'https://www.zendesk.com/company/agreements-and-terms/privacy-notice/',
	},
} satisfies VendorManifest;

export interface ZendeskWidgetOptions {
	/** Public widget key from the selected Messaging widget's Installation panel. */
	key: string;
	/** Consent condition required to load the widget. @default 'functionality' */
	category?: Script['category'];
}

/**
 * The manifest for Zendesk Messaging: the snippet for the widget key, and
 * the Zendesk adapter. The key must already be trimmed and non-empty. The
 * npm helper and the Inth server both build it here.
 */
export const resolveZendeskWidgetManifest =
	function resolveZendeskWidgetManifest({
		category = 'functionality',
		key,
	}: ZendeskWidgetOptions): ResolvedManifest {
		return {
			...getCompiledManifest(zendeskWidgetManifest, {
				encodedKey: encodeURIComponent(key),
				key,
			}),
			adapter: { id: 'zendesk', options: {} },
			category,
			requires: 4,
		};
	};

/**
 * What the Inth server may set for Zendesk Messaging: the widget key.
 * Marked pure so a bundler drops it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'zendeskWidget',
		{
			key: {
				example: '0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d',
				kind: 'id',
				label: 'Widget key',
				pattern: '^[A-Za-z0-9-]{1,64}$',
				required: true,
			},
		},
		resolveZendeskWidgetManifest
	);

const createZendeskScript = (options: ZendeskWidgetOptions): Script => {
	const { adapter: _adapter, ...manifest } =
		resolveZendeskWidgetManifest(options);
	return zendeskScript(resolvedManifestToScript(manifest), {
		registrations: getScriptRegistrations,
	});
};

const reuseZendeskScript = createScriptReuse<ZendeskWidgetOptions>();

/**
 * Loads Zendesk Messaging after its mapped consent is granted.
 *
 * Queues `functional` storage before the loader runs, or `all` when
 * measurement is also allowed. Revocation sends the documented `none` range
 * once no shared registration permits the widget. Removing a configuration
 * or disposing its loader does not clear a granted conversation. Equal
 * configurations share the active lifecycle across rerenders.
 * Keep `reloadOnConsentRevoked` enabled to unload code already running.
 *
 * @remarks A missing or blank key logs an error and returns a script that
 * never loads. This helper targets Messaging, not Web Widget Classic.
 * @example
 * zendeskWidget({ key: 'YOUR_ZENDESK_WIDGET_KEY' });
 * @see https://developer.zendesk.com/api-reference/widget-messaging/web/core/#set-cookies
 */
export const zendeskWidget = function zendeskWidget(
	options: ZendeskWidgetOptions
): Script {
	const key = readId(options?.key);
	const category = options?.category ?? 'functionality';
	if (key === undefined) {
		return skipMissingId('zendeskWidget', 'key', {
			category,
			manifest: zendeskWidgetManifest,
		});
	}
	return reuseZendeskScript({ category, key }, createZendeskScript);
};
