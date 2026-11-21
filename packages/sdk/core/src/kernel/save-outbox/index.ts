/**
 * The save outbox: everything that happens to a recorded choice or durable
 * opt-out act after the kernel records it.
 *
 * `send()` owns category and vendor saves: the transport call, trimming what
 * newer state superseded, queueing what the transport could not take,
 * replaying the queue, moving the visitor to a new subject id when the
 * backend refuses theirs, and asking for a retry when the browser comes back
 * online. `sendOptOut()`, `sendOptOutLift()` and `liftAccountOptOut()` run
 * durable opt-out acts through the same outbox, in their own `optOuts` slot in
 * the {@link SaveOutboxStore}.
 *
 * The send path loads with the kernel. Everything that reads the stored
 * queue (validation, replay, reassignment) is in `queue.ts`, imported the
 * first time a visitor saves, opts out, or replays a queue. Queueing never
 * waits for it: until it has loaded, the entry is appended as is and
 * normalized on the next read.
 *
 * Interface:
 * - Queue before send. An explicit save or opt-out act is stored before its
 *   transport starts, so a page that unloads with an in-flight request leaves
 *   a replay for the next page. Successful and permanently rejected requests
 *   remove it.
 * - Write before send. `send()`, `sendOptOut()` and `sendOptOutLift()` make
 *   no transport call before the macrotask after they were called. The kernel
 *   calls them once the commit has notified every listener, so a local writer
 *   that handed its write to a macrotask from a listener (persistence
 *   schedules `setTimeout(0)`) lands it before the request leaves. A writer
 *   that cannot write by then (persistence while its write code loads) holds
 *   the request through `kernel.holdSaves()` (`hold()` here).
 * - Saves are only ever sent, queued or discarded for the part of them the
 *   current state still holds ({@link withoutSuperseded}). Opt-out entries
 *   are never narrowed, superseded or dropped because the policy, the
 *   fingerprint or the policy snapshot changed, and replay in the exact order
 *   they were queued.
 * - A `404` on an opt-out route means the backend does not store opt-outs.
 *   The outbox removes every queued opt-out entry, fills empty local `rights`
 *   with all three rights through `opt-out:synced`, stops sending further
 *   opt-out requests for this kernel, and reports no error or warning.
 * - `clear()` empties all three slots (saves, opt-out acts, reassignments).
 *   The kernel calls it on `records:cleared`, so clearing records drops
 *   queued work of the cleared subject immediately and again under the lock.
 * - Whenever a send or replay leaves something queued, the outbox calls
 *   `retryWhenOnline`. The kernel's one connectivity listener then calls
 *   `replay()` on `online`, next to its init retry, and only while the
 *   kernel is not disposed.
 * - Queue transactions never span a network call: a hung transport must
 *   not block other tabs. Two tabs may replay the same entry; the persisted
 *   idempotency key makes the backend record it once.
 */

import { OPT_OUT_RIGHTS } from '@inth/sdk-schema/types';
import type { OptOutRecord } from '@inth/sdk-schema/types';

import type { OptionalConsentCategory } from '../../consent-record/types';
import { warnInDevelopment } from '../../libs/is-production';
import {
	isConsentSaveRejection,
	isSubjectConflict,
} from '../../transports/save-rejection';
import type {
	ConsentSnapshot,
	KernelTransport,
	LiftOptOutPayload,
	OptOutPayload,
	SavePayload,
	SaveResult,
} from '../../types';
import { applySyncedOptOut } from '../opt-out';
import type { KernelRuntime } from '../runtime';
import type {
	EnqueueResult,
	OptOutEnqueueResult,
	QueueWorker,
	QueueWorkerOptions,
} from './queue';
import { queueTools } from './queue-tools';
import { appendOptOut, appendSave } from './store';
import type { OptOutAct, SaveOutboxStore } from './store';
import {
	liveSupersession,
	withoutSuperseded,
	withSubjectId,
} from './supersession';

export type {
	OptOutAct,
	OutboxSlot,
	OutboxTransaction,
	PendingOptOutEntry,
	SaveOutboxStore,
} from './store';
export { createBrowserOutboxStore, createMemoryOutboxStore } from './store';

