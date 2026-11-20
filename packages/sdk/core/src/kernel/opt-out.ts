/**
 * Pure helpers for the durable opt-out record: local record creation,
 * liftability checks, payload builders, answer application and the live GPC
 * recording trigger.
 */
import type { OptOutRecord, OptOutRight } from '@inth/sdk-schema/types';

import { optOutLiftBlocker } from '../consent-record/opt-out-rules';
import { validateOptOutRecord } from '../consent-record/validation';
import { createIdempotencyKey } from '../libs/subject-uuid';
import type {
	ConsentSnapshot,
	LiftOptOutPayload,
	OptOutPayload,
	SaveUISource,
} from '../types';
import type { KernelRuntime } from './runtime';

/**
 * Next durable opt-out record for a visitor-initiated opt-out at `actionAt`,
 * or `null` when an opt-out record already exists.
 */
export const nextButtonOptOutRecord = function nextButtonOptOutRecord(
	snapshot: Pick<ConsentSnapshot, 'optOut'>,
	actionAt: number,
	rights: readonly OptOutRight[] = []
): OptOutRecord | null {
	if (snapshot.optOut !== null) {
		return null;
	}
	return {
		heldBy: 'device',
		method: 'button',
		recordedAt: actionAt,
		rights: [...rights],
	};
};

export { optOutLiftBlocker };

/**
 * Whether a live kernel must record a durable GPC opt-out for `snapshot`.
 */
export const gpcOptOutDue = function gpcOptOutDue(
	snapshot: ConsentSnapshot,
	live: boolean
): boolean {
	return (
		live &&
		!snapshot.externalPermissions &&
		!snapshot.policyPending &&
		snapshot.resolution.status === 'matched' &&
		snapshot.privacySignals.gpc.active &&
		snapshot.evaluationPolicy.gpcDenyCategories.length > 0 &&
		snapshot.optOut === null
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
		left.heldBy === right.heldBy &&
		left.method === right.method &&
		left.recordedAt === right.recordedAt &&
		left.rights.length === right.rights.length &&
		left.rights.every((rightName, index) => rightName === right.rights[index])
	);
};

/**
 * Build the transport payload for a local opt-out act (`button` or `gpc`),
 * with one idempotency key and the snapshot's context. Omits `rights` so
 * the backend derives the applicable rights from the visitor's location.
 */
export const buildOptOutPayload = function buildOptOutPayload(
	snapshot: ConsentSnapshot,
	optOut: Readonly<OptOutRecord>,
	actionAt: number,
	uiSource?: SaveUISource
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
		idempotencyKey: createIdempotencyKey(),
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
 * Build the transport payload for an opt-out lift, with one idempotency key
 * and no `rights` so the backend lifts every right the device holds.
 */
export const buildLiftOptOutPayload = function buildLiftOptOutPayload(
	snapshot: ConsentSnapshot,
	subjectId: string,
	actionAt: number,
	uiSource?: SaveUISource
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
	/** Only a lift answer may clear `snapshot.optOut` to `null`. */
	allowClear: boolean;
}

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
	if (incoming === undefined) {
		return false;
	}
	if (incoming === null && !fence.allowClear) {
		return false;
	}
	let next: OptOutRecord | null = null;
	if (incoming !== null) {
		const validated = validateOptOutRecord(incoming);
		if (!validated.ok || validated.record.rights.length === 0) {
			return false;
		}
		next = validated.record;
	}
	const current = runtime.getSnapshot();
	if (
		runtime.getOptOutActVersion() !== fence.actVersion ||
		runtime.getGeneration() !== fence.generation ||
		(current.subject?.subjectId ?? null) !== fence.subjectId
	) {
		return false;
	}
	if (sameOptOutRecord(current.optOut, next)) {
		return false;
	}
	runtime.batch(() => {
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
