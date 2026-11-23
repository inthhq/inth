/**
 * Pure helpers for the durable opt-out record: local record creation,
 * liftability checks, payload builders, answer application and the live GPC
 * recording trigger.
 */
import { OPT_OUT_RIGHTS } from '@inth/sdk-schema/types';
import type { OptOutRecord, OptOutRight } from '@inth/sdk-schema/types';

import type {
	ConsentSnapshot,
	KernelUser,
	LiftOptOutPayload,
	OptOutPayload,
	SaveUISource,
} from '../consent-kernel.model';
import { consentPending } from '../consent-pending';
import { validateOptOutRecord } from '../consent-record/consent-record-validation.model';
import {
	answersHeldOptOut,
	carryOptOutCategories,
	optOutLiftBlocker,
} from '../consent-record/opt-out-rules.model';
import {
	OPTIONAL_CONSENT_CATEGORIES,
	policyOptOutCategories,
} from '../consent-record/types';
import type { OptionalConsentCategory } from '../consent-record/types';
import { EMPTY_OPT_OUT_RECEIPT_DATA } from '../libs/opt-out-state.model';
import type { OptOutReceiptData } from '../libs/opt-out-state.model';
import { createIdempotencyKey } from '../libs/subject-uuid.model';
import { splitServerOptOutForAccount } from './account-layer';
import type { AccountOptOutRecord } from './account-layer';
import type { KernelRuntime } from './create-runtime';

const inCanonicalOrder = function inCanonicalOrder(
	categories: readonly OptionalConsentCategory[]
): OptionalConsentCategory[] {
	return OPTIONAL_CONSENT_CATEGORIES.filter((category) =>
		categories.includes(category)
	);
};

/**
 * A new browser-made opt-out record. It carries the categories the current
 * policy withholds, so a later policy that narrows its mapping cannot lift
 * them.
 */
export const newLocalOptOutRecord = function newLocalOptOutRecord(
	snapshot: Pick<ConsentSnapshot, 'evaluationPolicy'>,
	method: 'button' | 'gpc',
	recordedAt: number,
	rights: readonly OptOutRight[] = []
): OptOutRecord {
	return {
		categories: inCanonicalOrder(
			policyOptOutCategories(snapshot.evaluationPolicy)
		),
		heldBy: 'device',
		method,
		recordedAt,
		rights: [...rights],
	};
};

/**
 * Next durable opt-out record for a visitor-initiated opt-out at `actionAt`,
 * or `null` when an opt-out record already exists.
 */
export const nextButtonOptOutRecord = function nextButtonOptOutRecord(
	snapshot: Pick<ConsentSnapshot, 'evaluationPolicy' | 'optOut'>,
	actionAt: number,
	rights: readonly OptOutRight[] = []
): OptOutRecord | null {
	if (snapshot.optOut !== null) {
		return null;
	}
	return newLocalOptOutRecord(snapshot, 'button', actionAt, rights);
};

export { optOutLiftBlocker };

/**
 * Whether a live kernel sees an active GPC signal under a matched,
 * non-provisional rule that maps it.
 */
export const gpcSignalApplicable = function gpcSignalApplicable(
	snapshot: ConsentSnapshot,
	live: boolean
): boolean {
	return (
		live &&
		!snapshot.externalPermissions &&
		!consentPending(snapshot) &&
		snapshot.resolution.status === 'matched' &&
		snapshot.privacySignals.gpc.active &&
		snapshot.evaluationPolicy.gpcDenyCategories.length > 0
	);
};

/**
 * Whether a live kernel must record a durable GPC opt-out for `snapshot`.
 * Checks the browser record only so an account opt-out never suppresses this
 * device's own GPC opt-out.
 */
export const gpcOptOutDue = function gpcOptOutDue(
	snapshot: ConsentSnapshot,
	live: boolean,
	browserOptOut: Readonly<OptOutRecord> | null = snapshot.optOut
): boolean {
	return gpcSignalApplicable(snapshot, live) && browserOptOut === null;
};

/**
 * Whether a live kernel must report an active GPC signal for an opt-out record
 * already held in the browser layer.
 */
export const gpcSignalReportDue = function gpcSignalReportDue(
	snapshot: ConsentSnapshot,
	live: boolean,
	gpcReported: boolean,
	browserOptOut: Readonly<OptOutRecord> | null = snapshot.optOut
): boolean {
	return (
		gpcSignalApplicable(snapshot, live) &&
		browserOptOut !== null &&
		!gpcReported
	);
};

