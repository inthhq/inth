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

import type {
	ConsentSnapshot,
	KernelEvent,
	Listener,
	PromptSurface,
	VendorChoice,
} from '../consent-kernel.model';
import { consentPending } from '../consent-pending';
import type { ExplicitChoice } from '../consent-record/types';
import type { ExperimentAssignment, ExperimentGate } from '../libs/experiment';
import { EMPTY_OPT_OUT_RECEIPT_DATA } from '../libs/opt-out-state.model';
import type { OptOutReceiptData } from '../libs/opt-out-state.model';
import {
	createIdempotencyKey,
	generateUuidV7,
} from '../libs/subject-uuid.model';
import { buildEvaluationPolicy, resolveEffectivePolicy } from '../policy';
import { deriveEffectiveRecords, freezeAccountLayer } from './account-layer';
import type {
	AccountConsentLayer,
	AccountLayerSource,
	BrowserConsentRecords,
} from './account-layer';
import { createListenerSet } from './create-dispatcher';
import type { Dispatcher, ListenerSet } from './create-dispatcher';
import {
	gpcOptOutDue,
	gpcSignalReportDue,
	newLocalOptOutRecord,
	sameOptOutRecord,
} from './kernel-opt-out.model';
import {
	buildNextSnapshot,
	isUnchangedPatch,
	snapshotChanged,
} from './kernel-patch.model';
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

/** Extra layer options passed alongside a snapshot patch. */
export interface RuntimeCommitOptions {
	/** Replace or clear the internal account consent layer in this commit. */
	accountLayer?: AccountConsentLayer | null;
	/** Provenance of `accountLayer` when set (`'incoming'` vs `'stored'`). */
	accountLayerSource?: AccountLayerSource;
	/** Notify account persistence even when `accountLayer` stayed `null`. */
	forceAccountNotify?: boolean;
	/** Suppress persistence write-back when hydrating the account layer. */
	fromHydration?: boolean;
	/** Keep an open preference dialog open even when derived choices changed. */
	preserveDialog?: boolean;
	/** Suppress the automatic account-drop `opt-out:synced` when the caller emits it. */
	suppressAccountDropOptOutSynced?: boolean;
	/** Declared vendor IDs covered by the browser vendor decision. */
	vendorDeclared?: readonly string[] | null;
	/** Per-vendor confirmation timestamps recorded for the browser vendor decision. */
	vendorTimes?: Readonly<Record<string, number>> | null;
}