/** One recorded action, as `commands.save()` hands it to the outbox. */
export interface RecordedAction {
	/** Records generation the action landed in. */
	generation: number;
	/** Local opt-out act counter when the action landed. */
	optOutActVersion: number;
	/** The snapshot the action committed. */
	snapshot: ConsentSnapshot;
	/** Categories the action confirmed, echoed in the result. */
	confirmed: readonly OptionalConsentCategory[];
}

/** Fencing context for a queued opt-out act. */
export interface OptOutActionContext {
	actVersion: number;
	generation: number;
	/** Called once a GPC report is stored durably or answered by the backend. */
	onGpcReported?: () => void;
}

/** Outcome of a queued account opt-out lift. */
export interface AccountLiftOutcome {
	ok: boolean;
	optOut?: OptOutRecord | null;
	subjectId?: string;
	unsupported?: boolean;
}

export interface SaveOutbox {
	/**
	 * Send one recorded action. Resolves once the transport answered and
	 * the queue was updated; never rejects. Without a transport `save`, it
	 * resolves at once as accepted.
	 */
	send: (payload: SavePayload, action: RecordedAction) => Promise<SaveResult>;
	/** Queue and send one local opt-out act (`button` or `gpc`). */
	sendOptOut: (
		payload: OptOutPayload,
		context: OptOutActionContext
	) => Promise<void>;
	/** Queue and send one local device opt-out lift. */
	sendOptOutLift: (
		payload: LiftOptOutPayload,
		context: OptOutActionContext
	) => Promise<void>;
	/**
	 * Queue and send one account-held opt-out lift. Keeps it queued for replay
	 * on failure and handles `404` and `409 subject_conflict`.
	 */
	liftAccountOptOut: (
		payload: LiftOptOutPayload
	) => Promise<AccountLiftOutcome>;
	/**
	 * Replay queued saves and opt-out acts, one entry at a time. Overlapping
	 * calls share one run. Asks for an online retry while anything is left.
	 */
	replay: () => Promise<void>;
	/**
	 * Drop every queued save, opt-out act and subject reassignment: from
	 * storage before it returns, and again under the store's lock once that
	 * is granted.
	 */
	clear: () => Promise<void>;
	/**
	 * Keep requests from leaving until `until` settles: a local write that
	 * is not ready yet. Requests already sent are not held.
	 */
	hold: (until: Promise<unknown>) => void;
	/** Pending promise from {@link hold}, or `undefined` once settled. */
	getHold: () => Promise<unknown> | undefined;
	/**
	 * Move the visitor from the `sub_` id `from` to the UUID the backend
	 * answered for it, in every tab, with the entries queued under `from`.
	 * Returns the adopted UUID when it moved, else `null`.
	 */
	adoptSubject: (from: string, to: string) => Promise<string | null>;
	/** Whether an opt-out route answered `404` on this kernel. */
	areOptOutsUnsupported: () => boolean;
	/** Number of direct opt-out and lift requests currently in flight. */
	getOptOutRequestsInFlight: () => number;
	/** Subscribe to changes in the in-flight opt-out and lift request count. */
	onOptOutRequestsChange: (listener: (inFlight: number) => void) => () => void;
}

export interface SaveOutboxOptions {
	runtime: KernelRuntime;
	transport: KernelTransport | undefined;
	store: SaveOutboxStore;
	/** Called whenever something is left queued; replay once back online. */
	retryWhenOnline: () => void;
	/** Loads the queue module. Defaults to `import('./queue')`. */
	loadQueue?: () => Promise<{
		createQueueWorker: (options: QueueWorkerOptions) => QueueWorker;
	}>;
}

/**
 * Tell a developer that a save did not reach the backend. Otherwise the only
 * signal is `onError`, and a queued save looks the same as a recorded one.
 */
const SAVE_FAILED_WARNINGS = {
	queued:
		'[inth] Consent save failed. The choice is kept in this browser and queued, and is resent on the next init or when the browser comes back online.',
	rejected:
		'[inth] The backend refused the consent save, so it will not be resent. The choice is kept in this browser only.',
	unstored:
		'[inth] Consent save failed, and storage refused to queue it, so it will not be resent. The choice is kept in this browser only.',
} as const;

const OPT_OUT_FAILED_WARNINGS = {
	queued:
		'[inth] Opt-out request failed. The opt-out is kept in this browser and queued, and is resent on the next init or when the browser comes back online.',
	rejected:
		'[inth] The backend refused the opt-out request, so it will not be resent. The opt-out is kept in this browser only.',
	unstored:
		'[inth] Opt-out request failed, and storage refused to queue it, so it will not be resent. The opt-out is kept in this browser only.',
} as const;

