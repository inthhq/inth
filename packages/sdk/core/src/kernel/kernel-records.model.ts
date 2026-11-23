/**
 * The records boundary: how stored and server records enter the kernel
 * without creating a choice.
 *
 * - Every record is validated (`record-validation.ts`) against the time it
 *   applies at; one invalid record rejects the whole input.
 * - `hydrate()` replaces records (SSR seeds, storage, a clear with `null`s).
 *   Replacing or clearing the choice or the subject bumps the records
 *   generation, which fences every async read or save started before it.
 * - Server records (a `/v1/consent/init` response, a subject read after `identify()`)
 *   merge newest-wins per category and never remove local standing state,
 *   so a delayed server read cannot overwrite a newer local action.
 * - `identify()` and `set.subjectId` change who the records belong to. When
 *   the backend's link answer carries an effective opt-out, `identify()`
 *   applies it to the snapshot and emits `opt-out:synced`.
 *
 * Clearing (`clear-records.ts`) is `hydrate()` with `null`s followed by
 * `records:cleared`, which the save outbox listens for.
 */
import type { OptOutRecord } from '@inth/sdk-schema/types';

import { EMPTY_OPT_OUT_RECEIPT_DATA } from '../libs/opt-out-state.model';
import type {
	ConsentSnapshot,
	HydrationRecords,
	HydrationResult,
	KernelTransport,
	KernelUser,
} from '../consent-kernel.model';
import { applySyncedOptOut, sameOptOutAnswer } from './kernel-opt-out.model';
import type { SnapshotPatch } from './kernel-patch.model';
import {
	mergeNewestChoice,
	mergeNewestOptOut,
	mergeNewestVendorChoice,
	validateHydrationRecords,
} from './record-validation.model';
import type { ValidatedRecords } from './record-validation.model';
import type { KernelRuntime } from './create-runtime';

/**
 * The patch server records make: the newest receipt per category, the
 * newest notice dismissal and vendor decision, and subject fields filled
 * in without dropping local identifiers.
 */
export const foldServerRecords = function foldServerRecords(
	current: ConsentSnapshot,
	records: ValidatedRecords,
	now: number
): SnapshotPatch {
	const patch: SnapshotPatch = { now };
	if (records.choice !== undefined) {
		patch.explicitChoice = mergeNewestChoice(
			current.explicitChoice,
			records.choice
		);
	}
	if (records.noticeDismissal !== undefined) {
		const local = current.noticeDismissal;
		const incoming = records.noticeDismissal;
		patch.noticeDismissal =
			incoming && (!local || incoming.dismissedAt > local.dismissedAt)
				? incoming
				: local;
	}
	if (records.subject !== undefined) {
		patch.subject = records.subject
			? { ...current.subject, ...records.subject }
			: current.subject;
	}
	if (records.optOut !== undefined) {
		patch.optOut = mergeNewestOptOut(current.optOut, records.optOut);
	}
	if (records.vendorChoice !== undefined) {
		patch.vendorChoice = mergeNewestVendorChoice(
			current.vendorChoice,
			records.vendorChoice
		);
	}
	return patch;
};

/**
 * Update local opt-out receipt metadata after folding a server opt-out record.
 * Preserves local click/GPC metadata only when the server record confirms the
 * same held opt-out; clears it whenever a different server record is adopted.
 *
 * Both checks compare by value and ignore `categories`, which the backend
 * never sends: the fold can clone the winning record to carry the held
 * categories, so neither identity nor the full record says which copy won.
 */
export const syncAdoptedServerOptOutReceipt =
	function syncAdoptedServerOptOutReceipt(
		runtime: KernelRuntime,
		beforeOptOut: Readonly<OptOutRecord> | null,
		incomingOptOut: OptOutRecord | null | undefined,
		foldedOptOut: OptOutRecord | null | undefined,
		fromHydration = false
	): void {
		if (!incomingOptOut) {
			return;
		}
		const rightsConfirmed = incomingOptOut.rights.length > 0;
		if (
			beforeOptOut !== null &&
			sameOptOutAnswer(beforeOptOut, incomingOptOut)
		) {
			if (!rightsConfirmed) {
				return;
			}
			const current = runtime.getOptOutReceiptData();
			if (!current.rightsConfirmed) {
				runtime.setOptOutReceiptData(
					{
						localAct: current.localAct,
						reference: current.reference,
						rightsConfirmed: true,
					},
					fromHydration
				);
			}
			return;
		}
		if (sameOptOutAnswer(foldedOptOut, incomingOptOut)) {
			runtime.setOptOutReceiptData(
				{ localAct: null, reference: null, rightsConfirmed },
				fromHydration
			);
		}
	};

export interface RecordsBoundaryOptions {
	runtime: KernelRuntime;
	transport: KernelTransport | undefined;
	/** Starts the lifecycle; hydration counts as a lifecycle command. */
	start: () => void;
	/** Moves a visitor on a `sub_` id to the UUID a link answered for it. */
	adoptSubject: (from: string, to: string) => Promise<string | null>;
}

