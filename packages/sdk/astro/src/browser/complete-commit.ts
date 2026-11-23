/**
 * The shell's commit chunk: completes a banner choice the first-load shell
 * committed before the consent engine loaded.
 *
 * The tap's own task already changed the snapshot the page reads
 * (`planInstantCommit`), hid the banner and started the plain scripts the
 * choice allows. This chunk, loaded one task later, completes it with
 * core's `completeCommit`, which stores the record, queues the backend
 * save and calls the site's callbacks, and activates the page's inline
 * gated scripts. The engine loads after it, starts from the records and
 * sends the queued save; it records nothing again.
 *
 * @internal
 */

import type { StorageConfig } from '@inth/sdk/modules/persistence';
import type { ConsentRuntimeOptions } from '@inth/sdk/runtime';
import { completeCommit as completeCoreCommit } from '@inth/sdk/surface-actions/early-commit';
import type {
	CompleteCommitInput as CoreCommitInput,
	CompleteCommitResult,
} from '@inth/sdk/surface-actions/early-commit';
import type { InstantCommit } from '@inth/sdk/surface-actions/instant-commit';

import { activateGatedScripts } from './activate-gated-scripts';

export type {
	CompleteCommitResult,
	DeferredCommitted,
} from '@inth/sdk/surface-actions/early-commit';

/** @internal */
export interface CompleteCommitInput {
	/** What the tap's own task committed. */
	instant: InstantCommit;
	/** `'all'`, `'none'` or a selection, as `commands.save` takes it. */
	choice: CoreCommitInput['choice'];
	/** Epoch milliseconds of the tap. */
	actionAt: number;
	storageConfig?: StorageConfig;
	callbacks?: ConsentRuntimeOptions['callbacks'];
	/** The page's CSP nonce, for the gated scripts it activates. */
	nonce?: string;
}

/**
 * Completes the instant commit the tap's task made and activates the
 * inline gated scripts. Returns `null` when the engine has to record the
 * choice.
 *
 * @param input - The instant commit and the site's options.
 * @returns What the engine needs to take over, or `null`.
 * @internal
 */
export const completeCommit = function completeCommit(
	input: CompleteCommitInput
): Promise<CompleteCommitResult | null> {
	return completeCoreCommit({
		actionAt: input.actionAt,
		choice: input.choice,
		config: { callbacks: input.callbacks, storageConfig: input.storageConfig },
		instant: input.instant,
		onCommitted: (snapshot) => {
			activateGatedScripts(snapshot, document, input.nonce);
		},
	});
};
