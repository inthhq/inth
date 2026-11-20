/**
 * A banner's accept or reject, recorded before the kernel has loaded.
 *
 * A deferred root keeps the consent kernel out of the page's first load.
 * When the visitor's first input is a tap on the banner, waiting for the
 * whole kernel would hold their choice back by its download. This records
 * the tap from the snapshot the page rendered with, with the kernel's own
 * save code (`kernel/save-plan.ts`, `buildNextSnapshot`):
 *
 * - {@link planEarlyCommit} builds what `commands.save('all' | 'none')`
 *   would commit: the next snapshot, the records, the events and the
 *   backend payload. It declines whatever only the kernel can record.
 * - {@link storeEarlyCommit} writes the consent record to localStorage and
 *   its cookie, as persistence does, and queues the payload in the save
 *   outbox, as a save does before it sends. The kernel that loads next
 *   starts from the records and sends the queued payload.
 *
 * @packageDocumentation
 * @internal
 */

import { recordCategoryPatch } from '../consent-record/record';
import type { OptionalConsentCategory } from '../consent-record/types';
import { buildNextSnapshot } from '../kernel/next-snapshot';
import type { PolicyResolvers, SnapshotPatch } from '../kernel/next-snapshot';
import {
	createBrowserOutboxStore,
	enqueueSave,
} from '../kernel/save-outbox/store';
import type { SaveOutboxStore } from '../kernel/save-outbox/store';
import {
	applyNoticeAcknowledgement,
	buildSavePayload,
	choiceAcknowledgement,
	datedSubjectDates,
	resolveSaveSelection,
	saveAttribution,
	saveSubject,
} from '../kernel/save-plan';
import { deleteCookie, getRawCookieValue, writeCookie } from '../libs/cookie';
import { dateChoice, queuedGivenAt } from '../libs/given-at';
import { removeLocalStorageKey } from '../libs/local-storage';
import { storageFor } from '../libs/storage-for';
import { resolveStorageKeys } from '../libs/storage-keys';
import { generateUuidV7 } from '../libs/subject-uuid';
import {
	decodeNoticeDismissal,
	decodeVendorChoice,
	validateStoredConsentEnvelope,
} from '../modules/persistence/record-codec';
import type { StorageConfig } from '../modules/persistence/types';
import { createRecordStore } from '../modules/persistence/writer/store';
import type { RecordStoreTools } from '../modules/persistence/writer/types';
import { buildStoredEnvelope } from '../modules/persistence/writer/write';
import type { Callbacks } from '../options/callbacks';
import type { StandInKernelHandle } from '../runtime/stand-in-kernel';
import type { ConsentRuntimeOptions } from '../runtime/types';
import type {
	ConsentSnapshot,
	HydrationRecords,
	KernelEvent,
	SaveResult,
	SavePayload,
	SaveUISource,
} from '../types';
import {
	hasStoredClearEpoch,
	kernelOnly,
	pendingIsInert,
} from './instant-commit';
import type { InstantCommit } from './instant-commit';

export { hasStoredClearEpoch } from './instant-commit';

/**
 * A choice changes neither the resolution nor the consent categories, so
 * `buildNextSnapshot` never resolves a policy here; this keeps that code
 * out of the commit's chunk.
 */
const NO_POLICY_CHANGE: PolicyResolvers = {
	buildEvaluationPolicy: () => {
		throw new Error('inth: a choice does not change the policy.');
	},
	resolveEffectivePolicy: () => {
		throw new Error('inth: a choice does not change the policy.');
	},
};

/** What one early save records. @internal */
export interface EarlyCommit {
	/** The snapshot the kernel would hold after the save. */
	snapshot: ConsentSnapshot;
	/** The snapshot before it. */
	previous: ConsentSnapshot;
	/** The records a kernel loaded afterwards starts from. */
	records: Pick<HydrationRecords, 'choice' | 'subject'>;
	/** The backend payload, queued in the save outbox. */
	payload: SavePayload;
	/** The kernel events the save emits, in the kernel's order. */
	events: KernelEvent[];
}

/** @internal */
export interface EarlyCommitInput {
	/** The snapshot the page renders from. */
	snapshot: ConsentSnapshot;
	/**
	 * `'all'` for accept, `'none'` for reject, or the categories a
	 * preference form saves, as `commands.save` takes them.
	 */
	choice: 'all' | 'none' | Partial<Record<OptionalConsentCategory, boolean>>;
	/** Epoch milliseconds of the tap. */
	actionAt: number;
	/** The clock now. Defaults to `Date.now()`. */
	now?: number;
	/** The surface the tap was on. Defaults to `banner`. */
	uiSource?: SaveUISource;
	/**
	 * The subject id to record when the visitor has none, such as the one
	 * `planInstantCommit` chose. Generated when absent.
	 */
	subjectId?: string;
}