/** The prefix of a subject ID a c15t client made. */
const LEGACY_SUBJECT_PREFIX = 'sub_';

const isUnsupportedStatus = function isUnsupportedStatus(
	error: unknown
): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		(error as { status?: unknown }).status === 404
	);
};

const warnSaveFailed = function warnSaveFailed(
	outcome: keyof typeof SAVE_FAILED_WARNINGS | 'superseded',
	error?: unknown
): void {
	// A save whose records were cleared or replaced meanwhile lost nothing.
	if (outcome !== 'superseded') {
		warnInDevelopment(SAVE_FAILED_WARNINGS[outcome], error);
	}
};

const warnOptOutFailed = function warnOptOutFailed(
	outcome: keyof typeof OPT_OUT_FAILED_WARNINGS,
	error?: unknown
): void {
	warnInDevelopment(OPT_OUT_FAILED_WARNINGS[outcome], error);
};

// oxlint-disable-next-line max-lines-per-function -- Save and opt-out delivery share the store, worker and lock state.
export const createSaveOutbox = function createSaveOutbox({
	runtime,
	transport,
	store,
	retryWhenOnline,
	loadQueue = () => import('./queue'),
}: SaveOutboxOptions): SaveOutbox {
	const { emit, getSnapshot } = runtime;
	let worker: QueueWorker | undefined;
	// Instance-local: another page must still recover a stranded request.
	const directSends = new Set<SavePayload>();
	const directOptOutSends = new Set<string>();
	const saveActVersions = new Map<string, number>();
	let optOutRequestsInFlight = 0;
	const optOutRequestListeners = new Set<(inFlight: number) => void>();
	const notifyOptOutRequests = (): void => {
		for (const listener of [...optOutRequestListeners]) {
			listener(optOutRequestsInFlight);
		}
	};
	const trackOptOutRequest = async function trackOptOutRequest<Result>(
		run: () => Promise<Result>
	): Promise<Result> {
		optOutRequestsInFlight += 1;
		notifyOptOutRequests();
		try {
			return await run();
		} finally {
			optOutRequestsInFlight = Math.max(0, optOutRequestsInFlight - 1);
			notifyOptOutRequests();
		}
	};
	// By key: the stored entry of a save in flight is still this action
	// after it was narrowed, or moved to another subject id.
	const isSending = (payload: SavePayload): boolean =>
		payload.idempotencyKey !== undefined &&
		[...directSends].some(
			(pending) => pending.idempotencyKey === payload.idempotencyKey
		);
	const isSendingOptOut = (idempotencyKey: string): boolean =>
		directOptOutSends.has(idempotencyKey);
	// What requests wait for after the pre-send macrotask: see `hold()`.
	let held: Promise<unknown> | undefined;
	// Remembered per kernel once either opt-out route answers 404.
	let optOutsUnsupported = false;
	// Bumped on `clear()` so pre-clear opt-out sends waiting for the macrotask
	// do not leave after a clear.
	let clearVersion = 0;

	/** The queue module, loaded once; `undefined` when it cannot load. */
	const loadWorker = async function loadWorker(): Promise<
		QueueWorker | undefined
	> {
		if (!worker) {
			try {
				const { createQueueWorker } = await loadQueue();
				worker ??= createQueueWorker({
					getSaveActVersion: (key) =>
						key === undefined ? undefined : saveActVersions.get(key),
					hasOptOutInFlight: () => directOptOutSends.size > 0,
					isSending,
					isSendingOptOut,
					runtime,
					store,
					tools: queueTools,
				});
			} catch {
				// Offline and never loaded: callers fall back or skip.
			}
		}
		return worker;
	};

	const hasQueued = function hasQueued(
		slot: 'saves' | 'optOuts'
	): Promise<boolean> {
		return store.transact((tx) => tx.read(slot) !== undefined);
	};

	const enqueue = function enqueue(
		current: () => SavePayload | null
	): Promise<EnqueueResult> {
		if (worker) {
			return worker.enqueue(current);
		}
		void loadWorker();
		return store.transact((tx) => {
			const payload = current();
			if (!payload) {
				return 'superseded';
			}
			return tx.write(
				'saves',
				appendSave(tx.read('saves'), payload, Date.now())
			)
				? 'queued'
				: 'unstored';
		});
	};

	const enqueueOptOut = function enqueueOptOut(
		act: OptOutAct
	): Promise<OptOutEnqueueResult> {
		if (worker) {
			return worker.enqueueOptOut(act);
		}
		void loadWorker();
		return store.transact((tx) => {
			if (
				!tx.write('optOuts', appendOptOut(tx.read('optOuts'), act, Date.now()))
			) {
				return 'unstored';
			}
			return tx.durable === false ? 'memory' : 'queued';
		});
	};

	const discard = async function discard(payload: SavePayload): Promise<void> {
		if (payload.idempotencyKey !== undefined) {
			saveActVersions.delete(payload.idempotencyKey);
		}
		if (await hasQueued('saves')) {
			await (await loadWorker())?.discard(payload);
		}
	};

	const discardOptOut = async function discardOptOut(
		idempotencyKey: string
	): Promise<void> {
		if (await hasQueued('optOuts')) {
			await (await loadWorker())?.discardOptOut(idempotencyKey);
		}
	};

	const fillUnsupportedOptOutRights =
		function fillUnsupportedOptOutRights(): void {
			const current = getSnapshot();
			if (!current.optOut || current.optOut.rights.length > 0) {
				return;
			}
			applySyncedOptOut(
				runtime,
				{ ...current.optOut, rights: [...OPT_OUT_RIGHTS] },
				{
					actVersion: runtime.getOptOutActVersion(),
					allowClear: false,
					generation: runtime.getGeneration(),
					subjectId: current.subject?.subjectId ?? null,
				}
			);
		};

	const markOptOutsUnsupported =
		async function markOptOutsUnsupported(): Promise<void> {
			optOutsUnsupported = true;
			fillUnsupportedOptOutRights();
			await store.transact((tx) => {
				if (tx.read('optOuts') !== undefined) {
					tx.write('optOuts', []);
				}
			});
		};

	const clear = function clear(): Promise<void> {
		clearVersion += 1;
		saveActVersions.clear();
		// At once, so the page can close before the lock is granted: a later
		// page must not replay the cleared subject's saves or opt-outs. Then
		// again under the lock, after any transaction that read the lists first.
		store.clear();
		return store.transact(() => {
			store.clear();
		});
	};

	const replay = async function replay(): Promise<void> {
		const save = transport?.save;
		const hasSaves = Boolean(save) && (await hasQueued('saves'));
		const hasOptOutTransport =
			!optOutsUnsupported &&
			Boolean(transport?.optOut || transport?.liftOptOut);
		const hasOptOuts = hasOptOutTransport && (await hasQueued('optOuts'));
		if (!hasSaves && !hasOptOuts) {
			return;
		}
		const loaded = await loadWorker();
		if (!loaded) {
			return;
		}
		let leftQueued = false;
		if (hasSaves && save) {
			// A replay is no longer the page that made the save: it carries no
			// consent journey, so a backend never links it to this page load.
			const resend: NonNullable<KernelTransport['save']> = (payload) =>
				save(payload, { replay: true });
			if (await loaded.replay(resend)) {
				leftQueued = true;
			}
		}
		if (hasOptOuts && !optOutsUnsupported) {
			const remainingOptOuts = await loaded.replayOptOuts(
				{
					liftOptOut: transport?.liftOptOut,
					optOut: transport?.optOut,
				},
				() => {
					optOutsUnsupported = true;
					fillUnsupportedOptOutRights();
				}
			);
			if (remainingOptOuts) {
				leftQueued = true;
			}
		}
		if (leftQueued) {
			retryWhenOnline();
		}
	};

	// -- Send ------------------------------------------------------------------

	const settleThrownSave = async function settleThrownSave(
		payload: SavePayload,
		ensureQueued: () => Promise<EnqueueResult>,
		error: unknown
	): Promise<void> {
		if (isConsentSaveRejection(error)) {
			warnSaveFailed('rejected', error);
			await discard(payload);
			return;
		}
		warnSaveFailed(await ensureQueued(), error);
		retryWhenOnline();
	};

	const adoptSubject = async function adoptSubject(
		from: string,
		to: string
	): Promise<string | null> {
		if (from.startsWith(LEGACY_SUBJECT_PREFIX) && from !== to) {
			return (await (await loadWorker())?.reassignSubject(from, to)) ?? null;
		}
		return null;
	};

	const adoptServerSubjectById = async function adoptServerSubjectById(
		subjectId: string | undefined,
		sentSubjectId: string | undefined
	): Promise<string | undefined> {
		const from = getSnapshot().subject?.subjectId;
		if (subjectId && from && from === sentSubjectId) {
			return (await adoptSubject(from, subjectId)) ?? undefined;
		}
		return undefined;
	};

	const trackDirectSend = async function trackDirectSend(
		payload: SavePayload,
		send: () => Promise<SaveResult>
	): Promise<SaveResult> {
		// Register before enqueueing or waiting for local persistence. A replay
		// must not bypass those waits or duplicate this request while pending.
		directSends.add(payload);
		try {
			return await send();
		} finally {
			directSends.delete(payload);
		}
	};

	const settleAcceptedSave = async function settleAcceptedSave(
		payload: SavePayload,
		result: SaveResult,
		action: RecordedAction
	): Promise<void> {
		// The whole action, not the part still current: a newer choice
		// that storage refused never narrowed the queued entry.
		await discard(payload);
		// Also when a newer choice superseded this one: the answer names
		// the subject, and saves queued under the old id move with it.
		const adopted = await adoptServerSubjectById(
			result.subjectId,
			action.snapshot.subject?.subjectId
		);
		if (
			result.optOut !== undefined &&
			directOptOutSends.size === 0 &&
			!(await hasQueued('optOuts'))
		) {
			applySyncedOptOut(runtime, result.optOut, {
				actVersion: action.optOutActVersion,
				allowClear: false,
				generation: action.generation,
				subjectId: adopted ?? action.snapshot.subject?.subjectId ?? null,
			});
		}
	};

	const performSendAction = async function performSendAction(
		payload: SavePayload,
		action: RecordedAction,
		// False on the resend after a subject reassignment, so a backend that
		// refuses every id costs one extra request, not a loop.
		reassign: boolean
	): Promise<SaveResult> {
		const { confirmed, generation, snapshot: actionSnapshot } = action;
		if (payload.idempotencyKey !== undefined) {
			saveActVersions.set(payload.idempotencyKey, action.optOutActVersion);
		}
		const currentPayload = (): SavePayload | null => {
			const current = getSnapshot();
			if (
				runtime.getGeneration() !== generation ||
				current.user !== actionSnapshot.user ||
				current.evaluationPolicy.choice.fingerprint !==
					actionSnapshot.evaluationPolicy.choice.fingerprint
			) {
				return null;
			}
			return withoutSuperseded(
				payload,
				liveSupersession(actionSnapshot, current)
			);
		};
		const save = transport?.save;
		let staged: EnqueueResult = 'unstored';
		if (save) {
			// A request may never settle when the document unloads. Waiting for
			// its failure before queueing would lose this explicit action.
			staged = await enqueue(currentPayload);
		}
		const ensureQueued = (): Promise<EnqueueResult> =>
			staged === 'queued' && currentPayload() === payload
				? Promise.resolve(staged)
				: enqueue(currentPayload);
		// A local write that is not ready yet holds the request, and without
		// a request the save's completion, which a revocation reload waits for.
		if (held) {
			await held;
		}
		if (!save) {
			return { confirmed, ok: true, subjectId: payload.subjectId };
		}
		try {
			// Write before send, and paint before send: see the module
			// interface. Nothing goes out before the next macrotask.
			await new Promise((resolve) => {
				setTimeout(resolve, 0);
			});
			const sending = currentPayload();
			if (!sending) {
				await discard(payload);
				return { confirmed, ok: false };
			}
			const result = await save(sending);
			if (result.ok) {
				await settleAcceptedSave(payload, result, action);
			} else if (currentPayload()) {
				warnSaveFailed(await ensureQueued());
				retryWhenOnline();
			} else {
				await discard(payload);
			}
			return { ...result, confirmed };
		} catch (error) {
			const remaining = currentPayload();
			const queue =
				reassign && remaining && isSubjectConflict(error)
					? await loadWorker()
					: undefined;
			const subjectId =
				queue && remaining
					? await queue.reassignSubject(remaining.subjectId)
					: null;
			if (subjectId !== null) {
				// The action's snapshot under the new subject, so a canonical id
				// the resend returns is adopted like any other save's.
				const reassigned = withSubjectId(payload, subjectId);
				return trackDirectSend(reassigned, () =>
					performSendAction(
						reassigned,
						{
							...action,
							snapshot: {
								...actionSnapshot,
								subject: { ...actionSnapshot.subject, subjectId },
							},
						},
						false
					)
				);
			}
			emit({ command: 'save', error, type: 'command:error' });
			if (remaining) {
				await settleThrownSave(payload, ensureQueued, error);
			} else {
				await discard(payload);
			}
			return { confirmed, ok: false };
		}
	};

	const trackDirectOptOut = async function trackDirectOptOut<Result>(
		idempotencyKey: string,
		run: () => Promise<Result>
	): Promise<Result> {
		directOptOutSends.add(idempotencyKey);
		try {
			return await run();
		} finally {
			directOptOutSends.delete(idempotencyKey);
		}
	};

	const sendOptOutAct = (act: OptOutAct) =>
		act.kind === 'record'
			? transport?.optOut?.(act.payload)
			: transport?.liftOptOut?.(act.payload);

	// oxlint-disable-next-line complexity -- Direct send handles queue-before-send, 404, 409 reassignment and answer sync.
	const performSendOptOut = async function performSendOptOut(
		act: OptOutAct,
		context: OptOutActionContext,
		reassign: boolean
	): Promise<void> {
		if (optOutsUnsupported) {
			return;
		}
		const hasTransport =
			act.kind === 'record'
				? Boolean(transport?.optOut)
				: Boolean(transport?.liftOptOut);
		const startedClear = clearVersion;
		let staged: OptOutEnqueueResult = 'unstored';
		if (hasTransport) {
			staged = await enqueueOptOut(act);
			if (
				staged === 'queued' &&
				!optOutsUnsupported &&
				clearVersion === startedClear
			) {
				context.onGpcReported?.();
			}
		}
		const ensureOptOutQueued = async (): Promise<'queued' | 'unstored'> => {
			if (staged === 'queued') {
				return 'queued';
			}
			if (staged === 'memory') {
				return 'unstored';
			}
			staged = await enqueueOptOut(act);
			if (staged === 'queued' && clearVersion === startedClear) {
				context.onGpcReported?.();
				return 'queued';
			}
			return 'unstored';
		};
		if (held) {
			await held;
		}
		if (!hasTransport || optOutsUnsupported || clearVersion !== startedClear) {
			return;
		}
		try {
			// Write before send: persistence writes in a macrotask before the
			// request leaves.
			await new Promise((resolve) => {
				setTimeout(resolve, 0);
			});
			if (optOutsUnsupported || clearVersion !== startedClear) {
				return;
			}
			const result = await sendOptOutAct(act);
			if (!result) {
				return;
			}
			if (result.unsupported) {
				await markOptOutsUnsupported();
				return;
			}
			if (result.ok) {
				if (clearVersion === startedClear) {
					context.onGpcReported?.();
				}
				await discardOptOut(act.payload.idempotencyKey);
				const adopted = await adoptServerSubjectById(
					result.subjectId,
					act.payload.subjectId
				);
				if (result.optOut !== undefined) {
					applySyncedOptOut(runtime, result.optOut, {
						actVersion: context.actVersion,
						allowClear: act.kind === 'lift',
						generation: context.generation,
						subjectId: adopted ?? act.payload.subjectId,
					});
				}
			} else if (clearVersion === startedClear) {
				warnOptOutFailed(await ensureOptOutQueued());
				retryWhenOnline();
			}
		} catch (error) {
			if (isUnsupportedStatus(error)) {
				await markOptOutsUnsupported();
				return;
			}
			if (
				reassign &&
				clearVersion === startedClear &&
				isSubjectConflict(error)
			) {
				const subjectId =
					(await (
						await loadWorker()
					)?.reassignSubject(act.payload.subjectId)) ?? null;
				if (subjectId !== null) {
					const reassigned: OptOutAct =
						act.kind === 'record'
							? { kind: 'record', payload: { ...act.payload, subjectId } }
							: { kind: 'lift', payload: { ...act.payload, subjectId } };
					return performSendOptOut(reassigned, context, false);
				}
			}
			emit({
				command: act.kind === 'lift' ? 'optIn' : 'optOut',
				error,
				type: 'command:error',
			});
			if (isConsentSaveRejection(error)) {
				warnOptOutFailed('rejected', error);
				await discardOptOut(act.payload.idempotencyKey);
			} else if (clearVersion === startedClear) {
				warnOptOutFailed(await ensureOptOutQueued(), error);
				retryWhenOnline();
			}
		}
	};

	// oxlint-disable-next-line complexity -- Direct account lift shares queue-before-send, 404, 409 reassignment and rejection cleanup.
	const performAccountLift = async function performAccountLift(
		payload: LiftOptOutPayload,
		reassign: boolean,
		alreadyQueued = false
	): Promise<AccountLiftOutcome> {
		const lift = transport?.liftOptOut;
		if (optOutsUnsupported || !lift) {
			return { ok: false };
		}
		const startedClear = clearVersion;
		const act: OptOutAct = { kind: 'lift', payload };
		let staged: OptOutEnqueueResult = alreadyQueued
			? 'queued'
			: await enqueueOptOut(act);
		const ensureLiftQueued = async (): Promise<'queued' | 'unstored'> => {
			if (staged === 'queued') {
				return 'queued';
			}
			if (staged === 'memory') {
				return 'unstored';
			}
			staged = await enqueueOptOut(act);
			return staged === 'queued' ? 'queued' : 'unstored';
		};
		if (held) {
			await held;
		}
		if (optOutsUnsupported || clearVersion !== startedClear) {
			return { ok: false };
		}
		try {
			const result = await lift(payload);
			if (result.unsupported) {
				await markOptOutsUnsupported();
				return { ok: false, unsupported: true };
			}
			if (!result.ok) {
				if (clearVersion === startedClear) {
					warnOptOutFailed(await ensureLiftQueued());
					retryWhenOnline();
				}
				return { ok: false };
			}
			await discardOptOut(payload.idempotencyKey);
			const adopted = await adoptServerSubjectById(
				result.subjectId,
				payload.subjectId
			);
			return {
				ok: true,
				optOut: result.optOut,
				subjectId: adopted ?? payload.subjectId,
			};
		} catch (error) {
			if (isUnsupportedStatus(error)) {
				await markOptOutsUnsupported();
				return { ok: false, unsupported: true };
			}
			if (
				reassign &&
				clearVersion === startedClear &&
				isSubjectConflict(error)
			) {
				const subjectId =
					(await (await loadWorker())?.reassignSubject(payload.subjectId)) ??
					null;
				if (subjectId !== null) {
					return performAccountLift(
						{ ...payload, subjectId },
						false,
						staged !== 'unstored'
					);
				}
			}
			emit({ command: 'optIn', error, type: 'command:error' });
			if (isConsentSaveRejection(error)) {
				warnOptOutFailed('rejected', error);
				await discardOptOut(payload.idempotencyKey);
			} else if (clearVersion === startedClear) {
				warnOptOutFailed(await ensureLiftQueued(), error);
				retryWhenOnline();
			}
			return { ok: false };
		}
	};

	return {
		adoptSubject,
		areOptOutsUnsupported: () => optOutsUnsupported,
		clear,
		getHold: () => held,
		getOptOutRequestsInFlight: () => optOutRequestsInFlight,
		hold(until) {
			const next = Promise.allSettled([held, until]);
			held = next;
			void (async () => {
				await next;
				if (held === next) {
					held = undefined;
				}
			})();
		},
		liftAccountOptOut: (payload) =>
			optOutsUnsupported || !transport?.liftOptOut
				? Promise.resolve({ ok: false })
				: trackOptOutRequest(() =>
						trackDirectOptOut(payload.idempotencyKey, () =>
							performAccountLift(payload, true)
						)
					),
		onOptOutRequestsChange(listener) {
			optOutRequestListeners.add(listener);
			return () => {
				optOutRequestListeners.delete(listener);
			};
		},
		replay,
		send: (payload, action) =>
			trackDirectSend(payload, () => performSendAction(payload, action, true)),
		sendOptOut: (payload, context) =>
			optOutsUnsupported || (!transport?.optOut && !held)
				? Promise.resolve()
				: trackOptOutRequest(() =>
						trackDirectOptOut(payload.idempotencyKey, () =>
							performSendOptOut({ kind: 'record', payload }, context, true)
						)
					),
		sendOptOutLift: (payload, context) =>
			optOutsUnsupported || (!transport?.liftOptOut && !held)
				? Promise.resolve()
				: trackOptOutRequest(() =>
						trackDirectOptOut(payload.idempotencyKey, () =>
							performSendOptOut({ kind: 'lift', payload }, context, true)
						)
					),
	};
};
