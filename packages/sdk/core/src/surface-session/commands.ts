/**
 * Surface commands: the rights decisions in `rights.ts`, carried out
 * through the kernel's own commands.
 *
 * The kernel enforces what it already knows: `commands.optOut()` records a
 * refusal once and keeps the first record's time, a refusing save under an
 * opt-out rule records the opt-out too, `commands.optIn()` refuses while a
 * live GPC signal holds the opt-out, and a save that grants the deciding
 * category lifts a held opt-out. These functions decide which command to
 * call so a surface never reaches that last path by accident.
 *
 * @packageDocumentation
 */

import type { AllConsentNames } from '../consent/consent-types';
import { resolveOptOutState } from '../libs/opt-out-state';
import type { PreferenceDraft } from '../preference-draft';
import { markOptOutReloadIfDue } from '../surface-actions/opt-out';
import { beginAction } from '../surface-actions/rules';
import { saveConsentSurface, settleSurface } from '../surface-actions/save';
import type {
	ConsentKernel,
	OptInResult,
	OptOutResult,
	SaveResult,
	SaveUISource,
} from '../types';
import {
	resolveBannerCommit,
	resolveRightPress,
	resolveSaleRight,
} from './rights';
import type {
	BannerCommitAction,
	BannerCommitPlan,
	RightOption,
	RightPressOutcome,
} from './rights';
import { getSurfaceSession } from './session';
import type { SurfaceCopyFinish, SurfaceCopyOptions } from './session';

/** Options for {@link commitBannerChoice}. */
export interface BannerCommitOptions {
	/**
	 * The draft behind an expanded panel's switches. A `'save'` records it;
	 * without one, `'save'` confirms what the kernel has staged.
	 */
	draft?: PreferenceDraft;
	/** Surface to attribute the save to. Defaults to `'banner'`. */
	uiSource?: SaveUISource;
}

/** What {@link commitBannerChoice} did. */
export interface BannerCommitOutcome {
	readonly plan: BannerCommitPlan;
	readonly result: Promise<SaveResult>;
}

/**
 * Commit a banner's Allow, Don't allow or Save (§3.6, PERM-02) and end the
 * banner: the save closes it as any surface save does, and the session
 * drops its expanded panel, confirmation, copy state and announcement.
 *
 * When live GPC withholds every category the commit could record, the
 * signal already refused them, which answers the prompt, so the banner
 * closes at once. Only a Save still records the vendor edits in `draft`
 * then.
 *
 * The renderer then moves focus to "Your Privacy Choices" and announces
 * the outcome on the page; `plan.keptOff` says whether sale and sharing
 * stayed off and why.
 */
export const commitBannerChoice = function commitBannerChoice(
	kernel: ConsentKernel,
	action: BannerCommitAction,
	options: BannerCommitOptions = {}
): BannerCommitOutcome {
	const snapshot = kernel.getSnapshot();
	const { category } = resolveSaleRight(snapshot);
	const plan = resolveBannerCommit(snapshot, action, {
		sale:
			action === 'save' && options.draft && category !== null
				? options.draft.getState().values[category]
				: undefined,
	});
	const uiSource = options.uiSource ?? 'banner';
	const { categories } = plan;
	const { draft } = options;
	// Vendor edits in the panel are still the visitor's to keep when no
	// category is left to record, but only Save records the panel: Allow
	// and Don't allow never save its switches.
	const keepsVendorEdits =
		plan.input === 'draft' &&
		draft?.toSaveInput(categories)?.vendors !== undefined;
	if (categories?.length === 0 && !keepsVendorEdits) {
		beginAction(kernel);
		settleSurface(kernel);
		getSurfaceSession(kernel).commit();
		return { plan, result: Promise.resolve({ confirmed: [], ok: true }) };
	}
	const save = (): Promise<SaveResult> => {
		if (plan.input === 'draft') {
			return draft
				? draft.save({ categories, uiSource })
				: kernel.commands.save(undefined, { categories, uiSource });
		}
		if (plan.input === 'all' && categories !== undefined) {
			return kernel.commands.save('all', { categories, uiSource });
		}
		return kernel.commands.save(plan.input, { uiSource });
	};
	const result = saveConsentSurface(kernel, save);
	getSurfaceSession(kernel).commit();
	return { plan, result };
};

