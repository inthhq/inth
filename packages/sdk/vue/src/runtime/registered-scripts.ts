/**
 * Scripts components register at runtime (`useScriptLoader`), shared by the
 * engine's context and the Nuxt plugin's deferred context. Dependency-free:
 * the deferred context sits in the page's first-load chunk, and a value
 * import of the engine's module from there would pull the engine in.
 *
 * @packageDocumentation
 * @internal
 */
import type { Script } from '@inth/sdk/modules/script-loader';

import type { RuntimeConsentConfig } from './kernel';

/** What {@link VueConsentKernelContext.registerScripts} returns. */
export interface RegisteredScripts {
	/** Replace these scripts; the loader reconciles at once. */
	update: (scripts: readonly Script[]) => void;
	/** Remove these scripts from the loader. */
	dispose: () => void;
}

/**
 * The config's `scripts` plus every set a component registered, in
 * registration order. A later entry with an id an earlier one has wins,
 * as the loader keeps one element per id.
 */
export const withRegisteredScripts = function withRegisteredScripts(
	config: RuntimeConsentConfig,
	registered: Iterable<readonly Script[]>
): RuntimeConsentConfig {
	const extra = [...registered].flat();
	// Each call to `registerScripts()` is its own entry, keyed by a token,
	// so two components passing one array register twice and unregister
	// one at a time.
	if (extra.length === 0) {
		return config;
	}
	// One entry per id, the latest registration's: the loader keys its
	// elements by id, and two entries for one id could insert two.
	const byId = new Map<string, Script>();
	for (const script of [...(config.scripts ?? []), ...extra]) {
		byId.delete(script.id);
		byId.set(script.id, script);
	}
	return { ...config, scripts: [...byId.values()] };
};
