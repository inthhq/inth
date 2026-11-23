/**
 * The records boundary: how stored and server records enter the kernel
 * without creating a choice.
 *
 * - Every record is validated (`record-validation.model.ts`) against the time it
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
 * Clearing (`clear-records.model.ts`) is `hydrate()` with `null`s followed by
 * `records:cleared`, which the save outbox listens for.
 */
import type { OptOutRecord, UserConsent } from '@inth/sdk-schema/types';

import type {
	ConsentSnapshot,
	HydrationRecords,
	HydrationResult,
	KernelTransport,
	KernelUser,
} from '../consent-kernel.model';
import { isProductionBuild } from '../libs/is-production';
import { EMPTY_OPT_OUT_RECEIPT_DATA } from '../libs/opt-out-state.model';
import {
	applyLiftFloorToIncoming,
	normalizeUserConsent,
	shouldAdoptAccountLayer,
} from './account-layer';
import type {
	AccountConsentLayer,
	BrowserConsentRecords,
} from './account-layer';
import type { KernelRuntime, RuntimeCommitOptions } from './create-runtime';
import {
	answerOwnedBy,
	applySyncedOptOut,
	sameOptOutAnswer,
	sameOptOutRecord,
} from './kernel-opt-out.model';
import type { SnapshotPatch } from './kernel-patch.model';
import {
	mergeNewestChoice,
	mergeNewestOptOut,
	mergeNewestVendorChoice,
	validateHydrationRecords,
} from './record-validation.model';
import type { ValidatedRecords } from './record-validation.model';

/**
 * The patch server records make: the newest receipt per category, the
 * newest notice dismissal and vendor decision, and subject fields filled
 * in without dropping local identifiers. Reads browser records only; when
 * an account layer is active, splits the server opt-out into person and
 * device parts.
 */
