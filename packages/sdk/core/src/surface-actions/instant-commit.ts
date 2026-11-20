/**
 * The snapshot a banner or dialog save commits, computed in the tap's own
 * task, before any of the kernel's code has loaded.
 *
 * A deferred root keeps the kernel, and even the commit path's chunk
 * (`./early-commit.ts`), out of the page's first load. Waiting for either
 * on a tap holds the visitor's choice back by a download. This module is
 * small enough for the first-load chunk: for a visitor with no stored
 * choice under a choice prompt, it computes the snapshot
 * `commands.save('all' | 'none' | selection)` would commit, so the page
 * reads the choice and its scripts start at the tap.
 *
 * It covers only the case where that is a short calculation, and returns
 * `null` for anything else; the caller then waits for `planEarlyCommit` or
 * the kernel. Within that case it must equal `planEarlyCommit`'s snapshot
 * field for field; a test compares them across policies.
 *
 * @packageDocumentation
 * @internal
 */

import { OPTIONAL_CONSENT_CATEGORIES } from '../consent-record/types';
import type {
	CategoryDecision,
	ConsentSubject,
	EvaluationPolicy,
	ExplicitChoice,
	OptionalConsentCategory,
	RestrictionReason,
} from '../consent-record/types';
import { readCookieValueFromHeader } from '../libs/cookie/read-header';
import { resolveStorageKeys } from '../libs/storage-keys';
import { generateUuidV7 } from '../libs/subject-uuid';
import type { StorageConfig } from '../modules/persistence/types';
import type { ConsentSnapshot } from '../types';

export { generateUuidV7 } from '../libs/subject-uuid';

/** Latest valid epoch milliseconds, as the record validator reads them. */
const MAX_DATE_MS = 8_640_000_000_000_000;

/**
 * Whether only the kernel can record a save from `snapshot`: no matched
 * policy or a pending one, an IAB or external CMP decision, an
 * experiment, or declared or denied vendors.
 *
 * @param snapshot - The snapshot the page renders from.
 * @returns `true` when the kernel has to record the save.
 * @internal
 */
export const kernelOnly = function kernelOnly(
	snapshot: ConsentSnapshot
): boolean {
	return (
		snapshot.resolution.status !== 'matched' ||
		snapshot.policyPending ||
		Boolean(snapshot.externalPermissions) ||
		snapshot.model === 'iab' ||
		snapshot.evaluationPolicy.model === 'none' ||
		Boolean(snapshot.experiment) ||
		snapshot.experimentPending ||
		snapshot.optOut !== null ||
		// A bulk action also decides vendors; the kernel records that.
		(snapshot.vendors?.declared.length ?? 0) > 0 ||
		(snapshot.vendorChoice?.denied.length ?? 0) > 0
	);
};

/**
 * Whether storage holds a clear epoch. A record written after a clear
 * carries it, which only persistence reads; the kernel records those.
 *
 * @param storageConfig - The runtime's storage configuration.
 * @returns `true` when a clear was stored.
 * @internal
 */
export const hasStoredClearEpoch = function hasStoredClearEpoch(
	storageConfig?: StorageConfig
): boolean {
	const key = resolveStorageKeys(storageConfig).epoch;
	try {
		if ((window.localStorage?.getItem(key) ?? null) !== null) {
			return true;
		}
	} catch {
		// Blocked storage: the cookie still tells.
	}
	try {
		return readCookieValueFromHeader(document.cookie, key) !== undefined;
	} catch {
		return false;
	}
};

/** @internal */
export interface InstantCommitInput {
	/** The snapshot the page renders from. */
	snapshot: ConsentSnapshot;
	/**
	 * `'all'` for accept, `'none'` for reject, or the categories a
	 * preference form saves, as `commands.save` takes them.
	 */
	choice: unknown;
	/** Epoch milliseconds of the tap. */
	actionAt: number;
	/** The clock now. Defaults to `Date.now()`. */
	now?: number;
	/**
	 * The subject id to record when the visitor has none, generated ahead of
	 * the tap. Generated here when absent.
	 */
	subjectId?: string;
}

/** What an instant commit records. @internal */
export interface InstantCommit {
	/** The snapshot the kernel would hold after the save. */
	snapshot: ConsentSnapshot;
	/** The snapshot it was computed from. */
	previous: ConsentSnapshot;
	/** The subject id the save records; pass it on to `planEarlyCommit`. */
	subjectId: string;
	/** The evaluation time used. */
	now: number;
}

