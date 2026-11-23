/**
 * The parts of a category save that need no kernel: which values a save
 * input confirms, the acknowledgement and subject it records, how it is
 * attributed, and the payload the backend receives.
 *
 * `create-choice-recorder.ts` records every save with these. A deferred root's commit path
 * (`@inth/sdk/surface-actions/early-commit`) records a banner tap made
 * before its kernel loads with the same functions, so both write and send
 * the same thing. Pure, and small: the commit path loads them on a tap.
 *
 * @internal
 */

import { decisionAnswersPrompt } from '../consent-record/decision-authority';
import type {
	ConsentSubject,
	EvaluationPolicy,
	OptionalConsentCategory,
} from '../consent-record/types';
import type { AllConsentNames } from '../consent/consent-types';
import type { ExperimentAssignment } from '../libs/experiment';
import { createIdempotencyKey } from '../libs/subject-uuid.model';
import { presentedSelection, scopeSelection } from '../policy-choice.model';
import type { PresentedSelection } from '../policy-choice.model';
import type {
	ConsentSnapshot,
	ExplicitChoice,
	NoticeDismissal,
	SaveInput,
	SavePayload,
	SaveUISource,
} from '../consent-kernel.model';
import type { SnapshotPatch } from './next-snapshot.model';

/**
 * Values one save input confirms. Object input is passed through untouched
 * so the record helper validates it and reports the exact issue.
 */
export const resolveSaveSelection = function resolveSaveSelection(
	snapshot: ConsentSnapshot,
	draft: PresentedSelection | null,
	input: SaveInput | undefined,
	categories?: readonly AllConsentNames[]
): { values: unknown; consentAction: SavePayload['consentAction'] } {
	const rule = snapshot.policyRule;
	const { choiceScope } = snapshot.evaluationPolicy;
	const displayed =
		categories === undefined
			? choiceScope
			: choiceScope.filter((category) => categories.includes(category));
	const narrow = (values: PresentedSelection) =>
		displayed.length === rule.scope.length
			? values
			: Object.fromEntries(
					displayed.map((category) => [category, values[category]])
				);
	if (input === 'all' || input === 'none') {
		// A bulk action stays `all` / `necessary` even when the host displays
		// a subset of the scope: the action names what the visitor clicked,
		// `confirmed` names what it covered.
		const bulkAction = input === 'all' ? 'all' : 'necessary';
		// With nothing to decide, the bulk action still covers everything the
		// visitor was shown: strictly necessary alone.
		return {
			consentAction: bulkAction,
			values: narrow(scopeSelection(rule, input === 'all')),
		};
	}
	if (input === undefined) {
		return {
			consentAction: 'custom',
			values: narrow(presentedSelection(rule, draft, snapshot.explicitChoice)),
		};
	}
	return { consentAction: 'custom', values: input };
};

/**
 * Whether a save decides a category in the choice scope and leaves another
 * one in it without a decision that still answers the prompt. A grant past
 * its lifetime is stored but answers nothing, as the evaluator reads it.
 */
const leavesScopeUndecided = function leavesScopeUndecided(
	policy: EvaluationPolicy,
	now: number,
	recorded:
		| {
				choice: ExplicitChoice;
				confirmed: readonly OptionalConsentCategory[];
		  }
		| undefined
): boolean {
	const scope = policy.choiceScope;
	return (
		recorded !== undefined &&
		recorded.confirmed.some((category) => scope.includes(category)) &&
		scope.some(
			(category) =>
				!decisionAnswersPrompt(
					recorded.choice.categories[category],
					policy,
					now
				)
		)
	);
};

