/**
 * Builds a script the way the SDK does for a remote integration: the Inth
 * server resolves the options, the manifest crosses the wire as JSON, the
 * SDK's parser checks it, and the loader turns it into a script. An e2e
 * suite runs its scenarios through both this path and the npm helper.
 */
import type { Script } from '@inth/sdk/engine';
import { parseResolvedManifest } from '@inth/sdk/manifest-runtime';

import { resolvedManifestToScript } from '../engine/runtime';
import type { BuiltInScriptIntegrationKey } from '../registry';
import { remoteIntegrations } from '../remote';

/** A script built from the JSON manifest the server sends for `options`. */
export const fromRemote = function fromRemote<TOptions>(
	key: BuiltInScriptIntegrationKey,
	options: TOptions
): Script {
	const integration = remoteIntegrations[key];
	if (integration === undefined) {
		throw new Error(`${key} has no remote definition`);
	}
	const wire: unknown = JSON.parse(
		JSON.stringify(
			integration.resolveRemote(options as Record<string, unknown>)
		)
	);
	const parsed = parseResolvedManifest(wire);
	if (!parsed.ok) {
		throw new Error(`${key}: the SDK refused the manifest: ${parsed.reason}`);
	}
	return resolvedManifestToScript(parsed.manifest);
};

/**
 * `[label, build]` rows for `describe.each`: the npm helper, then the same
 * options through the server's JSON manifest. Use it only for scenarios whose
 * options a dashboard can set.
 */
export const npmAndRemote = function npmAndRemote<TOptions>(
	key: BuiltInScriptIntegrationKey,
	helper: (options: TOptions) => Script
): [string, (options: TOptions) => Script][] {
	return [
		['npm helper', helper],
		['remote manifest', (options) => fromRemote(key, options)],
	];
};
