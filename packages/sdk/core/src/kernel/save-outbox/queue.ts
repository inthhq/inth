/**
 * The stored queue of the save outbox, loaded on demand.
 *
 * The outbox imports this module the first time it has to read the queue:
 * a replay or a discard that finds something stored, a queue write, or a
 * subject reassignment. A visitor with nothing queued never loads it. If it
 * cannot load (the network that just failed a save is down), the outbox
 * appends the save to the stored list itself and this module normalizes the
 * list on its next read.
 *
 * Stored entries come back from storage another release or another tab
 * may have written, so every read validates them and drops what it cannot
 * replay: malformed entries, entries older than a week, and entries that
 * used up their attempts.
 *
 * A save that leaves the queue without reaching the backend (out of
 * attempts, older than a week, or refused for good) emits `command:error`
 * once, from the transaction that removed it, so `onError` hears about
 * every lost save. A replay that fails and keeps the entry only warns in
 * development: the save already reported its first failure.
 */

import type { CONSENT_MODELS, OptOutRecord } from '@inth/sdk-schema/types';

import type { OPTIONAL_CONSENT_CATEGORIES } from '../../consent-record/types';
import type {
	isPlainRecord,
	validateExplicitChoice,
} from '../../consent-record/validation';
import { isExperimentAssignment } from '../../libs/experiment-record';
import type { warnInDevelopment } from '../../libs/is-production';
import type { generateUuidV7 } from '../../libs/subject-uuid';
import type {
	isConsentSaveRejection,
	isSubjectConflict,
} from '../../transports/save-rejection';
import type {
	ConsentSubject,
	KernelTransport,
	KernelUser,
	LiftOptOutPayload,
	OptOutPayload,
	SavePayload,
} from '../../types';
import type { applySyncedOptOut } from '../opt-out';
import type { KernelRuntime } from '../runtime';
import type {
	appendOptOut,
	appendSave,
	OptOutAct,
	OutboxTransaction,
	PendingOptOutEntry,
	SaveOutboxStore,
} from './store';
import { withStoredIdempotencyKey } from './stored-key';
import type { StoredSavePayload } from './stored-key';
import type { toStoredPayload } from './stored-payload';
import type {
	PendingSaveEntry,
	Supersession,
	withoutSuperseded,
	withSubjectId,
} from './supersession';

/**
 * The first-load functions the queue calls. The outbox passes them in
 * (`queue-tools.ts`) instead of this module importing them, so the queue
 * loads as one chunk that imports nothing the first load has. A value
 * import of a first-load module makes bundlers that split shared code
 * (Rolldown in Nuxt) move that module into a first-load file of its own.
 *
 * @internal
 */
export interface QueueTools {
	appendOptOut: typeof appendOptOut;
	appendSave: typeof appendSave;
	applySyncedOptOut: typeof applySyncedOptOut;
	generateUuidV7: typeof generateUuidV7;
	isConsentSaveRejection: typeof isConsentSaveRejection;
	isPlainRecord: typeof isPlainRecord;
	isSubjectConflict: typeof isSubjectConflict;
	optionalCategories: typeof OPTIONAL_CONSENT_CATEGORIES;
	/** The schema's `CONSENT_MODELS`. */
	consentModels: typeof CONSENT_MODELS;
	toStoredPayload: typeof toStoredPayload;
	validateExplicitChoice: typeof validateExplicitChoice;
	warnInDevelopment: typeof warnInDevelopment;
	withoutSuperseded: typeof withoutSuperseded;
	withSubjectId: typeof withSubjectId;
}

const MAX_PENDING_SAVE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_REPLAY_ATTEMPTS = 10;
/** The prefix of a c15t subject id; `LEGACY_SUBJECT_PREFIX` in `index.ts`. */
const LEGACY_SUBJECT_PREFIX = 'sub_';

/** A subject id the backend refused, and the one this browser moved to. */
interface SubjectReassignment {
	from: string;
	to: string;
	at: number;
}

/**
 * What `newer` covers of an older save of the same subject: the categories
 * it confirmed and, when it carried one, the vendor map.
 */
const supersededBy = (newer: SavePayload): Supersession => ({
	category: (category) => Object.hasOwn(newer.confirmed.categories, category),
	vendors: newer.vendorChoice !== undefined,
});

/**
 * Validation and normalization of the stored lists, over the first-load
 * functions the outbox passed in. `onExpired` is called inside the
 * transaction that removed saves for being older than a week, with how many
 * it removed.
 */
