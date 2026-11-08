'use client';

import type {
	Script,
	ScriptLoaderDebugEvent,
	ScriptLoaderHandle,
} from '@c15t/core/modules/script-loader';
import { useEffect, useRef, useState } from 'react';

import {
	attachedKernel,
	deferredModules,
	deferredScriptsReady,
	loadDeferredScriptLoader,
	registerDeferredScripts,
	requestDeferredEngine,
	startDeferredScripts,
} from '../deferred/registry';
import { isRunnableNow } from '../deferred/runnable';
import { useRequiredKernel } from './shared';

/**
 * Under a deferred root, a script that may run now would otherwise wait
 * for the engine's trigger (the page's priority images, or a tap). Start
 * the engine for it at once. Does nothing under any other kernel.
 */
const startEngineFor = function startEngineFor(
	kernel: ReturnType<typeof useRequiredKernel>,
	scripts: Script[]
): void {
	if (!deferredModules(kernel)) {
		return;
	}
	const snapshot = kernel.getSnapshot();
	if (scripts.some((script) => isRunnableNow(script, snapshot))) {
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

export const useScriptLoader = function useScriptLoader(
	scripts: Script[],
	options: UseScriptLoaderOptions = {}
): ScriptLoaderHandle {
	const kernel = useRequiredKernel();
	const handleRef = useRef<ScriptLoaderHandle | null>(null);
	const latestScriptsRef = useRef(scripts);
	const latestOptionsRef = useRef(options);

	const [handle, setHandle] = useState<ScriptLoaderHandle>(() => ({
		dispose() {
			handleRef.current?.dispose();
			handleRef.current = null;
		},
		getLoadedScriptIds() {
			return handleRef.current?.getLoadedScriptIds() ?? [];
		},
		updateScripts(next) {
			latestScriptsRef.current = next;
			if (handleRef.current) {
				handleRef.current.updateScripts(next);
			} else {
				startEngineFor(kernel, next);
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
		let disposed = false;
		let unsubscribe: (() => void) | undefined;
		// A banner commit before the loader starts these scripts itself.
		const unregister = registerDeferredScripts(
			kernel,
			() => latestScriptsRef.current
		);
		void (async () => {
			// Under a deferred root the loader waits until the stand-in may
			// grant something: the engine attached, or a banner choice was
			// committed before it (`deferred/commit.ts`).
			const ready = deferredScriptsReady(kernel);
			startEngineFor(kernel, latestScriptsRef.current);
			if (ready) {
				await ready;
				// Scripts registered after a committed choice start now; the
				// loader adopts them when its chunk arrives.
				startDeferredScripts(kernel, latestScriptsRef.current);
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
		};
	}, [kernel]);

	return handle;
};

export type { Script, ScriptLoaderDebugEvent, ScriptLoaderHandle };