const sameList = function sameList(
	left: readonly string[],
	right: readonly string[]
): boolean {
	return (
		left.length === right.length &&
		left.every((entry, index) => entry === right[index])
	);
};

/**
 * Whether two durable opt-out records agree on everything the backend
 * sends. `categories` is left out because the backend never carries it, so
 * its copy of a held record still matches the browser's.
 */
export const sameOptOutAnswer = function sameOptOutAnswer(
	left: Readonly<OptOutRecord> | null | undefined,
	right: Readonly<OptOutRecord> | null | undefined
): boolean {
	if (left === right) {
		return true;
	}
	if (!left || !right) {
		return false;
	}
	return (
		left.heldBy === right.heldBy &&
		left.method === right.method &&
		left.recordedAt === right.recordedAt &&
		sameList(left.rights, right.rights)
	);
};

/** Structural equality for two durable opt-out records. */
export const sameOptOutRecord = function sameOptOutRecord(
	left: Readonly<OptOutRecord> | null,
	right: Readonly<OptOutRecord> | null
): boolean {
	if (left === right) {
		return true;
	}
	if (!left || !right) {
		return false;
	}
	return (
		sameOptOutAnswer(left, right) &&
		(left.categories === undefined
			? right.categories === undefined
			: right.categories !== undefined &&
				sameList(left.categories, right.categories))
	);
};

/**
 * Build the transport payload for a local opt-out act (`button` or `gpc`),
 * with one idempotency key and the snapshot's context. Omits `rights` so
 * the backend derives the applicable rights from the visitor's location.
 */
export const buildOptOutPayload = function buildOptOutPayload(
	snapshot: ConsentSnapshot,
	optOut: Pick<OptOutRecord, 'method'>,
	actionAt: number,
	uiSource?: SaveUISource,
	idempotencyKey: string = createIdempotencyKey()
): OptOutPayload {
	const country =
		snapshot.overrides.country ?? snapshot.location?.countryCode ?? null;
	const region =
		snapshot.overrides.region ?? snapshot.location?.regionCode ?? null;
	const language =
		snapshot.overrides.language ?? snapshot.translations?.language;
	const payload: OptOutPayload = {
		country,
		givenAt: actionAt,
		idempotencyKey,
		method: optOut.method === 'gpc' ? 'gpc' : 'button',
		policyId:
			snapshot.resolution.status === 'matched'
				? snapshot.resolution.policyId
				: null,
		policySnapshotToken: snapshot.policySnapshotToken,
		region,
		subjectId: snapshot.subject?.subjectId ?? '',
		user: snapshot.user ? { ...snapshot.user } : null,
	};
	if (language) {
		payload.language = language;
	}
	if (uiSource !== undefined) {
		payload.uiSource = uiSource;
	}
	return payload;
};

/**
 * Build the transport payload for an opt-out lift, with one idempotency key.
 * Omit `rights` for device lifts so the backend lifts every right the device
 * holds; pass supported `rights` when lifting an account-held opt-out.
 */
export const buildLiftOptOutPayload = function buildLiftOptOutPayload(
	snapshot: ConsentSnapshot,
	subjectId: string,
	actionAt: number,
	uiSource?: SaveUISource,
	rights?: readonly OptOutRight[]
): LiftOptOutPayload {
	const payload: LiftOptOutPayload = {
		givenAt: actionAt,
		idempotencyKey: createIdempotencyKey(),
		policySnapshotToken: snapshot.policySnapshotToken,
		subjectId,
		user: snapshot.user ? { ...snapshot.user } : null,
	};
	if (uiSource !== undefined) {
		payload.uiSource = uiSource;
	}
	if (rights && rights.length > 0) {
		payload.rights = [...rights];
	}
	return payload;
};

