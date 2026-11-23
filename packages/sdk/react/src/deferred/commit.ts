/**
 * A deferred root's commit path: a banner accept or reject tapped before
 * the engine loaded, recorded without it.
 *
 * Loaded on that tap, in a chunk of its own, instead of the engine. It
 * records the choice with core's `completeCommit`: the stand-in kernel
 * reads the committed snapshot, the record is stored, the save is queued
 * and the root's callbacks hear it. This adds the root's `scripts`, which
 * start with the choice. The engine loads next, starts from the records
 * and sends the queued save; it records nothing again.
 *
 * @packageDocumentation
 * @internal
 */

import type { SaveResult, SaveUISource } from '@inth/sdk/engine';
import type { ScriptLoaderHandle } from '@inth/sdk/modules/script-loader';
import { completeCommit } from '@inth/sdk/surface-actions/early-commit';
import type { CompleteCommitInput } from '@inth/sdk/surface-actions/early-commit';
import type { InstantCommit } from '@inth/sdk/surface-actions/instant-commit';

import type { DeferredCommitConfig, DeferredCommitted } from './deferred-committed.model';
import type { DeferredKernelHandle } from './create-deferred-kernel';
import { startPlainScripts } from './instant-commit.model';
import {
	claimDeferredScripts,
	deferredScripts,
	loadDeferredScriptLoader,
} from './deferred-registry.model';

/** @internal */
export interface CommitTapInput {
	handle: DeferredKernelHandle;
	/** `'all'` for accept, `'none'` for reject, or a form's selection. */
	choice: CompleteCommitInput['choice'];
	/** Epoch milliseconds of the tap. */
	actionAt: number;
	/** The surface the save is attributed to. Defaults to `banner`. */
	uiSource?: SaveUISource;
	config: DeferredCommitConfig;
	/**
	 * The commit the root already made in the tap's task
	 * (`commitInstantly`). This completes it: the stand-in keeps its
	 * snapshot when it equals the one planned here, as it must.
	 */
	instant?: InstantCommit;
}

/** @internal */
export interface CommitTapResult {
	committed: DeferredCommitted;
	/** What `commands.save` resolves with for the same save. */
	result: SaveResult;
	/** The loader for the root's `scripts`, once the commit started one. */
	loader?: Promise<ScriptLoaderHandle>;
}

/**
 * Records a banner accept or reject on a deferred root's stand-in kernel,
 * or completes the instant commit the root made in the tap's task, as
 * core's `completeCommit` does, and starts the root's `scripts` with the
 * choice. Returns `null` and changes nothing when only the engine can
 * record it; the engine then records the tap.
 *
 * @returns What the engine needs to take over, or `null`.
 * @internal
 */
export const commitEarlyTap = async function commitEarlyTap(
	input: CommitTapInput
): Promise<CommitTapResult | null> {
	const { config, handle } = input;
	let loader: Promise<ScriptLoaderHandle> | undefined;
	const done = await completeCommit({
		actionAt: input.actionAt,
		choice: input.choice,
		config,
		handle,
		instant: input.instant ?? null,
		onCommitted(snapshot) {
			// The page's plain scripts start with the choice; the loader adopts
			// them when it arrives after it.
			startPlainScripts(
				[...deferredScripts(handle.kernel), ...(config.scripts ?? [])],
				snapshot,
				config.nonce,
				config.reserved
			);
			// The hooks whose scripts it started hold them from this task on.
			claimDeferredScripts(handle.kernel);
			const scripts = config.scripts ?? [];
			loader = scripts.length
				? (async () => {
						const { createScriptLoader } = await loadDeferredScriptLoader();
						return createScriptLoader({
							kernel: handle.kernel,
							nonce: config.nonce,
							onDebug: config.onDebug,
							scripts,
						});
					})()
				: undefined;
		},
		uiSource: input.uiSource,
	});
	if (!done) {
		return null;
	}
	return {
		committed: { ...done.committed, ownsScripts: loader !== undefined },
		loader,
		result: done.result,
	};
};