/**
 * Commit the EU dialog's Reject all, Accept all or Save choices (EU-01) and
 * close the dialog. The same protections as a banner commit apply: a
 * commit never lifts a held opt-out or grants past a live GPC signal
 * (PERM-02). Closing without one of these discards the draft (EU-02).
 */
export const commitDialogChoice = function commitDialogChoice(
	kernel: ConsentKernel,
	action: BannerCommitAction,
	options: BannerCommitOptions = {}
): BannerCommitOutcome {
	return commitBannerChoice(kernel, action, {
		...options,
		uiSource: options.uiSource ?? 'dialog',
	});
};

/**
 * Apply the categories a US dialog's switches changed, at once (LAW-04):
 * the draft's values for `categories` and the vendors the visitor moved.
 * The dialog stays open, and a choice prompt still owed is answered, as a
 * rights control answers it. The sale right's own record is untouched, so
 * the receipt keeps its date (RCPT-02).
 *
 * @returns The save, or `undefined` when the draft is stale.
 */
export const applyDialogCategories = function applyDialogCategories(
	kernel: ConsentKernel,
	draft: PreferenceDraft,
	categories: readonly AllConsentNames[],
	options: RightCommandOptions = {}
): Promise<SaveResult> | undefined {
	const input = draft.toSaveInput(categories);
	if (!input) {
		return undefined;
	}
	const { vendors, ...values } = input;
	const picked: Partial<Record<AllConsentNames, boolean>> = {};
	for (const category of categories) {
		const value = values[category];
		if (value !== undefined) {
			picked[category] = value;
		}
	}
	const result = kernel.commands.save(picked, {
		rightsControl: true,
		uiSource: options.uiSource ?? 'dialog',
		vendors,
	});
	// The record now holds what the draft staged; show it, not the edits.
	draft.reset();
	return result;
};

/** What {@link pressSaleRight} did. */
export interface RightPressResult {
	readonly outcome: RightPressOutcome;
	/** The command it started, if it recorded something. */
	readonly result?: Promise<OptOutResult | SaveResult>;
}

/** Options for the sale-right commands. */
export interface RightCommandOptions {
	/** Surface to attribute the choice to. Defaults to the snapshot's `activeUI`. */
	uiSource?: SaveUISource;
}

/**
 * Press one option of the sale control in the dialog or a banner panel.
 *
 * Refusing applies at once, in one action. Allowing a recorded refusal, or
 * any grant under an opt-in policy, opens the confirmation instead and
 * records nothing (LAW-02); pressing "Allow" again while it is open nudges
 * (RIGHT-04). The renderer plays the nudge and announces the outcome; the
 * session already holds the confirmation and the nudge count.
 *
 * A recorded right keeps the surface open and answers the first-layer
 * prompt without deciding any other category, so closing the dialog
 * afterwards never brings the banner back (BNR-05, RIGHT-08).
 */
