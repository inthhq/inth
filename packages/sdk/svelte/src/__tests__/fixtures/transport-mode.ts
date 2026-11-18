import type {
	KernelTransport,
	PolicyRule,
	ProviderTransportFactory,
	ProviderTransportKind,
} from '@inth/sdk/engine';
import type { ConsentTesting } from '@inth/sdk/testing';

import { testing } from '../../lib/testing';

/**
 * A transport factory that hands the provider `transport`, for tests that
 * stand in for the backend with a fake.
 *
 * @param transport - The fake transport.
 * @param kind - The kind `window.c15t.mode` reports.
 * @returns A factory for the provider's `mode`.
 */
export const transportMode = function transportMode(
	transport: KernelTransport,
	kind: ProviderTransportKind = 'hosted'
): ProviderTransportFactory {
	return Object.assign(() => transport, { kind });
};

/**
 * `testing()` resolving `policyRules`, for tests that need a policy the
 * recommended pack has no rule for, such as the opt-out notice.
 *
 * @param policyRules - The rules to resolve.
 * @returns A `testing()` mode.
 */
export const offlineMode = function offlineMode(
	policyRules: PolicyRule[]
): ConsentTesting {
	return testing({ policy: policyRules });
};