/**
 * The category values a save input records, as `resolveSaveSelection` and
 * `recordCategoryPatch` read them for a visitor with no stored choice, or
 * `null` when the record helper would reject them.
 */
const selectionValues = function selectionValues(
	snapshot: ConsentSnapshot,
	choice: unknown
): Map<OptionalConsentCategory, boolean> | null {
	const policy = snapshot.evaluationPolicy;
	const ruleScope = snapshot.policyRule.scope;
	let entries: [string, unknown][];
	if (choice === 'all' || choice === 'none') {
		const displayed = policy.choiceScope;
		const keys = displayed.length === ruleScope.length ? ruleScope : displayed;
		entries = keys.map((key) => [
			key,
			ruleScope.includes(key) ? choice === 'all' : undefined,
		]);
	} else if (
		typeof choice === 'object' &&
		choice !== null &&
		!Array.isArray(choice) &&
		[Object.prototype, null].includes(Object.getPrototypeOf(choice))
	) {
		entries = Object.getOwnPropertyNames(choice).map((key) => [
			key,
			(choice as Record<string, unknown>)[key],
		]);
	} else {
		return null;
	}
	const values = new Map<OptionalConsentCategory, boolean>();
	for (const [key, value] of entries) {
		if (key === 'necessary' && value === true) {
			continue;
		}
		if (
			!OPTIONAL_CONSENT_CATEGORIES.includes(key as never) ||
			typeof value !== 'boolean' ||
			(value && !policy.scope.includes(key as OptionalConsentCategory))
		) {
			return null;
		}
		values.set(key as OptionalConsentCategory, value);
	}
	return values.size ? values : null;
};

/**
 * Whether a save from `before` at `actionAt` is the case
 * {@link planInstantCommit} covers, before the input is checked.
 *
 * @param before - The snapshot the page renders from.
 * @param actionAt - Epoch milliseconds of the tap.
 * @returns `true` when an instant commit can apply.
 * @internal
 */
export const isShortCase = function isShortCase(
	before: ConsentSnapshot,
	actionAt: number,
	now: number
): boolean {
	const policy = before.evaluationPolicy;
	const gpc = before.overrides.gpc ?? before.privacySignals.gpc.detected;
	return !(
		kernelOnly(before) ||
		before.explicitChoice !== null ||
		policy.prompt !== 'choice' ||
		policy.choiceScope.length === 0 ||
		gpc ||
		before.privacySignals.gpc.active ||
		before.iab?.authority ||
		!Number.isSafeInteger(actionAt) ||
		actionAt < 0 ||
		actionAt > now ||
		actionAt > MAX_DATE_MS
	);
};

/** What `evaluateConsentRecord` derives from the choice. */
interface ChoiceEvaluation {
	permissions: Record<string, boolean>;
	restrictions: Partial<Record<OptionalConsentCategory, RestrictionReason[]>>;
	/** The choice answers the choice prompt. */
	answered: boolean;
	nextDeadline: number | null;
}

/**
 * `evaluateConsentRecord` for a choice made now, with no privacy signal and
 * no earlier decision, so every decision is valid until `expiresAt`.
 */
const evaluateChoice = function evaluateChoice(
	policy: EvaluationPolicy,
	values: Map<OptionalConsentCategory, boolean>,
	expiresAt: number | null
): ChoiceEvaluation {
	const { choiceScope } = policy;
	const permissions: Record<string, boolean> = { necessary: true };
	const restrictions: ChoiceEvaluation['restrictions'] = {};
	let refused = false;
	let decided = true;
	for (const category of OPTIONAL_CONSENT_CATEGORIES) {
		const value = values.get(category);
		const inScope = policy.scope.includes(category);
		const reasons: RestrictionReason[] = [];
		if (value === false) {
			reasons.push('explicit-denial');
		}
		if (!inScope && policy.scopeMode === 'strict') {
			reasons.push('strict-scope');
		}
		let permitted = inScope
			? policy.model === 'opt-out' || value === true
			: policy.scopeMode === 'permissive';
		if (reasons.length > 0) {
			permitted = false;
			restrictions[category] = reasons;
		}
		permissions[category] = permitted;
		if (choiceScope.includes(category)) {
			refused ||= reasons.length > 0;
			decided &&= value !== undefined;
		}
	}
	const answered = refused || decided;
	// A grant's expiry matters when it changes a permission (not under
	// opt-out; `none` is the kernel's), or a satisfied choice prompt.
	const expiring = policy.scope.some(
		(category) =>
			values.get(category) === true &&
			(policy.model !== 'opt-out' ||
				(answered && !refused && choiceScope.includes(category)))
	);
	return {
		answered,
		nextDeadline: expiring ? expiresAt : null,
		permissions,
		restrictions,
	};
};