export interface RecordsBoundary {
	hydrate: (records: HydrationRecords) => HydrationResult;
	identify: (user: KernelUser) => Promise<void>;
	setSubjectId: (id: string | null) => void;
	/** See {@link InternalKernel.markProvisionalSubject}. */
	markProvisionalSubject: (id: string | null) => void;
	/** See {@link InternalKernel.getProvisionalSubject}. */
	getProvisionalSubject: () => string | null;
	/** A record now carries `id`, so it is no longer provisional. */
	noteRecordedSubject: (id: string | undefined) => void;
}

export const createRecordsBoundary = function createRecordsBoundary({
	adoptSubject,
	runtime,
	transport,
	start,
}: RecordsBoundaryOptions): RecordsBoundary {
	const { getSnapshot, commit, emit } = runtime;
	// Bumped by every `identify()` so a subject read started by an earlier
	// identify cannot apply after a later one.
	let identifyGeneration = 0;
	// An ID Inth generated that no record carries yet. It lives in memory
	// only and is gone on the next page load.
	let provisionalSubjectId: string | null = null;

	const applyHydratedGpcMark = function applyHydratedGpcMark(
		before: ConsentSnapshot,
		hydrated: ValidatedRecords
	): void {
		if (hydrated.optOut === null) {
			runtime.setOptOutGpcReported(false, false);
			return;
		}
		if (hydrated.optOutGpcReported !== undefined) {
			const hasOptOut =
				hydrated.optOut === undefined
					? before.optOut !== null
					: hydrated.optOut !== null;
			runtime.setOptOutGpcReported(
				hydrated.optOutGpcReported && hasOptOut,
				false
			);
			return;
		}
		if (hydrated.optOut !== undefined) {
			runtime.setOptOutGpcReported(false, false);
		}
	};

	const applyHydratedOptOutReceipt = function applyHydratedOptOutReceipt(
		before: ConsentSnapshot,
		hydrated: ValidatedRecords
	): void {
		if (hydrated.optOut === null) {
			runtime.setOptOutReceiptData(EMPTY_OPT_OUT_RECEIPT_DATA, true);
			return;
		}
		if (hydrated.optOut !== undefined) {
			runtime.setOptOutReceiptData(
				{
					localAct: hydrated.optOutLocalAct ?? null,
					reference: hydrated.optOutReference ?? null,
					rightsConfirmed: hydrated.optOutRightsConfirmed === true,
				},
				true
			);
			return;
		}
		const hasReceiptPatch =
			hydrated.optOutLocalAct !== undefined ||
			hydrated.optOutReference !== undefined ||
			hydrated.optOutRightsConfirmed !== undefined;
		if (!hasReceiptPatch) {
			return;
		}
		if (before.optOut === null) {
			runtime.setOptOutReceiptData(EMPTY_OPT_OUT_RECEIPT_DATA, true);
			return;
		}
		const current = runtime.getOptOutReceiptData();
		runtime.setOptOutReceiptData(
			{
				localAct:
					hydrated.optOutLocalAct === undefined
						? current.localAct
						: hydrated.optOutLocalAct,
				reference:
					hydrated.optOutReference === undefined
						? current.reference
						: hydrated.optOutReference,
				rightsConfirmed:
					hydrated.optOutRightsConfirmed === undefined
						? current.rightsConfirmed
						: hydrated.optOutRightsConfirmed,
			},
			true
		);
	};

	const applyRecords = function applyRecords(
		records: HydrationRecords,
		fromServer: boolean
	): HydrationResult {
		const at = records.now ?? runtime.now();
		const validated = validateHydrationRecords(records, at);
		if (validated.ok === false) {
			return validated;
		}
		start();
		const before = getSnapshot();
		let patch: SnapshotPatch;
		let reset = false;
		if (fromServer) {
			patch = foldServerRecords(before, validated.records, at);
			syncAdoptedServerOptOutReceipt(
				runtime,
				before.optOut,
				validated.records.optOut,
				patch.optOut
			);
		} else {
			const {
				choice,
				optOutGpcReported: _gpcMark,
				optOutLocalAct: _localAct,
				optOutReference: _reference,
				optOutRightsConfirmed: _rightsConfirmed,
				...rest
			} = validated.records;
			patch = { ...rest, now: at };
			if (choice !== undefined) {
				patch.explicitChoice = choice;
			}
			reset = choice === null || rest.subject === null;
			if (reset && before.iab) {
				patch.iab = { ...before.iab, authority: null, tcString: null };
			}
			applyHydratedGpcMark(before, validated.records);
			applyHydratedOptOutReceipt(before, validated.records);
		}
		const changed = commit(patch);
		const touchedOptOut =
			validated.records.optOut !== undefined ||
			validated.records.optOutGpcReported !== undefined;
		if (!changed && !fromServer && touchedOptOut) {
			runtime.syncGpcSignal(at);
		}
		const after = getSnapshot();
		if (
			reset ||
			after.explicitChoice !== before.explicitChoice ||
			after.optOut !== before.optOut ||
			after.subject !== before.subject
		) {
			runtime.invalidateRecords();
		}
		return { changed, ok: true };
	};

	const loadSubjectRecord = async function loadSubjectRecord(
		subjectId: string | null,
		identifyAttempt: number
	): Promise<void> {
		if (!transport?.loadSubjectRecord || !subjectId) {
			return;
		}
		// The read is bound to the subject it was requested for and to the
		// records generation at request time. A clear, a newer identify or a
		// subject switch while it was in flight makes the result stale.
		const generation = runtime.getGeneration();
		try {
			const records = await transport.loadSubjectRecord(subjectId);
			const stale =
				identifyAttempt !== identifyGeneration ||
				runtime.getGeneration() !== generation ||
				(getSnapshot().subject?.subjectId ?? null) !== subjectId;
			if (records && !stale) {
				// Newest receipt per category wins: a local refusal made while
				// the server read was in flight is never overwritten.
				const result = applyRecords(records, true);
				if (result.ok === false) {
					emit({
						command: 'loadSubjectRecord',
						error: new Error('inth: server record rejected by validation'),
						type: 'command:error',
					});
				}
			}
		} catch (error) {
			emit({ command: 'loadSubjectRecord', error, type: 'command:error' });
		}
	};

	const linkSubject = async function linkSubject(
		user: KernelUser,
		linkedId: string | null,
		subjectId: string | null,
		attempt: number,
		generation: number,
		optOutActVersion: number
	): Promise<string | null> {
		if (!transport?.identify) {
			return subjectId;
		}
		let linked: Awaited<ReturnType<typeof transport.identify>>;
		try {
			linked = await transport.identify({ ...user }, linkedId);
		} catch (error) {
			emit({ command: 'identify', error, type: 'command:error' });
			throw error;
		}
		let effectiveSubjectId = subjectId;
		if (linkedId && linked?.subjectId && linked.subjectId !== linkedId) {
			const adopted = await adoptSubject(linkedId, linked.subjectId);
			if (adopted !== null) {
				effectiveSubjectId = adopted;
			}
		}
		if (attempt === identifyGeneration && linked?.optOut !== undefined) {
			applySyncedOptOut(runtime, linked.optOut, {
				actVersion: optOutActVersion,
				allowClear: false,
				generation,
				subjectId: effectiveSubjectId,
			});
		}
		return effectiveSubjectId;
	};

	return {
		getProvisionalSubject: () => provisionalSubjectId,

		hydrate: (records) => applyRecords(records, false),

		async identify(user) {
			if (getSnapshot().externalPermissions) {
				return;
			}
			identifyGeneration += 1;
			const attempt = identifyGeneration;
			const generation = runtime.getGeneration();
			const optOutActVersion = runtime.getOptOutActVersion();
			const { subject, iab } = getSnapshot();
			const subjectId = subject?.subjectId ?? null;
			// A provisional ID is gone on the next page load, so linking it
			// would leave the backend one subject per page view. The identity
			// travels with the first save instead, as it does when there is no
			// ID at all. An ID the app, a server or a record supplied links now.
			const linkedId = subjectId === provisionalSubjectId ? null : subjectId;
			const patch: SnapshotPatch = { user: { ...user } };
			if (iab) {
				patch.iab = { ...iab, authority: null, tcString: null };
			}
			runtime.announce(patch, 'user:identified', true);
			const effectiveSubjectId = await linkSubject(
				user,
				linkedId,
				subjectId,
				attempt,
				generation,
				optOutActVersion
			);
			if (
				attempt !== identifyGeneration ||
				runtime.getGeneration() !== generation ||
				(getSnapshot().subject?.subjectId ?? null) !== effectiveSubjectId
			) {
				return;
			}
			await loadSubjectRecord(linkedId, attempt);
		},

		markProvisionalSubject(id) {
			provisionalSubjectId = id;
		},

		noteRecordedSubject(id) {
			if (id !== undefined && id === provisionalSubjectId) {
				provisionalSubjectId = null;
			}
		},

		setSubjectId(id) {
			const { subject, iab } = getSnapshot();
			if ((subject?.subjectId ?? null) === id) {
				return;
			}
			runtime.invalidateRecords();
			const patch: SnapshotPatch = {};
			if (iab) {
				patch.iab = { ...iab, authority: null, tcString: null };
			}
			if (id === null) {
				const { subjectId: _dropped, ...rest } = subject ?? {};
				patch.subject = Object.keys(rest).length > 0 ? rest : null;
			} else {
				patch.subject = { ...subject, subjectId: id };
			}
			commit(patch);
		},
	};
};
