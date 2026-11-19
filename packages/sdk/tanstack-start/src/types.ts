import type { PrefetchOptions } from '@inth/sdk/engine';

/**
 * Options for {@link consentPrefetchHead}.
 */
export interface ConsentPrefetchHeadOptions extends PrefetchOptions {
	/**
	 * Script element ID. Stable across renders so React reconciles the same
	 * head element instead of inserting a second one.
	 *
	 * @default 'inth-initial-data-prefetch'
	 */
	id?: string;
}

/**
 * A `head()` fragment TanStack Router can merge: a single inline script
 * entry under `scripts`.
 */
export interface ConsentPrefetchHead {
	scripts: {
		id: string;
		children: string;
	}[];
}
