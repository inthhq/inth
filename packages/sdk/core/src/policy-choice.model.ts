/**
 * The parts of the policy derivations a save needs: the runtime model and
 * the selection a save confirms. Pure, and free of the policy resolution
 * code in `./policy.ts`, which re-exports them.
 */
import type { ResolvedPolicyRule } from '@inth/sdk-schema/types';

import type {
	ExplicitChoice,
	OptionalConsentCategory,
} from './consent-record/types';
import { policyDefault } from './consent/consent-types';
import type { KernelModel } from './consent-kernel.model';

/**
 * Runtime model. An IAB rule only runs as `iab` when the IAB module is
 * enabled; otherwise its categories behave as opt-in, which is what the
 * evaluator already does for the `iab` model.
 */
export const deriveModel = function deriveModel(
	rule: ResolvedPolicyRule,
	iabEnabled: boolean
): KernelModel {
	if (rule.model === 'iab') {
		return iabEnabled ? 'iab' : 'opt-in';
	}
	return rule.model;
};

/** Values a form would present before any restriction is applied. */
export type PresentedSelection = Partial<
	Record<OptionalConsentCategory, boolean>
>;

/**
 * The selection a no-input `save()` confirms for the active scope: the
 * staged draft value, else the explicit value, else the model's displayed
 * default (allowed under opt-out, preselected under opt-in and IAB). It is
 * deliberately not the effective permission, which may be masked by GPC or
 * an expired grant.
 */
export const presentedSelection = function presentedSelection(
	rule: ResolvedPolicyRule,
	draft: PresentedSelection | null,
	choice: ExplicitChoice | null
): PresentedSelection {
	const selection: PresentedSelection = {};
	for (const category of rule.scope) {
		const staged = draft?.[category];
		if (typeof staged === 'boolean') {
			selection[category] = staged;
			continue;
		}
		const decision = choice?.categories[category];
		if (decision) {
			selection[category] = decision.value;
			continue;
		}
		selection[category] = policyDefault(rule, category);
	}
	return selection;
};

/** Every category in the active scope set to one value. */
export const scopeSelection = function scopeSelection(
	rule: ResolvedPolicyRule,
	value: boolean
): PresentedSelection {
	const selection: PresentedSelection = {};
	for (const category of rule.scope) {
		selection[category] = value;
	}
	return selection;
};