/** Fencing inputs checked before applying a backend opt-out answer. */
export interface OptOutAnswerFence {
	/** Local opt-out act counter when the request started. */
	actVersion: number;
	/** Records generation when the request started. */
	generation: number;
	/** Subject ID the request belongs to (after any `sub_` canonicalization). */
	subjectId: string | null;
	/**
	 * Identification generation when the request started, for a request
	 * made on behalf of the identified account. Once the site identifies
	 * anyone on this subject, the answer is that account's no longer.
	 */
	identity?: number;
	/**
	 * The account the request was made for (`null` for none), when the
	 * answer is that account's: it applies only while that account is still
	 * the identified one. Leave unset for an answer about the subject alone.
	 */
	account?: Readonly<KernelUser> | null;
	/** External user ID active when the request started. Drops the answer on mismatch. */
	externalId?: string | null;
	/** Only a lift answer may clear `snapshot.optOut` to `null`. */
	allowClear: boolean;
	/** Whether `incoming` came from a backend answer (`false` for the local 404 fallback). */
	confirmed?: boolean;
	/**
	 * `incoming` answers the opt-out act this browser recorded, so it takes
	 * the categories the browser fixed for that act. Leave unset for any
	 * other answer (a save, `identify`, a refused lift): its record joins
	 * the held categories unless it names the same act.
	 */
	ownAct?: boolean;
	/**
	 * Whether this answer responds directly to this device's own pending
	 * opt-out request (`sendOptOut` / queued `record` replay). Allows a `'both'`
	 * answer to fill the browser device record's unconfirmed rights without
	 * copying pre-existing account-only rights.
	 */
	fromOptOutRequest?: boolean;
}

/**
 * The backend never carries `categories`. An answer to this browser's own
 * act keeps the list the browser fixed when it recorded it; so does an
 * answer saying this device alone holds the opt-out, since that is the act
 * this browser holds. Any other record, such as one an account holds,
 * joins it.
 */
const answerWithHeldCategories = function answerWithHeldCategories(
	answer: OptOutRecord,
	held: Readonly<OptOutRecord> | null,
	fence: Pick<OptOutAnswerFence, 'ownAct'>
): OptOutRecord {
	return carryOptOutCategories(
		answer,
		held,
		fence.ownAct === true ||
			(held !== null &&
				(answer.heldBy === 'device' || answersHeldOptOut(answer, held)))
	);
};

/**
 * Whether a backend answer is the act this browser recorded, so its receipt
 * (the local act and its reference) still describes it: the answer to this
 * browser's own request, or a record with the same time and method. A
 * different act, such as a newer one an account holds, was not made here.
 */
const answersLocalAct = function answersLocalAct(
	answer: OptOutRecord | null,
	held: Readonly<OptOutRecord> | null,
	fence: Pick<OptOutAnswerFence, 'ownAct'>
): boolean {
	if (answer === null || held === null) {
		return false;
	}
	return fence.ownAct === true || answersHeldOptOut(answer, held);
};

/**
 * Whether two users are the same account: the same external ID, ID type
 * and identity provider. `null` (no one identified) matches only `null`.
 * The identity token and properties do not name the account.
 */
export const sameAccount = function sameAccount(
	left: Readonly<KernelUser> | null | undefined,
	right: Readonly<KernelUser> | null | undefined
): boolean {
	if (!left || !right) {
		return !left && !right;
	}
	return (
		left.externalId === right.externalId &&
		(left.externalIdType ?? null) === (right.externalIdType ?? null) &&
		(left.identityProvider ?? null) === (right.identityProvider ?? null)
	);
};

/**
 * Whether an answer to a request made for `account` at identification
 * generation `identity` still belongs to whoever is identified now: no
 * `identify()` or sign-out happened since, and `account` is the current
 * user. A stale answer must not change the opt-out, the subject or the
 * categories of the account identified now.
 */
export const answerOwnedBy = function answerOwnedBy(
	runtime: KernelRuntime,
	account: Readonly<KernelUser> | null,
	identity: number
): boolean {
	return (
		runtime.getIdentityVersion() === identity &&
		sameAccount(account, runtime.getSnapshot().user)
	);
};

/** Whether nothing an answer is fenced against changed since its request. */
const fenceHolds = function fenceHolds(
	runtime: KernelRuntime,
	current: ConsentSnapshot,
	fence: OptOutAnswerFence
): boolean {
	return (
		runtime.getOptOutActVersion() === fence.actVersion &&
		runtime.getGeneration() === fence.generation &&
		(fence.identity === undefined ||
			runtime.getIdentityVersion() === fence.identity) &&
		(fence.account === undefined || sameAccount(fence.account, current.user)) &&
		(current.subject?.subjectId ?? null) === fence.subjectId
	);
};

/**
 * The receipt after a backend answer. This browser's act and its reference
 * stay only while the answer is that act (`localAct`); a different act was
 * not made here, so the receipt drops them.
 */