// oxlint-disable-next-line max-lines-per-function -- The stored-list readers share the validators.
const createStoredLists = function createStoredLists(
	tools: QueueTools,
	onExpired: (count: number) => void
) {
	const {
		consentModels,
		isPlainRecord,
		optionalCategories,
		toStoredPayload,
		validateExplicitChoice,
		withoutSuperseded,
	} = tools;

	// ---------------------------------------------------------------------------
	// Stored entry validation
	// ---------------------------------------------------------------------------

	const isBooleanRecord = function isBooleanRecord(value: unknown): boolean {
		return (
			isPlainRecord(value) &&
			Object.values(value).every((item) => typeof item === 'boolean')
		);
	};

	const isScalarRecord = function isScalarRecord(value: unknown): boolean {
		return (
			isPlainRecord(value) &&
			Object.values(value).every(
				(item) =>
					typeof item === 'string' ||
					typeof item === 'number' ||
					typeof item === 'boolean'
			)
		);
	};

	const isOptionalString = function isOptionalString(value: unknown): boolean {
		return value === undefined || typeof value === 'string';
	};

	const isOptionalFiniteNumber = function isOptionalFiniteNumber(
		value: unknown
	): boolean {
		return (
			value === undefined ||
			(typeof value === 'number' && Number.isFinite(value))
		);
	};

	const isSaveUser = function isSaveUser(value: unknown): boolean {
		if (value === null) {
			return true;
		}
		if (!isPlainRecord(value) || typeof value.externalId !== 'string') {
			return false;
		}
		return (
			isOptionalString(value.externalIdType) &&
			isOptionalString(value.identityProvider) &&
			isOptionalString(value.identityToken) &&
			(value.properties === undefined || isScalarRecord(value.properties))
		);
	};

	const isSubject = function isSubject(value: unknown): boolean {
		return (
			isPlainRecord(value) &&
			isOptionalString(value.subjectId) &&
			isOptionalString(value.externalId) &&
			isOptionalString(value.identityProvider)
		);
	};

	const isConfirmedCoverage = function isConfirmedCoverage(
		value: unknown
	): boolean {
		if (!isPlainRecord(value) || !isPlainRecord(value.categories)) {
			return false;
		}
		if (
			typeof value.actionAt !== 'number' ||
			!Number.isSafeInteger(value.actionAt) ||
			value.actionAt < 0
		) {
			return false;
		}
		const known = new Set<string>(optionalCategories);
		return Object.entries(value.categories).every(
			([key, item]) => known.has(key) && typeof item === 'boolean'
		);
	};

	const isDecisionInputs = (value: unknown): boolean =>
		value === undefined ||
		(isPlainRecord(value) &&
			(value.policyId === null ||
				(typeof value.policyId === 'string' &&
					value.policyId.length > 0 &&
					typeof value.fingerprint === 'string' &&
					value.fingerprint.length > 0)) &&
			(value.country === null || typeof value.country === 'string') &&
			(value.region === null || typeof value.region === 'string') &&
			typeof value.language === 'string' &&
			typeof value.gpc === 'boolean');

	const isVendorChoicePayload = function isVendorChoicePayload(
		value: unknown
	): boolean {
		return (
			value === undefined ||
			(isPlainRecord(value) &&
				value.version === 1 &&
				typeof value.confirmedAt === 'number' &&
				Number.isSafeInteger(value.confirmedAt) &&
				value.confirmedAt >= 0 &&
				isBooleanRecord(value.grants))
		);
	};

	// Validate every persisted payload field before replaying it.
	// oxlint-disable-next-line complexity
	const isSavePayload = function isSavePayload(
		value: unknown
	): value is StoredSavePayload {
		if (!isPlainRecord(value)) {
			return false;
		}
		if (
			!isSubject(value.subject) ||
			!isDecisionInputs(value.decisionInputs) ||
			!isConfirmedCoverage(value.confirmed) ||
			// No clock: a device clock moved back since the save was queued
			// must not make its dates look like they are in the future.
			!validateExplicitChoice(value.choice, Number.MAX_SAFE_INTEGER).ok
		) {
			return false;
		}

		const validModel =
			value.model === null ||
			(consentModels as readonly unknown[]).includes(value.model);
		const validUiSource =
			value.uiSource === null ||
			value.uiSource === 'none' ||
			value.uiSource === 'banner' ||
			value.uiSource === 'dialog' ||
			value.uiSource === 'widget';
		const validAction =
			value.consentAction === 'all' ||
			value.consentAction === 'necessary' ||
			value.consentAction === 'custom';

		return (
			typeof value.subjectId === 'string' &&
			isOptionalString(value.idempotencyKey) &&
			isBooleanRecord(value.consents) &&
			isPlainRecord(value.overrides) &&
			isSaveUser(value.user) &&
			validModel &&
			validUiSource &&
			validAction &&
			isOptionalFiniteNumber(value.givenAt) &&
			isOptionalFiniteNumber(value.timeToDecisionMs) &&
			(value.experiment === undefined ||
				isExperimentAssignment(value.experiment)) &&
			(value.policySnapshotToken === null ||
				typeof value.policySnapshotToken === 'string') &&
			(value.tcString === undefined ||
				value.tcString === null ||
				typeof value.tcString === 'string') &&
			(value.addtlConsent === undefined ||
				typeof value.addtlConsent === 'string') &&
			isVendorChoicePayload(value.vendorChoice)
		);
	};

	const isPendingSaveEntry = function isPendingSaveEntry(
		value: unknown
	): value is Omit<PendingSaveEntry, 'payload'> & {
		payload: StoredSavePayload;
	} {
		return (
			isPlainRecord(value) &&
			isSavePayload(value.payload) &&
			typeof value.queuedAt === 'number' &&
			Number.isFinite(value.queuedAt) &&
			value.queuedAt >= 0 &&
			typeof value.attempts === 'number' &&
			Number.isInteger(value.attempts) &&
			value.attempts >= 0 &&
			(value.seq === undefined ||
				(typeof value.seq === 'number' &&
					Number.isSafeInteger(value.seq) &&
					value.seq > 0))
		);
	};

	const isSubjectReassignment = function isSubjectReassignment(
		value: unknown
	): value is SubjectReassignment {
		return (
			isPlainRecord(value) &&
			typeof value.from === 'string' &&
			typeof value.to === 'string' &&
			typeof value.at === 'number' &&
			Number.isFinite(value.at)
		);
	};

	const isOptionalUiSource = function isOptionalUiSource(
		value: unknown
	): boolean {
		return (
			value === undefined ||
			value === null ||
			value === 'none' ||
			value === 'banner' ||
			value === 'dialog' ||
			value === 'widget'
		);
	};

	const isOptionalNullableString = function isOptionalNullableString(
		value: unknown
	): boolean {
		return value === undefined || value === null || typeof value === 'string';
	};

	const isOptOutPayload = function isOptOutPayload(
		value: unknown
	): value is OptOutPayload {
		return (
			isPlainRecord(value) &&
			typeof value.subjectId === 'string' &&
			typeof value.idempotencyKey === 'string' &&
			value.idempotencyKey.length > 0 &&
			(value.method === 'button' || value.method === 'gpc') &&
			typeof value.givenAt === 'number' &&
			Number.isSafeInteger(value.givenAt) &&
			value.givenAt >= 0 &&
			isSaveUser(value.user) &&
			isOptionalUiSource(value.uiSource) &&
			(value.metadata === undefined || isPlainRecord(value.metadata)) &&
			isOptionalNullableString(value.policyId) &&
			isOptionalNullableString(value.country) &&
			isOptionalNullableString(value.region) &&
			isOptionalString(value.language) &&
			isOptionalNullableString(value.policySnapshotToken)
		);
	};

	const isLiftOptOutPayload = function isLiftOptOutPayload(
		value: unknown
	): value is LiftOptOutPayload {
		return (
			isPlainRecord(value) &&
			typeof value.subjectId === 'string' &&
			typeof value.idempotencyKey === 'string' &&
			value.idempotencyKey.length > 0 &&
			typeof value.givenAt === 'number' &&
			Number.isSafeInteger(value.givenAt) &&
			value.givenAt >= 0 &&
			isSaveUser(value.user) &&
			isOptionalUiSource(value.uiSource) &&
			isOptionalNullableString(value.policySnapshotToken)
		);
	};

	const isPendingOptOutEntry = function isPendingOptOutEntry(
		value: unknown
	): value is PendingOptOutEntry {
		if (!isPlainRecord(value)) {
			return false;
		}
		const validPayload =
			(value.kind === 'record' && isOptOutPayload(value.payload)) ||
			(value.kind === 'lift' && isLiftOptOutPayload(value.payload));
		if (!validPayload) {
			return false;
		}
		const payload = value.payload as { idempotencyKey: string };
		return (
			typeof value.idempotencyKey === 'string' &&
			value.idempotencyKey === payload.idempotencyKey &&
			typeof value.queuedAt === 'number' &&
			Number.isFinite(value.queuedAt) &&
			value.queuedAt >= 0 &&
			typeof value.attempts === 'number' &&
			Number.isInteger(value.attempts) &&
			value.attempts >= 0 &&
			(value.seq === undefined ||
				(typeof value.seq === 'number' &&
					Number.isSafeInteger(value.seq) &&
					value.seq > 0))
		);
	};

	// ---------------------------------------------------------------------------
	// Stored lists
	// ---------------------------------------------------------------------------

	/**
	 * The subject each id stands for: the last id the recorded moves lead it
	 * to. A `sub_` id and the UUID it moved to are one subject, so a save
	 * under either covers the other's older saves, in every tab.
	 */
	const subjectOf = function subjectOf(
		tx: OutboxTransaction
	): (id: string) => string {
		const stored = tx.read('reassignments');
		const moves = new Map(
			(Array.isArray(stored) ? stored : [])
				.filter(isSubjectReassignment)
				.map(({ from, to }) => [from, to])
		);
		return (id) => {
			let subject = id;
			// A record can't lead back to itself, but storage is not trusted.
			for (let step = 0; step <= moves.size; step += 1) {
				const to = moves.get(subject);
				if (to === undefined) {
					break;
				}
				subject = to;
			}
			return subject;
		};
	};

	/**
	 * The valid, live entries in the order they were queued (`seq`; an older
	 * release's entries first, as stored), each narrowed by every later entry
	 * of its subject, so no stale category replays over a newer one. The
	 * device clock plays no part in the order: a save queued later is the
	 * newer one, whatever the clock said.
	 */
	const normalizePendingSaves = function normalizePendingSaves(
		tx: OutboxTransaction,
		value: unknown,
		now: number
	): PendingSaveEntry[] {
		if (!Array.isArray(value)) {
			return [];
		}

		const cutoff = now - MAX_PENDING_SAVE_AGE_MS;
		const entries: PendingSaveEntry[] = [];
		for (const entry of value) {
			if (!isPendingSaveEntry(entry) || entry.attempts >= MAX_REPLAY_ATTEMPTS) {
				continue;
			}
			// A queue time ahead of the clock counts as now, and is stored so:
			// the week runs out however far ahead the clock was.
			const queuedAt = Math.min(entry.queuedAt, now);
			if (queuedAt < cutoff) {
				continue;
			}
			entries.push({
				...entry,
				payload: withStoredIdempotencyKey(
					toStoredPayload(entry.payload),
					entry.queuedAt
				),
				queuedAt,
			});
		}
		entries.sort((left, right) => (left.seq ?? 0) - (right.seq ?? 0));
		const subject = subjectOf(tx);
		return entries.flatMap((entry, index) => {
			let payload: SavePayload | null = entry.payload;
			const own = subject(entry.payload.subjectId);
			for (const later of entries.slice(index + 1)) {
				if (payload && subject(later.payload.subjectId) === own) {
					payload = withoutSuperseded(payload, supersededBy(later.payload));
				}
			}
			return payload ? [{ ...entry, payload }] : [];
		});
	};

	/** The queued saves, rewriting the stored list when normalizing changed it. */
	const readPendingSaves = function readPendingSaves(
		tx: OutboxTransaction,
		now = Date.now()
	): PendingSaveEntry[] {
		const stored = tx.read('saves');
		if (stored === undefined) {
			return [];
		}
		const normalized = normalizePendingSaves(tx, stored, now);
		if (JSON.stringify(normalized) !== JSON.stringify(stored)) {
			// Storage that refused the write still holds the expired saves,
			// so they are reported by the read that removes them.
			if (!tx.write('saves', normalized)) {
				return normalized;
			}
			const cutoff = now - MAX_PENDING_SAVE_AGE_MS;
			const expired = Array.isArray(stored)
				? stored.filter(
						(entry) =>
							isPendingSaveEntry(entry) &&
							entry.queuedAt < cutoff &&
							entry.attempts < MAX_REPLAY_ATTEMPTS
					).length
				: 0;
			if (expired > 0) {
				onExpired(expired);
			}
		}
		return normalized;
	};

	/**
	 * Valid, live opt-out entries in the exact order they were queued (`seq`).
	 * Opt-out entries are never narrowed or superseded by later entries or by
	 * policy changes.
	 */
	const normalizePendingOptOuts = function normalizePendingOptOuts(
		value: unknown,
		now: number
	): PendingOptOutEntry[] {
		if (!Array.isArray(value)) {
			return [];
		}
		const cutoff = now - MAX_PENDING_SAVE_AGE_MS;
		const entries: PendingOptOutEntry[] = [];
		for (const entry of value) {
			if (
				!isPendingOptOutEntry(entry) ||
				entry.attempts >= MAX_REPLAY_ATTEMPTS
			) {
				continue;
			}
			const queuedAt = Math.min(entry.queuedAt, now);
			if (queuedAt < cutoff) {
				continue;
			}
			entries.push(
				entry.kind === 'record'
					? {
							...entry,
							payload: toStoredPayload(entry.payload),
							queuedAt,
						}
					: {
							...entry,
							payload: toStoredPayload(entry.payload),
							queuedAt,
						}
			);
		}
		entries.sort((left, right) => (left.seq ?? 0) - (right.seq ?? 0));
		return entries;
	};

	/** The queued opt-out acts, rewriting the stored list when normalizing changed it. */
	const readPendingOptOuts = function readPendingOptOuts(
		tx: OutboxTransaction,
		now = Date.now()
	): PendingOptOutEntry[] {
		const stored = tx.read('optOuts');
		if (stored === undefined) {
			return [];
		}
		const normalized = normalizePendingOptOuts(stored, now);
		if (JSON.stringify(normalized) !== JSON.stringify(stored)) {
			tx.write('optOuts', normalized);
		}
		return normalized;
	};

	/**
	 * Stored reassignments, dropping malformed ones and those no queued save can
	 * still need: older than a queued save may live, and with no save left
	 * queued under the old id. A tab still on the old id can queue a save days
	 * after the reassignment, and that save needs the record for as long as it
	 * waits.
	 */
	const readReassignments = function readReassignments(
		tx: OutboxTransaction,
		now = Date.now()
	): SubjectReassignment[] {
		const stored = tx.read('reassignments');
		if (!Array.isArray(stored)) {
			return [];
		}
		const cutoff = now - MAX_PENDING_SAVE_AGE_MS;
		const queued = new Set([
			...readPendingSaves(tx, now).map((entry) => entry.payload.subjectId),
			...readPendingOptOuts(tx, now).map((entry) => entry.payload.subjectId),
		]);
		const kept = stored
			.filter(isSubjectReassignment)
			// A time ahead of the clock counts as now, as for a queued save.
			.map((item) => (item.at > now ? { ...item, at: now } : item))
			.filter((item) => item.at >= cutoff || queued.has(item.from));
		if (JSON.stringify(kept) !== JSON.stringify(stored)) {
			tx.write('reassignments', kept);
		}
		return kept;
	};

	return {
		normalizePendingOptOuts,
		normalizePendingSaves,
		readPendingOptOuts,
		readPendingSaves,
		readReassignments,
	};
};