export const pressSaleRight = function pressSaleRight(
	kernel: ConsentKernel,
	option: RightOption,
	options: RightCommandOptions = {}
): RightPressResult {
	const session = getSurfaceSession(kernel);
	const snapshot = kernel.getSnapshot();
	const right = resolveSaleRight(snapshot);
	const { category } = right;
	if (!right.available || category === null) {
		return { outcome: 'none' };
	}
	const outcome = resolveRightPress({
		confirmationOpen: session.getState().confirmation?.right === 'sale',
		model: snapshot.evaluationPolicy.model,
		option,
		right,
	});
	const uiSource = options.uiSource ?? snapshot.activeUI;
	// A rights control records one right and the visitor carries on: the
	// surface stays open, and the right answers the first-layer prompt.
	const record = (value: boolean) =>
		kernel.commands.save(
			{ [category]: value },
			{ rightsControl: true, uiSource }
		);
	// The opt-out may reload the page (`reloadOnConsentRevoked`). The
	// marker brings the visitor back to the receipt on the next document,
	// as the one-click opt-out does; without it they would see nothing.
	const optOut = () => {
		const result = kernel.commands.optOut({ rightsControl: true, uiSource });
		const after = kernel.getSnapshot();
		if (resolveOptOutState(after).honored) {
			markOptOutReloadIfDue(kernel, snapshot, after);
		} else {
			// A deferred kernel records once its engine settles, before the
			// reload, which waits for the command to complete.
			// oxlint-disable-next-line promise/prefer-await-to-then -- The press must not wait on the network.
			void result.then(
				(recorded) => {
					const settled = kernel.getSnapshot();
					if (recorded.ok && resolveOptOutState(settled).honored) {
						markOptOutReloadIfDue(kernel, snapshot, settled);
					}
				},
				() => undefined
			);
		}
		return result;
	};
	switch (outcome) {
		case 'apply-protect': {
			session.closeConfirmation();
			return {
				outcome,
				result:
					snapshot.evaluationPolicy.model === 'opt-out'
						? optOut()
						: record(false),
			};
		}
		case 'apply-allow': {
			session.closeConfirmation();
			return { outcome, result: record(true) };
		}
		case 'record-default': {
			return {
				outcome,
				result:
					right.selected === 'protect' &&
					snapshot.evaluationPolicy.model === 'opt-out'
						? optOut()
						: record(right.selected === 'allow'),
			};
		}
		case 'confirm': {
			session.openConfirmation('sale');
			return { outcome };
		}
		case 'nudge': {
			session.nudgeConfirmation();
			return { outcome };
		}
		case 'close-confirmation': {
			session.closeConfirmation();
			return { outcome };
		}
		default: {
			return { outcome };
		}
	}
};

/**
 * Confirm the open sale confirmation: lift the held opt-out, or record the
 * grant. Does nothing unless that confirmation is open.
 *
 * @returns The command it started, or `undefined`.
 */
export const confirmSaleRight = function confirmSaleRight(
	kernel: ConsentKernel,
	options: RightCommandOptions = {}
): Promise<OptInResult | SaveResult> | undefined {
	const session = getSurfaceSession(kernel);
	if (session.getState().confirmation?.right !== 'sale') {
		return undefined;
	}
	session.closeConfirmation();
	const snapshot = kernel.getSnapshot();
	const right = resolveSaleRight(snapshot);
	if (right.locked || right.category === null) {
		return undefined;
	}
	const uiSource = options.uiSource ?? snapshot.activeUI;
	if (snapshot.evaluationPolicy.model === 'opt-out' && snapshot.optOut) {
		return kernel.commands.optIn({ uiSource });
	}
	return kernel.commands.save(
		{ [right.category]: true },
		{ rightsControl: true, uiSource }
	);
};

/**
 * Copy the receipt reference with a token per attempt (CLIP-01, CLIP-02).
 * Resolves `copied` only after the write resolved, and `failed` when it
 * rejected or no clipboard exists. A result for an older attempt, or one
 * that lands after the surface changed, changes nothing.
 *
 * @param write - Writes the text; defaults to `navigator.clipboard.writeText`.
 * @param options - Pass `panelVisible: true` from an all-in-one layout,
 * whose panel shows without the banner being expanded.
 * @returns What the renderer should do: see {@link SurfaceCopyFinish}.
 */
export const copySurfaceReference = async function copySurfaceReference(
	kernel: ConsentKernel,
	text: string,
	write?: (text: string) => Promise<void>,
	options: SurfaceCopyOptions = {}
): Promise<SurfaceCopyFinish> {
	const session = getSurfaceSession(kernel);
	const attempt = session.beginCopy();
	const writer =
		write ??
		(typeof navigator !== 'undefined' &&
		typeof navigator.clipboard?.writeText === 'function'
			? (value: string) => navigator.clipboard.writeText(value)
			: undefined);
	let ok = false;
	if (writer) {
		try {
			await writer(text);
			ok = true;
		} catch {
			ok = false;
		}
	}
	return session.finishCopy(attempt, ok, options);
};
