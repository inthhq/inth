/**
 * `@inth/react/deferred/engine`: the side of a deferred root that loads
 * on demand, and the server's boot data.
 *
 * @packageDocumentation
 * @internal
 */

// oxlint-disable-next-line oxc/no-barrel-file -- The subpath's public interface.
export { ConsentBootData } from './consent-boot-data';
export { ServerBootData } from './server-boot-data';
export type { ConsentBootDataProps } from './server-boot-data';
export type { DeferredEngineHostProps } from './deferred-engine-host';
export { DeferredEngineHost } from './deferred-engine-host';
export {
	importScriptServerStart,
	renderFor,
	renderPlan,
	settledState,
} from './server-render.model';
export { read } from './server-render';
export type {
	Recorded,
	ScriptServerStartModule,
} from './server-render.model';
// The stock surfaces load with the engine, in one chunk group: imported
// apart, each group would carry its own copy of the modules they share.
export { ConsentDialog, OptOutConfirmation } from '../aggregate-components';
// The banner waits for the container the server rendered before it
// hydrates (`surface-with-parts.tsx`).
export {
	ConsentBanner,
	preloadServerContainer,
} from '../components/prompt/index';
