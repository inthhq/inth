import type { Script } from '@inth/sdk/modules/script-loader';
import { onScopeDispose, toValue, watch } from 'vue';
import type { MaybeRefOrGetter } from 'vue';

import type { RegisteredScripts } from '../kernel';
import { useConsentKernelContext } from './kernel';

/** What {@link useScriptLoader} returns. */
export interface ScriptLoaderHandle {
	/** Replace the scripts; the loader reconciles at once. */
	updateScripts: (scripts: readonly Script[]) => void;
	/** Remove the scripts now, ahead of the component's unmount. */
	dispose: () => void;
}

/**
 * Load vendor scripts a component decides at runtime, by consent category.
 *
 * The plugin's `scripts` option covers scripts known when the app starts.
 * Use this for ones a component learns later, such as a tenant's tag or a
 * script a route needs. They join the app's one script loader, which loads
 * each while its category is allowed and removes it when consent is
 * withdrawn, so they never load twice and a withdrawal reloads as usual.
 *
 * Under the Nuxt module's deferred first load, a script that may run now
 * loads the consent engine at once, and an Accept tapped before the engine
 * starts the plain entries it allows without waiting for it, as the
 * config's `scripts` do.
 *
 * @param scripts - The scripts, or a ref or getter; a change reconciles.
 * @returns A handle to replace or remove them early. They are removed when
 * the component unmounts.
 * @throws {Error} When the c15t plugin is not installed.
 * @example
 * ```ts
 * const tenant = useTenant();
 * useScriptLoader(() => [posthog({ projectKey: tenant.value.posthogKey })]);
 * ```
 */
export const useScriptLoader = function useScriptLoader(
	scripts: MaybeRefOrGetter<readonly Script[]>
): ScriptLoaderHandle {
	const context = useConsentKernelContext();
	const live: { registered: RegisteredScripts | null } = {
		registered: context.registerScripts(toValue(scripts)),
	};
	// Deep: a `push` into the ref, or a field changed on one entry, is a
	// change too. The loader gets a copy, so it never holds the reactive
	// array itself.
	const stop = watch(
		() => toValue(scripts),
		(next) => live.registered?.update([...next]),
		{ deep: true }
	);
	const dispose = (): void => {
		stop();
		live.registered?.dispose();
		live.registered = null;
	};
	onScopeDispose(dispose, true);
	return {
		dispose,
		updateScripts: (next) => live.registered?.update(next),
	};
};

export type { Script } from '@inth/sdk/modules/script-loader';