/**
 * The acknowledgement a save records when the choice prompt has no category
 * to decide, or `null` when the choice scope has one. It is a dismissal
 * record bound to the choice fingerprint, so persistence, cross-tab
 * reconciliation and the deadline timer carry it like a notice dismissal,
 * and the evaluator never mistakes it for one. A stored acknowledgement at
 * least as new is kept.
 *
 * A save from a rights control (`rightsControl`) records one too while the
 * choice prompt is owed: recording a statutory right answers the prompt
 * (BNR-05, RIGHT-08), and the categories it did not record keep their
 * defaults instead of being granted or refused on the visitor's behalf.
 * It records a fresh one whatever the prompt is when it decides a scoped
 * category and leaves another undecided: the answer only holds beside a
 * decision made in the same action, so a refusal that answered the prompt
 * and is then changed to a grant would otherwise bring the banner back.
 *
 * @param recorded - What the save records, when it records categories.
 * @param now - When the save is evaluated, which decides whether a stored
 * grant has expired. Defaults to `actionAt`.
 */
export const choiceAcknowledgement = function choiceAcknowledgement(
	snapshot: ConsentSnapshot,
	actionAt: number,
	rightsControl = false,
	recorded?: {
		choice: ExplicitChoice;
		confirmed: readonly OptionalConsentCategory[];
	},
	now = actionAt
): NoticeDismissal | null {
	const policy = snapshot.evaluationPolicy;
	if (policy.prompt !== 'choice') {
		return null;
	}
	if (
		policy.choiceScope.length > 0 &&
		!(
			rightsControl &&
			(snapshot.promptRequirement.kind === 'choice' ||
				leavesScopeUndecided(policy, now, recorded))
		)
	) {
		return null;
	}
	const current = snapshot.noticeDismissal;
	// A rights control's acknowledgement answers the prompt only beside the
	// decision made in the same action, so it always takes that action's
	// time.
	if (
		current &&
		current.fingerprint === policy.choice.fingerprint &&
		(rightsControl && policy.choiceScope.length > 0
			? current.dismissedAt === actionAt
			: current.dismissedAt >= actionAt)
	) {
		return current;
	}
	return {
		dismissedAt: actionAt,
		fingerprint: policy.choice.fingerprint,
		version: 1,
	};
};

/**
 * A visitor who records a choice while a notice is owed has read the
 * notice: the choice acknowledges it, so the banner does not return after
 * an opt-out made from the preference center. The dismissal rides on
 * `choice:recorded`; no separate notice event, so an outcome is counted once.
 */
export const applyNoticeAcknowledgement = function applyNoticeAcknowledgement(
	patch: SnapshotPatch,
	before: ConsentSnapshot,
	actionAt: number
): void {
	// Only a notice prompt, and never over an acknowledgement this save
	// already made (a choice prompt with nothing to decide records its own).
	if (
		patch.noticeDismissal !== undefined ||
		before.evaluationPolicy.prompt !== 'notice' ||
		before.promptRequirement.kind !== 'notice'
	) {
		return;
	}
	patch.noticeDismissal = {
		dismissedAt: actionAt,
		fingerprint: before.evaluationPolicy.notice.fingerprint,
		version: 1,
	};
};

/**
 * Keep the open surface across a rights control's action. The kernel closes
 * an open surface when a choice answers its prompt; a rights control
 * records one right and the visitor carries on in the same surface, which
 * closes when they finish (BNR-05).
 */
export const keepRightsSurface = function keepRightsSurface(
	patch: SnapshotPatch,
	before: ConsentSnapshot,
	rightsControl: boolean | undefined
): void {
	if (
		rightsControl === true &&
		(before.activeUI === 'banner' || before.activeUI === 'dialog')
	) {
		patch.activeUI = before.activeUI;
	}
};

/** Subject written by a save: the stored identifiers plus the current user's. */
export const saveSubject = function saveSubject(
	snapshot: ConsentSnapshot,
	subjectId: string
): ConsentSubject {
	const subject: ConsentSubject = { ...snapshot.subject, subjectId };
	if (snapshot.user?.externalId) {
		subject.externalId = snapshot.user.externalId;
		if (snapshot.user.identityProvider) {
			subject.identityProvider = snapshot.user.identityProvider;
		}
	}
	return subject;
};