/** Whether two permission maps hold the same values. */
const sameFlags = function sameFlags(
	left: Record<string, boolean>,
	right: Record<string, boolean>
): boolean {
	const keys = Object.keys(left);
	return (
		keys.length === Object.keys(right).length &&
		keys.every((key) => left[key] === right[key])
	);
};

/** Whether two restriction maps hold the same reasons. */
const sameReasons = function sameReasons(
	left: ConsentSnapshot['restrictions'],
	right: ConsentSnapshot['restrictions']
): boolean {
	return OPTIONAL_CONSENT_CATEGORIES.every(
		(category) =>
			(left[category] ?? []).join(',') === (right[category] ?? []).join(',')
	);
};

/** The subject a save records, as `saveSubject` builds it. */
const recordedSubject = function recordedSubject(
	before: ConsentSnapshot,
	subjectId: string | undefined
): ConsentSubject & { subjectId: string } {
	const subject = {
		...before.subject,
		subjectId: before.subject?.subjectId ?? subjectId ?? generateUuidV7(),
	};
	const { user } = before;
	if (user?.externalId) {
		subject.externalId = user.externalId;
		if (user.identityProvider) {
			subject.identityProvider = user.identityProvider;
		}
	}
	return subject;
};

/**
 * The snapshot `commands.save(choice)` would commit, or `null` when this
 * is not the short case: only the kernel can record it, the visitor has a
 * stored choice, the prompt is not a choice with something to decide, a
 * privacy signal is active, or the input would be rejected. The subject id
 * is generated here when the visitor has none.
 *
 * @param input - The rendered snapshot and the tap.
 * @internal
 */
export const planInstantCommit = function planInstantCommit(
	input: InstantCommitInput
): InstantCommit | null {
	const before = input.snapshot;
	const now = input.now ?? Date.now();
	const { actionAt } = input;
	if (!isShortCase(before, actionAt, now)) {
		return null;
	}
	const policy = before.evaluationPolicy;
	const maxAge = policy.choice.maxAgeMs;
	const expiresAt = maxAge === null ? null : actionAt + maxAge;
	const values = selectionValues(before, input.choice);
	// A decision that expires at once is the kernel's to judge.
	if (!values || (expiresAt !== null && now >= expiresAt)) {
		return null;
	}

	const categories: ExplicitChoice['categories'] = {};
	for (const [category, value] of values) {
		categories[category] = {
			basis: { fingerprint: policy.choice.fingerprint, kind: 'choice-v1' },
			confirmedAt: actionAt,
			value,
		} satisfies CategoryDecision;
	}
	const evaluation = evaluateChoice(policy, values, expiresAt);
	// Unchanged derived fields keep their reference, as the kernel's do.
	const promptChanged =
		evaluation.answered && before.promptRequirement.kind !== 'none';
	const subject = recordedSubject(before, input.subjectId);
	return {
		now,
		previous: before,
		snapshot: {
			...before,
			activeUI: promptChanged ? 'none' : before.activeUI,
			effectivePermissions: sameFlags(
				evaluation.permissions,
				before.effectivePermissions
			)
				? before.effectivePermissions
				: (evaluation.permissions as ConsentSnapshot['effectivePermissions']),
			evaluatedAt: now,
			explicitChoice: { categories, version: 3 },
			nextDeadline: evaluation.nextDeadline,
			promptRequirement: promptChanged
				? { kind: 'none' }
				: before.promptRequirement,
			restrictions: sameReasons(evaluation.restrictions, before.restrictions)
				? before.restrictions
				: evaluation.restrictions,
			revision: before.revision + 1,
			subject,
		},
		subjectId: subject.subjectId,
	};
};

/**
 * Whether setters queued for the engine leave the snapshot as a commit
 * reads it: only category registrations the snapshot already holds.
 *
 * @internal
 */
export const pendingIsInert = function pendingIsInert(handle: {
	readonly kernel: { getSnapshot: () => ConsentSnapshot };
	readonly pending: () => readonly { name: string; args: unknown[] }[];
}): boolean {
	const categories = handle.kernel.getSnapshot().consentCategories;
	return handle
		.pending()
		.every(
			({ args, name }) =>
				name === 'registerConsentCategories' &&
				Array.isArray(args[0]) &&
				(args[0] as string[]).every((category) =>
					categories?.includes(category as never)
				)
		);
};
