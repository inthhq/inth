import type { Overrides } from '../../options/overrides-options.model';
import type { ConsentExperiment } from '../experiment';
import type { ConsentJourneyOption } from '../journey.store';

export interface PrefetchOptions {
	/**
	 * Backend URL used for fetching `/v1/consent/init`.
	 * Accepts absolute URLs or same-origin paths like `/api/inth`.
	 */
	projectUrl: string;

	/**
	 * Optional request-level overrides for prefetching init data.
	 */
	overrides?: Pick<Overrides, 'country' | 'region' | 'language' | 'gpc'>;

	/**
	 * Fetch credentials mode. `/v1/consent/init` reads no cookie, so the default sends
	 * cookies only to a same-origin init route, and a cross-origin backend
	 * can answer with `Access-Control-Allow-Origin: *`.
	 *
	 * @default 'same-origin'
	 */
	credentials?: RequestCredentials;

	/**
	 * The provider's `journey` setting, for the journey this `/v1/consent/init` starts.
	 * Unset, the request continues a `'tab'` journey id this tab already
	 * holds, and otherwise starts a `'page'` journey.
	 */
	journey?: ConsentJourneyOption;

	/**
	 * The app's banner `experiment`, so the early request carries the arm
	 * the banner will run. The request picks it as Inth does: the arm this
	 * browser saw before, otherwise a weighted pick over `split`. The
	 * runtime then runs that arm. Only `id`, the arm names, `split` and a
	 * fixed `arm` are read.
	 *
	 * Without it, an app that runs an experiment sends its own `/v1/consent/init`
	 * while the visitor has no stored choice, so every visit is counted
	 * with its arm. The same happens when the arm the runtime runs differs,
	 * for example one a feature flag resolves at runtime.
	 */
	experiment?: Pick<ConsentExperiment, 'arm' | 'arms' | 'id' | 'split'>;

	/**
	 * The consent storage key, used to tell whether a choice is stored.
	 *
	 * @default 'inth'
	 */
	storageKey?: string;
}
