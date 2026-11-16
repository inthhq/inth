'use client';

import type {
	Script,
	ScriptLoaderDebugEvent,
	ScriptLoaderHandle,
} from '@c15t/core/modules/script-loader';
import {
	changedPlainScripts,
	claimPlainScripts,
	releasePlainScripts,
} from '@c15t/core/surface-actions/plain-scripts';
import { useEffect, useRef, useState } from 'react';

import {
	attachedKernel,
	deferredModules,
	deferredScriptsReady,
	loadDeferredScriptLoader,
	registerDeferredScripts,
	requestDeferredEngine,
	startDeferredScripts,
	startsDeferredScripts,
} from '../deferred/registry';
import {
	isPlainScript,
	isRunnableNow,
	observesConsent,
} from '../deferred/runnable';
import { useRequiredKernel } from './shared';

/**
 * Under a deferred root, a script that may run now would otherwise wait
 * for the engine's trigger (the page's priority images, or a tap). Start
 * the engine for it at once, unless the root starts it without the engine.
 * Does nothing under any other kernel.
 */
const startEngineFor = function startEngineFor(
	kernel: ReturnType<typeof useRequiredKernel>,
	scripts: Script[]
): void {
	if (!deferredModules(kernel)) {
		return;
	}
	const snapshot = kernel.getSnapshot();
	// Plain scripts the root starts without the engine do not need it. A
	// script the loader reports a denial to does, even while it may not run.
	const starts = startsDeferredScripts(kernel);
	if (
		scripts.some((script) =>
			isRunnableNow(script, snapshot)
				? !(starts && isPlainScript(script))
				: observesConsent(script)
		)
	) {
		requestDeferredEngine(kernel);
	}
};

export interface UseScriptLoaderOptions {
	onDebug?: (event: ScriptLoaderDebugEvent) => void;
	/**
	 * Set `false` to start every `scripts` entry after hydration. By default
	 * `ConsentRoot` in `c15t/next` and `c15t/tanstack-start` starts the
	 * entries the visitor's consent already allows from the server HTML,
	 * before the page hydrates.
	 *
	 * @default true
	 */
	serverStart?: boolean;
}

/**
 * Starts `scripts` before the loader, then holds every early-started
 * element they name, whoever started it: another hook or the root may
 * share the resource, and the element stays until its last holder goes.
 */
const startEarly = function startEarly(
	kernel: ReturnType<typeof useRequiredKernel>,
	early: Map<string, string>,
	scripts: readonly Script[]
): void {
	startDeferredScripts(kernel, scripts);
	// One started for another declaration of the resource is not what these
	// scripts run, and is left to its owners: the engine loads these.
	if (claimPlainScripts(scripts, early).length > 0) {
		requestDeferredEngine(kernel);
	}
};

/** Releases what `early` holds that `kept` no longer names. */
const releaseEarly = function releaseEarly(
	early: Map<string, string>,
	kept: readonly Script[]
): void {
	const keys = new Set(kept.map((script) => script.resourceKey ?? script.id));
	const gone = [...early.keys()].filter((key) => !keys.has(key));
	releasePlainScripts(gone);
	for (const key of gone) {
		early.delete(key);
	}
};

export const useScriptLoader = function useScriptLoader(
	scripts: Script[],
	options: UseScriptLoaderOptions = {}
): ScriptLoaderHandle {
	const kernel = useRequiredKernel();
	const handleRef = useRef<ScriptLoaderHandle | null>(null);
	const latestScriptsRef = useRef(scripts);
	const latestOptionsRef = useRef(options);
	// Plain scripts this hook started before its loader, which it owns until
	// the loader adopts them: they leave with the hook, or when it drops them.
	const earlyRef = useRef(new Map<string, string>());

	const [handle, setHandle] = useState<ScriptLoaderHandle>(() => ({
		dispose() {
			handleRef.current?.dispose();
			handleRef.current = null;
			releaseEarly(earlyRef.current, []);
		},
		getLoadedScriptIds() {
			return handleRef.current?.getLoadedScriptIds() ?? [];
		},
		updateScripts(next) {
			latestScriptsRef.current = next;
			if (handleRef.current) {
				handleRef.current.updateScripts(next);
			} else {
				// A script it started early that it now declares otherwise (a
				// new src, a denied category) is no longer what the page runs:
				// release it, and leave it to the engine.
				const changed = changedPlainScripts(next, earlyRef.current);
				if (changed.length > 0) {
					releasePlainScripts(changed);
					for (const key of changed) {
						earlyRef.current.delete(key);
					}
					requestDeferredEngine(kernel);
				}
				releaseEarly(earlyRef.current, next);
				startEngineFor(kernel, next);
				// Plain scripts the root may start before its loader exists,
				// checked by the root as they start.
				startEarly(kernel, earlyRef.current, next);
			}
		},
	}));
	void setHandle;

	useEffect(() => {
		latestScriptsRef.current = scripts;
		latestOptionsRef.current = options;
	}, [options, scripts]);

	const firstRun = useRef(true);
	useEffect(() => {
		if (firstRun.current) {
			firstRun.current = false;
			return;
		}
		handle.updateScripts(scripts);
	}, [handle, scripts]);

	useEffect(() => {
		const early = earlyRef.current;
		let disposed = false;
		let unsubscribe: (() => void) | undefined;
		// A banner commit before the loader starts these scripts itself.
		const unregister = registerDeferredScripts(
			kernel,
			() => latestScriptsRef.current,
			early
		);
		void (async () => {
			// Under a deferred root the loader waits until the stand-in may
			// grant something: the engine attached, or a banner choice was
			// committed before it (`deferred/commit.ts`).
			const ready = deferredScriptsReady(kernel);
			startEngineFor(kernel, latestScriptsRef.current);
			// A returning visitor's root starts the plain scripts its stored
			// choice allows now, checking that choice as it does; without a
			// starter (no stored choice, no commit yet) this does nothing.
			startEarly(kernel, early, latestScriptsRef.current);
			if (ready) {
				await ready;
				// A hook that unmounted while it waited starts nothing.
				if (disposed) {
					return;
				}
				// Scripts registered after a committed choice start now; the
				// loader adopts them when its chunk arrives.
				startEarly(kernel, early, latestScriptsRef.current);
			}
			const { createScriptLoader } = await loadDeferredScriptLoader();
			unregister();
			if (disposed) {
				return;
			}
			// On the engine's kernel once attached, as its own loader for
			// `scripts` is: state kept per kernel (vendor owners, diagnostics)
			// then has one key. A loader started from a commit stays on the
			// stand-in, which routes to the engine once it attaches: moving it
			// would remove and insert its scripts again.
			let target = (ready && attachedKernel(kernel)) || kernel;
			const create = () => {
				handleRef.current = createScriptLoader({
					kernel: target,
					onDebug: latestOptionsRef.current.onDebug,
					scripts: latestScriptsRef.current,
				});
			};
			create();
			if (ready && target !== kernel) {
				// The engine swaps kernels when `enabled` changes; follow it.
				unsubscribe = kernel.subscribe(() => {
					const next = attachedKernel(kernel);
					if (next && next !== target) {
						handleRef.current?.dispose();
						target = next;
						create();
					}
				});
			}
		})();

		return () => {
			disposed = true;
			unregister();
			unsubscribe?.();
			handleRef.current?.dispose();
			handleRef.current = null;
			releaseEarly(early, []);
		};
	}, [kernel]);

	return handle;
};

export type { Script, ScriptLoaderDebugEvent, ScriptLoaderHandle };
