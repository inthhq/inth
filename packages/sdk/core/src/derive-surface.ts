/**
 * The kernel's rule for which surface the first layer shows.
 *
 * A leaf module with no imports: the kernel derives `activeUI` with it, and
 * core's surface actions settle a surface with it after a save. Bundlers
 * that group modules by who imports them (Turbopack) keep the kernel's
 * policy code where it was when adapters reach only this rule.
 */
import type { PolicyResolution } from '@inth/sdk-schema/types';

import type { KernelActiveUI } from './consent-kernel.model';
import type { PromptRequirement } from './consent-record/types';

/**
 * Which surface the first layer should use for the remaining prompt.
 * Visibility follows the prompt requirement, never `hasConsented`. A
 * pending policy and a failed resolution keep the first layer hidden.
 * Adapters resolve the host presentation for a required prompt.
 *
 * @returns `'banner'` while a choice or notice is owed and nothing hides it,
 * otherwise `'none'`.
 */
export const deriveActiveUI = function deriveActiveUI(input: {
	promptRequirement: PromptRequirement;
	policyPending: boolean;
	resolution: PolicyResolution;
	/** A banner experiment is still assigning this visitor's arm. */
	experimentPending?: boolean;
}): KernelActiveUI {
	return input.policyPending ||
		input.experimentPending ||
		input.resolution.status === 'failed' ||
		input.promptRequirement.kind === 'none'
		? 'none'
		: 'banner';
};
