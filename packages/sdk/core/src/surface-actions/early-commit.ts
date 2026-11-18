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
import { createBrowserOutboxStore } from '../kernel/save-outbox/store';
import type { SaveOutboxStore } from '../kernel/save-outbox/store';
import {
	applyNoticeAcknowledgement,
	buildSavePayload,
	choiceAcknowledgement,
	resolveSaveSelection,
	saveAttribution,
	saveSubject,
} from '../kernel/save-plan';
import { deleteCookie, getRawCookieValue, writeCookie } from '../libs/cookie';
import { generateSubjectId } from '../libs/generate-subject-id';
import { resolveStorageKeys } from '../libs/storage-keys';
import type { StorageConfig } from '../modules/persistence/types';
import { createRecordStore } from '../modules/persistence/writer/store';
import type { PersistenceTools } from '../modules/persistence/writer/types';
import { buildStoredEnvelope } from '../modules/persistence/writer/write';
import type {
	ConsentSnapshot,
	HydrationRecords,
	KernelEvent,
	SavePayload,
	SaveUISource,
} from '../types';
import { kernelOnly } from './instant-commit';

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
 * @returns The commit, or `null`.
 * @internal
 */
export const planEarlyCommit = function planEarlyCommit(
	input: EarlyCommitInput
): EarlyCommit | null {
	const before = input.snapshot;
	const now = input.now ?? Date.now();
	const { actionAt } = input;
	if (
		kernelOnly(before) ||
		!Number.isSafeInteger(actionAt) ||
		actionAt < 0 ||
		actionAt > now
	) {
		return null;
	}
	// The stock banner's replay passes its displayed categories, which
	// cover the whole choice scope: the same selection as passing none. An
	// object is recorded as given, as the kernel records it.
	const selection = resolveSaveSelection(before, null, input.choice);
	const recorded = recordCategoryPatch(
		before.explicitChoice,
		selection.values,
		{ actionAt, now, policy: before.evaluationPolicy }
	);
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
		actionAt
	);
	const subjectId =
		before.subject?.subjectId ?? input.subjectId ?? generateSubjectId();
	const subject = saveSubject(before, subjectId);
	const patch: SnapshotPatch = {
		explicitChoice: recorded.choice,
		now,
		subject,
	};
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

const writeTools = {
	deleteCookie,
	keys: resolveStorageKeys,
	rawCookie: getRawCookieValue,
	// The envelope is built from records the kernel's own code validated.
	validateEnvelope: (envelope: unknown) => ({ ok: true, record: envelope }),
	writeCookie,
} as unknown as PersistenceTools;

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
	return (storage.outbox ?? createBrowserOutboxStore()).transact((tx) => {
		const stored = tx.read('saves');
		return tx.write('saves', [
			...(Array.isArray(stored) ? stored : []),
			{ attempts: 0, payload: commit.payload, queuedAt: Date.now() },
		]);
	});
};
