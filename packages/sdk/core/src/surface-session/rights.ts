/**
 * Rights decisions for consent surfaces, as pure functions over a snapshot.
 *
 * The kernel already owns what an opt-out is, when one is held, when GPC
 * locks it and when a save would lift it (`libs/opt-out-state.ts`,
 * `consent-record/opt-out-rules.ts`). These functions read those rules and
 * answer the questions a surface asks before it calls a command: what the
 * sale control shows, what pressing one of its options does, and what a
 * banner's Allow, Don't allow or Save records.
 *
 * There is no sensitive-information right in the schema yet, so only the
 * sale right (sale, sharing and targeted advertising) is decided here.
 *
 * @packageDocumentation
 */

import { optOutDecidingCategory } from '../consent-record/types';
import type { OptionalConsentCategory } from '../consent-record/types';
import type { AllConsentNames } from '../consent/consent-types';
import { resolveOptOutState } from '../libs/opt-out-state';
import type { ConsentSnapshot } from '../types';

/** Snapshot fields the rights decisions read. */
export type RightsSnapshot = Pick<
	ConsentSnapshot,
	| 'effectivePermissions'
	| 'evaluationPolicy'
	| 'explicitChoice'
	| 'optOut'
	| 'privacySignals'
	| 'restrictions'
>;

/** Which option of a two-option rights control. The protective one comes first (RIGHT-01). */
export type RightOption = 'protect' | 'allow';

/**
 * Where the shown value came from (§9): the regime's default, the
 * visitor's own choice, or a live Global Privacy Control signal. Copy such
 * as "Off by default" appears only for `'default'`.
 */
export type RightSource = 'default' | 'user' | 'gpc';

/** What the sale control shows. */
export interface SaleRightState {
	/** The policy has a category that decides sale and sharing. */
	readonly available: boolean;
	/** That category, or `null`. */
	readonly category: OptionalConsentCategory | null;
	readonly selected: RightOption;
	readonly source: RightSource;
	/** A live GPC signal holds the opt-out; "Allow" is unavailable (GPC-03). */
	readonly locked: boolean;
	/**
	 * The held opt-out came from a GPC signal, live or past. A past one is a
	 * recorded choice the visitor can lift (GPC-05).
	 */
	readonly viaSignal: boolean;
}

const hasGpcRestriction = (
	snapshot: RightsSnapshot,
	category: OptionalConsentCategory
): boolean => snapshot.restrictions[category]?.includes('gpc') === true;

/**
 * Read what the sale control shows from a snapshot.
 *
 * Under an opt-out policy a held opt-out record is the visitor's refusal,
 * locked while a live GPC signal maintains it. Elsewhere the deciding
 * category's recorded choice is the visitor's, and without one the regime's
 * default shows.
 */
export const resolveSaleRight = function resolveSaleRight(
	snapshot: RightsSnapshot
): SaleRightState {
	const category = optOutDecidingCategory(snapshot.evaluationPolicy);
	const available =
		category !== null &&
		snapshot.evaluationPolicy.choiceScope.includes(category);
	const optOut = resolveOptOutState(snapshot);
	if (optOut.available && optOut.honored) {
		const locked = optOut.lock === 'gpc-active';
		return {
			available,
			category,
			locked,
			selected: 'protect',
			source: locked ? 'gpc' : 'user',
			viaSignal: optOut.via === 'signal' || snapshot.optOut?.method === 'gpc',
		};
	}
	if (category === null) {
		return {
			available,
			category,
			locked: false,
			selected: 'protect',
			source: 'default',
			viaSignal: false,
		};
	}
	if (hasGpcRestriction(snapshot, category)) {
		return {
			available,
			category,
			locked: true,
			selected: 'protect',
			source: 'gpc',
			viaSignal: true,
		};
	}
	const recorded = snapshot.explicitChoice?.categories?.[category]?.value;
	if (typeof recorded === 'boolean') {
		return {
			available,
			category,
			locked: false,
			selected: recorded ? 'allow' : 'protect',
			source: 'user',
			viaSignal: false,
		};
	}
	return {
		available,
		category,
		locked: false,
		selected:
			snapshot.effectivePermissions[category] === true ? 'allow' : 'protect',
		source: 'default',
		viaSignal: false,
	};
};

/**
 * What pressing one option of the sale control does:
 *
 * - `'apply-protect'`: record the refusal now, in one action (LAW-02).
 * - `'apply-allow'`: record the grant now. Only from an untouched default
 *   under an opt-out policy, where allowing is the default already.
 * - `'confirm'`: open the confirmation; nothing is recorded until the
 *   visitor confirms (LAW-02).
 * - `'nudge'`: the confirmation is open; shake it, move focus to its
 *   cancel button and say "Choose one of the two buttons first." Nothing
 *   applies (RIGHT-04).
 * - `'close-confirmation'`: the selected option was pressed again while the
 *   confirmation was open (RIGHT-03).
 * - `'record-default'`: the selected option was pressed while it shows a
 *   default; record it as the visitor's own choice (RIGHT-03).
 * - `'none'`: nothing to do, such as "Allow" while GPC locks it (GPC-03).
 */
