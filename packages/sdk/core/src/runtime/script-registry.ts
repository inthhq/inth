import { rememberedRegistry } from '../modules/script-loader/remembered';
import type { ScriptLoaderOptions } from '../modules/script-loader/types';
import type { ConsentRuntimeOptions } from './types';

/**
 * How the script loader reads the Inth script registry's sources, or
 * `undefined` when `experimentalScriptRegistry` is off or there is no
 * document to load scripts into.
 *
 * @param callsInit - Whether the runtime asks `/v1/consent/init`. One that never
 * does, such as with `enabled: false` or a `consentSource`, has only the
 * list its prefetch carries. One that does remembers the last list its
 * `projectUrl` answered with, for when init fails.
 * @internal
 */
export const scriptRegistry = function scriptRegistry(
	options: Pick<
		ConsentRuntimeOptions,
		'experimentalScriptRegistry' | 'projectUrl'
	>,
	callsInit: boolean
): ScriptLoaderOptions['registry'] {
	if (
		options.experimentalScriptRegistry !== true ||
		typeof document === 'undefined'
	) {
		return undefined;
	}
	const memory = callsInit ? rememberedRegistry(options.projectUrl) : undefined;
	return memory
		? { memory, waitForInit: callsInit }
		: { waitForInit: callsInit };
};
