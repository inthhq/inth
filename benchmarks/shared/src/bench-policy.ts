/**
 * A transport factory that resolves policy rules in the browser with no
 * backend, for benchmark pages.
 *
 * Benchmarks build and run in production, where `testing()` from a
 * package's `/testing` entry refuses to run. This stands in for the backend
 * with the same local resolver, so a benchmark page measures the provider
 * and its surfaces, not the network.
 */
import type { PolicyRule, ProviderTransportFactory } from '@inth/react';

// By path: the benchmarks package declares no dependency on `@inth/sdk/engine`.
import { createOfflineTransport } from '../../../packages/sdk/core/src/transports/offline';

/**
 * The `mode` of a benchmark page.
 *
 * @param options - `policy`: the rules to resolve. Without it, the
 *   recommended pack.
 * @returns A transport factory for the provider's `mode`.
 */
export const benchPolicy = function benchPolicy(
	options: { policy?: PolicyRule[] } = {}
): ProviderTransportFactory {
	return Object.assign(
		(context: Parameters<ProviderTransportFactory>[0]) =>
			createOfflineTransport({
				acknowledgeNoRecords: true,
				iabEnabled: context.iabEnabled,
				policyRules: options.policy,
				translations: context.translations,
				translationsFor: context.translationsFor,
			}),
		{ kind: 'offline' as const }
	);
};