/** Capture the action’s policy evidence before init or navigation changes it. */
export const saveDecisionInputs = (
	snapshot: ConsentSnapshot
): Pick<SavePayload, 'decisionInputs'> => {
	if (
		snapshot.resolution.status !== 'no-match' &&
		snapshot.resolution.status !== 'matched'
	) {
		return {};
	}
	return {
		decisionInputs: {
			country: snapshot.location
				? snapshot.location.countryCode
				: (snapshot.overrides.country ?? null),
			fingerprint:
				snapshot.resolution.status === 'matched'
					? snapshot.resolution.fingerprints.policy
					: undefined,
			gpc: snapshot.privacySignals.gpc.active,
			language:
				snapshot.translations?.language ?? snapshot.overrides.language ?? 'en',
			policyId:
				snapshot.resolution.status === 'matched'
					? snapshot.resolution.policyId
					: null,
			region: snapshot.location
				? snapshot.location.regionCode
				: (snapshot.overrides.region ?? null),
		},
	};
};

/**
 * Which surface a save is attributed to and, when that surface has a
 * recorded impression, the milliseconds from it to the action. Unknown
 * for a non-prompt surface, a surface never shown, or a clock that moved
 * backwards; then `timeToDecisionMs` is omitted rather than negative.
 */
export const saveAttribution = function saveAttribution(
	current: ConsentSnapshot,
	requested: SaveUISource | undefined,
	actionAt: number
): {
	uiSource: SaveUISource;
	timeToDecisionMs?: number;
	experiment?: ExperimentAssignment;
} {
	const uiSource = requested ?? current.activeUI;
	const attribution: ReturnType<typeof saveAttribution> = { uiSource };
	// The arm the visitor acted under, captured with the action so a
	// later reassignment cannot relabel this choice. Only once the banner
	// has shown it in this page: a returning visitor who changes their
	// choice from a footer link never saw the arm's banner.
	if (current.experiment && current.surfaceShownAt.banner !== null) {
		attribution.experiment = current.experiment;
	}
	if (uiSource !== 'banner' && uiSource !== 'dialog') {
		return attribution;
	}
	const shownAt = current.surfaceShownAt[uiSource];
	if (shownAt === null || actionAt < shownAt) {
		return attribution;
	}
	attribution.timeToDecisionMs = actionAt - shownAt;
	return attribution;
};

/** What {@link buildSavePayload} needs besides the committed snapshot. */
export interface SavePayloadInput {
	/** The choice the action recorded. */
	choice: ExplicitChoice;
	/** Categories the action confirmed. */
	confirmed: readonly OptionalConsentCategory[];
	consentAction: SavePayload['consentAction'];
	actionAt: number;
	subject: ConsentSubject;
	subjectId: string;
	uiSource: SaveUISource;
	/** `timeToDecisionMs` and `experiment` from {@link saveAttribution}. */
	timing: Pick<SavePayload, 'experiment' | 'timeToDecisionMs'>;
}

/**
 * The payload one recorded action sends, built once so a queued replay
 * records when the visitor decided, not when the retry ran, and derives
 * the same backend consent id. Vendor and IAB fields are the caller's.
 *
 * @param after - The snapshot the action committed.
 * @param input - What the action recorded.
 * @internal
 */
export const buildSavePayload = function buildSavePayload(
	after: ConsentSnapshot,
	input: SavePayloadInput
): SavePayload {
	// Exactly the confirmed keys with their recorded values, copied so a
	// caller mutating its input object cannot change the queued payload.
	const confirmedCategories: Partial<Record<OptionalConsentCategory, boolean>> =
		{};
	for (const category of input.confirmed) {
		const decision = input.choice.categories[category];
		if (decision) {
			confirmedCategories[category] = decision.value;
		}
	}
	return {
		choice: input.choice,
		confirmed: { actionAt: input.actionAt, categories: confirmedCategories },
		consentAction: input.consentAction,
		consents: after.effectivePermissions,
		...saveDecisionInputs(after),
		givenAt: input.actionAt,
		idempotencyKey: createIdempotencyKey(),
		model: after.model,
		overrides: after.overrides,
		policySnapshotToken: after.policySnapshotToken,
		subject: input.subject,
		subjectId: input.subjectId,
		tcString: after.iab?.tcString ?? null,
		uiSource: input.uiSource,
		user: after.user,
		...input.timing,
	};
};
