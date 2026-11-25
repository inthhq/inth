/**
 * The one supersession rule of the save outbox: which part of a save newer
 * state already covers. Loaded with the kernel; the stored queue's code
 * loads on demand (`queue.ts`).
 */

import type { SavePayload } from '../../consent-kernel.model';
import { OPTIONAL_CONSENT_CATEGORIES } from '../../consent-record/types';
import type { OptionalConsentCategory } from '../../consent-record/types';
import { DENIED_CONSENTS } from '../../consent/consent-types';
import type { BrowserConsentRecords } from '../account-layer';

/** A save waiting for a replay. */
export interface PendingSaveEntry {
	payload: SavePayload;
	queuedAt: number;
	attempts: number;
	/**
	 * Its place in the queue, numbered when it was added to the stored list
	 * under the store's lock, so in the order saves were queued across tabs.
	 * Absent on an entry an older release queued; those come first.
	 */
	seq?: number;
}

/**
 * What newer state covers of an older save: the categories and the vendors
 * decided again since.
 */
export interface Supersession {
	category: (category: OptionalConsentCategory) => boolean;
	vendor: (id: string) => boolean;
}

/**
 * The part of a save nothing newer covers, or `null` when nothing is left.
 *
 * Surviving categories keep their receipts and action time, so a replay
 * records when the visitor decided. A narrowed save is a `custom` action
 * and cannot replay the full TC string. The vendor map is a decision of
 * its own: narrowing the categories says nothing about it. It keeps the
 * vendors nothing newer decided, since a save under an account layer sends
 * only the vendors it decided, and goes once none is left, taking with it
 * a save that has no category left.
 *
 * Every caller that asks "is this save superseded?" asks it here: the
 * outbox for a send in flight ({@link liveSupersession}) and the queue for
 * stored entries.
 */
export const withoutSuperseded = function withoutSuperseded(
	payload: SavePayload,
	by: Supersession
): SavePayload | null {
	const keys = OPTIONAL_CONSENT_CATEGORIES.filter((category) =>
		Object.hasOwn(payload.confirmed.categories, category)
	);
	const kept = keys.filter((category) => !by.category(category));
	let selected = payload;
	// Every category decided again can still leave vendors nothing newer
	// decided, so the vendor map is narrowed before the save can go.
	const categoriesGone = kept.length === 0 && keys.length > 0;
	if (kept.length < keys.length) {
		const categories: Partial<Record<OptionalConsentCategory, boolean>> = {};
		const receipts: SavePayload['choice']['categories'] = {};
		const consents = { ...DENIED_CONSENTS };
		for (const category of kept) {
			const receipt = payload.choice.categories[category];
			if (receipt) {
				categories[category] = receipt.value;
				receipts[category] = receipt;
				consents[category] = payload.consents[category];
			}
		}
		// A narrowed save no longer matches the TC string, so neither it nor
		// the AC string beside it goes with the replay.
		const { addtlConsent: _addtlConsent, ...rest } = payload;
		selected = {
			...rest,
			choice: { categories: receipts, version: 3 },
			confirmed: { ...payload.confirmed, categories },
			consentAction: 'custom',
			consents,
			tcString: null,
		};
	}
	const { vendorChoice, ...remaining } = selected;
	if (vendorChoice === undefined) {
		return categoriesGone ? null : selected;
	}
	const ids = Object.keys(vendorChoice.grants);
	const keptIds = ids.filter((id) => !by.vendor(id));
	if (keptIds.length === ids.length) {
		return categoriesGone && ids.length === 0 ? null : selected;
	}
	if (keptIds.length > 0) {
		const grants = Object.fromEntries(
			keptIds.map((id) => [id, vendorChoice.grants[id] === true])
		);
		return { ...remaining, vendorChoice: { ...vendorChoice, grants } };
	}
	return Object.keys(remaining.confirmed.categories).length > 0
		? remaining
		: null;
};

/**
 * What the live browser records cover of a save sent from `action`, the
 * browser records the save committed: every category whose browser receipt
 * changed since, and, once another browser vendor map replaced it, every
 * vendor whose browser time changed. Without per-vendor times on both
 * sides, the new map covers every vendor.
 *
 * Compares browser records rather than merged snapshots so an account
 * layer sync or sign-out never supersedes an in-flight browser save.
 */
export const liveSupersession = function liveSupersession(
	action: Pick<
		BrowserConsentRecords,
		'choice' | 'vendorChoice' | 'vendorTimes'
	>,
	current: Pick<
		BrowserConsentRecords,
		'choice' | 'vendorChoice' | 'vendorTimes'
	>
): Supersession {
	const before = action.vendorTimes;
	const after = current.vendorTimes;
	return {
		category: (category) =>
			current.choice?.categories[category] !==
			action.choice?.categories[category],
		vendor: (id) =>
			current.vendorChoice !== action.vendorChoice &&
			(!before || !after || before[id] !== after[id]),
	};
};

/**
 * The same save under another subject id. Keys keep their positions, so a
 * queued entry moved by a reassignment still serializes identically to one
 * rebuilt from the original payload.
 */
export const withSubjectId = function withSubjectId(
	payload: SavePayload,
	subjectId: string
): SavePayload {
	return {
		...payload,
		subject: { ...payload.subject, subjectId },
		subjectId,
	};
};
