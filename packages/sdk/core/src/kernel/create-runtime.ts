/**
 * Kernel runtime: the snapshot cell every kernel concept writes through.
 *
 * - `commit()` merges a patch, re-derives dependent fields and adopts the
 *   result only when something changed, emitting `permissions:changed`
 *   when the effective permissions differ and, once the kernel is live,
 *   `surface:shown` when a prompt surface becomes visible. Subscribers
 *   receive the snapshot that commit produced, through the dispatcher
 *   shared with the event bus.
 * - `announce()` is the one commit convention: commit, then emit an event
 *   carrying the committed snapshot, delivered after the batch closes.
 * - A commit that moves `nextDeadline` calls `onDeadlineChange`, so the
 *   deadline timer follows the snapshot without every writer re-arming it.
 * - The records generation is a fence counter: the records boundary bumps
 *   it, async work started under an older value must not apply.
 *
 * The init lifecycle (`create-init-lifecycle.ts`), choice recording (`create-choice-recorder.ts`),
 * the records boundary (`kernel-records.model.ts`), the setters and the save outbox all
 * write through this cell and own nothing of it.
 */
import type { OptOutRecord, OptOutRight } from '@inth/sdk-schema/types';

import type { ExperimentAssignment, ExperimentGate } from '../libs/experiment';
import { EMPTY_OPT_OUT_RECEIPT_DATA } from '../libs/opt-out-state.model';
import type { OptOutReceiptData } from '../libs/opt-out-state.model';
import { createIdempotencyKey, generateUuidV7 } from '../libs/subject-uuid.model';
import type {
	ConsentSnapshot,
	KernelEvent,
	Listener,
	PromptSurface,
} from '../consent-kernel.model';
import { createListenerSet } from './create-dispatcher';
import type { Dispatcher, ListenerSet } from './create-dispatcher';
import {
	gpcOptOutDue,
	gpcSignalReportDue,
	newLocalOptOutRecord,
} from './kernel-opt-out.model';
import { buildNextSnapshot, isUnchangedPatch, snapshotChanged } from './kernel-patch.model';
import type { SnapshotPatch } from './kernel-patch.model';
import { freezeSnapshot, isPromptSurface } from './kernel-snapshot.model';

/** Events `announce()` emits: each carries only the committed snapshot. */
export type AnnouncedEvent = Extract<
	KernelEvent,
	{
		type:
			| 'iab:set'
			| 'init:applied'
			| 'overrides:set'
			| 'subject:resolved'
			| 'user:identified'
			| 'vendors:set';
	}
>['type'];