/**
 * What queueing a failed save did: `superseded` when the records were
 * cleared or replaced first, so there was nothing left to queue, and
 * `unstored` when storage refused the write.
 */
export type EnqueueResult = 'queued' | 'superseded' | 'unstored';

/**
 * Outcome of queueing an opt-out act. `queued` means stored durably, `memory`
 * means kept in the process-only fallback store, and `unstored` means the write
 * was refused.
 */
export type OptOutEnqueueResult = 'queued' | 'memory' | 'unstored';

/** `retry` keeps the entry for another attempt; the others remove it. */
type ReplayOutcome = 'saved' | 'retry' | 'rejected';

/** What one replay did, for the run that called it. */
interface ReplayResult {
	/** The `save:replayed` event to emit. */
	event: { ok: boolean; rejected?: string; subjectId: string };
	/** The entry failed again and stays queued for another attempt. */
	kept: boolean;
	/** What the transport threw, when it threw. */
	error: unknown;
}

/** Transports the opt-out replay path calls. */
export interface OptOutReplayTransports {
	optOut?: KernelTransport['optOut'];
	liftOptOut?: KernelTransport['liftOptOut'];
}

export interface QueueWorkerOptions {
	runtime: KernelRuntime;
	store: SaveOutboxStore;
	tools: QueueTools;
	/** Opt-out act version when a save queued on this kernel was recorded. */
	getSaveActVersion?: (
		idempotencyKey: string | undefined
	) => number | undefined;
	/** Whether this instance has a direct opt-out or lift request in flight. */
	hasOptOutInFlight?: () => boolean;
	/** Whether this instance already owns a direct send for the action. */
	isSending?: (payload: SavePayload) => boolean;
	/** Whether this instance already owns a direct send for an opt-out act. */
	isSendingOptOut?: (idempotencyKey: string) => boolean;
}

