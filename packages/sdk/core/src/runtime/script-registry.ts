import { MANIFEST_RUNTIME_LEVEL } from '../manifest-runtime/level';
import type { ScriptLoaderOptions } from '../modules/script-loader/types';
import type { ConsentRuntimeModules, ConsentRuntimeOptions } from './types';

/**
 * The signature settings `experimentalScriptRegistry` asks for, or
 * `undefined` when the registry is off.
 *
 * @internal
 */
export const scriptRegistrySignatures = function scriptRegistrySignatures(
	option: ConsentRuntimeOptions['experimentalScriptRegistry']
):
	| Pick<
			NonNullable<ScriptLoaderOptions['registry']>,
			'requireSignatures' | 'signingKeys'
	  >
	| undefined {
	if (option === true) {
		return { requireSignatures: false, signingKeys: 'production' };
	}
	if (typeof option !== 'object' || option === null) {
		return undefined;
	}
	return {
		requireSignatures: option.requireSignatures === true,
		signingKeys: option.signingKeys === 'preview' ? 'preview' : 'production',
	};
};

/**
 * How the script loader reads the Inth script registry's sources, or
 * `undefined` when `experimentalScriptRegistry` is off or there is no
 * document to load scripts into.
 *
 * @param callsInit - Whether the runtime asks `/v1/consent/init`. One that never
 * does, such as with `enabled: false` or a `consentSource`, has only the
 * list its prefetch carries.
 * @internal
 */
export const scriptRegistry = function scriptRegistry(
	options: Pick<ConsentRuntimeOptions, 'experimentalScriptRegistry'>,
	callsInit: boolean
): ScriptLoaderOptions['registry'] {
	const signatures = scriptRegistrySignatures(
		options.experimentalScriptRegistry
	);
	return signatures && typeof document !== 'undefined'
		? { waitForInit: callsInit, ...signatures }
		: undefined;
};

/**
 * How the script loader runs the scripts `remoteScripts` turns on, or
 * `undefined` when it is off, there is no document to load them into, or
 * the host passed no `loadManifestRuntime` module.
 *
 * @internal
 */
export const remoteScripts = function remoteScripts(
	options: Pick<ConsentRuntimeOptions, 'remoteScripts'>,
	modules: Pick<ConsentRuntimeModules, 'loadManifestRuntime'>
): ScriptLoaderOptions['remote'] {
	if (options.remoteScripts !== true || typeof document === 'undefined') {
		return undefined;
	}
	if (!modules.loadManifestRuntime) {
		if (process.env.NODE_ENV !== 'production') {
			console.warn(
				'[inth] remoteScripts is on, but the runtime has no loadManifestRuntime module, so remote scripts do not load. Pass loadManifestRuntime from @inth/sdk/runtime.'
			);
		}
		return undefined;
	}
	return {
		level: MANIFEST_RUNTIME_LEVEL,
		loadRuntime: modules.loadManifestRuntime,
	};
};
