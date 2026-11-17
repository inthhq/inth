import type {
	KernelTransport,
	PolicyRule,
	ProviderTransportFactory,
	ProviderTransportKind,
} from '@c15t/core';
import { createOfflineTransport } from '@c15t/core/transports';

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
 * A transport factory that resolves `policyRules` in the browser, for
 * tests that need a policy the recommended pack has no rule for, such as
 * the opt-out notice. `withoutNetwork()` covers the others.
 *
 * @param policyRules - The rules to resolve.
 * @returns A factory for the provider's `mode`.
 */
export const offlineMode = function offlineMode(
	policyRules: PolicyRule[]
): ProviderTransportFactory {
	return Object.assign(
		(context: Parameters<ProviderTransportFactory>[0]) =>
			createOfflineTransport({
				acknowledgeNoRecords: true,
				iabEnabled: context.iabEnabled,
				policyRules,
				translations: context.translations,
				translationsFor: context.translationsFor,
			}),
		{ kind: 'offline' as const }
	);
};