export interface KernelRuntime {
	getSnapshot: () => ConsentSnapshot;
	subscribe: (listener: Listener<ConsentSnapshot>) => () => void;
	emit: (event: KernelEvent) => void;
	/** Merge a patch and adopt the result when it changes anything. */
	commit: (patch: SnapshotPatch, options?: RuntimeCommitOptions) => boolean;
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
	/** Browser-made consent records kept apart from the account layer. */
	getBrowserRecords: () => BrowserConsentRecords;
	/** Account consent layer kept apart from browser records. */
	getAccountLayer: () => AccountConsentLayer | null;
	/** Provenance (`'incoming' | 'stored'`) of the current account layer. */
	getAccountLayerSource: () => AccountLayerSource;
	/** Monotonic fence for async `userConsent` Promises and lifts. */
	getAccountSyncGeneration: () => number;
	/** Bump the account sync generation and return the new counter. */
	bumpAccountSyncGeneration: () => number;
	/** Subscribe to account layer changes for persistence writes and deletion. */
	onAccountLayerChange: (
		listener: (
			layer: AccountConsentLayer | null,
			fromHydration: boolean
		) => void
	) => () => void;
	/**
	 * Identification generation. Bumped by every `identify()` and by
	 * signing out (`clearIdentity()`), so a request started for one account
	 * can tell that the site identified someone else, the same account
	 * again, or no one, on the same browser subject.
	 */
	getIdentityVersion: () => number;
	/** Record an `identify()` or sign-out and return the new identification generation. */
	noteIdentify: () => number;
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
	/** Initial browser-made records, kept separate from the account layer. */
	initialBrowserRecords?: BrowserConsentRecords;
	/** Initial account consent layer, kept separate from browser records. */
	initialAccountLayer?: AccountConsentLayer | null;
	/** Initial provenance of `initialAccountLayer`. */
	initialAccountLayerSource?: AccountLayerSource;
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
	let browserRecords: BrowserConsentRecords = options.initialBrowserRecords ?? {
		choice: options.initialSnapshot.explicitChoice,
		optOut: options.initialSnapshot.optOut,
		vendorChoice: options.initialSnapshot.vendorChoice,
	};
	let accountLayer: AccountConsentLayer | null = freezeAccountLayer(
		options.initialAccountLayer ?? null
	);
	let accountLayerSource: AccountLayerSource =
		options.initialAccountLayerSource ?? 'stored';
	let accountSyncGeneration = 0;
	let accountLayerListeners:
		| ListenerSet<{
				layer: AccountConsentLayer | null;
				fromHydration: boolean;
		  }>
		| undefined;
	let live = false;
	let gpcReported =
		options.initialOptOutGpcReported === true && browserRecords.optOut !== null;
	// Process-only latch so a failed outbox write does not retry in a loop on
	// this page load while keeping the persisted mark unset.
	let gpcReportAttempted = gpcReported;
	let gpcReportEpoch = 0;
	let gpcReportedListeners: ListenerSet<boolean> | undefined;
	let optOutReceiptData: Readonly<OptOutReceiptData> =
		browserRecords.optOut !== null && options.initialOptOutReceiptData
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
	let identityVersion = 0;
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

	const notifyAccountLayerChange = function notifyAccountLayerChange(
		layer: AccountConsentLayer | null,
		fromHydration: boolean
	): void {
		if (!accountLayerListeners) {
			return;
		}
		dispatcher.batch(() => {
			if (accountLayerListeners) {
				dispatcher.deliver(accountLayerListeners, { fromHydration, layer });
			}
		});
	};