export const foldServerRecords = function foldServerRecords(
	current: ConsentSnapshot,
	records: ValidatedRecords,
	now: number,
	browser: BrowserConsentRecords = {
		choice: current.explicitChoice,
		optOut: current.optOut,
		vendorChoice: current.vendorChoice,
	},
	activeAccount: AccountConsentLayer | null = null
): { patch: SnapshotPatch; nextAccount?: AccountConsentLayer } {
	const patch: SnapshotPatch = { now };
	if (records.choice !== undefined) {
		patch.explicitChoice = mergeNewestChoice(browser.choice, records.choice);
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
		if (activeAccount === null) {
			patch.optOut = mergeNewestOptOut(browser.optOut, records.optOut);
		} else if (records.optOut !== null && records.optOut.heldBy === 'device') {
			// While an account layer for the current `externalId` is active,
			// server opt-out answers with `heldBy` `'person'` or `'both'`
			// never write to browser records or mutate the account layer.
			const browserDeviceOptOut =
				browser.optOut?.heldBy === 'person' ? null : browser.optOut;
			patch.optOut = mergeNewestOptOut(browserDeviceOptOut, records.optOut);
		}
	}
	if (records.vendorChoice !== undefined) {
		patch.vendorChoice = mergeNewestVendorChoice(
			browser.vendorChoice,
			records.vendorChoice
		);
	}
	return { patch };
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
		const coversBrowserDevice =
			beforeOptOut !== null &&
			beforeOptOut.heldBy === 'device' &&
			incomingOptOut.heldBy === 'both' &&
			beforeOptOut.rights.every((right) =>
				incomingOptOut.rights.includes(right)
			);
		if (
			beforeOptOut !== null &&
			(sameOptOutAnswer(beforeOptOut, incomingOptOut) || coversBrowserDevice)
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
	/**
	 * Moves a visitor on a `sub_` id to the UUID a link answered for it,
	 * while `owned` holds (see `SaveOutbox.adoptSubject`).
	 */
	adoptSubject: (
		from: string,
		to: string,
		owned?: () => boolean
	) => Promise<string | null>;
}

export interface SyncUserConsentOptions {
	/** Atomically release `userConsentPending` in the same commit. */
	clearPending?: boolean;
	/**
	 * Allow re-normalizing an equal-`checkedAt` identical document against the
	 * browser clock (used when client `start()` re-syncs an SSR-seeded doc).
	 */
	forceClientSync?: boolean;
}

export interface RecordsBoundary {
	hydrate: (records: HydrationRecords) => HydrationResult;
	identify: (user: KernelUser) => Promise<void>;
	/** See {@link InternalKernel.clearIdentity}. */
	clearIdentity: () => void;
	syncUserConsent: (
		value: UserConsent | null | undefined,
		options?: SyncUserConsentOptions
	) => boolean;
	/** Atomically switch user and optionally apply pending/resolved userConsent. */
	setUserAtomic: (
		user: KernelUser | null,
		options?:
			| boolean
			| {
					readonly pending?: boolean;
					readonly userConsent?: UserConsent | null;
			  }
	) => void;
	setSubjectId: (id: string | null) => void;
	/** See {@link InternalKernel.markProvisionalSubject}. */
	markProvisionalSubject: (id: string | null) => void;
	/** See {@link InternalKernel.getProvisionalSubject}. */
	getProvisionalSubject: () => string | null;
	/** A record now carries `id`, so it is no longer provisional. */
	noteRecordedSubject: (id: string | undefined) => void;
	/** Whether `subjectId` was proven linked to `externalId` in this session. */
	isSubjectLinked: (subjectId: string | null, externalId: string) => boolean;
	/** Record a proven link between `subjectId` and `externalId` in this session. */
	markSubjectLinked: (subjectId: string, externalId: string) => void;
}

export const createRecordsBoundary = function createRecordsBoundary({
	adoptSubject,
	runtime,
	transport,
	start,
}: RecordsBoundaryOptions): RecordsBoundary {
	const { getSnapshot, commit, emit } = runtime;
	// Bumped by every `identify()` (`runtime.noteIdentify()`) so a subject
	// read started by an earlier identify cannot apply after a later one.
	const identifyGeneration = runtime.getIdentityVersion;
	// An ID Inth generated that no record carries yet. It lives in memory
	// only and is gone on the next page load.
	let provisionalSubjectId: string | null = null;
	// Proven (subjectId -> externalId) links established with an identityToken
	// in this session, cleared when records or subject are reset.
	const verifiedLinks = new Map<string, string>();

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

	const buildHydrationCommit = function buildHydrationCommit(
		before: ConsentSnapshot,
		browserBefore: BrowserConsentRecords,
		validated: ValidatedRecords,
		at: number
	): {
		patch: SnapshotPatch;
		commitOptions?: RuntimeCommitOptions;
		reset: boolean;
	} {
		const {
			accountLayer: incomingAccountLayer,
			choice,
			optOutGpcReported: _gpcMark,
			optOutLocalAct: _localAct,
			optOutReference: _reference,
			optOutRightsConfirmed: _rightsConfirmed,
			vendorDeclared,
			...rest
		} = validated;
		const patch: SnapshotPatch = { ...rest, now: at };
		if (choice !== undefined) {
			patch.explicitChoice = choice;
		}
		let commitOptions: RuntimeCommitOptions | undefined;
		if (incomingAccountLayer === null) {
			commitOptions = { accountLayer: null, fromHydration: true };
		} else if (
			incomingAccountLayer !== undefined &&
			shouldAdoptAccountLayer({
				current: runtime.getAccountLayer(),
				currentSource: runtime.getAccountLayerSource(),
				incoming: incomingAccountLayer,
				incomingSource: 'stored',
				userExternalId: before.user?.externalId ?? null,
			})
		) {
			commitOptions = {
				accountLayer: applyLiftFloorToIncoming(
					runtime.getAccountLayer(),
					incomingAccountLayer
				),
				accountLayerSource: 'stored',
				fromHydration: true,
			};
		}
		if (vendorDeclared !== undefined) {
			commitOptions = { ...commitOptions, vendorDeclared };
		}
		const reset = choice === null || rest.subject === null;
		if (reset) {
			verifiedLinks.clear();
		}
		if (reset && before.iab) {
			patch.iab = { ...before.iab, authority: null, tcString: null };
		}
		applyHydratedGpcMark(
			{ ...before, optOut: browserBefore.optOut },
			validated
		);
		applyHydratedOptOutReceipt(
			{ ...before, optOut: browserBefore.optOut },
			validated
		);
		return { commitOptions, patch, reset };
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
		const browserBefore = runtime.getBrowserRecords();
		const accountBefore = runtime.getAccountLayer();
		const activeAccount =
			accountBefore !== null &&
			before.user !== null &&
			accountBefore.externalId === before.user.externalId
				? accountBefore
				: null;
		let patch: SnapshotPatch;
		let commitOptions: RuntimeCommitOptions | undefined;
		let reset = false;
		if (fromServer) {
			const folded = foldServerRecords(
				before,
				validated.records,
				at,
				browserBefore,
				activeAccount
			);
			({ patch } = folded);
			if (folded.nextAccount !== undefined) {
				commitOptions = { accountLayer: folded.nextAccount };
			}
			syncAdoptedServerOptOutReceipt(
				runtime,
				browserBefore.optOut,
				validated.records.optOut,
				patch.optOut
			);
		} else {
			({ commitOptions, patch, reset } = buildHydrationCommit(
				before,
				browserBefore,
				validated.records,
				at
			));
		}
		const changed = commit(patch, commitOptions);
		const touchedOptOut =
			validated.records.optOut !== undefined ||
			validated.records.optOutGpcReported !== undefined;
		if (!changed && !fromServer && touchedOptOut) {
			runtime.syncGpcSignal(at);
		}
		const after = getSnapshot();
		const browserAfter = runtime.getBrowserRecords();
		if (
			reset ||
			browserAfter.choice !== browserBefore.choice ||
			browserAfter.optOut !== browserBefore.optOut ||
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
				identifyAttempt !== identifyGeneration() ||
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
		// A link answer is the account's that asked: after another
		// `identify()` or a sign-out it moves no subject and no opt-out.
		if (attempt !== identifyGeneration()) {
			return effectiveSubjectId;
		}
		if (linkedId && linked?.subjectId && linked.subjectId !== linkedId) {
			// Checked again inside the storage transaction and just before
			// the subject is committed: the account can change while the
			// move waits for storage.
			const adopted = await adoptSubject(linkedId, linked.subjectId, () =>
				answerOwnedBy(runtime, user, attempt)
			);
			if (adopted !== null) {
				effectiveSubjectId = adopted;
			}
		}
		if (
			user.identityToken &&
			linkedId !== null &&
			effectiveSubjectId !== null
		) {
			verifiedLinks.set(effectiveSubjectId, user.externalId);
		}
		if (attempt === identifyGeneration() && linked?.optOut !== undefined) {
			applySyncedOptOut(runtime, linked.optOut, {
				actVersion: optOutActVersion,
				allowClear: false,
				externalId: user.externalId,
				generation,
				subjectId: effectiveSubjectId,
			});
		}
		return effectiveSubjectId;
	};

	const clearPendingIfRequested = function clearPendingIfRequested(
		before: ConsentSnapshot,
		at: number,
		clearPending: boolean
	): void {
		if (clearPending && before.userConsentPending) {
			commit({ now: at, userConsentPending: false }, { preserveDialog: true });
		}
	};

	const validateIncomingUserConsent = function validateIncomingUserConsent(
		before: ConsentSnapshot,
		value: UserConsent,
		at: number,
		options?: SyncUserConsentOptions
	): AccountConsentLayer | null {
		const { user } = before;
		if (!user || !user.externalId) {
			if (!isProductionBuild()) {
				console.warn(
					'[inth] Ignoring userConsent because no user with an externalId is set.'
				);
			}
			return null;
		}
		const normalized = normalizeUserConsent(value, at);
		if (!normalized) {
			if (!isProductionBuild()) {
				console.warn('[inth] Ignoring malformed userConsent document.');
			}
			return null;
		}
		if (normalized.externalId !== user.externalId) {
			if (!isProductionBuild()) {
				console.warn(
					'[inth] Ignoring userConsent because user.externalId does not match userConsent.sync.externalId.'
				);
			}
			return null;
		}
		const currentAccount = runtime.getAccountLayer();
		if (
			!shouldAdoptAccountLayer({
				current: currentAccount,
				currentSource: runtime.getAccountLayerSource(),
				forceClientSync: options?.forceClientSync,
				incoming: normalized,
				incomingSource: 'incoming',
				userExternalId: user.externalId,
			})
		) {
			return null;
		}
		return applyLiftFloorToIncoming(currentAccount, normalized);
	};

	const syncUserConsent = function syncUserConsent(
		value: UserConsent | null | undefined,
		options?: SyncUserConsentOptions
	): boolean {
		const clearPending = options?.clearPending === true;
		const before = getSnapshot();
		const at = runtime.now();
		if (value === undefined || before.externalPermissions) {
			clearPendingIfRequested(before, at, clearPending);
			return false;
		}
		if (value === null) {
			const hadAccount = runtime.getAccountLayer() !== null;
			const patch: SnapshotPatch = { now: at };
			if (clearPending) {
				patch.userConsentPending = false;
			}
			let changed = false;
			runtime.batch(() => {
				if (!hadAccount) {
					runtime.bumpAccountSyncGeneration();
				}
				changed = commit(patch, {
					accountLayer: null,
					forceAccountNotify: true,
					preserveDialog: true,
				});
				const after = getSnapshot();
				if (hadAccount && !sameOptOutRecord(before.optOut, after.optOut)) {
					emit({
						optOut: after.optOut,
						snapshot: after,
						type: 'opt-out:synced',
					});
				}
			});
			return changed;
		}

		const normalized = validateIncomingUserConsent(before, value, at, options);
		if (!normalized) {
			clearPendingIfRequested(before, at, clearPending);
			return false;
		}

		const patch: SnapshotPatch = { now: at };
		if (clearPending) {
			patch.userConsentPending = false;
		}
		let changed = false;
		runtime.batch(() => {
			changed = commit(patch, {
				accountLayer: normalized,
				accountLayerSource: 'incoming',
				preserveDialog: true,
			});
			const after = getSnapshot();
			if (!sameOptOutRecord(before.optOut, after.optOut)) {
				emit({
					optOut: after.optOut,
					snapshot: after,
					type: 'opt-out:synced',
				});
			}
		});
		return changed;
	};

	return {
		clearIdentity() {
			if (getSnapshot().externalPermissions) {
				return;
			}
			// Synchronous, before anything can answer: a request started for
			// the account signing out (a lift, a link, a subject read) checks
			// this generation and no longer applies.
			runtime.noteIdentify();
			const { user, iab } = getSnapshot();
			if (!user) {
				return;
			}
			const patch: SnapshotPatch = { user: null };
			if (iab) {
				patch.iab = { ...iab, authority: null, tcString: null };
			}
			commit(patch);
		},

		getProvisionalSubject: () => provisionalSubjectId,

		hydrate: (records) => applyRecords(records, false),

		async identify(user) {
			if (getSnapshot().externalPermissions) {
				return;
			}
			const attempt = runtime.noteIdentify();
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
				attempt !== identifyGeneration() ||
				runtime.getGeneration() !== generation ||
				(getSnapshot().subject?.subjectId ?? null) !== effectiveSubjectId
			) {
				return;
			}
			await loadSubjectRecord(linkedId, attempt);
		},

		isSubjectLinked(subjectId, externalId) {
			return subjectId !== null && verifiedLinks.get(subjectId) === externalId;
		},

		markProvisionalSubject(id) {
			provisionalSubjectId = id;
		},

		markSubjectLinked(subjectId, externalId) {
			verifiedLinks.set(subjectId, externalId);
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
			verifiedLinks.clear();
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

		setUserAtomic(user, options) {
			const before = getSnapshot();
			const at = runtime.now();
			const nextUser = user ? { ...user } : null;
			const resolvedOptions =
				typeof options === 'boolean' ? { pending: options } : options;
			const patch: SnapshotPatch = { now: at, user: nextUser };
			let commitOptions: RuntimeCommitOptions | undefined;

			if (resolvedOptions?.userConsent === null) {
				patch.userConsentPending = false;
				commitOptions = {
					accountLayer: null,
					forceAccountNotify: true,
					preserveDialog: true,
				};
			} else if (resolvedOptions?.userConsent !== undefined) {
				patch.userConsentPending = false;
				const incoming = normalizeUserConsent(resolvedOptions.userConsent, at);
				if (
					incoming !== null &&
					nextUser !== null &&
					incoming.externalId === nextUser.externalId
				) {
					commitOptions = {
						accountLayer: incoming,
						accountLayerSource: 'incoming',
						preserveDialog: true,
					};
				}
			} else if (resolvedOptions?.pending !== undefined) {
				patch.userConsentPending = resolvedOptions.pending;
			}

			runtime.batch(() => {
				commit(patch, commitOptions);
				const after = getSnapshot();
				if (
					resolvedOptions?.userConsent !== undefined &&
					!sameOptOutRecord(before.optOut, after.optOut)
				) {
					emit({
						optOut: after.optOut,
						snapshot: after,
						type: 'opt-out:synced',
					});
				}
			});
		},

		syncUserConsent,
	};
};
