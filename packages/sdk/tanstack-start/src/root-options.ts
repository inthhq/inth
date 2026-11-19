import type {
	UseNetworkBlockerOptions,
	UsePersistenceOptions,
	UseScriptLoaderOptions,
} from '@inth/react/module-hooks';
import type { ConsentProviderOptions } from '@inth/react/provider';
/**
 * `ConsentRoot`'s props and the checks on its state, shared by the
 * first-load shell (`./root`) and the engine it loads (`./root-engine`).
 *
 * @internal
 */
import type { ProviderTransportFactory, Vendor } from '@inth/sdk/engine';
import type { ConsentMode } from '@inth/sdk/modes';
import type { Script } from '@inth/sdk/modules/script-loader';
import type { ReactNode } from 'react';

import type { ConsentState } from './server';

export interface ConsentRootProps {
	/**
	 * The visitor's consent state produced server-side by `resolveConsent()`
	 * (or `createConsentStateHandler()`) from `@inth/tanstack-start/server`,
	 * usually read back with `Route.useLoaderData()`. Serializable JSON. It
	 * carries the backend URL, mode and route prefix the server helper was
	 * given, so the root needs no transport options of its own.
	 *
	 * A pending promise is fine too. Return it unawaited from the root
	 * loader (`loader: () => ({ consent: getConsentState() })`) and TanStack
	 * Router streams it: the response starts without waiting for the
	 * backend, and the banner mounts once the promise resolves after
	 * hydration instead of being in the server HTML. Until then no category
	 * is granted, so gated scripts and embeds stay blocked.
	 *
	 * Pages with no loader, such as a static host, pass `{}`. The browser
	 * then resolves consent from the backend URL `consentManifest()` read.
	 */
	state: ConsentState | Promise<ConsentState>;

	/**
	 * Script tags to manage with the script-loader module.
	 */
	scripts?: Script[];

	/**
	 * Vendors the preference center lists under their category, each with
	 * its own switch, so a visitor can grant a category and still turn one
	 * vendor off. Scripts, network rules and iframes naming a vendor's
	 * `id` follow that choice. Merged with vendors the backend declares.
	 * Optional: most sites need only categories. See the vendor consent guide.
	 */
	vendors?: Vendor[];

	/**
	 * Remove configured browser data for initially denied categories after policy
	 * resolution and when consent is later revoked.
	 * Initial-only: remount ConsentRoot to replace the cleanup configuration.
	 */
	clearOnRevocation?: ConsentProviderOptions['clearOnRevocation'];

	scriptLoader?: UseScriptLoaderOptions;

	networkBlocker?: UseNetworkBlockerOptions | false;

	/**
	 * Enable client-side persistence. Defaults to true.
	 */
	persistence?: boolean | UsePersistenceOptions;

	/**
	 * Additional React provider options.
	 */
	options?: Omit<
		ConsentProviderOptions,
		| 'projectUrl'
		| 'mode'
		| 'clearOnRevocation'
		| 'networkBlocker'
		| 'persistence'
		| 'prefetch'
		| 'scriptLoader'
		| 'scripts'
		| 'vendors'
		| '__debugPkg'
		| '__preloadScriptLoader'
		| '__resolveStreamedInit'
	> & {
		/**
		 * Replaces the mode the state carries: `manifest()` or `hosted()`
		 * from `@inth/tanstack-start`, `testing()` from
		 * `@inth/tanstack-start/testing`, or a transport factory.
		 */
		mode?: ConsentMode | ProviderTransportFactory;
	};

	children: ReactNode;
}

/**
 * Whether `state` is a promise the server streams.
 *
 * @internal
 */
export const isPending = function isPending(
	state: ConsentState | Promise<ConsentState>
): state is Promise<ConsentState> {
	return typeof (state as PromiseLike<ConsentState>).then === 'function';
};

/**
 * Whether `state` was resolved for this request: a streamed one, or one
 * with the request's policy and clock. A prerendered state, or the static
 * root's `{}`, is shared HTML: it starts no script from the HTML and
 * leaves no boot data, so the browser renders the whole root at once.
 *
 * @internal
 */
export const startsFromHTML = function startsFromHTML(
	state: ConsentState | Promise<ConsentState> | undefined
): boolean {
	if (state !== undefined && isPending(state)) {
		return true;
	}
	return (
		state?.initialPolicyResolution !== undefined && state.now !== undefined
	);
};
