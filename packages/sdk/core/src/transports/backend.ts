/**
 * The backend a transport reports, through the transport context a
 * runtime builds, once it has resolved it: the settings
 * `@inth/sdk/runtime/documents` sends with. Off the published context
 * type: only the runtime and core's own transports know the callback.
 *
 * @internal
 */
import type { TransportBackend } from '../kernel/internals';
import type { ProviderTransportContext } from './mode';

/** A transport context from a runtime, which hears the backend. */
export interface BackendReportingContext extends ProviderTransportContext {
	backend?: (backend: TransportBackend) => void;
}
