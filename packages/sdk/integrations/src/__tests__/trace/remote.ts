/**
 * The server path for a golden trace run: the factory builds each script
 * from the manifest the Inth server sends for `options`, after a JSON round
 * trip and the SDK's parser, and the run compares it with the npm helper's
 * fixture.
 */
import type { BuiltInScriptIntegrationKey } from '../../registry';
import type { GoldenTraceOptions, TraceFactory } from './golden';

/**
 * A `describeGoldenTraces` factory for the remote manifest of `key` with
 * `options`. Pass only options a dashboard can set; validation fails for
 * any other.
 */
export const remoteTraceFactory = function remoteTraceFactory(
	key: BuiltInScriptIntegrationKey,
	options: Readonly<Record<string, unknown>>
): NonNullable<GoldenTraceOptions['factory']> {
	return async (): Promise<TraceFactory> => {
		// Imported per scenario, after the module reset, like the helpers.
		const { parseResolvedManifest } =
			await import('@inth/sdk/manifest-runtime');
		const { resolvedManifestToScript } = await import('../../engine/runtime');
		const { remoteIntegrations, validateRemoteOptions } =
			await import('../../remote');
		const validated = validateRemoteOptions(key, options);
		if (!validated.ok) {
			throw new Error(
				`A dashboard cannot save these options: ${validated.issues.join('; ')}`
			);
		}
		const wire: unknown = JSON.parse(
			JSON.stringify(remoteIntegrations[key]?.resolveRemote(validated.options))
		);
		return () => {
			const parsed = parseResolvedManifest(wire);
			if (!parsed.ok) {
				throw new Error(`${key}: ${parsed.reason}`);
			}
			return resolvedManifestToScript(parsed.manifest);
		};
	};
};