const nextSyncedOptOutReceipt = function nextSyncedOptOutReceipt(
	currentOptOut: Readonly<OptOutRecord> | null,
	nextOptOut: OptOutRecord | null,
	currentReceipt: Readonly<OptOutReceiptData>,
	confirmed: boolean,
	localAct: boolean
): OptOutReceiptData {
	if (nextOptOut === null) {
		return EMPTY_OPT_OUT_RECEIPT_DATA;
	}
	if (currentOptOut === null || !localAct) {
		return {
			localAct: null,
			reference: null,
			rightsConfirmed: confirmed,
		};
	}
	return {
		localAct: currentReceipt.localAct,
		reference: currentReceipt.reference,
		rightsConfirmed: currentReceipt.rightsConfirmed || confirmed,
	};
};

const receiptChangedFrom = function receiptChangedFrom(
	current: Readonly<OptOutReceiptData>,
	next: OptOutReceiptData
): boolean {
	return (
		next.localAct !== current.localAct ||
		next.reference !== current.reference ||
		next.rightsConfirmed !== current.rightsConfirmed
	);
};

const confirmedDeviceRightsFromBoth = function confirmedDeviceRightsFromBoth(
	browserOptOut: Readonly<OptOutRecord>,
	answerRights: readonly OptOutRight[],
	accountOptOutRights: readonly OptOutRight[] | undefined
): OptOutRight[] {
	const answerSet = new Set<OptOutRight>(answerRights);
	if (browserOptOut.rights.length > 0) {
		return browserOptOut.rights.filter((right) => answerSet.has(right));
	}
	const accountOnly = new Set<OptOutRight>(accountOptOutRights);
	return OPT_OUT_RIGHTS.filter(
		(right) => answerSet.has(right) && !accountOnly.has(right)
	);
};

const applySyncedOptOutWithAccount = function applySyncedOptOutWithAccount(
	runtime: KernelRuntime,
	current: ConsentSnapshot,
	next: OptOutRecord | null,
	fence: OptOutAnswerFence
): boolean {
	// While an account layer for the current `externalId` is active, server
	// opt-out answers held by `'person'` or `'both'` never copy account rights
	// into browser records and never mutate the account layer (`appliedAt` or
	// `optOut`). When a `'both'` answer confirms this device's own pending
	// opt-out request, fill the device record with the requested rights
	// intersected with the answer's rights (never adding pre-existing account
	// rights). Otherwise, when a `'both'` answer covers every right already on
	// the browser device record, mark its receipt confirmed without copying.
	const browserOptOut = runtime.getBrowserRecords().optOut;
	const effectiveBrowserOptOut =
		browserOptOut?.heldBy === 'person' ? null : browserOptOut;
	const currentReceipt = runtime.getOptOutReceiptData();
	if (next !== null && next.heldBy !== 'device') {
		if (
			next.heldBy === 'both' &&
			effectiveBrowserOptOut !== null &&
			fence.confirmed !== false &&
			!currentReceipt.rightsConfirmed
		) {
			if (fence.fromOptOutRequest === true) {
				const accountRights = runtime.getAccountLayer()?.optOut?.rights;
				const nextRights = confirmedDeviceRightsFromBoth(
					effectiveBrowserOptOut,
					next.rights,
					accountRights
				);
				const rightsChanged =
					nextRights.length !== effectiveBrowserOptOut.rights.length ||
					nextRights.some(
						(right, index) => right !== effectiveBrowserOptOut.rights[index]
					);
				const nextReceipt: OptOutReceiptData = {
					...currentReceipt,
					rightsConfirmed: true,
				};
				if (!rightsChanged) {
					runtime.setOptOutReceiptData(nextReceipt);
					return true;
				}
				runtime.batch(() => {
					runtime.setOptOutReceiptData(nextReceipt);
					runtime.commit({
						now: runtime.now(),
						optOut: { ...effectiveBrowserOptOut, rights: nextRights },
					});
					const after = runtime.getSnapshot();
					runtime.emit({
						optOut: after.optOut,
						snapshot: after,
						type: 'opt-out:synced',
					});
				});
				return true;
			}
			if (
				effectiveBrowserOptOut.rights.every((right) =>
					next.rights.includes(right)
				)
			) {
				runtime.setOptOutReceiptData({
					...currentReceipt,
					rightsConfirmed: true,
				});
				return true;
			}
		}
		return false;
	}
	const at = runtime.now();
	const localAct = answersLocalAct(next, effectiveBrowserOptOut, fence);
	const nextBrowserOptOut =
		next !== null
			? answerWithHeldCategories(next, effectiveBrowserOptOut, fence)
			: null;
	const browserChanged = !sameOptOutRecord(
		effectiveBrowserOptOut,
		nextBrowserOptOut
	);
	const nextReceipt = nextSyncedOptOutReceipt(
		effectiveBrowserOptOut,
		nextBrowserOptOut,
		currentReceipt,
		fence.confirmed !== false,
		localAct
	);
	if (!browserChanged) {
		if (!receiptChangedFrom(currentReceipt, nextReceipt)) {
			return false;
		}
		runtime.setOptOutReceiptData(nextReceipt);
		return true;
	}
	runtime.batch(() => {
		runtime.setOptOutReceiptData(nextReceipt);
		runtime.commit({ now: at, optOut: nextBrowserOptOut });
		const after = runtime.getSnapshot();
		if (!sameOptOutRecord(current.optOut, after.optOut) || browserChanged) {
			runtime.emit({
				optOut: after.optOut,
				snapshot: after,
				type: 'opt-out:synced',
			});
		}
	});
	return true;
};