	const syncGpcSignalState = function syncGpcSignalState(
		previous: ConsentSnapshot,
		current: ConsentSnapshot,
		actionAt: number
	): void {
		if (
			browserRecords.optOut === null ||
			(previous.privacySignals.gpc.active &&
				!current.privacySignals.gpc.active) ||
			(live && !consentPending(current) && !current.privacySignals.gpc.active)
		) {
			setOptOutGpcReported(false, browserRecords.optOut !== null);
			return;
		}
		if (
			gpcSignalReportDue(
				current,
				live,
				gpcReported || gpcReportAttempted,
				browserRecords.optOut
			)
		) {
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
		recordedOptOut: Readonly<OptOutRecord> | null = null,
		emitOptOutSynced = false
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
			if (emitOptOutSynced) {
				emit({
					optOut: adopted.optOut,
					snapshot: adopted,
					type: 'opt-out:synced',
				});
			}
		});
	};

	const freezeBrowser = function freezeBrowser(
		records: BrowserConsentRecords
	): BrowserConsentRecords {
		if (records.optOut && !Object.isFrozen(records.optOut)) {
			Object.freeze(records.optOut.rights);
			Object.freeze(records.optOut);
		}
		if (records.vendorChoice && !Object.isFrozen(records.vendorChoice)) {
			Object.freeze(records.vendorChoice.denied);
			Object.freeze(records.vendorChoice);
		}
		if (records.vendorDeclared && !Object.isFrozen(records.vendorDeclared)) {
			Object.freeze(records.vendorDeclared);
		}
		if (records.vendorTimes && !Object.isFrozen(records.vendorTimes)) {
			Object.freeze(records.vendorTimes);
		}
		if (records.choice && !Object.isFrozen(records.choice)) {
			for (const decision of Object.values(records.choice.categories)) {
				if (decision) {
					Object.freeze(decision.basis);
					Object.freeze(decision);
				}
			}
			Object.freeze(records.choice.categories);
			Object.freeze(records.choice);
		}
		return records;
	};

	const resolveNextAccount = function resolveNextAccount(
		nextUser: ConsentSnapshot['user'],
		userExternalIdChanged: boolean,
		commitOptions?: RuntimeCommitOptions
	): AccountConsentLayer | null {
		if (commitOptions?.accountLayer !== undefined) {
			return freezeAccountLayer(commitOptions.accountLayer);
		}
		if (
			userExternalIdChanged &&
			accountLayer !== null &&
			accountLayer.externalId !== nextUser?.externalId
		) {
			return null;
		}
		return accountLayer;
	};

	const resolveNextVendorMeta = <T>(
		explicit: T | undefined,
		previous: T | undefined,
		clearOnReplace: boolean
	): T | null | undefined => {
		if (explicit !== undefined) {
			return explicit;
		}
		return clearOnReplace ? null : previous;
	};

	const resolveNextBrowser = function resolveNextBrowser(
		patch: SnapshotPatch,
		accountDroppedOrReplaced: boolean,
		commitOptions?: RuntimeCommitOptions
	): { browserChanged: boolean; nextBrowser: BrowserConsentRecords } {
		let nextOptOut =
			patch.optOut === undefined ? browserRecords.optOut : patch.optOut;
		if (
			patch.optOut === undefined &&
			accountDroppedOrReplaced &&
			nextOptOut?.heldBy === 'person'
		) {
			nextOptOut = null;
		}
		const clearVendorMeta =
			patch.vendorChoice === null ||
			(patch.vendorChoice !== undefined &&
				patch.vendorChoice !== browserRecords.vendorChoice);
		const nextBrowser: BrowserConsentRecords = {
			choice:
				patch.explicitChoice === undefined
					? browserRecords.choice
					: patch.explicitChoice,
			optOut: nextOptOut,
			vendorChoice:
				patch.vendorChoice === undefined
					? browserRecords.vendorChoice
					: patch.vendorChoice,
			vendorDeclared: resolveNextVendorMeta(
				commitOptions?.vendorDeclared,
				browserRecords.vendorDeclared,
				clearVendorMeta
			),
			vendorTimes: resolveNextVendorMeta(
				commitOptions?.vendorTimes,
				browserRecords.vendorTimes,
				clearVendorMeta
			),
		};
		const browserChanged =
			nextBrowser.choice !== browserRecords.choice ||
			nextBrowser.optOut !== browserRecords.optOut ||
			nextBrowser.vendorChoice !== browserRecords.vendorChoice ||
			nextBrowser.vendorDeclared !== browserRecords.vendorDeclared ||
			nextBrowser.vendorTimes !== browserRecords.vendorTimes;
		return { browserChanged, nextBrowser };
	};

	const resolveNextLayers = function resolveNextLayers(
		current: ConsentSnapshot,
		patch: SnapshotPatch,
		commitOptions?: RuntimeCommitOptions
	) {
		const nextUser = patch.user === undefined ? current.user : patch.user;
		const userExternalIdChanged =
			(nextUser?.externalId ?? null) !== (current.user?.externalId ?? null);
		const nextAccount = resolveNextAccount(
			nextUser,
			userExternalIdChanged,
			commitOptions
		);
		const accountDroppedOrReplaced =
			accountLayer !== null && nextAccount !== accountLayer;
		const { browserChanged, nextBrowser } = resolveNextBrowser(
			patch,
			accountDroppedOrReplaced,
			commitOptions
		);
		const nextPolicy =
			patch.resolution !== undefined || patch.consentCategories !== undefined
				? buildEvaluationPolicy(
						resolveEffectivePolicy(patch.resolution ?? current.resolution),
						patch.consentCategories === undefined
							? current.consentCategories
							: patch.consentCategories
					)
				: current.evaluationPolicy;
		const derived = deriveEffectiveRecords(
			nextBrowser,
			nextAccount,
			nextUser,
			nextPolicy,
			{
				choice: current.explicitChoice,
				optOut: current.optOut,
				vendorChoice: current.vendorChoice,
			}
		);
		const effectivePatch: SnapshotPatch = {
			...patch,
			explicitChoice: derived.choice as ExplicitChoice | null,
			hasAccountLayer: derived.activeAccount !== null,
			optOut: derived.optOut as OptOutRecord | null,
			vendorChoice: derived.vendorChoice as VendorChoice | null,
		};
		if (
			commitOptions?.preserveDialog &&
			current.activeUI === 'dialog' &&
			effectivePatch.activeUI === undefined
		) {
			effectivePatch.activeUI = 'dialog';
		}
		return {
			accountChanged: nextAccount !== accountLayer,
			browserChanged,
			effectivePatch,
			nextAccount,
			nextBrowser,
			userExternalIdChanged,
		};
	};

	const deriveCandidate = function deriveCandidate(
		current: ConsentSnapshot,
		rawPatch: SnapshotPatch,
		effectivePatch: SnapshotPatch,
		initialBrowser: BrowserConsentRecords,
		nextAccount: AccountConsentLayer | null
	): {
		next: ConsentSnapshot;
		nextBrowser: BrowserConsentRecords;
		recordedGpcOptOut: boolean;
		recordedBrowserOptOut: OptOutRecord | null;
	} {
		let nextBrowser = initialBrowser;
		let next = gateExperiment(
			current,
			buildNextSnapshot(current, effectivePatch),
			effectivePatch
		);
		let recordedGpcOptOut = false;
		let recordedBrowserOptOut: OptOutRecord | null = null;
		// Record a durable GPC opt-out once the kernel is live (after stored
		// records have been read), the policy is matched and not provisional,
		// GPC is active, and the rule maps it to at least one category.
		// Checks browser records only so an account opt-out never suppresses
		// this device's own GPC report.
		if (
			rawPatch.optOut === undefined &&
			gpcOptOutDue(next, live, nextBrowser.optOut)
		) {
			const gpcOptOut = newLocalOptOutRecord(
				next,
				'gpc',
				next.evaluatedAt,
				defaultOptOutRights()
			);
			nextBrowser = { ...nextBrowser, optOut: gpcOptOut };
			const derivedWithGpc = deriveEffectiveRecords(
				nextBrowser,
				nextAccount,
				next.user,
				next.evaluationPolicy
			);
			const gpcPatch: SnapshotPatch = {
				...effectivePatch,
				optOut: derivedWithGpc.optOut as OptOutRecord | null,
			};
			if (!next.subject?.subjectId) {
				gpcPatch.subject = { ...next.subject, subjectId: generateUuidV7() };
			}
			next = gateExperiment(
				current,
				buildNextSnapshot(current, gpcPatch),
				effectivePatch
			);
			recordedGpcOptOut = true;
			recordedBrowserOptOut = gpcOptOut;
		}
		if (impressionDue(next)) {
			next = stampImpression(next);
		}
		return { next, nextBrowser, recordedBrowserOptOut, recordedGpcOptOut };
	};

	const canSkipDerivation = function canSkipDerivation(
		current: ConsentSnapshot,
		rawPatch: SnapshotPatch,
		effectivePatch: SnapshotPatch,
		browserChanged: boolean,
		accountChanged: boolean,
		nextBrowser: BrowserConsentRecords
	): boolean {
		return (
			!browserChanged &&
			!accountChanged &&
			isUnchangedPatch(current, effectivePatch) &&
			!(
				rawPatch.optOut === undefined &&
				gpcOptOutDue(current, live, nextBrowser.optOut)
			)
		);
	};

	const applyLayerUpdates = function applyLayerUpdates(
		nextBrowser: BrowserConsentRecords,
		browserChanged: boolean,
		nextAccount: AccountConsentLayer | null,
		accountChanged: boolean,
		syncGenShouldBump: boolean,
		fromHydration: boolean,
		forceAccountNotify = false,
		nextAccountSource?: AccountLayerSource
	): void {
		if (browserChanged) {
			browserRecords = freezeBrowser(nextBrowser);
		}
		if (syncGenShouldBump) {
			accountSyncGeneration += 1;
		}
		if (accountChanged) {
			accountLayer = nextAccount;
			accountLayerSource =
				nextAccount === null
					? 'stored'
					: (nextAccountSource ?? (fromHydration ? 'stored' : 'incoming'));
			notifyAccountLayerChange(accountLayer, fromHydration);
		} else if (forceAccountNotify) {
			notifyAccountLayerChange(accountLayer, fromHydration);
		}
	};

	const nextShownSurface = function nextShownSurface(
		current: ConsentSnapshot,
		adopted: ConsentSnapshot,
		patch: SnapshotPatch
	): PromptSurface | null {
		const surface = adopted.activeUI;
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
		return live &&
			isPromptSurface(surface) &&
			!restoredAfterSave &&
			(surface !== current.activeUI || current.surfaceShownAt[surface] === null)
			? surface
			: null;
	};

	const finalizeCommittedSnapshot = function finalizeCommittedSnapshot(
		current: ConsentSnapshot,
		adopted: ConsentSnapshot,
		patch: SnapshotPatch,
		recordedGpcOptOut: boolean,
		recordedBrowserOptOut: OptOutRecord | null,
		emitOptOutSynced: boolean
	): void {
		snapshot = adopted;
		const shown = nextShownSurface(current, adopted, patch);
		if (recordedGpcOptOut) {
			optOutActVersion += 1;
			gpcReportAttempted = true;
			setOptOutReceiptData({
				localAct: 'gpc',
				reference: createIdempotencyKey(),
				rightsConfirmed: false,
			});
			publish(current, adopted, shown, recordedBrowserOptOut ?? adopted.optOut);
		} else {
			if (browserRecords.optOut === null) {
				setOptOutReceiptData(EMPTY_OPT_OUT_RECEIPT_DATA, true);
			}
			publish(current, adopted, shown, null, emitOptOutSynced);
			syncGpcSignalState(current, adopted, adopted.evaluatedAt);
		}
		if (adopted.nextDeadline !== current.nextDeadline) {
			onDeadlineChange();
		}
	};

	const notifyDroppedLegacyOptOut = function notifyDroppedLegacyOptOut(
		dropped: boolean
	): void {
		if (!dropped) {
			return;
		}
		setOptOutReceiptData(EMPTY_OPT_OUT_RECEIPT_DATA, true);
		emit({
			optOut: snapshot.optOut,
			snapshot,
			type: 'opt-out:synced',
		});
	};

	const shouldEmitAccountOptOutSynced = function shouldEmitAccountOptOutSynced(
		droppedLegacy: boolean,
		userExternalIdChanged: boolean,
		previousAccount: AccountConsentLayer | null,
		current: ConsentSnapshot,
		adopted: ConsentSnapshot,
		suppressAccountDrop = false
	): boolean {
		return (
			droppedLegacy ||
			(!suppressAccountDrop &&
				userExternalIdChanged &&
				previousAccount !== null &&
				!sameOptOutRecord(current.optOut, adopted.optOut))
		);
	};

	const commit = function commit(
		patch: SnapshotPatch,
		commitOptions?: RuntimeCommitOptions
	): boolean {
		if (patch.experiment !== undefined) {
			wantedExperiment = patch.experiment;
		}
		const current = snapshot;
		const fromHydration = commitOptions?.fromHydration === true;
		const {
			accountChanged,
			browserChanged,
			effectivePatch,
			nextAccount,
			nextBrowser: initialBrowser,
			userExternalIdChanged,
		} = resolveNextLayers(current, patch, commitOptions);
		let nextBrowser = initialBrowser;
		let adopted: ConsentSnapshot;
		let recordedGpcOptOut = false;
		let recordedBrowserOptOut: OptOutRecord | null = null;
		const previousAccount = accountLayer;
		const droppedLegacyPersonOptOut =
			patch.optOut === undefined &&
			browserRecords.optOut?.heldBy === 'person' &&
			nextBrowser.optOut === null;
		const forceAccountNotify = commitOptions?.forceAccountNotify === true;
		const syncGenShouldBump =
			userExternalIdChanged ||
			(previousAccount !== null && nextAccount === null && !fromHydration);
		if (
			canSkipDerivation(
				current,
				patch,
				effectivePatch,
				browserChanged,
				accountChanged,
				nextBrowser
			)
		) {
			if (syncGenShouldBump) {
				accountSyncGeneration += 1;
			}
			if (forceAccountNotify) {
				notifyAccountLayerChange(accountLayer, fromHydration);
			}
			if (!impressionDue(current)) {
				return false;
			}
			adopted = stampCurrent(current, patch.now ?? current.evaluatedAt);
		} else {
			const derived = deriveCandidate(
				current,
				patch,
				effectivePatch,
				nextBrowser,
				nextAccount
			);
			({ nextBrowser, recordedBrowserOptOut, recordedGpcOptOut } = derived);
			if (!snapshotChanged(current, derived.next)) {
				applyLayerUpdates(
					nextBrowser,
					browserChanged,
					nextAccount,
					accountChanged,
					syncGenShouldBump,
					fromHydration,
					forceAccountNotify,
					commitOptions?.accountLayerSource
				);
				notifyDroppedLegacyOptOut(droppedLegacyPersonOptOut);
				return false;
			}
			adopted = freezeSnapshot(derived.next);
		}
		applyLayerUpdates(
			nextBrowser,
			true,
			nextAccount,
			accountChanged,
			syncGenShouldBump,
			fromHydration,
			forceAccountNotify,
			commitOptions?.accountLayerSource
		);
		finalizeCommittedSnapshot(
			current,
			adopted,
			patch,
			recordedGpcOptOut,
			recordedBrowserOptOut,
			shouldEmitAccountOptOutSynced(
				droppedLegacyPersonOptOut,
				userExternalIdChanged,
				previousAccount,
				current,
				adopted,
				commitOptions?.suppressAccountDropOptOutSynced === true
			)
		);
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
		if (gpcOptOutDue(current, live, browserRecords.optOut)) {
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
		bumpAccountSyncGeneration: () => {
			accountSyncGeneration += 1;
			return accountSyncGeneration;
		},
		commit,
		emit,
		getAccountLayer: () => accountLayer,
		getAccountLayerSource: () => accountLayerSource,
		getAccountSyncGeneration: () => accountSyncGeneration,
		getBrowserRecords: () => browserRecords,
		getGeneration: () => generation,
		getIdentityVersion: () => identityVersion,
		getOptOutActVersion: () => optOutActVersion,
		getOptOutGpcReportEpoch: () => gpcReportEpoch,
		getOptOutReceiptData: () => optOutReceiptData,
		getSnapshot,
		invalidateRecords: () => {
			generation += 1;
		},
		isOptOutGpcReported: () => gpcReported,
		markLive,
		noteIdentify: () => {
			identityVersion += 1;
			return identityVersion;
		},
		noteOptOutAct: () => {
			optOutActVersion += 1;
			return optOutActVersion;
		},
		now,
		onAccountLayerChange(listener) {
			accountLayerListeners ??= createListenerSet();
			return accountLayerListeners.add(({ layer, fromHydration }) => {
				listener(layer, fromHydration);
			});
		},
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
