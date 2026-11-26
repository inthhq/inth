import type { Script } from '@inth/sdk/engine';
import { adaScript } from '@inth/sdk/manifest-runtime/adapters/ada';
import type { AdaAdapterOptions } from '@inth/sdk/manifest-runtime/adapters/ada';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { trimToUndefined } from '../_shared/script-url';

/**
 * Ada Messaging metadata. The Ada adapter in `@inth/sdk` imports Ada's
 * module after consent, so the manifest inserts no tag.
 */
export const adaManifest = {
	...vendorManifestContract,
	category: 'functionality',
	install: [],
	observeConsentBeforeLoad: true,
	vendor: 'ada',
	vendorDetails: {
		homepageUrl: 'https://www.ada.cx/',
		legalName: 'Ada Support Inc.',
		name: 'Ada',
		privacyPolicyUrl: 'https://www.ada.cx/legal/privacy-policy/',
	},
} as const satisfies VendorManifest;

/** Configuration for Ada's Messaging Web SDK. */
export interface AdaOptions {
	/** Public AI Agent handle supplied by Ada. */
	handle: string;
	/**
	 * Regional cluster supplied by Ada, such as `eu`, `us2`, or `maple`.
	 * Leave unset for an Agent on the default cluster.
	 */
	cluster?: string;
	/** Ada base-domain segment. Set only when Ada supplies an override. */
	domain?: string;
}

/**
 * The manifest for Ada: no tag, and the Ada adapter with the settings Ada's
 * `start()` takes. The handle must already be trimmed and non-empty. The
 * npm helper and the Inth server both build it here.
 */
export const resolveAdaManifest = function resolveAdaManifest(
	options: AdaOptions
): ResolvedManifest {
	const settings: AdaAdapterOptions = { handle: options.handle };
	const cluster = trimToUndefined(options.cluster);
	const domain = trimToUndefined(options.domain);
	if (cluster) {
		settings.cluster = cluster;
	}
	if (domain) {
		settings.domain = domain;
	}
	return {
		...getCompiledManifest(adaManifest, {}),
		adapter: { id: 'ada', options: { ...settings } },
		requires: 4,
	};
};

/** One label of an Ada host name. */
const label = '^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$';

/**
 * What the Inth server may set for Ada: the handle and the optional cluster
 * and domain segments, each one label of the host Ada builds.
 * Marked pure so a bundler drops it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'ada',
		{
			cluster: {
				example: 'eu',
				kind: 'id',
				label: 'Cluster',
				pattern: label,
				required: false,
			},
			domain: {
				example: 'ada',
				kind: 'id',
				label: 'Domain segment',
				pattern: label,
				required: false,
			},
			handle: {
				example: 'your-agent',
				kind: 'id',
				label: 'AI Agent handle',
				pattern: label,
				required: true,
			},
		},
		resolveAdaManifest
	);

/**
 * Loads Ada Messaging only after the script's mapped consent is granted.
 *
 * Repeated registrations share one private Messaging interface. A
 * registration whose settings differ from the active configuration logs a
 * `console.warn` and is ignored until the page reloads. When the last granted
 * loader revokes consent or disposes the script, Ada's documented `stop()` runs,
 * including while `start()` is pending. A later grant waits for pending work.
 * Once every registration is gone and `stop()` has run, a later registration
 * can restart the reused interface with different settings.
 *
 * @returns A callback-only script gated on functionality consent.
 * @remarks A missing or blank `handle` logs `ada: missing or invalid handle`
 * with `console.error` and returns a script that never loads. `stop()` does
 * not erase the visitor's stored conversation. An import already in progress
 * cannot be cancelled, so keep Inth's reload-on-revocation behavior enabled.
 * @example
 * ada({ handle: 'YOUR_ADA_HANDLE' });
 * @see https://docs.ada.cx/messaging/web/getting-started
 * @see https://docs.ada.cx/messaging/web/sdk-api-reference#stop
 */
export const ada = function ada(options: AdaOptions): Script {
	const handle = readId(options?.handle);
	if (handle === undefined) {
		return skipMissingId('ada', 'handle', {
			category: 'functionality',
			manifest: adaManifest,
		});
	}
	const { adapter, ...manifest } = resolveAdaManifest({ ...options, handle });
	return adaScript(
		resolvedManifestToScript(manifest),
		adapter?.options as unknown as AdaAdapterOptions
	);
};