/** The queue operations of one outbox. */
export interface QueueWorker {
	/** Queue what `current()` still holds, read inside the transaction. */
	enqueue: (current: () => SavePayload | null) => Promise<EnqueueResult>;
	/** Queue one opt-out act (record or lift), without its identity token. */
	enqueueOptOut: (act: OptOutAct) => Promise<OptOutEnqueueResult>;
	/** Drop `payload` and the queued saves it superseded. */
	discard: (payload: SavePayload) => Promise<void>;
	/** Drop one opt-out act by its idempotency key. */
	discardOptOut: (idempotencyKey: string) => Promise<void>;
	/** Strip an expired policy snapshot token from a queued opt-out act. */
	clearOptOutSnapshotToken: (
		idempotencyKey: string
	) => Promise<PendingOptOutEntry | null>;
	/** Remove every queued opt-out act (used when the backend answers 404). */
	clearOptOuts: () => Promise<void>;
	/**
	 * Move the visitor off a subject id: to a new one when the backend
	 * refused it, or to the canonical one it answered for a `sub_` id.
	 */
	reassignSubject: (from: string, to?: string) => Promise<string | null>;
	/** Replay every queued save entry; resolves to whether any is left. */
	replay: (save: NonNullable<KernelTransport['save']>) => Promise<boolean>;
	/** Replay every queued opt-out entry in order; resolves to whether any is left. */
	replayOptOuts: (
		transports: OptOutReplayTransports,
		onUnsupported: () => void
	) => Promise<boolean>;
}

const isUnsupportedStatus = function isUnsupportedStatus(
	error: unknown
): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		(error as { status?: unknown }).status === 404
	);
};

const isPolicySnapshotConflict = function isPolicySnapshotConflict(
	error: unknown
): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		(error as { status?: unknown }).status === 409 &&
		typeof (error as { code?: unknown }).code === 'string' &&
		(error as { code: string }).code.startsWith('policy_snapshot_')
	);
};

const withoutOptOutSnapshotToken = function withoutOptOutSnapshotToken(
	entry: PendingOptOutEntry
): PendingOptOutEntry {
	return entry.kind === 'record'
		? { ...entry, payload: { ...entry.payload, policySnapshotToken: null } }
		: { ...entry, payload: { ...entry.payload, policySnapshotToken: null } };
};

const withCurrentIdentityToken = function withCurrentIdentityToken<
	Payload extends { user: Readonly<KernelUser> | null },
>(payload: Payload, currentUser: Readonly<KernelUser> | null): Payload {
	if (
		!currentUser?.identityToken ||
		!payload.user ||
		payload.user.externalId !== currentUser.externalId ||
		(payload.user.identityProvider ?? undefined) !==
			(currentUser.identityProvider ?? undefined)
	) {
		return payload;
	}
	return {
		...payload,
		user: { ...payload.user, identityToken: currentUser.identityToken },
	};
};

const withOptOutSubjectId = function withOptOutSubjectId(
	entry: PendingOptOutEntry,
	subjectId: string
): PendingOptOutEntry {
	return entry.kind === 'record'
		? { ...entry, payload: { ...entry.payload, subjectId } }
		: { ...entry, payload: { ...entry.payload, subjectId } };
};

/**
 * Create the queue operations of one outbox.
 */
