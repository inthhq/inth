/**
 * A deferred root's commit path: a banner accept or reject tapped before
 * the engine loaded, recorded without it.
 *
 * Loaded on that tap, in a chunk of its own, instead of the engine. It
 * records the choice with core's save code (`@c15t/core/surface-actions/
 * early-commit`): the stand-in kernel reads the committed snapshot, the
 * record is stored, the save is queued, the root's callbacks hear it and
 * the root's `scripts` start. The engine loads next, starts from the
 * records and sends the queued save; it records nothing again.
 *
 * @packageDocumentation
 * @internal
 */

import type { KernelEvent, SaveResult, SaveUISource } from '@c15t/core';
import type { ScriptLoaderHandle } from '@c15t/core/modules/script-loader';
import {
	hasStoredClearEpoch,
	planEarlyCommit,
	storeEarlyCommit,
} from '@c15t/core/surface-actions/early-commit';
import type { EarlyCommit } from '@c15t/core/surface-actions/early-commit';
import type { InstantCommit } from '@c15t/core/surface-actions/instant-commit';

import type { DeferredCommitConfig, DeferredCommitted } from './committed';
import type { DeferredKernelHandle } from './deferred-kernel';
import { pendingIsInert, startPlainScripts } from './instant';
import {
	claimDeferredScripts,
	deferredScripts,
	loadDeferredScriptLoader,
} from './registry';

/** @internal */
export interface CommitTapInput {
	handle: DeferredKernelHandle;
	/** `'all'` for accept, `'none'` for reject, or a form's selection. */
	choice: Parameters<typeof planEarlyCommit>[0]['choice'];
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

/** Calls the root callback the engine's runtime calls for `event`. */
const announce = function announce(
	callbacks: DeferredCommitConfig['callbacks'],
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

/** Structural equality of two snapshots' plain data, in any key order. */
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
	const leftKeys = Object.keys(left).filter(
		(key) => (left as Record<string, unknown>)[key] !== undefined
	);
	const rightKeys = Object.keys(right).filter(
		(key) => (right as Record<string, unknown>)[key] !== undefined
	);
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

/**
 * Plans the commit, from the snapshot the instant commit started from when
 * there was one, and gives the stand-in its snapshot and events.
 */
const planAndCommit = function planAndCommit(
	input: CommitTapInput
): EarlyCommit | null {
	const { handle, instant } = input;
	if (instant) {
		// The root read storage ahead of the tap; a clear stored since is
		// the engine's to record.
		if (hasStoredClearEpoch(input.config.storageConfig)) {
			return null;
		}
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
		// Listeners already heard the instant snapshot; they hear nothing new
		// for the same state.
		const snapshot = sameValue(plan.snapshot, instant.snapshot)
			? instant.snapshot
			: plan.snapshot;
		const events = plan.events.map((event) => ({ ...event, snapshot }));
		return handle.commit(snapshot, events)
			? { ...plan, events, snapshot }
			: null;
	}
	if (
		handle.attached() ||
		!pendingIsInert(handle) ||
		hasStoredClearEpoch(input.config.storageConfig)
	) {
		return null;
	}
	const plan = planEarlyCommit({
		actionAt: input.actionAt,
		choice: input.choice,
		snapshot: handle.kernel.getSnapshot(),
		uiSource: input.uiSource,
	});
	// Listeners hear the snapshot first, then the events, as the kernel
	// delivers a save: page loaders insert the granted scripts here.
	return plan && handle.commit(plan.snapshot, plan.events) ? plan : null;
};

/**
 * Records a banner accept or reject on a deferred root's stand-in kernel,
 * or completes the instant commit the root made in the tap's task: stores
 * the record, queues the save and calls the root's callbacks. Returns
 * `null` and changes nothing when only the engine can record it (see
 * `planEarlyCommit`), when setters are waiting for the engine, when a
 * clear epoch is stored, or once the engine has attached; the engine then
 * records the tap.
 *
 * @param input - The root's stand-in, the tap and the root's options.
 * @returns What the engine needs to take over, or `null`.
 * @internal
 */
export const commitEarlyTap = async function commitEarlyTap(
	input: CommitTapInput
): Promise<CommitTapResult | null> {
	const { config, handle } = input;
	const plan = planAndCommit(input);
	if (!plan) {
		return null;
	}
	// The page's plain scripts start with the choice; the loader adopts
	// them when it arrives after it.
	startPlainScripts(
		[...deferredScripts(handle.kernel), ...(config.scripts ?? [])],
		plan.snapshot,
		config.nonce,
		config.reserved
	);
	// The hooks whose scripts it started hold them from this task on.
	claimDeferredScripts(handle.kernel);
	const stored = storeEarlyCommit(plan, {
		storageConfig: config.storageConfig,
	});
	const scripts = config.scripts ?? [];
	const loader = scripts.length
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
	if (!(await stored)) {
		// The record is stored, but the outbox could not keep its save: the
		// engine records the tap, so the backend still gets it, and its
		// callbacks announce it.
		return null;
	}
	// The callbacks hear a choice once it is recorded.
	for (const event of plan.events) {
		announce(config.callbacks, event);
	}
	return {
		committed: {
			ownsScripts: loader !== undefined,
			permissions: plan.snapshot.effectivePermissions,
			records: plan.records,
		},
		loader,
		result: {
			confirmed: Object.keys(
				plan.payload.confirmed.categories
			) as SaveResult['confirmed'],
			ok: true,
			subjectId: plan.payload.subjectId,
		},
	};
};
