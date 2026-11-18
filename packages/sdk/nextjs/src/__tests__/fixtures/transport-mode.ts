import type {
	KernelTransport,
	ProviderTransportFactory,
	ProviderTransportKind,
} from '@inth/sdk/engine';

/**
 * A transport factory that hands the provider `transport`, for tests that
 * stand in for the backend with a fake.
 *
 * @param transport - The fake transport.
 * @param kind - The kind `window.inth.mode` reports.
 * @returns A factory for the provider's `mode`.
 */
export const transportMode = function transportMode(
	transport: KernelTransport,
	kind: ProviderTransportKind = 'hosted'
): ProviderTransportFactory {
	return Object.assign(() => transport, { kind });
};
