/**
 * Golden trace factories for the server path: the Inth server validates the
 * options and resolves the manifest, the manifest crosses the wire as JSON,
 * and the browser's manifest runtime parses it and builds the script, as
 * the remote loader does. Pass one as `factory` to `describeGoldenTraces`,
 * so the server path is held to the npm helper's recorded trace.
 */
import type { Script } from '@inth/sdk/engine';

import type { BuiltInScriptIntegrationKey } from '../../registry';
import type { TraceFactory } from './golden';

export interface RemoteTraceOptions {
	/**
	 * Return the first built script on every call, as the remote loader does
	 * while the manifest it receives is unchanged. Use it for a vendor whose
	 * npm helper returns the same script for equal options, so a trace
	 * `replace` with identical options is the same registration on both
	 * paths. @default false: every call builds a fresh script, as the loader
	 * does for a changed manifest whose entry has not started. (A started
	 * entry keeps its script until the next page, so these traces check a
	 * stricter case than a live page runs.)
	 */
	keepScript?: boolean;
}

/**
 * A `factory` that builds `key`'s script from the manifest the Inth server
 * sends for `options`. `options` must be ones a dashboard can save.
 */
export const remoteTraceFactory = function remoteTraceFactory(
	key: BuiltInScriptIntegrationKey,
	options: Readonly<Record<string, unknown>>,
	{ keepScript = false }: RemoteTraceOptions = {}
): () => Promise<TraceFactory> {
	return async () => {
		// Imported per scenario, after the golden runner reset the registry.
		const { remoteIntegrations, validateRemoteOptions } =
			await import('../../remote');
		const { loadManifestRuntime } = await import('@inth/sdk/runtime');
		const validated = validateRemoteOptions(key, options);
		if (!validated.ok) {
			throw new Error(
				`A dashboard cannot save these options: ${validated.issues.join('; ')}`
			);
		}
		const wire = JSON.stringify(
			remoteIntegrations[key]?.resolveRemote(validated.options)
		);
		// The runtime the loader uses: its `prepare` loads the level 3 part or
		// an adapter a manifest needs, before the loader parses the manifest.
		const loaded = await loadManifestRuntime();
		const runtime = (await loaded.prepare?.([JSON.parse(wire)])) ?? loaded;
		let kept: Script | undefined;
		return () => {
			if (keepScript && kept) {
				return kept;
			}
			const parsed = runtime.parseResolvedManifest(JSON.parse(wire));
			if (!parsed.ok) {
				throw new Error(`${key}: ${parsed.reason}`);
			}
			kept = runtime.resolvedManifestToScript(parsed.manifest);
			return kept;
		};
	};
};
