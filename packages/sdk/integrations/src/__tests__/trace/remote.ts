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
	 * does when the manifest changes.
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
		const runtime = await import('@inth/sdk/manifest-runtime');
		const validated = validateRemoteOptions(key, options);
		if (!validated.ok) {
			throw new Error(
				`A dashboard cannot save these options: ${validated.issues.join('; ')}`
			);
		}
		const wire = JSON.stringify(
			remoteIntegrations[key]?.resolveRemote(validated.options)
		);
		// The loader installs the level 3 part before it parses a manifest
		// that requires it.
		if (runtime.requiresLevelThree([JSON.parse(wire)])) {
			const { levelThreePart } =
				await import('@inth/sdk/manifest-runtime/level-three');
			runtime.installLevelThree(levelThreePart);
		}
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