/**
 * The save `commands.save(choice)` from a stock surface would record, or
 * `null` when only the kernel can record it: no matched policy or a
 * pending one, an IAB or external CMP decision, an experiment, declared or
 * denied vendors, an acknowledgement record, or nothing to confirm.
 *
 * @param input - The rendered snapshot and the tap.
 * @internal
 */
export const planEarlyCommit = function planEarlyCommit(
	input: EarlyCommitInput
): EarlyCommit | null {
	const before = input.snapshot;
	const deviceNow = input.now ?? Date.now();
	const tapAt = input.actionAt;
	if (
		kernelOnly(before) ||
		!Number.isSafeInteger(tapAt) ||
		tapAt < 0 ||
		tapAt > deviceNow
	) {
		return null;
	}
	// The stock banner's replay passes its displayed categories, which
	// cover the whole choice scope: the same selection as passing none. An
	// object is recorded as given, as the kernel records it.
	const selection = resolveSaveSelection(before, null, input.choice);
	const record = (at: number) =>
		recordCategoryPatch(before.explicitChoice, selection.values, {
			actionAt: at,
			now: Math.max(deviceNow, at),
			policy: before.evaluationPolicy,
		});
	const subjectId =
		before.subject?.subjectId ?? input.subjectId ?? generateUuidV7();
	// Dated as the kernel dates an action: after the subject's floor.
	const actionAt = dateChoice(
		tapAt,
		Math.max(
			before.subject?.subjectId === subjectId
				? (before.subjectDates?.acceptedGivenAt ?? -1)
				: -1,
			queuedGivenAt(createBrowserOutboxStore().peek('saves'), subjectId)
		)
	);
	const now = Math.max(deviceNow, actionAt);
	const recorded = record(actionAt);
	if (
		recorded.ok === false ||
		recorded.confirmed.length === 0 ||
		choiceAcknowledgement(before, actionAt) !== null
	) {
		return null;
	}
	const { uiSource, ...timing } = saveAttribution(
		before,
		input.uiSource ?? 'banner',
		tapAt
	);
	const subject = saveSubject(before, subjectId);
	const patch: SnapshotPatch = {
		explicitChoice: recorded.choice,
		now,
		subject,
	};
	const subjectDates = datedSubjectDates(before, actionAt, deviceNow);
	if (subjectDates) {
		patch.subjectDates = subjectDates;
	}
	applyNoticeAcknowledgement(patch, before, actionAt);
	if (patch.noticeDismissal !== undefined) {
		// A notice record goes through persistence's notice write.
		return null;
	}
	const after = buildNextSnapshot(before, patch, NO_POLICY_CHANGE);
	const events: KernelEvent[] = [];
	if (after.effectivePermissions !== before.effectivePermissions) {
		events.push({
			previous: before.effectivePermissions,
			snapshot: after,
			type: 'permissions:changed',
		});
	}
	events.push({
		actionAt,
		confirmed: Object.freeze([...recorded.confirmed]),
		consentAction: selection.consentAction,
		snapshot: after,
		type: 'choice:recorded',
		uiSource,
		...timing,
	});
	return {
		events,
		payload: buildSavePayload(after, {
			actionAt,
			choice: recorded.choice,
			confirmed: recorded.confirmed,
			consentAction: selection.consentAction,
			subject,
			subjectId,
			timing,
			uiSource,
		}),
		previous: before,
		records: { choice: recorded.choice, subject },
		snapshot: after,
	};
};

/** Where {@link storeEarlyCommit} writes. @internal */
export interface EarlyCommitStorage {
	/** The runtime's storage configuration (`storageFor(options)`). */
	storageConfig?: StorageConfig;
	/** The outbox store. Defaults to the browser's. */
	outbox?: SaveOutboxStore;
}

const writeTools: RecordStoreTools = {
	decodeNotice: decodeNoticeDismissal,
	decodeVendors: decodeVendorChoice,
	deleteCookie,
	keys: resolveStorageKeys,
	rawCookie: getRawCookieValue,
	removeLocal: removeLocalStorageKey,
	validateEnvelope: validateStoredConsentEnvelope,
	writeCookie,
};

/**
 * Writes the commit's consent record to localStorage and its cookie, then
 * queues its payload in the save outbox, where the kernel's replay sends
 * it. Write before send, as a save does.
 *
 * @param commit - From {@link planEarlyCommit}.
 * @param storage - Storage configuration and outbox store.
 * @returns Resolves once the payload is queued; `false` when storage
 * refused it.
 * @internal
 */