const isSyncedOptOutFenceCurrent = function isSyncedOptOutFenceCurrent(
	runtime: KernelRuntime,
	current: ConsentSnapshot,
	fence: OptOutAnswerFence
): boolean {
	return (
		fenceHolds(runtime, current, fence) &&
		(fence.externalId === undefined ||
			(current.user?.externalId ?? null) === fence.externalId)
	);
};

const parseSyncedOptOutInput = function parseSyncedOptOutInput(
	incoming: OptOutRecord | null | undefined,
	allowClear: boolean
): { ok: true; record: OptOutRecord | null } | { ok: false } {
	if (incoming === undefined || (incoming === null && !allowClear)) {
		return { ok: false };
	}
	if (incoming === null) {
		return { ok: true, record: null };
	}
	const validated = validateOptOutRecord(incoming);
	return validated.ok && validated.record.rights.length > 0
		? { ok: true, record: validated.record }
		: { ok: false };
};

/**
 * Apply the backend's authoritative opt-out answer to `runtime` when it is
 * still current. Emits `opt-out:synced` and never triggers another request or
 * emits `opt-out:recorded` / `opt-out:lifted`.
 */
export const applySyncedOptOut = function applySyncedOptOut(
	runtime: KernelRuntime,
	incoming: OptOutRecord | null | undefined,
	fence: OptOutAnswerFence
): boolean {
	const parsed = parseSyncedOptOutInput(incoming, fence.allowClear);
	if (!parsed.ok) {
		return false;
	}
	let next = parsed.record;
	const current = runtime.getSnapshot();
	if (
		!isSyncedOptOutFenceCurrent(runtime, current, fence) ||
		(next === null && optOutLiftBlocker(current) === 'gpc-active')
	) {
		return false;
	}
	const accountLayer = runtime.getAccountLayer();
	if (
		accountLayer !== null &&
		current.user !== null &&
		accountLayer.externalId === current.user.externalId
	) {
		return applySyncedOptOutWithAccount(runtime, current, next, fence);
	}
	const localAct = answersLocalAct(next, current.optOut, fence);
	if (next !== null) {
		next = answerWithHeldCategories(next, current.optOut, fence);
	}
	const confirmed = fence.confirmed !== false;
	const currentReceipt = runtime.getOptOutReceiptData();
	const nextReceipt = nextSyncedOptOutReceipt(
		current.optOut,
		next,
		currentReceipt,
		confirmed,
		localAct
	);
	if (sameOptOutRecord(current.optOut, next)) {
		if (!receiptChangedFrom(currentReceipt, nextReceipt)) {
			return false;
		}
		runtime.setOptOutReceiptData(nextReceipt);
		return true;
	}
	runtime.batch(() => {
		runtime.setOptOutReceiptData(nextReceipt);
		runtime.commit({ now: runtime.now(), optOut: next });
		const after = runtime.getSnapshot();
		runtime.emit({
			optOut: after.optOut,
			snapshot: after,
			type: 'opt-out:synced',
		});
	});
	return true;
};
