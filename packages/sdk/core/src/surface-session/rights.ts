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

import { decisionAuthority } from '../consent-record/decision-authority';
import { optOutDecidingCategory } from '../consent-record/types';
import type { OptionalConsentCategory } from '../consent-record/types';
import type { AllConsentNames } from '../consent/consent-types';
import { resolveOptOutState } from '../libs/opt-out-state';
import type { OptOutLock } from '../libs/opt-out-state';
import type { ConsentSnapshot } from '../types';

/** Snapshot fields the rights decisions read. */
export type RightsSnapshot = Pick<
	ConsentSnapshot,
	| 'effectivePermissions'
	| 'evaluatedAt'
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
	/**
	 * Why this browser cannot allow sale right now: a live GPC signal
	 * (GPC-03), or an opt-out the visitor's account holds. `null` when
	 * nothing locks it.
	 */
	readonly lock: OptOutLock | null;
	/** Something locks the refusal, so "Allow" is unavailable. */
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
 * The visitor's recorded value for `category`, when it still decides what
 * runs. A refusal is durable and never ages. A grant counts only while it
 * is valid under the current policy and the kernel permits the category:
 * an expired grant no longer runs anything, so the control shows the
 * regime's default again.
 */
const recordedValue = function recordedValue(
	snapshot: RightsSnapshot,
	category: OptionalConsentCategory
): boolean | undefined {
	const decision = snapshot.explicitChoice?.categories?.[category];
	if (!decision) {
		return undefined;
	}
	if (!decision.value) {
		return false;
	}
	const { authority } = decisionAuthority(
		decision,
		snapshot.evaluationPolicy,
		snapshot.evaluatedAt
	);
	return authority === 'valid' &&
		snapshot.effectivePermissions[category] === true
		? true
		: undefined;
};

/**
 * Read what the sale control shows from a snapshot.
 *
 * A held opt-out record is the visitor's refusal under an opt-out policy,
 * and under any policy while something locks it: a live GPC signal, or the
 * visitor's account. Elsewhere the deciding category's recorded choice is
 * the visitor's while it still decides what runs, and otherwise the
 * regime's default shows.
 */
export const resolveSaleRight = function resolveSaleRight(
	snapshot: RightsSnapshot
): SaleRightState {
	const category = optOutDecidingCategory(snapshot.evaluationPolicy);
	const available =
		category !== null &&
		snapshot.evaluationPolicy.choiceScope.includes(category);
	const optOut = resolveOptOutState(snapshot);
	if (optOut.honored && (optOut.available || optOut.lock !== null)) {
		const { lock } = optOut;
		return {
			available,
			category,
			lock,
			locked: lock !== null,
			selected: 'protect',
			source: lock === 'gpc-active' ? 'gpc' : 'user',
			viaSignal: optOut.via === 'signal' || snapshot.optOut?.method === 'gpc',
		};
	}
	if (category === null) {
		return {
			available,
			category,
			lock: null,
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
			lock: 'gpc-active',
			locked: true,
			selected: 'protect',
			source: 'gpc',
			viaSignal: true,
		};
	}
	const recorded = recordedValue(snapshot, category);
	if (recorded !== undefined) {
		return {
			available,
			category,
			lock: null,
			locked: false,
			selected: recorded ? 'allow' : 'protect',
			source: 'user',
			viaSignal: false,
		};
	}
	return {
		available,
		category,
		lock: null,
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

/** What the expanded panel's switches show, for a `'save'`. */
export interface BannerCommitDraft {
	/**
	 * The value the draft shows for sale's deciding category. Omitted, the
	 * save is taken to leave sale as it shows.
	 */
	readonly sale?: boolean;
}

const saleOption = (value: boolean): RightOption =>
	value ? 'allow' : 'protect';

/** Why a non-refusing commit leaves sale off, or `null` when it decides sale. */
const keptOffFor = function keptOffFor(
	sale: SaleRightState
): BannerKeptOff | null {
	if (!sale.available || sale.selected !== 'protect') {
		return null;
	}
	if (sale.lock === 'gpc-active') {
		return 'gpc';
	}
	return sale.locked || sale.source === 'user' ? 'opt-out' : null;
};

/**
 * The categories a non-refusing commit may record, or `undefined` for the
 * whole choice scope.
 *
 * A save that grants the deciding category would lift a held opt-out
 * (11 CCR §7028(a) needs the two-step path for that), so it leaves out
 * every category the opt-out holds off. A live GPC signal holds its
 * categories off whatever is saved; recording a grant for them would
 * misstate the choice.
 */
const commitCategories = function commitCategories(
	snapshot: RightsSnapshot,
	sale: SaleRightState,
	keptOff: BannerKeptOff | null
): AllConsentNames[] | undefined {
	const scope = snapshot.evaluationPolicy.choiceScope;
	const withheld = new Set<AllConsentNames>(
		scope.filter((category) => hasGpcRestriction(snapshot, category))
	);
	if (keptOff !== null && sale.category !== null) {
		withheld.add(sale.category);
		const held = resolveOptOutState(snapshot);
		if (held.honored) {
			for (const category of held.categories) {
				withheld.add(category);
			}
		}
	}
	return withheld.size > 0
		? scope.filter((category) => !withheld.has(category))
		: undefined;
};

/**
 * Whether a commit changes the sale right (RCPT-02): its value, or who
 * made it, when a default or a past signal's refusal becomes the visitor's
 * own. A locked right never changes here.
 */
const rightChangedBy = function rightChangedBy(
	sale: SaleRightState,
	action: BannerCommitAction,
	keptOff: BannerKeptOff | null,
	draft: BannerCommitDraft
): boolean {
	if (!sale.available || sale.locked) {
		return false;
	}
	if (action === 'refuse') {
		return (
			sale.selected !== 'protect' || sale.source === 'default' || sale.viaSignal
		);
	}
	if (keptOff !== null) {
		return false;
	}
	if (action === 'allow') {
		return sale.selected !== 'allow' || sale.source === 'default';
	}
	return draft.sale !== undefined && saleOption(draft.sale) !== sale.selected;
};

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
 *
 * The receipt's time moves when the commit changes sale's value or makes a
 * default or a past signal's refusal the visitor's own (RCPT-02); a Save
 * compares the draft's sale value with what shows, so a cookie-only Save
 * keeps the date.
 */
export const resolveBannerCommit = function resolveBannerCommit(
	snapshot: RightsSnapshot,
	action: BannerCommitAction,
	draft: BannerCommitDraft = {}
): BannerCommitPlan {
	const sale = resolveSaleRight(snapshot);
	if (action === 'refuse') {
		return {
			categories: undefined,
			input: 'none',
			keptOff: null,
			rightChanged: rightChangedBy(sale, action, null, draft),
		};
	}
	const keptOff = keptOffFor(sale);
	return {
		categories: commitCategories(snapshot, sale, keptOff),
		input: action === 'allow' ? 'all' : 'draft',
		keptOff,
		rightChanged: rightChangedBy(sale, action, keptOff, draft),
	};
};
