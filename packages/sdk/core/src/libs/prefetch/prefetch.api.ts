/**
 * The `/v1/consent/init` request a browser prefetch sends.
 *
 * @packageDocumentation
 * @internal
 */
import { appendInitParams, appendJourneyParams } from '@inth/sdk-schema/types';
import type { InitOutput } from '@inth/sdk-schema/types';

import type { InitContext, KernelJourney } from '../../consent-kernel.model';
import type { SSRInitialData } from '../../options/ssr-options.model';

/** A pending `/v1/consent/init` response, as the page reads it. */
export type PrefetchPromise = Promise<SSRInitialData | undefined>;
/** One prefetched `/v1/consent/init`, with the request it answers. */
export interface PrefetchEntry {
	promise: PrefetchPromise;
	requestContext: NonNullable<SSRInitialData['metadata']>['requestContext'];
}

/** The `/v1/consent/init` request a prefetch sends, and its cache key. */
export interface PrefetchConfig {
	url: string;
	credentials: RequestCredentials;
	headers: Record<string, string>;
	requestContext: NonNullable<SSRInitialData['metadata']>['requestContext'];
	cacheKey: string;
}

const toInitialData = function toInitialData(
	config: Pick<PrefetchConfig, 'requestContext'>,
	init: InitOutput | undefined,
	journey: KernelJourney | undefined,
	experiment: InitContext['experiment']
): SSRInitialData | undefined {
	if (!init) {
		return undefined;
	}

	return {
		gvl: init.gvl,
		init,
		metadata: {
			experiment: experiment ?? null,
			journey: journey ?? null,
			requestContext: config.requestContext,
		},
	};
};

/**
 * Starts the `/v1/consent/init` request for `config`. The request carries
 * the experiment arm and journey; a failed one resolves to `undefined`.
 *
 * @internal
 */
export const createPrefetchEntry = function createPrefetchEntry(
	config: PrefetchConfig,
	journey: KernelJourney | undefined,
	experiment: InitContext['experiment']
): PrefetchEntry {
	const promise = (async () => {
		try {
			// The cache key stays the bare URL; only the request carries the
			// experiment arm and journey, as the inline script does.
			const withArm = experiment
				? appendInitParams(config.url, { experiment })
				: config.url;
			const url = journey ? appendJourneyParams(withArm, journey) : withArm;
			const response = await fetch(url, {
				credentials: config.credentials,
				headers: config.headers,
				method: 'GET',
			});
			const init = response.ok
				? ((await response.json()) as InitOutput)
				: undefined;
			return toInitialData(config, init, journey, experiment);
		} catch {
			return undefined;
		}
	})();

	return {
		promise,
		requestContext: config.requestContext,
	};
};
