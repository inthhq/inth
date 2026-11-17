/**
 * `ConsentRoot`'s props and option merging, shared by the first-load shell
 * (`./root`) and the engine it loads (`./root-engine`).
 *
 * @internal
 */
import type { ReactNode } from 'react';

import type { ConsentConfig } from './config';
import type { ConsentClientOptions, ConsentState } from './types';

export interface ConsentRootProps extends ConsentClientOptions {
	/**
	 * The visitor's resolved consent state, produced server-side by
	 * `resolveConsent()` from `c15t/next/server` or `withConsentProps()`
	 * from `c15t/next/pages`. Serializable JSON; a promise is fine, the
	 * provider awaits it. Without it the browser resolves consent itself.
	 */
	state?: ConsentState | Promise<ConsentState>;

	/**
	 * The config to use instead of `c15t.config.ts`. Only for a root the
	 * file can't reach, such as one in a test or a package: a Server
	 * Component can't pass it, because it may hold functions.
	 */
	config?: ConsentConfig;

	children?: ReactNode;
}

type RootOptions = ConsentClientOptions['options'];

/**
 * `options` from props over the config's, one key at a time, and
 * `callbacks` one callback at a time, so `options={{ nonce }}` keeps the
 * config's callbacks and other options.
 *
 * @internal
 */
export const mergeOptions = function mergeOptions(
	config: RootOptions,
	props: RootOptions
): RootOptions {
	if (!(config && props)) {
		return props ?? config;
	}
	return {
		...config,
		...props,
		callbacks: { ...config.callbacks, ...props.callbacks },
	};
};