export interface KernelRuntime {
	getSnapshot: () => ConsentSnapshot;
	subscribe: (listener: Listener<ConsentSnapshot>) => () => void;
	emit: (event: KernelEvent) => void;
	/** Merge a patch and adopt the result when it changes anything. */
	commit: (patch: SnapshotPatch) => boolean;
	/**
	 * Commit `patch` and emit `{ type, snapshot }` with the committed
	 * snapshot, in one batch. The event fires when the commit changed
	 * something, or always with `always`. Returns whether it changed.
	 */
	announce: (
		patch: SnapshotPatch,
		type: AnnouncedEvent,
		always?: boolean
	) => boolean;
	/**
	 * Deliver the notifications and events queued by `run` only after it
	 * returns, so a command's follow-up events precede any transition a
	 * listener starts and `getSnapshot()` inside `run` is its own commit.
	 */
	batch: Dispatcher['batch'];
	now: () => number;
	/**
	 * Records generation. Bumped whenever a hydration boundary replaces or
	 * clears the explicit choice or the subject, so an in-flight save, init
	 * or subject read can tell that its records were superseded.
	 */
	getGeneration: () => number;
	/** Bump the records generation. Only the records boundary calls this. */
	invalidateRecords: () => void;
	/**
	 * Monotonic counter of local opt-out acts (`opt-out:recorded`,
	 * `opt-out:lifted`). An answer from a request started before a newer local
	 * act must not overwrite that act.
	 */
	getOptOutActVersion: () => number;
	/** Record that a local opt-out act happened and return the new counter. */
	noteOptOutAct: () => number;
	/** Whether this browser has already reported its GPC signal for the held opt-out record. */
	isOptOutGpcReported: () => boolean;
	/** Monotonic fence bumped whenever the GPC report mark or attempt state clears. */
	getOptOutGpcReportEpoch: () => number;
	/** Set or clear the local GPC report mark. `notify` informs persistence listeners. */
	setOptOutGpcReported: (reported: boolean, notify?: boolean) => void;
	/** Subscribe to live changes to the local GPC report mark. */
	onOptOutGpcReportedChange: (listener: Listener<boolean>) => () => void;
	/** Local-only receipt data kept beside the held opt-out record. */
	getOptOutReceiptData: () => Readonly<OptOutReceiptData>;
	/** Update the local-only receipt data. `fromHydration` suppresses persistence write-back. */
	setOptOutReceiptData: (
		data: OptOutReceiptData,
		fromHydration?: boolean
	) => void;
	/** Subscribe to changes in local opt-out receipt data. */
	onOptOutReceiptDataChange: (
		listener: (
			data: Readonly<OptOutReceiptData>,
			fromHydration?: boolean
		) => void
	) => () => void;
	/** Reconcile the GPC report mark and trigger a held-record report when due. */
	syncGpcSignal: (actionAt?: number) => void;
	/**
	 * Mark the kernel live in a visitor's browser: from here on, every commit
	 * that leaves a prompt surface visible stamps its first impression. A
	 * surface already visible is stamped at `at` (default: now). Hydration
	 * alone never marks the kernel live, so a server or test kernel that only
	 * applies records records no impression.
	 */
	markLive: (at?: number) => void;
	/**
	 * Set the arm this visitor runs and the gate that decides, per policy,
	 * whether it is shown. A gate, or `null`, releases a held prompt.
	 */
	setExperiment: (
		assignment: ExperimentAssignment | null,
		gate: ExperimentGate | null
	) => void;
}

export interface RuntimeOptions {
	initialSnapshot: ConsentSnapshot;
	/** Initial local GPC report mark hydrated from stored records. */
	initialOptOutGpcReported?: boolean;
	/** Initial local opt-out receipt data hydrated from stored records. */
	initialOptOutReceiptData?: Readonly<OptOutReceiptData>;
	emit: (event: KernelEvent) => void;
	/** Shared with the event bus so snapshots and events keep one order. */
	dispatcher: Dispatcher;
	/** Called after a commit moved `nextDeadline`. */
	onDeadlineChange: () => void;
	/** Called when a live kernel must report an active GPC signal for an already-held opt-out. */
	onGpcSignalReportDue?: (snapshot: ConsentSnapshot, actionAt: number) => void;
	/** Rights placed on an automatically recorded GPC opt-out. */
	defaultOptOutRights?: () => OptOutRight[];
}

