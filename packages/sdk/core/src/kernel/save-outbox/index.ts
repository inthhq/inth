/**
 * The save outbox: everything that happens to a recorded choice after
 * `commands.save()` recorded it.
 *
 * `send()` takes the payload of one recorded action and owns the rest:
 * the transport call, trimming what newer state superseded, queueing what
 * the transport could not take, replaying the queue, moving the visitor to
 * a new subject id when the backend refuses theirs, and asking for a retry
 * when the browser comes back online. The queue lives in a
 * {@link SaveOutboxStore}.
 *
 * The send path loads with the kernel. Everything that reads the stored
 * queue (validation, replay, reassignment) is in `queue.ts`, imported the
 * first time a visitor saves or replays a choice.
 * Queueing never waits for it: until it has loaded, the entry is
 * appended as is and normalized on the next read.
 *
 * Interface:
 * - Queue before send. An explicit action is stored before its transport
 *   starts, so a page that unloads with an in-flight request leaves a replay
 *   for the next page. Successful and permanently rejected saves remove it.
 * - Write before send. `send()` makes no transport call before the
 *   macrotask after it was called. `commands.save()` calls it once the
 *   action's commit has notified every listener, so a local writer that
 *   handed its write to a macrotask from a listener (persistence schedules
 *   `setTimeout(0)`) lands it before the request leaves: timers with the
 *   same delay run in the order they were set. A writer that cannot write
 *   by then (persistence while its write code loads) holds the request
 *   through `kernel.holdSaves()` (`hold()` here). `send()` waits for that
 *   hold first, and without a transport `save` it resolves only after it,
 *   so nothing that waits for a save's completion (a revocation reload)
 *   overtakes the write either. A writer that defers longer without holding gives up
 *   that guarantee.
 * - A save is only ever sent, queued or discarded for the part of it the
 *   current state still holds ({@link withoutSuperseded}). Once the stored
 *   records were replaced or cleared, or the visitor or the choice contract
 *   changed, nothing of it is sent or queued. This is checked again inside
 *   the queue transaction, so a clear that lands while a save waits for the
 *   store cannot be undone by it.
 * - `clear()` empties the queue and the reassignment records. The kernel
 *   calls it on `records:cleared`, so every way of clearing the visitor's
 *   records drops the saves of the subject they reset away from. Storage is
 *   emptied before the event returns, without waiting for another tab's
 *   lock, so a page that closes right after a clear leaves nothing for the
 *   next page to replay; a transaction under the lock then empties it
 *   again.
 * - Whenever a send or replay leaves something queued, the outbox calls
 *   `retryWhenOnline`. The kernel's one connectivity listener then calls
 *   `replay()` on `online`, next to its init retry, and only while the
 *   kernel is not disposed.
 * - Queue transactions never span a network call: a hung transport must
 *   not block other tabs. Two tabs may replay the same entry; the persisted
 *   `givenAt` makes the backend derive the same consent id for both.
 */

import { OPTIONAL_CONSENT_CATEGORIES } from '../../consent-record/types';
import type { OptionalConsentCategory } from '../../consent-record/types';
import {
	createInFlightSaves,
	dateChoice,
	queuedGivenAt,
} from '../../libs/given-at';
import { warnInDevelopment } from '../../libs/is-production';
import { createIdempotencyKey } from '../../libs/subject-uuid';
import {
	isConsentSaveRejection,
	isSubjectConflict,
} from '../../transports/save-rejection';
import type {
	ConsentSnapshot,
	KernelTransport,
	SavePayload,
	SaveResult,
} from '../../types';
import type { SnapshotPatch } from '../patch';
import type { KernelRuntime } from '../runtime';
import { datedSubjectDates } from '../save-plan';
import type { EnqueueResult, QueueWorker, QueueWorkerOptions } from './queue';
import { queueTools } from './queue-tools';
import type { SaveOutboxStore } from './store';
import { toStoredPayload, withoutStoredTokens } from './stored-payload';
import {
	liveSupersession,
	withoutSuperseded,
	withSubjectId,
} from './supersession';

