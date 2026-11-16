/**
 * The Nuxt plugin's commit chunk: completes a banner or dialog choice the
 * deferred context recorded on the stand-in kernel before the consent
 * engine loaded.
 *
 * The tap's own task already changed the snapshot the page reads
 * (`planInstantCommit` in the first-load chunk), so scripts and
 * composables see the choice at once. This chunk, loaded one task later,
 * does what `commands.save` would do next with core's save code
 * (`@c15t/core/surface-actions/early-commit`): it stores the record, queues
 * the backend save and calls the app's callbacks. The engine loads after
 * it, starts from the records and sends the queued save; it records
 * nothing again.
 *
 * @packageDocumentation
 * @internal
 */

import type {
	ConsentSnapshot,
	HydrationRecords,
	KernelEvent,
	SaveResult,
	SaveUISource,
} from '@c15t/core';
import {
	hasStoredClearEpoch,
	planEarlyCommit,
	storeEarlyCommit,
} from '@c15t/core/surface-actions/early-commit';
import type { EarlyCommit } from '@c15t/core/surface-actions/early-commit';
import type { InstantCommit } from '@c15t/core/surface-actions/instant-commit';

import type { RuntimeConsentConfig } from '../kernel';
import { pendingIsInert } from './stand-in';
import type { StandInHandle } from './stand-in';

/** A choice recorded before the engine loaded. @internal */
export interface DeferredCommitted {
	/** The records the engine's kernel starts from. */
	records: Pick<HydrationRecords, 'choice' | 'subject'>;
	/** The permissions the commit announced. */
	permissions: ConsentSnapshot['effectivePermissions'];
}

/** @internal */
export interface CompleteCommitInput {
	handle: StandInHandle;
	/** What the tap's own task committed, if it did. */
	instant: InstantCommit | null;
	/** `'all'`, `'none'` or a form's selection, as `commands.save` takes. */
	choice: Parameters<typeof planEarlyCommit>[0]['choice'];
	/** Epoch milliseconds of the tap. */
	actionAt: number;
	/** The surface the save is attributed to. Defaults to `banner`. */
	uiSource?: SaveUISource;
	config: Pick<RuntimeConsentConfig, 'callbacks' | 'storageConfig'>;
}

/** @internal */
export interface CompleteCommitResult {
	committed: DeferredCommitted;
	/** What `commands.save` resolves with for the same save. */
	result: SaveResult;
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
	const leftRecord = left as Record<string, unknown>;
	const rightRecord = right as Record<string, unknown>;
	const own = (value: Record<string, unknown>) =>
		Object.keys(value).filter((key) => value[key] !== undefined);
	const leftKeys = own(leftRecord);
	const rightKeys = own(rightRecord);
	return (
		leftKeys.length === rightKeys.length &&
		leftKeys.every((key) => sameValue(leftRecord[key], rightRecord[key]))
	);
};

/** Calls the app callback the engine's runtime calls for `event`. */
const announce = function announce(
	callbacks: RuntimeConsentConfig['callbacks'],
	event: KernelEvent
): void {
	const { type: _type, ...payload } = event;
	try {
		if (event.type === 'permissions:changed') {
			callbacks?.onPermissionsChanged?.(
				payload as Parameters<
					NonNullable<NonNullable<typeof callbacks>['onPermissionsChanged']>
				>[0]
			);
		} else if (event.type === 'choice:recorded') {
			callbacks?.onChoiceRecorded?.(
				payload as Parameters<
					NonNullable<NonNullable<typeof callbacks>['onChoiceRecorded']>
				>[0]
			);
		}
	} catch (error) {
		console.error('[c15t] A consent callback threw.', error);
	}
};

/**
 * Plans the save from the snapshot the instant commit started from, when
 * there was one, and gives the stand-in its snapshot and events.
 */
const planAndCommit = function planAndCommit(
	input: CompleteCommitInput
): EarlyCommit | null {
	const { handle, instant } = input;
	if (hasStoredClearEpoch(input.config.storageConfig)) {
		return null;
	}
	if (instant) {
		const plan = planEarlyCommit({
			actionAt: input.actionAt,
			choice: input.choice,
			now: instant.now,
			snapshot: instant.previous,
			subjectId: instant.subjectId,
			uiSource: input.uiSource,
		});
		if (!plan) {
			return null;
		}
		// Listeners already heard the instant snapshot; they hear nothing
		// new for the same state.
		const snapshot = sameValue(plan.snapshot, instant.snapshot)
			? instant.snapshot
			: plan.snapshot;
		const events = plan.events.map((event) => ({ ...event, snapshot }));
		return handle.commit(snapshot, events)
			? { ...plan, events, snapshot }
			: null;
	}
	if (handle.attached() || !pendingIsInert(handle)) {
		return null;
	}
	const plan = planEarlyCommit({
		actionAt: input.actionAt,
		choice: input.choice,
		snapshot: handle.kernel.getSnapshot(),
		uiSource: input.uiSource,
	});
	return plan && handle.commit(plan.snapshot, plan.events) ? plan : null;
};

/**
 * Records a choice on the stand-in, or completes the instant commit the
 * tap's task made: stores the record, queues the save and calls the app's
 * callbacks. Returns `null` when only the engine can record it (see
 * `planEarlyCommit`), when a clear epoch is stored, once the engine has
 * attached, or when the outbox could not keep the save; the engine records
 * the choice then.
 *
 * @param input - The stand-in, the tap and the app's options.
 * @returns What the engine needs to take over, or `null`.
 * @internal
 */
export const completeCommit = async function completeCommit(
	input: CompleteCommitInput
): Promise<CompleteCommitResult | null> {
	const plan = planAndCommit(input);
	if (!plan) {
		return null;
	}
	const stored = await storeEarlyCommit(plan, {
		storageConfig: input.config.storageConfig,
	});
	if (!stored) {
		// The record is stored, but the outbox could not keep its save: the
		// engine records the choice, so the backend still gets it, and its
		// callbacks announce it.
		return null;
	}
	// The callbacks hear a choice once it is recorded.
	for (const event of plan.events) {
		announce(input.config.callbacks, event);
	}
	return {
		committed: {
			permissions: plan.snapshot.effectivePermissions,
			records: plan.records,
		},
		result: {
			confirmed: Object.keys(
				plan.payload.confirmed.categories
			) as SaveResult['confirmed'],
			ok: true,
			subjectId: plan.payload.subjectId,
		},
	};
};