export const createRuntime = function createRuntime(
	options: RuntimeOptions
): KernelRuntime {
	const {
		defaultOptOutRights = () => [],
		dispatcher,
		emit,
		onDeadlineChange,
		onGpcSignalReportDue,
	} = options;
	let snapshot = options.initialSnapshot;
	let live = false;
	let gpcReported =
		options.initialOptOutGpcReported === true &&
		options.initialSnapshot.optOut !== null;
	// Process-only latch so a failed outbox write does not retry in a loop on
	// this page load while keeping the persisted mark unset.
	let gpcReportAttempted = gpcReported;
	let gpcReportEpoch = 0;
	let gpcReportedListeners: ListenerSet<boolean> | undefined;
	let optOutReceiptData: Readonly<OptOutReceiptData> =
		options.initialSnapshot.optOut !== null && options.initialOptOutReceiptData
			? Object.freeze({ ...options.initialOptOutReceiptData })
			: EMPTY_OPT_OUT_RECEIPT_DATA;
	let optOutReceiptListeners:
		| ListenerSet<{
				data: Readonly<OptOutReceiptData>;
				fromHydration: boolean;
		  }>
		| undefined;
	/**
	 * The surface the kernel, not the adapter, hid in the last commit: a
	 * derived `activeUI` change (a save clearing the prompt) rather than an
	 * explicit `set.activeUI`, together with the snapshot that hide produced.
	 * An adapter restoring that surface as the very next state change is not
	 * a new impression. Any other commit clears it, so a later derived
	 * re-show (an expired choice, a refresh, a re-init) counts again.
	 */
	let hiddenBySave: {
		snapshot: ConsentSnapshot;
		surface: PromptSurface;
	} | null = null;
	let generation = 0;
	let optOutActVersion = 0;
	let listeners: ListenerSet<ConsentSnapshot> | undefined;
	/**
	 * The arm the visitor runs whenever the policy accepts it.
	 * `snapshot.experiment` is this arm or `null`, decided by `experimentGate`
	 * in the commit that resolves each policy.
	 */
	let wantedExperiment: ExperimentAssignment | null =
		options.initialSnapshot.experiment;
	let experimentGate: ExperimentGate | null = null;

	const getSnapshot = () => snapshot;
	const now = () => Date.now();

	const setOptOutGpcReported = function setOptOutGpcReported(
		reported: boolean,
		notify = true
	): void {
		if (reported) {
			gpcReportAttempted = true;
		} else {
			if (gpcReported || gpcReportAttempted) {
				gpcReportEpoch += 1;
			}
			gpcReportAttempted = false;
		}
		if (gpcReported === reported) {
			return;
		}
		gpcReported = reported;
		if (notify && gpcReportedListeners) {
			dispatcher.batch(() => {
				if (gpcReportedListeners) {
					dispatcher.deliver(gpcReportedListeners, reported);
				}
			});
		}
	};

	const setOptOutReceiptData = function setOptOutReceiptData(
		next: OptOutReceiptData,
		fromHydration = false
	): void {
		const normalized: Readonly<OptOutReceiptData> =
			next.localAct === null && next.reference === null && !next.rightsConfirmed
				? EMPTY_OPT_OUT_RECEIPT_DATA
				: Object.freeze({
						localAct: next.localAct,
						reference: next.reference,
						rightsConfirmed: next.rightsConfirmed,
					});
		if (
			optOutReceiptData.localAct === normalized.localAct &&
			optOutReceiptData.reference === normalized.reference &&
			optOutReceiptData.rightsConfirmed === normalized.rightsConfirmed
		) {
			return;
		}
		optOutReceiptData = normalized;
		if (optOutReceiptListeners) {
			dispatcher.batch(() => {
				if (optOutReceiptListeners) {
					dispatcher.deliver(optOutReceiptListeners, {
						data: normalized,
						fromHydration,
					});
				}
			});
		}
	};

	const syncGpcSignalState = function syncGpcSignalState(
		previous: ConsentSnapshot,
		current: ConsentSnapshot,
		actionAt: number
	): void {
		if (
			current.optOut === null ||
			(previous.privacySignals.gpc.active &&
				!current.privacySignals.gpc.active) ||
			(live && !current.policyPending && !current.privacySignals.gpc.active)
		) {
			setOptOutGpcReported(false, current.optOut !== null);
			return;
		}
		if (gpcSignalReportDue(current, live, gpcReported || gpcReportAttempted)) {
			gpcReportAttempted = true;
			onGpcSignalReportDue?.(current, actionAt);
		}
	};

	/**
	 * Whether the visible prompt surface still lacks its first impression
	 * time. Only a live kernel stamps impressions: a server render, a
	 * prerender seed or a hydrate-only kernel never records that a visitor
	 * saw anything.
	 */
	const impressionDue = function impressionDue(
		candidate: ConsentSnapshot
	): candidate is ConsentSnapshot & { activeUI: PromptSurface } {
		return (
			live &&
			isPromptSurface(candidate.activeUI) &&
			candidate.surfaceShownAt[candidate.activeUI] === null
		);
	};

	/**
	 * Candidate with the visible surface's first impression stamped at its
	 * evaluation time. `candidate` is an unfrozen copy owned by this commit.
	 */
	const stampImpression = function stampImpression(
		candidate: ConsentSnapshot & { activeUI: PromptSurface }
	): ConsentSnapshot {
		return {
			...candidate,
			surfaceShownAt: {
				...candidate.surfaceShownAt,
				[candidate.activeUI]: candidate.evaluatedAt,
			},
		};
	};

	/**
	 * `current` with only its first impression stamped, at `at`. An
	 * unchanged patch keeps every evaluator input and stays inside the
	 * current deadline, so the full derivation would hand back `current`
	 * under a new clock and revision. Every nested value is shared with the
	 * already-frozen `current`; only the two new objects need freezing.
	 */
	const stampCurrent = function stampCurrent(
		current: ConsentSnapshot & { activeUI: PromptSurface },
		at: number
	): ConsentSnapshot {
		return Object.freeze({
			...current,
			evaluatedAt: at,
			revision: current.revision + 1,
			surfaceShownAt: Object.freeze({
				...current.surfaceShownAt,
				[current.activeUI]: at,
			}),
		});
	};

	/**
	 * `candidate` with the arm its policy allows. Asked only when the policy
	 * or the arm changes, so a commit that stamps an impression under a new
	 * policy already carries the arm that policy shows.
	 */
	const gateExperiment = function gateExperiment(
		current: ConsentSnapshot,
		candidate: ConsentSnapshot,
		patch: SnapshotPatch
	): ConsentSnapshot {
		if (
			patch.experiment === undefined &&
			candidate.policyRule === current.policyRule
		) {
			return candidate;
		}
		const allowed =
			wantedExperiment && (!experimentGate || experimentGate(candidate))
				? wantedExperiment
				: null;
		return allowed === candidate.experiment
			? candidate
			: { ...candidate, experiment: allowed };
	};

	/**
	 * The arm an event records: the visitor's arm once the banner has shown
	 * it in this page. A returning visitor who reopens the dialog from a
	 * footer link never saw the arm's banner, so their choice is not the
	 * arm's outcome.
	 */
	const exposedExperiment = function exposedExperiment(
		candidate: ConsentSnapshot
	): ExperimentAssignment | undefined {
		return candidate.experiment && candidate.surfaceShownAt.banner !== null
			? candidate.experiment
			: undefined;
	};

	/**
	 * Deliver an adopted snapshot to subscribers, then its events. Runs as
	 * one batch so a listener that commits again queues behind this
	 * transition instead of overtaking it.
	 */
	const publish = function publish(
		current: ConsentSnapshot,
		adopted: ConsentSnapshot,
		shown: PromptSurface | null,
		recordedOptOut: Readonly<OptOutRecord> | null = null
	): void {
		dispatcher.batch(() => {
			if (listeners) {
				dispatcher.deliver(listeners, adopted);
			}
			if (adopted.effectivePermissions !== current.effectivePermissions) {
				emit({
					previous: current.effectivePermissions,
					snapshot: adopted,
					type: 'permissions:changed',
				});
			}
			if (shown !== null) {
				const event: Extract<KernelEvent, { type: 'surface:shown' }> = {
					shownAt: adopted.evaluatedAt,
					snapshot: adopted,
					surface: shown,
					type: 'surface:shown',
				};
				const experiment = exposedExperiment(adopted);
				if (experiment) {
					event.experiment = experiment;
				}
				emit(event);
			}
			if (recordedOptOut !== null) {
				emit({
					actionAt: recordedOptOut.recordedAt,
					optOut: recordedOptOut,
					snapshot: adopted,
					type: 'opt-out:recorded',
				});
			}
		});
	};

	const deriveCandidate = function deriveCandidate(
		current: ConsentSnapshot,
		patch: SnapshotPatch
	): { next: ConsentSnapshot; recordedGpcOptOut: boolean } {
		let next = gateExperiment(
			current,
			buildNextSnapshot(current, patch),
			patch
		);
		let recordedGpcOptOut = false;
		// Record a durable GPC opt-out once the kernel is live (after stored
		// records have been read), the policy is matched and not provisional,
		// GPC is active, and the rule maps it to at least one category.
		// Explicit `optOut` patches (such as hydration, clear or commands)
		// never trigger auto-recording in the same commit.
		if (patch.optOut === undefined && gpcOptOutDue(next, live)) {
			const optOut = newLocalOptOutRecord(
				next,
				'gpc',
				next.evaluatedAt,
				defaultOptOutRights()
			);
			const gpcPatch: SnapshotPatch = { ...patch, optOut };
			if (!next.subject?.subjectId) {
				gpcPatch.subject = { ...next.subject, subjectId: generateUuidV7() };
			}
			next = gateExperiment(
				current,
				buildNextSnapshot(current, gpcPatch),
				patch
			);
			recordedGpcOptOut = true;
		}
		if (impressionDue(next)) {
			next = stampImpression(next);
		}
		return { next, recordedGpcOptOut };
	};

	const canSkipDerivation = function canSkipDerivation(
		current: ConsentSnapshot,
		patch: SnapshotPatch
	): boolean {
		return (
			isUnchangedPatch(current, patch) &&
			!(patch.optOut === undefined && gpcOptOutDue(current, live))
		);
	};

	const commit = function commit(patch: SnapshotPatch): boolean {
		if (patch.experiment !== undefined) {
			wantedExperiment = patch.experiment;
		}
		const current = snapshot;
		let adopted: ConsentSnapshot;
		let recordedGpcOptOut = false;
		if (canSkipDerivation(current, patch)) {
			if (!impressionDue(current)) {
				return false;
			}
			adopted = stampCurrent(current, patch.now ?? current.evaluatedAt);
		} else {
			const derived = deriveCandidate(current, patch);
			if (!snapshotChanged(current, derived.next)) {
				return false;
			}
			adopted = freezeSnapshot(derived.next);
			({ recordedGpcOptOut } = derived);
		}
		snapshot = adopted;
		const surface = adopted.activeUI;
		// A save derives `activeUI` to `none` in the same commit that clears
		// the prompt. An adapter that keeps its preference dialog open for the
		// save then restores `dialog` with an explicit `set.activeUI` before
		// anything else commits; the visitor never saw it close. That restore
		// is not a new impression. A surface the visitor reopens after the
		// kernel hid it for real is, and so is a surface the kernel derives
		// back into view later (an expired choice, a refresh, a re-init).
		const restoredAfterSave =
			hiddenBySave !== null &&
			hiddenBySave.snapshot === current &&
			hiddenBySave.surface === surface &&
			patch.activeUI === surface;
		hiddenBySave =
			isPromptSurface(current.activeUI) &&
			current.activeUI !== surface &&
			patch.activeUI === undefined
				? { snapshot: adopted, surface: current.activeUI }
				: null;
		const shown: PromptSurface | null =
			live &&
			isPromptSurface(surface) &&
			!restoredAfterSave &&
			(surface !== current.activeUI || current.surfaceShownAt[surface] === null)
				? surface
				: null;
		// Everything the events describe is settled before subscribers run: a
		// listener may commit again synchronously (an adapter hiding or
		// restoring a surface), and that nested commit must neither steal
		// this commit's events nor see a stale `hiddenBySave`. Deliver the
		// snapshot this commit produced, never the live cell, so later
		// listeners still observe this transition first.
		if (recordedGpcOptOut) {
			optOutActVersion += 1;
			gpcReportAttempted = true;
			setOptOutReceiptData({
				localAct: 'gpc',
				reference: createIdempotencyKey(),
				rightsConfirmed: false,
			});
			publish(current, adopted, shown, adopted.optOut);
		} else {
			if (adopted.optOut === null) {
				setOptOutReceiptData(EMPTY_OPT_OUT_RECEIPT_DATA, true);
			}
			publish(current, adopted, shown, null);
			syncGpcSignalState(current, adopted, adopted.evaluatedAt);
		}
		if (adopted.nextDeadline !== current.nextDeadline) {
			onDeadlineChange();
		}
		return true;
	};

	const announce = function announce(
		patch: SnapshotPatch,
		type: AnnouncedEvent,
		always = false
	): boolean {
		return dispatcher.batch(() => {
			const changed = commit(patch);
			if (changed || always) {
				emit({ snapshot, type });
			}
			return changed;
		});
	};

	const setExperiment = function setExperiment(
		assignment: ExperimentAssignment | null,
		gate: ExperimentGate | null
	): void {
		// The arm alone keeps a held prompt held: it waits for the gate that
		// checks the arm against the policy. The gate, or no experiment at
		// all, releases it.
		const release = gate !== null || assignment === null;
		const pending = release ? false : snapshot.experimentPending;
		if (
			gate === experimentGate &&
			pending === snapshot.experimentPending &&
			assignment?.id === wantedExperiment?.id &&
			assignment?.arm === wantedExperiment?.arm &&
			assignment?.assignedBy === wantedExperiment?.assignedBy &&
			assignment?.acknowledgedDiagnostics ===
				wantedExperiment?.acknowledgedDiagnostics
		) {
			return;
		}
		experimentGate = gate;
		commit({
			experiment: assignment ? Object.freeze({ ...assignment }) : null,
			experimentPending: pending,
		});
	};

	const markLive = function markLive(at: number = now()): void {
		if (live) {
			return;
		}
		live = true;
		const current = snapshot;
		if (gpcOptOutDue(current, live)) {
			commit({ now: at });
			return;
		}
		// A surface visible before init ran is first shown now; the stamp
		// records that impression once and emits `surface:shown` for it.
		// Only the stamp changes, so skip the patch checks a commit runs:
		// this sits on every first visit's init.
		if (!impressionDue(current)) {
			syncGpcSignalState(current, current, at);
			return;
		}
		snapshot = stampCurrent(current, at);
		hiddenBySave = null;
		publish(current, snapshot, current.activeUI);
		syncGpcSignalState(current, snapshot, at);
	};

	return {
		announce,
		batch: dispatcher.batch,
		commit,
		emit,
		getGeneration: () => generation,
		getOptOutActVersion: () => optOutActVersion,
		getOptOutGpcReportEpoch: () => gpcReportEpoch,
		getOptOutReceiptData: () => optOutReceiptData,
		getSnapshot,
		invalidateRecords: () => {
			generation += 1;
		},
		isOptOutGpcReported: () => gpcReported,
		markLive,
		noteOptOutAct: () => {
			optOutActVersion += 1;
			return optOutActVersion;
		},
		now,
		onOptOutGpcReportedChange(listener) {
			gpcReportedListeners ??= createListenerSet();
			return gpcReportedListeners.add(listener);
		},
		onOptOutReceiptDataChange(listener) {
			optOutReceiptListeners ??= createListenerSet();
			return optOutReceiptListeners.add(({ data, fromHydration }) => {
				listener(data, fromHydration);
			});
		},
		setExperiment,
		setOptOutGpcReported,
		setOptOutReceiptData,
		subscribe(listener) {
			listeners ??= createListenerSet();
			return listeners.add(listener);
		},
		syncGpcSignal: (actionAt: number = now()) => {
			syncGpcSignalState(snapshot, snapshot, actionAt);
		},
	};
};
