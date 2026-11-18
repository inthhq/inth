/**
 * `@inth/react/deferred`: a consent root whose engine loads after the
 * page, for adapters that server-render. The engine side is in
 * `@inth/react/deferred/engine`, so this entry stays small.
 *
 * @packageDocumentation
 * @internal
 */

// oxlint-disable-next-line oxc/no-barrel-file -- The subpath's public interface.
export { DeferredConsentBanner, DeferredConsentDialog } from './surfaces';
export type { ConsentBoot, RootEngineInputs } from './boot';
export type { DeferredCommitConfig, DeferredCommitted } from './committed';
export {
	canDeferEngine,
	engineNeededAtLoad,
	canDeferEngineAfterChoice,
	iabProviderLoaded,
	whenIABProviderLoads,
	liveRootKey,
	readConsentBoot,
	rootNeedsEngine,
	startsScriptsWithoutEngine,
	storedChoiceCurrent,
} from './boot';
export { useConsentBootPlan } from './boot-plan';
export type { DeferredEngine, DeferredKernelHandle } from './deferred-kernel';
export { learnEngineChunks } from './engine-preload';
export { isRunnableNow, scriptsNeedEngine } from './runnable';
export { record, read } from './session';
export type { Recorded } from './session';
export type { DeferredConsentShellProps, DeferredShellOptions } from './shell';
export { DeferredConsentShell } from './shell';
