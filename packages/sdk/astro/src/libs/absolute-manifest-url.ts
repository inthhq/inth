import type { ConsentMode } from '@inth/sdk/modes';

/**
 * The mode's `manifestUrl` when it is an absolute http(s) URL. The build
 * bundles it and the route reads it in every `manifest()` mode, browser
 * resolution included, so a site saving consent on its own origin
 * (`projectUrl: ''`) still has a manifest to serve.
 */
export const absoluteManifestUrl = function absoluteManifestUrl(
	mode: ConsentMode
): string | undefined {
	return mode.type === 'manifest' &&
		/^https?:\/\//iu.test(mode.manifestUrl ?? '')
		? mode.manifestUrl
		: undefined;
};
