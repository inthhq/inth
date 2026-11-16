/**
 * The shell's commit chunk: completes a banner choice the first-load shell
 * committed before the consent engine loaded.
 *
 * The tap's own task already changed the snapshot the page reads
 * (`planInstantCommit`), hid the banner and started the plain scripts the
 * choice allows. This chunk, loaded one task later, does what
 * `commands.save` would do next with core's save code
 * (`@c15t/core/surface-actions/early-commit`): it stores the record, queues
 * the backend save, calls the site's callbacks and activates the page's
 * inline gated scripts. The engine loads after it, starts from the records
 * and sends the queued save; it records nothing again.
 *
 * @internal
 */

import type {
	ConsentSnapshot,
	HydrationRecords,
	KernelEvent,
} from '@c15t/core';
import type { StorageConfig } from '@c15t/core/modules/persistence';
import type { ConsentRuntimeOptions } from '@c15t/core/runtime';
import {
	hasStoredClearEpoch,
	planEarlyCommit,
	storeEarlyCommit,
} from '@c15t/core/surface-actions/early-commit';
import type { EarlyCommitInput } from '@c15t/core/surface-actions/early-commit';
import type { InstantCommit } from '@c15t/core/surface-actions/instant-commit';

import { activateGatedScripts } from './inline-scripts';

/** A choice recorded before the engine loaded. @internal */
export interface DeferredCommitted {
	/** The records the engine's kernel starts from. */
	records: Pick<HydrationRecords, 'choice' | 'subject'>;
	/** The permissions the commit announced. */
	permissions: ConsentSnapshot['effectivePermissions'];
}

type Callbacks = NonNullable<ConsentRuntimeOptions['callbacks']>;

/** @internal */
export interface CompleteCommitInput {
	/** What the tap's own task committed. */
	instant: InstantCommit;
	/** `'all'`, `'none'` or a selection, as `commands.save` takes it. */
	choice: EarlyCommitInput['choice'];
	/** Epoch milliseconds of the tap. */
	actionAt: number;
	storageConfig?: StorageConfig;
	callbacks?: ConsentRuntimeOptions['callbacks'];
	/** The page's CSP nonce, for the gated scripts it activates. */
	nonce?: string;
}

/** @internal */
export interface CompleteCommitResult {
	committed: DeferredCommitted;
	/**
	 * The snapshot the save records. The instant snapshot when they hold
	 * the same data, so listeners hear nothing new.
	 */
	snapshot: ConsentSnapshot;
}

/** Whether two values hold the same data, as a snapshot compares. */
const sameValue = function sameValue(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) {
		return true;
	}
	if (
		typeof left !== 'object' ||
		typeof right !== 'object' ||
		left === null ||
		right === null ||
		Array.isArray(left) !== Array.isArray(right)
	) {
		return false;
	}
	const own = (value: Record<string, unknown>) =>
		Object.keys(value).filter((key) => value[key] !== undefined);
	const leftKeys = own(left as Record<string, unknown>);
	const rightKeys = own(right as Record<string, unknown>);
	return (
		leftKeys.length === rightKeys.length &&
		leftKeys.every((key) =>
			sameValue(
				(left as Record<string, unknown>)[key],
				(right as Record<string, unknown>)[key]
			)
		)
	);
};

/** Calls the site callback the engine's runtime calls for `event`. */
const announce = function announce(
	callbacks: CompleteCommitInput['callbacks'],
	event: KernelEvent
): void {
	const { type: _type, ...payload } = event;
	try {
		if (event.type === 'permissions:changed') {
			callbacks?.onPermissionsChanged?.(
				payload as Parameters<NonNullable<Callbacks['onPermissionsChanged']>>[0]
			);
		} else if (event.type === 'choice:recorded') {
			callbacks?.onChoiceRecorded?.(
				payload as Parameters<NonNullable<Callbacks['onChoiceRecorded']>>[0]
			);
		}
	} catch (error) {
		console.error('[c15t] A consent callback threw.', error);
	}
};

/**
 * Completes the instant commit the tap's task made: stores the record,
 * queues the save, calls the site's callbacks and activates the inline
 * gated scripts. Returns `null` when only the engine can record the save
 * (see `planEarlyCommit`), a clear epoch was stored since, or the outbox
 * could not keep the save; the engine records the choice then.
 *
 * @param input - The instant commit and the site's options.
 * @returns What the engine needs to take over, or `null`.
 * @internal
 */
export const completeCommit = async function completeCommit(
	input: CompleteCommitInput
): Promise<CompleteCommitResult | null> {
	const { instant } = input;
	if (hasStoredClearEpoch(input.storageConfig)) {
		return null;
	}
	const plan = planEarlyCommit({
		actionAt: input.actionAt,
		choice: input.choice,
		now: instant.now,
		snapshot: instant.previous,
		subjectId: instant.subjectId,
	});
	if (!plan) {
		return null;
	}
	// Listeners already heard the instant snapshot; they hear nothing new
	// for the same state.
	const snapshot = sameValue(plan.snapshot, instant.snapshot)
		? instant.snapshot
		: plan.snapshot;
	activateGatedScripts(snapshot, document, input.nonce);
	const stored = await storeEarlyCommit(
		{ ...plan, snapshot },
		{
			storageConfig: input.storageConfig,
		}
	);
	if (!stored) {
		// The record is stored, but the outbox could not keep its save: the
		// engine records the choice, so the backend still gets it, and its
		// callbacks announce it.
		return null;
	}
	// The callbacks hear a choice once it is recorded.
	for (const event of plan.events) {
		announce(input.callbacks, { ...event, snapshot } as KernelEvent);
	}
	return {
		committed: {
			permissions: snapshot.effectivePermissions,
			records: plan.records,
		},
		snapshot,
	};
};