// oxlint-disable-next-line max-lines-per-function -- Queueing, replay and reassignment share the subject claims through closures.
export const createQueueWorker = function createQueueWorker({
	runtime,
	store,
	tools,
	getSaveActVersion = () => undefined,
	hasOptOutInFlight = () => false,
	isSending = () => false,
	isSendingOptOut = () => false,
}: QueueWorkerOptions): QueueWorker {
	const { batch, commit, emit, getSnapshot } = runtime;
	const {
		appendOptOut,
		appendSave,
		applySyncedOptOut,
		generateUuidV7,
		isConsentSaveRejection,
		isSubjectConflict,
		warnInDevelopment,
		withSubjectId,
	} = tools;

	/**
	 * Report a queued save that left the queue without the backend
	 * recording it. Called once, by the kernel whose transaction removed it.
	 */
	const reportDropped = function reportDropped(error: unknown): void {
		emit({ command: 'save', error, type: 'command:error' });
		warnInDevelopment(
			'[inth] A queued consent save was dropped and will not be resent. The choice is kept in this browser only.',
			error
		);
	};

	const reportOptOutDropped = function reportOptOutDropped(
		kind: PendingOptOutEntry['kind'],
		error: unknown
	): void {
		emit({
			command: kind === 'lift' ? 'optIn' : 'optOut',
			error,
			type: 'command:error',
		});
		warnInDevelopment(
			'[inth] A queued opt-out request was dropped and will not be resent. The opt-out stays recorded in this browser only.',
			error
		);
	};

	/**
	 * Report saves a read removed for being older than a week. The read runs
	 * inside a transaction, so listeners run after it: one that starts
	 * another transaction must not run inside this one.
	 */
	const reportExpired = function reportExpired(count: number): void {
		const saves =
			count === 1 ? 'a queued consent save' : `${count} queued consent saves`;
		const error = new Error(
			`inth save outbox: dropped ${saves} that waited more than 7 days without reaching the backend`
		);
		queueMicrotask(() => {
			reportDropped(error);
		});
	};

	const {
		normalizePendingOptOuts,
		normalizePendingSaves,
		readPendingOptOuts,
		readPendingSaves,
		readReassignments,
	} = createStoredLists(tools, reportExpired);
	// Subject ids this kernel replaced after the backend refused them as
	// another tenant's, old to the claim for the new one. A live save and a
	// replay can both hit the same refusal; this sends both to one new id
	// instead of minting two. Each claim belongs to the records generation it
	// was made in: after a clear, reusing it would tie the visitor's new
	// history to the subject they reset away from.
	const reassignedSubjects = new Map<
		string,
		{ claim: Promise<string | null>; generation: number }
	>();
	let activeReplay: Promise<boolean> | null = null;
	let activeOptOutReplay: Promise<boolean> | null = null;

	const currentSubjectId = () => getSnapshot().subject?.subjectId;

	/** Queue what `current()` still holds, read inside the transaction. */
	const enqueue = function enqueue(
		current: () => SavePayload | null
	): Promise<EnqueueResult> {
		return store.transact((tx) => {
			const payload = current();
			if (!payload) {
				return 'superseded';
			}
			const now = Date.now();
			const pending = appendSave(readPendingSaves(tx, now), payload, now);
			return tx.write('saves', normalizePendingSaves(tx, pending, now))
				? 'queued'
				: 'unstored';
		});
	};

	const enqueueOptOut = function enqueueOptOut(
		act: OptOutAct
	): Promise<OptOutEnqueueResult> {
		return store.transact((tx) => {
			const now = Date.now();
			const pending = appendOptOut(readPendingOptOuts(tx, now), act, now);
			if (!tx.write('optOuts', normalizePendingOptOuts(pending, now))) {
				return 'unstored';
			}
			return tx.durable === false ? 'memory' : 'queued';
		});
	};

	/**
	 * Drop the queued entry of `payload`, found by its idempotency key, so
	 * also after it was narrowed or moved to another subject id. Every save
	 * queued before it was narrowed by it when it was queued, so nothing
	 * older can replay over it. Queued actions for other categories keep
	 * waiting for their own replay.
	 */
	const discard = function discard(payload: SavePayload): Promise<void> {
		const key = payload.idempotencyKey;
		return store.transact((tx) => {
			const pending = readPendingSaves(tx);
			const remaining = pending.filter(
				(candidate) =>
					key === undefined || candidate.payload.idempotencyKey !== key
			);
			if (remaining.length !== pending.length) {
				tx.write('saves', remaining);
			}
		});
	};

	const discardOptOut = function discardOptOut(
		idempotencyKey: string
	): Promise<void> {
		return store.transact((tx) => {
			const pending = readPendingOptOuts(tx);
			const remaining = pending.filter(
				(candidate) => candidate.idempotencyKey !== idempotencyKey
			);
			if (remaining.length !== pending.length) {
				tx.write('optOuts', remaining);
			}
		});
	};

	const clearOptOutSnapshotToken = function clearOptOutSnapshotToken(
		idempotencyKey: string
	): Promise<PendingOptOutEntry | null> {
		return store.transact((tx) => {
			const pending = readPendingOptOuts(tx);
			let updated: PendingOptOutEntry | null = null;
			const next = pending.map((candidate) => {
				if (
					candidate.idempotencyKey !== idempotencyKey ||
					!candidate.payload.policySnapshotToken
				) {
					return candidate;
				}
				updated = withoutOptOutSnapshotToken(candidate);
				return updated;
			});
			if (updated !== null) {
				tx.write('optOuts', next);
			}
			return updated;
		});
	};

	const clearOptOuts = function clearOptOuts(): Promise<void> {
		return store.transact((tx) => {
			if (tx.read('optOuts') !== undefined) {
				tx.write('optOuts', []);
			}
		});
	};

	// -- Subject reassignment --------------------------------------------------

	/**
	 * The subject id that replaces `from` in this browser, shared by every
	 * kernel on the store. The first caller records `proposed`; any later
	 * one gets the id already recorded. Two tabs refused at the same moment
	 * would otherwise each pick an id, and one of them would persist a
	 * subject the backend holds no consent for.
	 *
	 * Every queued save for `from` moves to the returned id in the same
	 * transaction, so none is replayed under the refused one. Calling it
	 * again moves saves queued under `from` since.
	 *
	 * `isCurrent` is asked inside the transaction, before anything is
	 * written. Waiting for the store can take long enough for the visitor to
	 * be cleared or switched; then nothing is recorded or moved and this
	 * resolves to `null`, so saves that no longer belong to the visitor stay
	 * where they were.
	 */
	const claimReassignment = function claimReassignment(
		from: string,
		proposed: string,
		isCurrent: () => boolean
	): Promise<string | null> {
		return store.transact((tx) => {
			if (!isCurrent()) {
				return null;
			}
			const now = Date.now();
			const reassignments = readReassignments(tx, now);
			const recorded = reassignments.find((item) => item.from === from);
			const to = recorded?.to ?? proposed;
			if (!recorded) {
				tx.write('reassignments', [...reassignments, { at: now, from, to }]);
			}

			const pending = readPendingSaves(tx, now);
			if (pending.some((entry) => entry.payload.subjectId === from)) {
				const moved = pending.map((entry) =>
					entry.payload.subjectId === from
						? { ...entry, payload: withSubjectId(entry.payload, to) }
						: entry
				);
				tx.write('saves', normalizePendingSaves(tx, moved, now));
			}
			const pendingOptOuts = readPendingOptOuts(tx, now);
			if (pendingOptOuts.some((entry) => entry.payload.subjectId === from)) {
				const movedOptOuts = pendingOptOuts.map((entry) =>
					entry.payload.subjectId === from
						? withOptOutSubjectId(entry, to)
						: entry
				);
				tx.write('optOuts', normalizePendingOptOuts(movedOptOuts, now));
			}
			return to;
		});
	};

	/**
	 * A save queued under `from` after this browser had already moved the
	 * visitor off it: another tab was still on `from`, or the page reloaded
	 * onto the new subject before the replay. The recorded reassignment says
	 * where it belongs; the save follows it only when that is the visitor's
	 * subject now. A clear removes the record, so a save from before a reset
	 * is dropped rather than tied to the new history. Reading the record
	 * records nothing, so a save for a subject this browser never reassigned
	 * cannot start a new reassignment.
	 */
	const followRecordedReassignment = async function followRecordedReassignment(
		from: string
	): Promise<string | null> {
		const to = await store.transact(
			(tx) => readReassignments(tx).find((item) => item.from === from)?.to
		);
		if (to === undefined || currentSubjectId() !== to) {
			return null;
		}
		// Moves the queued saves; the record already names `to`.
		const moved = await claimReassignment(
			from,
			to,
			() => currentSubjectId() === to
		);
		return moved === null ? null : to;
	};

	/**
	 * Give the visitor a new subject id after the backend refused `from`
	 * with `subject_conflict`: on a database several tenants share, another
	 * tenant already owns it. Resending under the same id is refused every
	 * time, so without this the visitor's choices would never be recorded.
	 *
	 * The new id is claimed through the store, so every tab that hits the
	 * refusal moves to the same one, and queued saves for `from` move with
	 * it. It is committed like a subject the server resolved, so persistence
	 * writes it over the stored one. A visitor set back to `from` later moves
	 * to the same id again, unless the stored consent records were cleared in
	 * between.
	 *
	 * Resolves to `null` when `from` is no longer this visitor's subject and
	 * no reassignment of it leads to the current one: a save for a subject
	 * since replaced or cleared is not moved onto whoever holds the snapshot
	 * now.
	 */
	const reassignSubject = async function reassignSubject(
		from: string,
		proposed?: string
	): Promise<string | null> {
		const generation = runtime.getGeneration();
		const cached = reassignedSubjects.get(from);
		const earlier =
			cached?.generation === generation ? cached.claim : undefined;
		if (earlier === undefined && currentSubjectId() !== from) {
			return followRecordedReassignment(from);
		}
		// Still the visitor this reassignment started for: on `from`, or
		// already moved to its replacement. The subject alone decides. The
		// records generation also advances when the same visitor's choice
		// changes (a server merge, another tab's save), and a clear or a
		// switch always moves the subject.
		const unchanged = (to?: string) => () => {
			const id = currentSubjectId();
			return id === from || (to !== undefined && id === to);
		};
		let claim = earlier;
		if (claim === undefined) {
			claim = claimReassignment(
				from,
				proposed ?? generateUuidV7(),
				unchanged()
			);
			reassignedSubjects.set(from, { claim, generation });
		}
		const to = await claim;
		if (to === null) {
			return null;
		}
		// Moves saves queued under `from` since the first claim.
		if (
			earlier !== undefined &&
			(await claimReassignment(from, to, unchanged(to))) === null
		) {
			return null;
		}

		const current = getSnapshot().subject;
		if (current?.subjectId === to) {
			return to;
		}
		if (current?.subjectId !== from) {
			return null;
		}
		const subject: ConsentSubject = { ...current, subjectId: to };
		batch(() => {
			commit({ subject });
			emit({
				previousSubjectId: from,
				snapshot: getSnapshot(),
				type: 'subject:resolved',
			});
		});
		return to;
	};

	// -- Replay ----------------------------------------------------------------

	/**
	 * A `sub_` id a replay was answered with its UUID for: the visitor and
	 * every save still queued under it move to the UUID, so it is not sent
	 * again. An answer never moves a save or a visitor off a UUID. Not on the
	 * second attempt after a reassignment (`moved` is `null` there).
	 */
	const followCanonicalSubject = async function followCanonicalSubject(
		from: string,
		canonical: string | undefined,
		moved: Map<string, string> | null
	): Promise<string | undefined> {
		if (
			!moved ||
			canonical === undefined ||
			canonical === from ||
			!from.startsWith(LEGACY_SUBJECT_PREFIX)
		) {
			return undefined;
		}
		const to = await reassignSubject(from, canonical);
		if (to !== null) {
			moved.set(from, to);
			return to;
		}
		return undefined;
	};

	/**
	 * Replay one entry. Returns `null` when another kernel already replayed
	 * or dropped it, otherwise the replay outcome. A save the backend refused
	 * for good (a `ConsentSaveRejectedError`) leaves the queue at once
	 * instead of using up its attempts.
	 *
	 * The exception is a `subject_conflict`: the subject id belongs to
	 * another tenant, not the choice. The visitor moves to a new subject,
	 * which rekeys the queue, and the entry is replayed once more under the
	 * new id. The move is recorded in `moved` so the rest of this run replays
	 * its other saves under the new id too. `moved` is `null` for the second
	 * attempt, so a backend that refuses every id cannot keep the loop going.
	 *
	 * The entry is found by its idempotency key, so also after another tab
	 * narrowed it or moved it to another subject id, and the stored version
	 * is the one sent. An entry this call removes without the backend taking
	 * it (refused, or out of attempts) is reported through
	 * {@link reportDropped}. Another kernel that replayed the same entry at
	 * the same time finds it gone, or its attempt already counted, and
	 * reports nothing.
	 */
	const recordSaveAttempt = function recordSaveAttempt(
		key: string | undefined,
		outcome: ReplayOutcome,
		isEntry: (candidate: PendingSaveEntry) => boolean
	): Promise<{
		attempts: number | null;
		hasPendingOptOuts: boolean;
		written: boolean;
	}> {
		return store.transact((tx) => {
			let counted: number | null = null;
			const next: PendingSaveEntry[] = [];
			for (const candidate of readPendingSaves(tx)) {
				// Sent and answered: the entry goes whatever another tab did to
				// it since. A retry counts only once per attempt.
				if (
					candidate.payload.idempotencyKey !== key ||
					(outcome === 'retry' && !isEntry(candidate))
				) {
					next.push(candidate);
					continue;
				}
				counted = candidate.attempts + 1;
				if (outcome === 'retry' && counted < MAX_REPLAY_ATTEMPTS) {
					next.push({ ...candidate, attempts: counted });
				}
			}
			return {
				attempts: counted,
				hasPendingOptOuts: readPendingOptOuts(tx).length > 0,
				written: tx.write('saves', next),
			};
		});
	};

	const settleSaveRemoval = function settleSaveRemoval(
		outcome: ReplayOutcome,
		attempts: number | null,
		written: boolean,
		failure: unknown
	): boolean {
		// A refused write leaves the entry stored as it was: it stays queued,
		// and a drop is reported only by the write that removes it.
		const removed =
			attempts !== null &&
			written &&
			(outcome === 'rejected' ||
				(outcome === 'retry' && attempts >= MAX_REPLAY_ATTEMPTS));
		if (removed) {
			reportDropped(
				outcome === 'rejected'
					? failure
					: new Error(
							`inth save outbox: dropped a queued consent save after ${MAX_REPLAY_ATTEMPTS} failed attempts`,
							{ cause: failure }
						)
			);
		}
		return attempts !== null && outcome !== 'saved' && !removed;
	};

	const replayEntry = async function replayEntry(
		save: NonNullable<KernelTransport['save']>,
		queued: PendingSaveEntry,
		moved: Map<string, string> | null
	): Promise<ReplayResult | null> {
		const key = queued.payload.idempotencyKey;
		const isEntry = (candidate: PendingSaveEntry) =>
			candidate.payload.idempotencyKey === key &&
			candidate.attempts === queued.attempts;
		const entry = await store.transact((tx) =>
			readPendingSaves(tx).find(isEntry)
		);
		if (!entry || isSending(entry.payload)) {
			return null;
		}

		let outcome: ReplayOutcome = 'retry';
		let rejected: string | undefined;
		let failure: unknown;
		let canonical: string | undefined;
		let answeredOptOut: OptOutRecord | undefined;
		const actVersion = getSaveActVersion(key) ?? runtime.getOptOutActVersion();
		const generation = runtime.getGeneration();
		try {
			const result = await save(entry.payload);
			outcome = result.ok ? 'saved' : 'retry';
			canonical = result.subjectId;
			answeredOptOut = result.optOut;
		} catch (error) {
			failure = error;
			if (moved && isSubjectConflict(error)) {
				const subjectId = await reassignSubject(entry.payload.subjectId);
				if (subjectId !== null) {
					moved.set(entry.payload.subjectId, subjectId);
					// The queue already holds this entry under the new id.
					return replayEntry(
						save,
						{ ...entry, payload: withSubjectId(entry.payload, subjectId) },
						null
					);
				}
			}
			// Anything else keeps the entry for a later init or online event.
			if (isConsentSaveRejection(error)) {
				outcome = 'rejected';
				rejected = error.code;
			}
		}
		// The entry's attempts after this one, or `null` when another kernel
		// removed it, or counted this attempt, while the request was out; and
		// whether storage took the updated list.
		const { attempts, hasPendingOptOuts, written } = await recordSaveAttempt(
			key,
			outcome,
			isEntry
		);
		const kept = settleSaveRemoval(outcome, attempts, written, failure);
		const { subjectId } = entry.payload;
		const adopted = await followCanonicalSubject(
			subjectId,
			outcome === 'saved' ? canonical : undefined,
			moved
		);
		if (
			outcome === 'saved' &&
			answeredOptOut !== undefined &&
			!hasPendingOptOuts &&
			!hasOptOutInFlight()
		) {
			applySyncedOptOut(runtime, answeredOptOut, {
				actVersion,
				allowClear: false,
				generation,
				subjectId: adopted ?? subjectId,
			});
		}
		return {
			error: failure,
			event:
				rejected === undefined
					? { ok: outcome === 'saved', subjectId }
					: { ok: false, rejected, subjectId },
			kept,
		};
	};

	const recordOptOutAttempt = function recordOptOutAttempt(
		key: string,
		outcome: ReplayOutcome,
		isEntry: (candidate: PendingOptOutEntry) => boolean
	): Promise<{
		attempts: number | null;
		remainingCount: number;
		written: boolean;
	}> {
		return store.transact((tx) => {
			let counted: number | null = null;
			const next: PendingOptOutEntry[] = [];
			for (const candidate of readPendingOptOuts(tx)) {
				if (
					candidate.idempotencyKey !== key ||
					(outcome === 'retry' && !isEntry(candidate))
				) {
					next.push(candidate);
					continue;
				}
				counted = candidate.attempts + 1;
				if (outcome === 'retry' && counted < MAX_REPLAY_ATTEMPTS) {
					next.push({ ...candidate, attempts: counted });
				}
			}
			return {
				attempts: counted,
				remainingCount: next.length,
				written: tx.write('optOuts', next),
			};
		});
	};

	const dispatchOptOutReplay = (
		transports: OptOutReplayTransports,
		entry: PendingOptOutEntry,
		currentUser: Readonly<KernelUser> | null
	) =>
		entry.kind === 'record'
			? transports.optOut?.(
					withCurrentIdentityToken(entry.payload, currentUser),
					{ replay: true }
				)
			: transports.liftOptOut?.(
					withCurrentIdentityToken(entry.payload, currentUser),
					{ replay: true }
				);

	const settleOptOutRemoval = function settleOptOutRemoval(
		kind: PendingOptOutEntry['kind'],
		outcome: ReplayOutcome,
		attempts: number | null,
		written: boolean,
		failure: unknown
	): boolean {
		const removed =
			attempts !== null &&
			written &&
			(outcome === 'rejected' ||
				(outcome === 'retry' && attempts >= MAX_REPLAY_ATTEMPTS));
		if (removed) {
			reportOptOutDropped(
				kind,
				outcome === 'rejected'
					? failure
					: new Error(
							`inth save outbox: dropped a queued opt-out request after ${MAX_REPLAY_ATTEMPTS} failed attempts`,
							{ cause: failure }
						)
			);
		}
		return attempts !== null && outcome !== 'saved' && !removed;
	};

	const recoverOptOutConflict = async function recoverOptOutConflict(
		entry: PendingOptOutEntry,
		error: unknown,
		moved: Map<string, string> | null,
		retryWithoutToken: boolean
	): Promise<{
		next: PendingOptOutEntry;
		moved: Map<string, string> | null;
		retryWithoutToken: boolean;
	} | null> {
		if (moved && isSubjectConflict(error)) {
			const subjectId = await reassignSubject(entry.payload.subjectId);
			if (subjectId !== null) {
				moved.set(entry.payload.subjectId, subjectId);
				return {
					moved: null,
					next: withOptOutSubjectId(entry, subjectId),
					retryWithoutToken,
				};
			}
		}
		if (
			retryWithoutToken &&
			entry.payload.policySnapshotToken &&
			isPolicySnapshotConflict(error)
		) {
			const updated = await clearOptOutSnapshotToken(entry.idempotencyKey);
			return {
				moved,
				next: updated ?? withoutOptOutSnapshotToken(entry),
				retryWithoutToken: false,
			};
		}
		return null;
	};

	const replayOptOutEntry = async function replayOptOutEntry(
		transports: OptOutReplayTransports,
		queued: PendingOptOutEntry,
		moved: Map<string, string> | null,
		isLast: boolean,
		onUnsupported: () => void,
		retryWithoutToken = true
	): Promise<{ kept: boolean; error: unknown; unsupported?: boolean } | null> {
		const key = queued.idempotencyKey;
		const isEntry = (candidate: PendingOptOutEntry) =>
			candidate.idempotencyKey === key &&
			candidate.attempts === queued.attempts;
		const entry = await store.transact((tx) =>
			readPendingOptOuts(tx).find(isEntry)
		);
		if (!entry || isSendingOptOut(entry.idempotencyKey)) {
			return null;
		}
		let outcome: ReplayOutcome = 'retry';
		let failure: unknown;
		let canonical: string | undefined;
		let answeredOptOut: OptOutRecord | null | undefined;
		const actVersion = runtime.getOptOutActVersion();
		const generation = runtime.getGeneration();
		try {
			const result = await dispatchOptOutReplay(
				transports,
				entry,
				getSnapshot().user
			);
			if (!result) {
				return null;
			}
			if (result.unsupported) {
				onUnsupported();
				await clearOptOuts();
				return { error: undefined, kept: false, unsupported: true };
			}
			outcome = result.ok ? 'saved' : 'retry';
			canonical = result.subjectId;
			answeredOptOut = result.optOut;
		} catch (error) {
			if (isUnsupportedStatus(error)) {
				onUnsupported();
				await clearOptOuts();
				return { error: undefined, kept: false, unsupported: true };
			}
			failure = error;
			const recovery = await recoverOptOutConflict(
				entry,
				error,
				moved,
				retryWithoutToken
			);
			if (recovery) {
				return replayOptOutEntry(
					transports,
					recovery.next,
					recovery.moved,
					isLast,
					onUnsupported,
					recovery.retryWithoutToken
				);
			}
			if (isConsentSaveRejection(error)) {
				outcome = 'rejected';
			}
		}

		const { attempts, remainingCount, written } = await recordOptOutAttempt(
			key,
			outcome,
			isEntry
		);
		const kept = settleOptOutRemoval(
			entry.kind,
			outcome,
			attempts,
			written,
			failure
		);
		if (outcome === 'saved') {
			const { subjectId } = entry.payload;
			const adopted = await followCanonicalSubject(subjectId, canonical, moved);
			if (isLast && remainingCount === 0 && answeredOptOut !== undefined) {
				applySyncedOptOut(runtime, answeredOptOut, {
					actVersion,
					allowClear: entry.kind === 'lift',
					generation,
					subjectId: adopted ?? subjectId,
				});
			}
		}
		return { error: failure, kept };
	};

	const runOptOutReplay = async function runOptOutReplay(
		transports: OptOutReplayTransports,
		onUnsupported: () => void
	): Promise<boolean> {
		const pending = await store.transact((tx) => readPendingOptOuts(tx));
		let kept = 0;
		let lastError: unknown;
		const moved = new Map<string, string>();
		for (const [index, queued] of pending.entries()) {
			const to = moved.get(queued.payload.subjectId);
			const entry = to === undefined ? queued : withOptOutSubjectId(queued, to);
			// Replay queued opt-out acts one at a time in the exact order queued.
			// oxlint-disable-next-line no-await-in-loop
			const result = await replayOptOutEntry(
				transports,
				entry,
				moved,
				index === pending.length - 1,
				onUnsupported
			);
			if (result?.unsupported) {
				return false;
			}
			if (result?.kept) {
				kept += 1;
				lastError = result.error ?? lastError;
			}
		}
		if (kept > 0) {
			warnInDevelopment(
				kept === 1
					? '[inth] Resending a queued opt-out request failed. It stays queued and is resent on the next init or when the browser comes back online.'
					: `[inth] Resending ${kept} queued opt-out requests failed. They stay queued and are resent on the next init or when the browser comes back online.`,
				lastError
			);
		}
		return store.transact((tx) => readPendingOptOuts(tx).length > 0);
	};

	const runSharedOptOutReplay = async function runSharedOptOutReplay(
		transports: OptOutReplayTransports,
		onUnsupported: () => void
	): Promise<boolean> {
		try {
			return await runOptOutReplay(transports, onUnsupported);
		} finally {
			activeOptOutReplay = null;
		}
	};

	/** Replay every queued entry; resolves to whether any is left. */
	const runReplay = async function runReplay(
		save: NonNullable<KernelTransport['save']>
	): Promise<boolean> {
		const pending = await store.transact((tx) => readPendingSaves(tx));
		// Entries that failed again and stay queued, and the last error, for
		// one development warning per run rather than one per entry.
		let kept = 0;
		let lastError: unknown;
		// Subjects reassigned during this run. The queue has already moved
		// their saves, so the entries read above are looked up under the new
		// id rather than skipped as gone.
		const moved = new Map<string, string>();
		for (const queued of pending) {
			const to = moved.get(queued.payload.subjectId);
			const entry =
				to === undefined
					? queued
					: { ...queued, payload: withSubjectId(queued.payload, to) };
			// Preserve save order and avoid burst replays against the consent
			// endpoint.
			// oxlint-disable-next-line no-await-in-loop
			const result = await replayEntry(save, entry, moved);
			if (result !== null) {
				// The subject the save finally went out under, which differs from
				// the queued one after a reassignment.
				emit({ ...result.event, type: 'save:replayed' });
				if (result.kept) {
					kept += 1;
					lastError = result.error ?? lastError;
				}
			}
		}
		if (kept > 0) {
			warnInDevelopment(
				kept === 1
					? '[inth] Resending a queued consent save failed. It stays queued and is resent on the next init or when the browser comes back online.'
					: `[inth] Resending ${kept} queued consent saves failed. They stay queued and are resent on the next init or when the browser comes back online.`,
				lastError
			);
		}
		return store.transact((tx) => readPendingSaves(tx).length > 0);
	};

	const runSharedReplay = async function runSharedReplay(
		save: NonNullable<KernelTransport['save']>
	): Promise<boolean> {
		try {
			return await runReplay(save);
		} finally {
			activeReplay = null;
		}
	};

	return {
		clearOptOutSnapshotToken,
		clearOptOuts,
		discard,
		discardOptOut,
		enqueue,
		enqueueOptOut,
		reassignSubject,
		replay(save) {
			activeReplay ??= runSharedReplay(save);
			return activeReplay;
		},
		replayOptOuts(transports, onUnsupported) {
			activeOptOutReplay ??= runSharedOptOutReplay(transports, onUnsupported);
			return activeOptOutReplay;
		},
	};
};
