import type {
	ProviderTransportFactory,
	ProviderTransportKind,
} from '../../transports/mode';
import type { KernelTransport } from '../../types';

/**
 * A transport factory that hands the runtime `transport`, for tests that
 * stand in for the backend with a fake.
 *
 * @param transport - The fake transport.
 * @param kind - The kind `window.inth.mode` reports.
 * @returns A factory for the runtime's `mode`.
 */
export const transportMode = function transportMode(
	transport: KernelTransport,
	kind: ProviderTransportKind = 'hosted'
): ProviderTransportFactory {
	return Object.assign(() => transport, { kind });
};
