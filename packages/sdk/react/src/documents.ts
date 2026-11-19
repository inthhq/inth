'use client';

import { createRuntimeDocuments } from '@inth/sdk/runtime/documents';
import type { RuntimeDocuments } from '@inth/sdk/runtime/documents';
import { useContext, useMemo } from 'react';

import { ProviderServicesContext } from './context';
import { requestDeferredEngine } from './deferred/registry';
import { useKernel } from './kernel-selector';

/**
 * Legal documents for the visitor under `InthProvider`: `check(type)`
 * reads the release in force and whether this browser accepted it, and
 * `accept(documents)` records an acceptance. Both use the provider's
 * backend, subject and property, and load their code on the first call.
 *
 * @example
 * ```tsx
 * const { check, accept } = useDocuments();
 * const terms = await check('terms_us');
 * if (!terms.accepted) {
 *   await accept({ type: 'terms_us', hash: terms.document.hash });
 * }
 * ```
 */
export const useDocuments = function useDocuments(): RuntimeDocuments {
	const kernel = useKernel();
	const services = useContext(ProviderServicesContext);
	return useMemo(
		() =>
			createRuntimeDocuments(async () => {
				if (!services) {
					throw new Error(
						'inth: useDocuments() needs <InthProvider> from @inth/react.'
					);
				}
				if (services.ready) {
					requestDeferredEngine(kernel);
					await services.ready;
				}
				return services.runtime;
			}),
		[kernel, services]
	);
};