export const storeEarlyCommit = function storeEarlyCommit(
	commit: EarlyCommit,
	storage: EarlyCommitStorage = {}
): Promise<boolean> {
	const envelope = buildStoredEnvelope(commit.snapshot, null);
	if (envelope) {
		const result = createRecordStore(writeTools).writeStoredConsentEnvelope(
			envelope,
			{ config: storage.storageConfig, now: Date.now() }
		);
		if (result.ok === false) {
			console.warn('[inth] Consent record was not written.', result.issues);
		}
	}
	return enqueueSave(
		storage.outbox ?? createBrowserOutboxStore(),
		commit.payload
	);
};

/** A choice recorded before the engine loaded. @internal */
export interface DeferredCommitted {
	/** The records the engine's kernel starts from. */
	records: Pick<HydrationRecords, 'choice' | 'subject'>;
	/** The permissions the commit announced. */
	permissions: ConsentSnapshot['effectivePermissions'];
}

/** @internal */
export interface CompleteCommitInput {
	/**
	 * The stand-in kernel that reads the committed snapshot. Without one,
	 * only an `instant` commit completes; the caller shows its snapshot.
	 */
	handle?: Pick<
		StandInKernelHandle,
		'attached' | 'commit' | 'kernel' | 'pending'
	>;
	/** What the tap's own task committed, if it did. */
	instant: InstantCommit | null;
	/** `'all'`, `'none'` or a form's selection, as `commands.save` takes. */
	choice: EarlyCommitInput['choice'];
	/** Epoch milliseconds of the tap. */
	actionAt: number;
	/** The surface the save is attributed to. Defaults to `banner`. */
	uiSource?: SaveUISource;
	/** The runtime options: where persistence stores, and the callbacks. */
	config: Pick<
		ConsentRuntimeOptions,
		'callbacks' | 'consentSource' | 'persistence' | 'storageConfig'
	>;
	/**
	 * Runs once the stand-in reads the committed snapshot, before the record
	 * is stored: the page's scripts start with the choice.
	 */
	onCommitted?: (snapshot: ConsentSnapshot) => void;
}

/** @internal */
export interface CompleteCommitResult {
	committed: DeferredCommitted;
	/**
	 * The snapshot the save records: the instant snapshot when they hold the
	 * same data, so listeners hear nothing new.
	 */
	snapshot: ConsentSnapshot;
	/** What `commands.save` resolves with for the same save. */
	result: SaveResult;
}

/** Whether two values hold the same data, in any key order. */
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
	return (
		leftKeys.length === own(rightRecord).length &&
		leftKeys.every((key) => sameValue(leftRecord[key], rightRecord[key]))
	);
};

/** Calls the app callback the engine's runtime calls for `event`. */
const announce = function announce(
	callbacks: Callbacks | undefined,
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
		console.error('[inth] A consent callback threw.', error);
	}
};

/**
 * Plans the save from the snapshot the instant commit started from, when
 * there was one, and gives the stand-in its snapshot and events.
 */
const planAndCommit = function planAndCommit(
	input: CompleteCommitInput,
	storageConfig: StorageConfig | undefined
): EarlyCommit | null {
	const { handle, instant } = input;
	// Storage was read ahead of the tap; a clear stored since is the
	// engine's to record.
	if (hasStoredClearEpoch(storageConfig)) {
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
		return !handle || handle.commit(snapshot, events)
			? { ...plan, events, snapshot }
			: null;
	}
	if (!handle || handle.attached() || !pendingIsInert(handle)) {
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
 * Records a choice on a deferred root's stand-in, or completes the instant
 * commit the tap's task made: stores the record where persistence keeps it
 * (`storageFor`), queues the save and calls the app's callbacks. Returns
 * `null` when only the engine can record it (see `planEarlyCommit`), when
 * setters wait for the engine, when a clear epoch is stored, once the
 * engine has attached, or when the outbox could not keep the save; the
 * engine records the choice then.
 *
 * @param input - The stand-in, the tap and the app's options.
 * @returns What the engine needs to take over, or `null`.
 * @internal
 */
export const completeCommit = async function completeCommit(
	input: CompleteCommitInput
): Promise<CompleteCommitResult | null> {
	const storageConfig = storageFor(input.config);
	const plan = planAndCommit(input, storageConfig);
	if (!plan) {
		return null;
	}
	input.onCommitted?.(plan.snapshot);
	if (!(await storeEarlyCommit(plan, { storageConfig }))) {
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
		snapshot: plan.snapshot,
	};
};
