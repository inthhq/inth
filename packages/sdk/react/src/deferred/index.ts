/**
 * `@inth/react/deferred`: a consent root whose engine loads after the
 * page, for adapters that server-render. The engine side is in
 * `@inth/react/deferred/engine`, so this entry stays small.
 *
 * @packageDocumentation
 * @internal
 */

// oxlint-disable-next-line oxc/no-barrel-file -- The subpath's public interface.
export { DeferredConsentBanner, DeferredConsentDialog } from './surface-with-parts';
export { DeferredOptOutConfirmation } from './deferred-opt-out-confirmation';
export type { ConsentBoot, RootEngineInputs } from './boot';
export type {
	DeferredCommitConfig,
	DeferredCommitted,
} from './deferred-committed.model';
export {
	awaitsChoice,
	canDeferEngineAfterChoice,
	iabProviderLoaded,
	whenIABProviderLoads,
	liveRootKey,
	readConsentBoot,
	rootNeedsEngine,
	storedChoiceCurrent,
} from './boot';
export {
	engineNeededAtLoad,
	startsScriptsWithoutEngine,
	useConsentBootPlan,
} from './use-consent-boot-plan';
export type {
	DeferredEngine,
	DeferredKernelHandle,
} from './create-deferred-kernel';
export { learnEngineChunks } from './engine-preload.store';
export { isRunnableNow, scriptsNeedEngine } from './runnable-script.model';
export {
	record,
	recordOnce,
} from './recorded-promise.model';
export { read } from './read';
export type { Recorded } from './recorded-promise.model';
export type {
	DeferredConsentShellProps,
	DeferredShellOptions,
} from './deferred-consent-shell';
export { DeferredConsentShell } from './deferred-consent-shell';