export type RightPressOutcome =
	| 'apply-protect'
	| 'apply-allow'
	| 'confirm'
	| 'nudge'
	| 'close-confirmation'
	| 'record-default'
	| 'none';

/** Input for {@link resolveRightPress}. */
export interface RightPressInput {
	readonly right: Pick<SaleRightState, 'locked' | 'selected' | 'source'>;
	readonly option: RightOption;
	/** The confirmation for this right is open. */
	readonly confirmationOpen: boolean;
	/** The policy model. Under opt-in every grant takes the confirmation. */
	readonly model: ConsentSnapshot['evaluationPolicy']['model'];
}

/** Decide what pressing `option` on the sale control does. */
export const resolveRightPress = function resolveRightPress(
	input: RightPressInput
): RightPressOutcome {
	const { confirmationOpen, model, option, right } = input;
	if (option === 'allow' && right.locked) {
		return 'none';
	}
	if (option === 'allow' && confirmationOpen) {
		return 'nudge';
	}
	if (option === right.selected) {
		if (confirmationOpen) {
			return 'close-confirmation';
		}
		return right.source === 'default' ? 'record-default' : 'none';
	}
	if (option === 'protect') {
		return 'apply-protect';
	}
	return right.source === 'user' || model === 'opt-in'
		? 'confirm'
		: 'apply-allow';
};

/** A banner's commit buttons. `'save'` is an expanded panel's or an all-in-one drawer's own Save. */
export type BannerCommitAction = 'allow' | 'refuse' | 'save';

/** Why sale and sharing stayed off on a banner Allow. */
export type BannerKeptOff = 'gpc' | 'opt-out';

/** What a banner commit records. */
export interface BannerCommitPlan {
	/**
	 * `'all'` grants every category in `categories`; `'none'` refuses every
	 * category; `'draft'` saves the visitor's switches narrowed to
	 * `categories`.
	 */
	readonly input: 'all' | 'none' | 'draft';
	/**
	 * The categories the save may record. `undefined` means the whole
	 * choice scope. Sale's deciding category is left out when it stays off.
	 */
	readonly categories: readonly AllConsentNames[] | undefined;
	/** Sale and sharing stayed off, and why; `null` when the commit decided them. */
	readonly keptOff: BannerKeptOff | null;
	/**
	 * The sale right changed, so the receipt's time moves (RCPT-02). A
	 * commit that leaves an earlier refusal in place keeps its date.
	 */
	readonly rightChanged: boolean;
}

/**
 * Decide what a banner commit records (§3.6, PERM-02):
 *
 * - A refusal always applies, in one action, and refuses every category.
 *   Under a live GPC lock sale is off already, and the date stays.
 * - Allow grants the optional categories, but sets sale and sharing only
 *   while they show an untouched default. A live GPC lock and a recorded
 *   refusal stay in place; the visitor lifts a refusal through the
 *   confirmation in Your Privacy Choices (LAW-02).
 * - Save records the visitor's switches, with the same protection: it
 *   never lifts a held opt-out.
 */
export const resolveBannerCommit = function resolveBannerCommit(
	snapshot: RightsSnapshot,
	action: BannerCommitAction
): BannerCommitPlan {
	const sale = resolveSaleRight(snapshot);
	const scope = snapshot.evaluationPolicy.choiceScope;
	if (action === 'refuse') {
		return {
			categories: undefined,
			input: 'none',
			keptOff: null,
			rightChanged:
				sale.available && !sale.locked && sale.selected !== 'protect',
		};
	}
	let keptOff: BannerKeptOff | null = null;
	if (sale.available && sale.selected === 'protect') {
		if (sale.locked) {
			keptOff = 'gpc';
		} else if (sale.source === 'user') {
			keptOff = 'opt-out';
		}
	}
	// A save that grants the deciding category would lift a held opt-out
	// (11 CCR §7028(a) needs the two-step path for that), so leave out
	// every category the opt-out holds off. A live GPC signal holds its
	// categories off whatever is saved; recording a grant for them would
	// misstate the choice.
	const held = resolveOptOutState(snapshot);
	const withheld = new Set<AllConsentNames>(
		scope.filter((category) => hasGpcRestriction(snapshot, category))
	);
	if (keptOff !== null && sale.category !== null) {
		withheld.add(sale.category);
		if (held.honored) {
			for (const category of held.categories) {
				withheld.add(category);
			}
		}
	}
	const categories =
		withheld.size > 0
			? scope.filter((category) => !withheld.has(category))
			: undefined;
	return {
		categories,
		input: action === 'allow' ? 'all' : 'draft',
		keptOff,
		rightChanged:
			keptOff === null &&
			sale.available &&
			(sale.selected !== 'allow' || sale.source === 'default') &&
			(action === 'allow' || sale.source === 'default'),
	};
};
