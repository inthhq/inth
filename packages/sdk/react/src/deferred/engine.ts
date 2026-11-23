/**
 * `@inth/react/deferred/engine`: the side of a deferred root that loads
 * on demand, and the server's boot data.
 *
 * @packageDocumentation
 * @internal
 */

// oxlint-disable-next-line oxc/no-barrel-file -- The subpath's public interface.
export { ConsentBootData, ServerBootData } from './consent-boot-data';
export type { ConsentBootDataProps } from './consent-boot-data';
export type { DeferredEngineHostProps } from './deferred-engine-host';
export { DeferredEngineHost } from './deferred-engine-host';
export {
	importScriptServerStart,
	read,
	renderFor,
	renderPlan,
	settledState,
} from './server-render.model';
export type { Recorded, ScriptServerStartModule } from './server-render.model';
// The stock surfaces load with the engine, in one chunk group: imported
// apart, each group would carry its own copy of the modules they share.
export { ConsentDialog, OptOutConfirmation } from '../aggregate-components';
// The banner waits for the container the server rendered before it
// hydrates (`surfaces.tsx`).
export {
	ConsentBanner,
	preloadServerContainer,
} from '../components/prompt/index';
