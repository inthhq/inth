import type { ScriptLoaderOptions } from '../modules/script-loader/types';
import type { ConsentRuntimeOptions } from './types';

/**
 * How the script loader reads the Inth script registry's sources, or
 * `undefined` when `experimentalInthScriptRegistry` is off or there is no
 * document to load scripts into.
 *
 * @param options - The runtime's options.
 * @param callsInit - Whether the runtime asks `/init`. One that never
 * does, such as with `enabled: false` or a `consentSource`, has only the
 * list its prefetch carries.
 * @internal
 */
export const scriptRegistry = function scriptRegistry(
	options: Pick<ConsentRuntimeOptions, 'experimentalInthScriptRegistry'>,
	callsInit: boolean
): ScriptLoaderOptions['registry'] {
	return options.experimentalInthScriptRegistry === true &&
		typeof document !== 'undefined'
		? { waitForInit: callsInit }
		: undefined;
};
