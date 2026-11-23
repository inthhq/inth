/**
 * What the rights receipt in "Your Privacy Choices" shows, as a pure read
 * of the snapshot.
 *
 * @packageDocumentation
 */

import type { ConsentSnapshot } from '../consent-kernel.model';
import { resolveOptOutReceipt } from '../libs/opt-out-state.model';
import type { OptOutReceiptData } from '../libs/opt-out-state.model';
import { resolveSaleRight } from './surface-rights.model';
import type { RightOption, RightsSnapshot } from './surface-rights.model';

/** Snapshot fields the receipt reads. */
export type ReceiptSnapshot = RightsSnapshot & Pick<ConsentSnapshot, 'optOut'>;

/** The receipt line under the rights rows (RCPT-01). */
export interface RightsReceipt {
	/**
	 * Something is recorded, or a live GPC signal is honored. A first visit,
	 * or a default the visitor never touched, shows no receipt.
	 */
	readonly show: boolean;
	/**
	 * `'stored'`: the visitor's recorded choice. `'live'`: a GPC signal read
	 * on this visit, which is never shown as a saved date (GPC-06).
	 */
	readonly kind: 'stored' | 'live';
	readonly selected: RightOption;
	/** A kept refusal came from an earlier GPC signal (GPC-05). */
	readonly viaSignal: boolean;
	/**
	 * When the sale right was recorded, in epoch milliseconds. It moves only
	 * when that right changes: a cookie or vendor edit records other
	 * categories and leaves it (RCPT-02).
	 */
	readonly at: number | null;
	/** Whether the choice reaches the visitor's account too (RCPT-04). */
	readonly scope: 'browser' | 'account';
	/** The reference this browser recorded the opt-out under, to copy (CLIP-*). */
	readonly reference: string | null;
}

/**
 * Read the receipt from a snapshot and this browser's local receipt data.
 *
 * A held opt-out dates the receipt with its own record and carries its
 * reference. Any other recorded sale choice dates it with the deciding
 * category's confirmation.
 */
export const resolveRightsReceipt = function resolveRightsReceipt(
	snapshot: ReceiptSnapshot,
	local?: Partial<OptOutReceiptData> | null
): RightsReceipt {
	const sale = resolveSaleRight(snapshot);
	const held = resolveOptOutReceipt(snapshot, local);
	const scope = held.scope === 'account' ? 'account' : 'browser';
	const base = {
		at: null,
		reference: null,
		scope,
		selected: sale.selected,
		viaSignal: sale.viaSignal,
	} as const;
	if (!sale.available || sale.category === null) {
		return { ...base, kind: 'stored', show: false };
	}
	if (sale.source === 'gpc') {
		return { ...base, kind: 'live', show: true };
	}
	if (sale.source !== 'user') {
		return { ...base, kind: 'stored', show: false };
	}
	if (sale.selected === 'protect' && held.optedOut) {
		return {
			...base,
			at: held.at,
			kind: 'stored',
			reference: held.reference,
			show: true,
		};
	}
	const decision = snapshot.explicitChoice?.categories?.[sale.category];
	return {
		...base,
		at: decision?.confirmedAt ?? null,
		kind: 'stored',
		show: true,
	};
};
