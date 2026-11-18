/**
 * `@inth/react/deferred/engine`: the side of a deferred root that loads
 * on demand, and the server's boot data.
 *
 * @packageDocumentation
 * @internal
 */

// oxlint-disable-next-line oxc/no-barrel-file -- The subpath's public interface.
export { ConsentBootData, ServerBootData } from './boot-data';
export type { ConsentBootDataProps } from './boot-data';
export type { DeferredEngineHostProps } from './engine-host';
export { DeferredEngineHost } from './engine-host';
// The stock surfaces load with the engine, in one chunk group: imported
// apart, each group would carry its own copy of the modules they share.
export { ConsentDialog } from '../aggregate-components';
export { ConsentBanner } from '../components/prompt/index';