export type { OutboxSlot, OutboxTransaction, SaveOutboxStore } from './store';
export { createBrowserOutboxStore, createMemoryOutboxStore } from './store';

/** One recorded action, as `commands.save()` hands it to the outbox. */
export interface RecordedAction {
	/** Records generation the action landed in. */
	generation: number;
	/** The snapshot the action committed. */
	snapshot: ConsentSnapshot;
	/** Categories the action confirmed, echoed in the result. */
	confirmed: readonly OptionalConsentCategory[];
}

export interface SaveOutbox {
	/**
	 * Send one recorded action. Resolves once the transport answered and
	 * the queue was updated; never rejects. Without a transport `save`, it
	 * resolves at once as accepted.
	 */
	send: (payload: SavePayload, action: RecordedAction) => Promise<SaveResult>;
	/**
	 * Replay the queue, one entry at a time, emitting `save:replayed` for
	 * each. Overlapping calls share one run. Asks for an online retry while
	 * anything is left.
	 */
	replay: () => Promise<void>;
	/**
	 * Drop every queued save and subject reassignment: from storage before
	 * it returns, and again under the store's lock once that is granted.
	 */
	clear: () => Promise<void>;
	/**
	 * Keep requests from leaving until `until` settles: a local write that
	 * is not ready yet. Requests already sent are not held.
	 */
	hold: (until: Promise<unknown>) => void;
	/**
	 * Register a write that must land before an accepted save leaves the
	 * queue: persistence's, which stores the subject's accepted time.
	 * Returns the unregister function.
	 */
	flushWith: (flush: () => void) => () => void;
	/**
	 * Move the visitor from `from` to the subject id the backend answered
	 * for it, such as the UUID of a `sub_` id, in every tab, with the saves
	 * queued under `from`.
	 */
	adoptSubject: (from: string, to: string) => Promise<void>;
	/**
	 * The time to date a choice of `subjectId` with: the later of `time` and
	 * one millisecond after the subject's floor.
	 */
	dateChoice: (subjectId: string, time: number) => number;
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

/** The prefix of a subject ID a c15t client made. */
const LEGACY_SUBJECT_PREFIX = 'sub_';

const warnSaveFailed = function warnSaveFailed(
	outcome: keyof typeof SAVE_FAILED_WARNINGS | 'superseded',
	error?: unknown
): void {
	// A save whose records were cleared or replaced meanwhile lost nothing.
	if (outcome !== 'superseded') {
		warnInDevelopment(SAVE_FAILED_WARNINGS[outcome], error);
	}
};

/**
 * Whether the backend refused a save as invalid: what it answers for a
 * `givenAt` too far ahead of its clock.
 */
const isRefusedAsInvalid = (error: unknown): boolean =>
	isConsentSaveRejection(error) &&
	error.status === 400 &&
	error.code === 'invalid_request';

/**
 * The receipts of `choice` that `refused` confirmed and that are still the
 * same, dated `at`: the new categories, the receipts to send, and which
 * categories they are.
 */
const restampOwnReceipts = function restampOwnReceipts(
	choice: ConsentSnapshot['explicitChoice'],
	refused: SavePayload,
	at: number
): {
	categories: NonNullable<ConsentSnapshot['explicitChoice']>['categories'];
	sent: SavePayload['choice']['categories'];
	confirmed: OptionalConsentCategory[];
} {
	const categories = { ...choice?.categories };
	const sent: SavePayload['choice']['categories'] = {};
	const confirmed = OPTIONAL_CONSENT_CATEGORIES.filter((category) => {
		const receipt = categories[category];
		const own = refused.choice.categories[category];
		return (
			Object.hasOwn(refused.confirmed.categories, category) &&
			receipt?.confirmedAt === own?.confirmedAt &&
			receipt?.value === own?.value &&
			receipt !== undefined
		);
	});
	for (const category of confirmed) {
		const restamped = { ...categories[category], confirmedAt: at };
		categories[category] = restamped as NonNullable<
			(typeof categories)[typeof category]
		>;
		sent[category] = categories[category];
	}
	return { categories, confirmed, sent };
};

export const createSaveOutbox = function createSaveOutbox({
	runtime,
	transport,
	store,
	retryWhenOnline,
	loadQueue = () => import('./queue'),
}: SaveOutboxOptions): SaveOutbox {
	const { batch, commit, emit, getSnapshot } = runtime;
	const inFlight = createInFlightSaves();
	let worker: QueueWorker | undefined;
	// Instance-local: another page must still recover a stranded request.
	const directSends = new Set<SavePayload>();
	const isSending = (payload: SavePayload): boolean =>
		[...directSends].some(
			(pending) =>
				pending.subjectId === payload.subjectId &&
				pending.confirmed.actionAt === payload.confirmed.actionAt &&
				// A narrowed replay is still this action; disjoint confirmations
				// sharing its timestamp remain free to retry independently.
				Object.keys(payload.confirmed.categories).every((category) =>
					Object.hasOwn(pending.confirmed.categories, category)
				)
		);
	// What requests wait for after the pre-send macrotask: see `hold()`.
	let held: Promise<unknown> | undefined;

	/** The queue module, loaded once; `undefined` when it cannot load. */
	const loadWorker = async function loadWorker(): Promise<
		QueueWorker | undefined
	> {
		if (!worker) {
			try {
				const { createQueueWorker } = await loadQueue();
				worker ??= createQueueWorker({
					isSending,
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

	const hasQueued = function hasQueued(): Promise<boolean> {
		return store.transact((tx) => tx.read('saves') !== undefined);
	};

	/**
	 * Queue what `current()` still holds. Until the queue module has loaded,
	 * the entry is appended as is and the module starts loading; its next
	 * read normalizes the list. A failed save therefore settles without
	 * waiting for code, and is kept even when the network that failed it
	 * cannot deliver the module either.
	 *
	 * Nothing is queued when the records were cleared or replaced while the
	 * transaction waited for the store, or when storage refuses the write.
	 */
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
			const stored = tx.read('saves');
			return tx.write('saves', [
				...withoutStoredTokens(stored),
				{
					attempts: 0,
					payload: toStoredPayload(payload),
					queuedAt: Date.now(),
				},
			])
				? 'queued'
				: 'unstored';
		});
	};

	/**
	 * Drop `payload` and the queued saves it superseded, so a later replay
	 * cannot overwrite the newer receipts with stale ones.
	 */
	const discard = async function discard(payload: SavePayload): Promise<void> {
		if (await hasQueued()) {
			await (await loadWorker())?.discard(payload);
		}
	};

	const clear = function clear(): Promise<void> {
		// At once, so the page can close before the lock is granted: a later
		// page must not replay the cleared subject's saves. Then again under
		// the lock, after any transaction that read the lists before this.
		store.clear();
		return store.transact(() => {
			store.clear();
		});
	};

	const flushers = new Set<() => void>();

	/**
	 * Land the writes a commit scheduled before what follows: persistence's
	 * now, or once its code has loaded when it holds saves until then.
	 */
	const landed = async function landed(): Promise<void> {
		for (const flush of flushers) {
			flush();
		}
		if (held) {
			await held;
		}
	};

	/**
	 * Keep `givenAt` as the latest the backend accepted for the subject, when
	 * the save went out under the visitor's subject id or the answer names it.
	 */
	const recordAccepted = function recordAccepted(
		payload: SavePayload,
		result: SaveResult
	): void {
		const { subject, subjectDates } = getSnapshot();
		const at = payload.givenAt ?? payload.confirmed.actionAt;
		if (
			!subject?.subjectId ||
			(subject.subjectId !== payload.subjectId &&
				subject.subjectId !== result.subjectId) ||
			(subjectDates?.acceptedGivenAt ?? -1) >= at
		) {
			return;
		}
		commit({ subjectDates: { ...subjectDates, acceptedGivenAt: at } });
	};

	/**
	 * Sends `payload` through `send`. While the request is out its `givenAt`
	 * holds the floor. An accepted save's time is stored with the subject,
	 * and lands before the caller takes the save out of the queue, so a page
	 * that closes in between still has it in one place or the other.
	 */
	const sendDated = async function sendDated(
		payload: SavePayload,
		send: () => Promise<SaveResult>
	): Promise<SaveResult> {
		inFlight.start(payload);
		let result: SaveResult;
		try {
			result = await send();
		} finally {
			inFlight.settle(payload);
		}
		if (result.ok) {
			recordAccepted(payload, result);
			await landed();
		}
		return result;
	};

	/**
	 * The subject's floor: its accepted time, or the latest `givenAt` of a
	 * save queued or in flight, except the one with `exceptKey`.
	 */
	const floor = function floor(subjectId: string, exceptKey?: string): number {
		const { subject, subjectDates } = getSnapshot();
		const accepted =
			subject?.subjectId === subjectId
				? (subjectDates?.acceptedGivenAt ?? -1)
				: -1;
		// Without a transport nothing is sent or queued, and storage is not read.
		const queued = transport?.save
			? queuedGivenAt(
					store.peek('saves'),
					subjectId,
					(payload) => payload.idempotencyKey !== exceptKey
				)
			: -1;
		return Math.max(accepted, queued, inFlight.latest());
	};

	/** Saves already re-dated once: a second refusal drops them. */
	const redatedKeys = new Set<string>();

	/**
	 * A save the backend refused as invalid, dated again once by the device
	 * clock now, under a new key. Its receipts in the local record that it
	 * still holds take the new time too, and keep it if this one is refused
	 * as well. `null` when it was re-dated before, or nothing of it is still
	 * the visitor's.
	 */
	const redate = function redate(
		refused: SavePayload
	): { payload: SavePayload; action: RecordedAction } | null {
		const current = getSnapshot();
		if (
			!refused.idempotencyKey ||
			redatedKeys.has(refused.idempotencyKey) ||
			current.subject?.subjectId !== refused.subjectId
		) {
			return null;
		}
		// The refused save never counts toward the floor.
		const at = dateChoice(
			runtime.now(),
			floor(refused.subjectId, refused.idempotencyKey)
		);
		const { categories, confirmed, sent } = restampOwnReceipts(
			current.explicitChoice,
			refused,
			at
		);
		const vendors =
			refused.vendorChoice !== undefined &&
			current.vendorChoice?.confirmedAt === refused.vendorChoice.confirmedAt;
		if (confirmed.length === 0 && !vendors) {
			return null;
		}
		const subjectDates = datedSubjectDates(current, at, runtime.now());
		const patch: SnapshotPatch = subjectDates ? { subjectDates } : {};
		if (confirmed.length > 0 && current.explicitChoice) {
			patch.explicitChoice = { ...current.explicitChoice, categories };
		}
		if (vendors && current.vendorChoice) {
			patch.vendorChoice = { ...current.vendorChoice, confirmedAt: at };
		}
		commit(patch);
		const { vendorChoice, ...rest } = refused;
		const payload: SavePayload = {
			...rest,
			choice: {
				...refused.choice,
				categories: { ...refused.choice.categories, ...sent },
			},
			confirmed: {
				actionAt: at,
				categories: Object.fromEntries(
					confirmed.map((category) => [
						category,
						refused.confirmed.categories[category],
					])
				),
			},
			givenAt: at,
			idempotencyKey: createIdempotencyKey(),
			...(vendors &&
				vendorChoice && {
					vendorChoice: { ...vendorChoice, confirmedAt: at },
				}),
		};
		redatedKeys.add(payload.idempotencyKey as string);
		return {
			action: {
				confirmed,
				generation: runtime.getGeneration(),
				snapshot: getSnapshot(),
			},
			payload,
		};
	};

	// -- Send ------------------------------------------------------------------

	/**
	 * Queue a save the transport threw on, unless the backend refused it for
	 * good: that one would be refused again on every replay. Queued older
	 * saves it replaced are dropped instead, so they can't replay over the
	 * newer choice. The choice stays recorded locally either way.
	 */
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

	/** Whether a save is queued under `subjectId`. */
	const holdsSaveFor = function holdsSaveFor(
		subjectId: string
	): Promise<boolean> {
		return store.transact((tx) => {
			const saves = tx.read('saves');
			return (
				Array.isArray(saves) &&
				saves.some(
					(entry) =>
						(entry as { payload?: { subjectId?: unknown } } | null)?.payload
							?.subjectId === subjectId
				)
			);
		});
	};

	const adoptSubject = async function adoptSubject(
		from: string,
		to: string
	): Promise<void> {
		const queue = (await holdsSaveFor(from)) ? await loadWorker() : undefined;
		if (queue) {
			await queue.reassignSubject(from, to);
			return;
		}
		const current = getSnapshot();
		if (current.subject?.subjectId !== from) {
			return;
		}
		batch(() => {
			commit({ subject: { ...current.subject, subjectId: to } });
			emit({
				previousSubjectId: from,
				snapshot: getSnapshot(),
				type: 'subject:resolved',
			});
		});
	};

	/**
	 * Take the UUID a save answered for the `sub_` id it went out under,
	 * while that id is still the visitor's. Only that move: a save answered
	 * late must not replace a UUID the visitor got since, from a link or a
	 * newer save. A choice made since does not matter.
	 */
	const adoptServerSubject = async function adoptServerSubject(
		subjectId: string | undefined,
		action: ConsentSnapshot
	): Promise<void> {
		const from = getSnapshot().subject?.subjectId;
		if (
			!(subjectId && from?.startsWith(LEGACY_SUBJECT_PREFIX)) ||
			subjectId === from ||
			from !== action.subject?.subjectId
		) {
			return;
		}
		await adoptSubject(from, subjectId);
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

	/**
	 * Transport phase of one action. The outcome only touches the queue
	 * while the action's confirmed receipts are current. Disjoint category
	 * actions remain independent.
	 */
	const performSendAction = async function performSendAction(
		payload: SavePayload,
		action: RecordedAction,
		// False on the resend after a subject reassignment, so a backend that
		// refuses every id costs one extra request, not a loop.
		reassign: boolean
	): Promise<SaveResult> {
		const { confirmed, generation, snapshot: actionSnapshot } = action;
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
			const result = await sendDated(sending, () => save(sending));
			if (result.ok) {
				// Also when a newer choice superseded this one: the answer names
				// the subject, and saves queued under the old id move with it.
				await adoptServerSubject(result.subjectId, actionSnapshot);
				await landed();
				// The whole action, not the part still current: a newer choice
				// that storage refused never narrowed the queued entry.
				await discard(payload);
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
			const again =
				remaining && isRefusedAsInvalid(error) ? redate(remaining) : null;
			if (again) {
				await discard(payload);
				return trackDirectSend(again.payload, () =>
					performSendAction(again.payload, again.action, reassign)
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

	const sendAction = function sendAction(
		payload: SavePayload,
		action: RecordedAction
	): Promise<SaveResult> {
		return trackDirectSend(payload, () =>
			performSendAction(payload, action, true)
		);
	};

	const replay = async function replay(): Promise<void> {
		const save = transport?.save;
		if (!save || !(await hasQueued())) {
			return;
		}
		// A replay is no longer the page that made the save: it carries no
		// consent journey, so a backend never links it to this page load.
		const resend: NonNullable<KernelTransport['save']> = async (payload) => {
			try {
				return await sendDated(payload, () => save(payload, { replay: true }));
			} catch (error) {
				// The queue drops the refused entry; its re-dated copy goes out as
				// a save of its own.
				const again = isRefusedAsInvalid(error) ? redate(payload) : null;
				if (again) {
					void sendAction(again.payload, again.action);
				}
				throw error;
			}
		};
		if (await (await loadWorker())?.replay(resend)) {
			retryWhenOnline();
		}
	};

	return {
		adoptSubject,
		clear,
		dateChoice: (subjectId, time) => dateChoice(time, floor(subjectId)),
		flushWith(flush) {
			flushers.add(flush);
			return () => {
				flushers.delete(flush);
			};
		},
		hold(until) {
			held = Promise.allSettled([held, until]);
		},
		replay,
		send: sendAction,
	};
};
