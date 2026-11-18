/**
 * Which kernels in context are a deferred root's stand-in, and the modules
 * its engine offers. Small and dependency-free, so a module hook can check
 * it without pulling the stand-in's code into its chunk.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentKernel } from '@inth/sdk/engine';
import type { Script } from '@inth/sdk/modules/script-loader';
import type * as ScriptLoaderModule from '@inth/sdk/modules/script-loader';
import { claimPlainScripts } from '@inth/sdk/surface-actions/plain-scripts';

/**
 * Loaders the engine's chunk offers. A module imported from there finds
 * the engine's modules already loaded, so the bundler does not copy them
 * into a chunk of its own, as it would for an import from the first-load
 * chunk.
 *
 * @internal
 */
export interface DeferredModules {
	loadScriptLoader: () => Promise<typeof ScriptLoaderModule>;
}

/**
 * The script loader's module. The one `import()` of it under a deferred
 * root, in the first-load chunk, so the engine and a commit made before it
 * load the same chunk.
 *
 * @internal
 */
export const loadDeferredScriptLoader = () =>
	import('@inth/sdk/modules/script-loader');

interface DeferredEntry {
	ready: Promise<DeferredModules>;
	request: () => void;
	current: () => ConsentKernel | undefined;
	/** Resolves when a loader may run: a choice was committed, or attach. */
	scripts: Promise<void>;
	/** The scripts each waiting `useScriptLoader` currently passes. */
	sources?: Map<() => readonly Script[], Map<string, string> | undefined>;
	/** Starts plain scripts a committed choice allows, before the loader. */
	start?: (scripts: readonly Script[]) => readonly string[] | undefined;
}

const engines = new WeakMap<ConsentKernel, DeferredEntry>();

/** @internal */
export const markDeferredKernel = function markDeferredKernel(
	kernel: ConsentKernel,
	ready: Promise<DeferredModules>,
	request: () => void,
	current: () => ConsentKernel | undefined,
	// oxlint-disable-next-line promise/prefer-await-to-then -- Settles with `ready`.
	scripts: Promise<void> = ready.then(() => undefined)
): void {
	engines.set(kernel, { current, ready, request, scripts });
};

/**
 * For a stand-in kernel: resolves once a script loader may run on it, when
 * a banner choice was committed without the engine or the engine attached.
 *
 * @param kernel - A kernel from context.
 * @returns A promise for a stand-in kernel, else `undefined`.
 * @internal
 */
export const deferredScriptsReady = function deferredScriptsReady(
	kernel: ConsentKernel
): Promise<void> | undefined {
	return engines.get(kernel)?.scripts;
};

/**
 * The engine's modules, for a deferred root's stand-in kernel. They
 * resolve once its engine attached, so nothing loads before the engine.
 *
 * @param kernel - A kernel from context.
 * @returns A promise for a stand-in kernel, else `undefined`.
 * @internal
 */
export const deferredModules = function deferredModules(
	kernel: ConsentKernel
): Promise<DeferredModules> | undefined {
	return engines.get(kernel)?.ready;
};

/**
 * Starts loading a deferred root's engine now, for a stand-in kernel.
 * Does nothing for any other kernel, or when the engine is loading.
 *
 * @param kernel - A kernel from context.
 * @internal
 */
export const requestDeferredEngine = function requestDeferredEngine(
	kernel: ConsentKernel
): void {
	engines.get(kernel)?.request();
};

/**
 * The engine's kernel a deferred root's stand-in currently routes to.
 * Modules that key state by kernel (vendor ownership, script diagnostics)
 * register on it, as the engine's own modules do, so both see one key.
 *
 * @param kernel - A kernel from context.
 * @returns The engine's kernel once attached; else `undefined`.
 * @internal
 */
export const attachedKernel = function attachedKernel(
	kernel: ConsentKernel
): ConsentKernel | undefined {
	return engines.get(kernel)?.current();
};

/**
 * Tells a deferred root which scripts a `useScriptLoader` waiting on its
 * stand-in will run, so a banner commit can start them before the
 * loader's chunk arrives. Does nothing for any other kernel.
 *
 * @param kernel - A kernel from context.
 * @param scripts - Returns the hook's current scripts.
 * @returns Stops telling.
 * @internal
 */
export const registerDeferredScripts = function registerDeferredScripts(
	kernel: ConsentKernel,
	scripts: () => readonly Script[],
	owned?: Map<string, string>
): () => void {
	const entry = engines.get(kernel);
	if (!entry) {
		return () => undefined;
	}
	entry.sources ??= new Map();
	entry.sources.set(scripts, owned);
	return () => {
		entry.sources?.delete(scripts);
	};
};

/**
 * The scripts every waiting `useScriptLoader` under a stand-in passes.
 *
 * @param kernel - A kernel from context.
 * @returns The scripts, empty for any other kernel.
 * @internal
 */
export const deferredScripts = function deferredScripts(
	kernel: ConsentKernel
): Script[] {
	return [...(engines.get(kernel)?.sources?.keys() ?? [])].flatMap((get) =>
		get()
	);
};

/**
 * Claims, for each waiting `useScriptLoader` that registered where it
 * records what it holds, the early-started elements its scripts name. A
 * commit that started them in the same task calls this, so a hook that
 * goes before its own claim still releases them.
 *
 * @param kernel - A kernel from context.
 * @internal
 */
export const claimDeferredScripts = function claimDeferredScripts(
	kernel: ConsentKernel
): void {
	const entry = engines.get(kernel);
	for (const [get, owned] of entry?.sources ?? []) {
		// One started for another declaration of the resource is not what
		// this hook runs, and is left to its owners: the engine loads it.
		if (owned && claimPlainScripts(get(), owned).length > 0) {
			entry?.request();
		}
	}
};

/**
 * Sets how a deferred root starts the plain scripts its committed choice
 * allows (see `instant.ts`), for a loader that registers after the choice.
 *
 * @param kernel - The root's stand-in kernel.
 * @param start - Inserts the scripts; ignores those it cannot.
 * @internal
 */
export const setDeferredScriptStarter = function setDeferredScriptStarter(
	kernel: ConsentKernel,
	start: (scripts: readonly Script[]) => readonly string[] | undefined
): void {
	const entry = engines.get(kernel);
	if (entry) {
		entry.start = start;
	}
};

/**
 * Whether a deferred root starts plain scripts without its engine: a
 * choice was committed, or the stored one already allows them.
 *
 * @param kernel - A kernel from context.
 * @returns `false` for any other kernel.
 * @internal
 */
export const startsDeferredScripts = function startsDeferredScripts(
	kernel: ConsentKernel
): boolean {
	return Boolean(engines.get(kernel)?.start);
};

/**
 * Starts the plain scripts a deferred root's committed choice allows, ahead
 * of the script loader's chunk, which adopts them. Does nothing for any
 * other kernel.
 *
 * @param kernel - A kernel from context.
 * @param scripts - A loader's scripts.
 * @returns The resource keys it inserted, which the caller owns until its
 * loader adopts them.
 * @internal
 */
export const startDeferredScripts = function startDeferredScripts(
	kernel: ConsentKernel,
	scripts: readonly Script[]
): readonly string[] {
	return engines.get(kernel)?.start?.(scripts) ?? [];
};
