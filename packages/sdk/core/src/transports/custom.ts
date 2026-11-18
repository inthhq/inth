/**
 * `custom()`, kept on `@inth/sdk/transports` only for
 * `@inth/react-native`'s web client, which builds its own transports.
 * Providers no longer take it: tests pass a transport factory as `mode`,
 * and apps set `projectUrl`.
 *
 * @deprecated Remove once `@inth/react-native` no longer imports it.
 */
import type { KernelTransport } from '../types';
import type { ProviderTransportFactory } from './mode';

/**
 * Wraps a caller-supplied transport as a provider transport factory.
 *
 * @deprecated For `@inth/react-native` only; see the module comment.
 * @param transport - Canonical kernel transport.
 * @returns A custom provider transport factory.
 * @example
 * ```ts
 * import { custom } from '@inth/sdk-core/transports';
 *
 * const mode = custom({
 *   async init() {
 *     return await loadInitResponse();
 *   },
 *   async save(payload) {
 *     await persist(payload);
 *     return { ok: true, subjectId: payload.subjectId };
 *   },
 * });
 * ```
 */
export const custom = function custom(
	transport: KernelTransport
): ProviderTransportFactory {
	if ('setConsent' in transport) {
		throw new TypeError(
			'inth: custom() requires a KernelTransport with save(), not endpoint handlers'
		);
	}
	return Object.assign(() => transport, { kind: 'custom' as const });
};
