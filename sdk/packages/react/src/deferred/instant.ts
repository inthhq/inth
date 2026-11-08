/**
 * A deferred root's instant commit: a banner or dialog save recorded on the
 * stand-in kernel in the tap's own task, before any chunk loads.
 *
 * In the first-load chunk, so it is small. For a visitor with no stored
 * choice (`planInstantCommit` says which), it starts the plain scripts the
 * choice allows, then gives the stand-in the committed snapshot, whose
 * listeners (`useSnapshot`) hear it at once. Storage, the save, the root's
 * callbacks and events follow from the commit chunk (`commit.ts`), which
 * the caller loads next and which takes this commit over.
 *
 * @packageDocumentation
 * @internal
 */

import {
	generateSubjectId,
	hasStoredClearEpoch,
	isShortCase,
	planInstantCommit,
} from '@c15t/core/surface-actions/instant-commit';
import type { InstantCommit } from '@c15t/core/surface-actions/instant-commit';
import { startPlainScripts } from '@c15t/core/surface-actions/plain-scripts';

import type { DeferredCommitConfig } from './committed';
import type { DeferredKernelHandle } from './deferred-kernel';
import { deferredScripts } from './registry';

export { startPlainScripts } from '@c15t/core/surface-actions/plain-scripts';

/**
 * Whether setters queued for the engine leave the snapshot as a commit
 * reads it: only category registrations the snapshot already holds.
 *
 * @param handle - The root's stand-in.
 * @returns `true` when a commit may read the stand-in's snapshot.
 * @internal
 */
export const pendingIsInert = function pendingIsInert(
	handle: DeferredKernelHandle
): boolean {
	const categories = handle.kernel.getSnapshot().consentCategories;
	return handle
		.pending()
		.every(
			({ args, name }) =>
				name === 'registerConsentCategories' &&
				Array.isArray(args[0]) &&
				(args[0] as string[]).every((category) =>
					categories?.includes(category as never)
				)
		);
};

/**
 * What an instant commit reads from storage and the clock, read ahead of
 * the tap so the tap's task does not wait on storage. A clear epoch stored
 * after this is caught by the commit chunk, which hands the save to the
 * engine.
 *
 * @internal
 */
export interface InstantCommitAhead {
	clearEpoch: boolean;
	/** Recorded only when the visitor has no subject id. */
	subjectId: string;
}

/**
 * Reads what {@link commitInstantly} needs from storage, ahead of a tap.
 *
 * @param config - The root's commit options.
 * @returns The values to pass to `commitInstantly`.
 * @internal
 */
export const readAheadOfTap = function readAheadOfTap(
	config: DeferredCommitConfig
): InstantCommitAhead {
	return {
		clearEpoch: hasStoredClearEpoch(config.storageConfig),
		subjectId: generateSubjectId(),
	};
};

/**
 * Whether a tap now would commit instantly, as far as can be told before
 * the tap: a press on the banner then needs no preloads.
 *
 * @param handle - The root's stand-in.
 * @param ahead - From {@link readAheadOfTap}.
 * @returns `true` when {@link commitInstantly} would apply.
 * @internal
 */
export const canCommitInstantly = function canCommitInstantly(
	handle: DeferredKernelHandle,
	ahead: InstantCommitAhead | undefined
): boolean {
	const now = Date.now();
	return Boolean(
		ahead &&
		!ahead.clearEpoch &&
		pendingIsInert(handle) &&
		isShortCase(handle.kernel.getSnapshot(), now, now)
	);
};

/**
 * Commits a save on the stand-in now, when it is the short case: the
 * granted plain scripts start first, so their requests leave at the tap,
 * then the stand-in's listeners hear the committed snapshot. Returns `null`
 * and changes nothing otherwise; the commit chunk or the engine records
 * it then. The caller must check the engine has not attached.
 *
 * @param handle - The root's stand-in.
 * @param config - The root's commit options.
 * @param choice - What `commands.save` was called with.
 * @param actionAt - Epoch milliseconds of the tap.
 * @param ahead - From {@link readAheadOfTap}; read now when absent.
 * @returns The commit, for `commitEarlyTap` to complete, or `null`.
 * @internal
 */
export const commitInstantly = function commitInstantly(
	handle: DeferredKernelHandle,
	config: DeferredCommitConfig,
	choice: unknown,
	actionAt: number,
	ahead: InstantCommitAhead = readAheadOfTap(config)
): InstantCommit | null {
	if (!pendingIsInert(handle) || ahead.clearEpoch) {
		return null;
	}
	const plan = planInstantCommit({
		actionAt,
		choice,
		snapshot: handle.kernel.getSnapshot(),
		subjectId: ahead.subjectId,
	});
	if (!plan) {
		return null;
	}
	startPlainScripts(
		[...deferredScripts(handle.kernel), ...(config.scripts ?? [])],
		plan.snapshot,
		config.nonce
	);
	return handle.commit(plan.snapshot, []) ? plan : null;
};
