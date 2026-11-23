/**
 * How the two `InthProvider` components, from `@inth/svelte` and
 * `@inth/svelte/kit`, read their props: top-level
 * options merged over `options`, and the runtime options they hand core.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentRuntime } from '@inth/sdk/runtime/provider';
import type { Snippet } from 'svelte';

import type { ConsentManagerOptions } from './manager-options.model';
import { isIABConfigured, lazyCreateIAB, loadGPP } from './lazy-create-iab';

/** Provider options before `mode` is known. @internal */
export type ProviderOptionsInput = Omit<ConsentManagerOptions, 'mode'> & {
	mode?: ConsentManagerOptions['mode'];
};

/** Props every provider takes besides its options. @internal */
export interface ProviderRuntimeProps {
	children?: Snippet;
	/**
	 * An externally owned runtime to render instead of creating one.
	 *
	 * A SvelteKit root layout or an Astro page can create a single
	 * runtime with `createConsentRuntime()` and share it across
	 * component trees that cannot see each other's context. The
	 * provider neither starts nor disposes a runtime it did not
	 * create — the owner does both.
	 */
	runtime?: ConsentRuntime;
}

const mergeDefinedOptions = function mergeDefinedOptions(
	base: ProviderOptionsInput,
	overrides: ProviderOptionsInput
): ProviderOptionsInput {
	const merged = { ...base };
	for (const [key, value] of Object.entries(overrides) as [
		keyof ConsentManagerOptions,
		ConsentManagerOptions[keyof ConsentManagerOptions],
	][]) {
		if (value !== undefined) {
			merged[key] = value as never;
		}
	}
	return merged;
};

/**
 * A provider's options: its top-level props over `options`, without the
 * props that are not options.
 *
 * @internal
 */
export const resolveProviderOptions = function resolveProviderOptions(
	props: ProviderOptionsInput &
		ProviderRuntimeProps & { options?: ProviderOptionsInput }
): ProviderOptionsInput {
	const {
		children: _children,
		runtime: _runtime,
		options: nestedOptions = {},
		...topLevelOptions
	} = props;
	return mergeDefinedOptions(nestedOptions, topLevelOptions);
};

/**
 * The options a provider hands the runtime: its own, with the lazy IAB
 * and GPP loaders and the package name.
 *
 * @internal
 */
export const runtimeOptionsFor = function runtimeOptionsFor(
	options: ProviderOptionsInput
) {
	return {
		...options,
		// Only an app that configured IAB reaches for `@inth/sdk/iab`, and even
		// then the module arrives through a dynamic import.
		createIAB: isIABConfigured(options.iab) ? lazyCreateIAB : undefined,
		// Called only when `gpp` is set, so other apps never fetch the chunk.
		loadGPP,
		mode: options.mode as ConsentManagerOptions['mode'],
		pkg: '@inth/svelte',
	};
};
