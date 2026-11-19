import type { ScriptLoaderOptions } from '../modules/script-loader/types';
import type { ConsentRuntimeOptions } from './types';

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
		return { requireSignatures: true, signingKeys: 'production' };
	}
	if (typeof option !== 'object' || option === null) {
		return undefined;
	}
	return {
		requireSignatures: option.requireSignatures !== false,
		signingKeys: option.signingKeys === 'preview' ? 'preview' : 'production',
	};
};

/**
 * How the script loader reads the Inth script registry's sources, or
 * `undefined` when `experimentalScriptRegistry` is off or there is no
 * document to load scripts into.
 *
 * @param options - The runtime's options.
 * @param callsInit - Whether the runtime asks `/init`. One that never
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
