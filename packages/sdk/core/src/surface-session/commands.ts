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

import type { PreferenceDraft } from '../preference-draft';
import { saveConsentSurface } from '../surface-actions/save';
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
import type { SurfaceCopyFinish } from './session';

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
 * The renderer then moves focus to "Your Privacy Choices" and announces
 * the outcome on the page; `plan.keptOff` says whether sale and sharing
 * stayed off and why.
 */
export const commitBannerChoice = function commitBannerChoice(
	kernel: ConsentKernel,
	action: BannerCommitAction,
	options: BannerCommitOptions = {}
): BannerCommitOutcome {
	const plan = resolveBannerCommit(kernel.getSnapshot(), action);
	const uiSource = options.uiSource ?? 'banner';
	const { categories } = plan;
	const save = (): Promise<SaveResult> => {
		if (plan.input === 'draft') {
			return options.draft
				? options.draft.save({ categories, uiSource })
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
	const record = (value: boolean) =>
		kernel.commands.save({ [category]: value }, { uiSource });
	switch (outcome) {
		case 'apply-protect': {
			session.closeConfirmation();
			return {
				outcome,
				result:
					snapshot.evaluationPolicy.model === 'opt-out'
						? kernel.commands.optOut({ uiSource })
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
						? kernel.commands.optOut({ uiSource })
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
	return kernel.commands.save({ [right.category]: true }, { uiSource });
};

/**
 * Copy the receipt reference with a token per attempt (CLIP-01, CLIP-02).
 * Resolves `copied` only after the write resolved, and `failed` when it
 * rejected or no clipboard exists. A result for an older attempt, or one
 * that lands after the surface changed, changes nothing.
 *
 * @param write - Writes the text; defaults to `navigator.clipboard.writeText`.
 * @returns What the renderer should do: see {@link SurfaceCopyFinish}.
 */
export const copySurfaceReference = async function copySurfaceReference(
	kernel: ConsentKernel,
	text: string,
	write?: (text: string) => Promise<void>
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
	return session.finishCopy(attempt, ok);
};
