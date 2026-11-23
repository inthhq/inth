/**
 * The persistent "Your Privacy Choices" footer link: whether it shows, what
 * it says, and whether the CPPA opt-out icon goes beside it.
 *
 * @packageDocumentation
 */

import type { Translations } from '@inth/sdk-translations';
import { translations as enTranslations } from '@inth/sdk-translations/en';

import type { ConsentSnapshot } from '../consent-kernel.model';
import { resolveOptOutLink } from './consent-copy';
import type {
	OptOutLinkIcon,
	OptOutLinkVariant,
	ResolvedOptOutLink,
} from './consent-copy';
import { resolveOptOutState } from './opt-out-state.model';

/** What a "Your Privacy Choices" link renders. */
export interface PrivacyChoicesLinkState {
	readonly label: string;
	/**
	 * The CPPA opt-out icon. It marks an opt-out right, so it shows only
	 * beside an opt-out link's Privacy Choices titles.
	 */
	readonly icon: OptOutLinkIcon | null;
	/**
	 * The opt-out link variant, or `'choices'` for a link that only reopens
	 * the Privacy Choices dialog under a policy with no opt-out right.
	 */
	readonly variant: ResolvedOptOutLink['variant'] | 'choices';
}

/**
 * The "Your Privacy Choices" link for `snapshot`, or `null` when it shows
 * nothing.
 *
 * Under an opt-out policy with the `opt-out` right it is the opt-out link
 * the host configured (`variant`). It is also the way back into the dialog
 * whenever the dialog has something to show: under an opt-in policy, in
 * the US or the EU, it reads "Your Privacy Choices" with no opt-out icon,
 * since no opt-out right is offered.
 *
 * Nothing shows before a policy resolves or while an external consent
 * source owns consent.
 */
export const resolvePrivacyChoicesLink = function resolvePrivacyChoicesLink(
	snapshot: Pick<
		ConsentSnapshot,
		| 'evaluationPolicy'
		| 'externalPermissions'
		| 'optOut'
		| 'policyRule'
		| 'privacySignals'
		| 'resolution'
	>,
	translations: Partial<Translations> | undefined,
	options: { variant?: OptOutLinkVariant } = {}
): PrivacyChoicesLinkState | null {
	if (
		snapshot.resolution.status !== 'matched' ||
		snapshot.externalPermissions
	) {
		return null;
	}
	if (
		resolveOptOutState(snapshot).available &&
		snapshot.policyRule.rights.includes('opt-out')
	) {
		const link = resolveOptOutLink(translations, options.variant);
		return {
			icon: link.variant === 'privacy-choices' ? link.icon : null,
			label: link.label,
			variant: link.variant,
		};
	}
	const { model } = snapshot.policyRule;
	if (model !== 'opt-in' && model !== 'opt-out') {
		return null;
	}
	return {
		icon: null,
		label:
			translations?.rights?.privacyChoices ??
			enTranslations.rights.privacyChoices,
		variant: 'choices',
	};
};
