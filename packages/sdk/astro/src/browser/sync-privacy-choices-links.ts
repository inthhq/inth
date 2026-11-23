/**
 * Keeps every `<PrivacyChoicesLink />` in step with the snapshot: shown
 * only while it has something to open, with the label, opt-out icon and
 * variant `resolvePrivacyChoicesLink` gives, as React's link renders them.
 * The server renders the first state; a page it could not resolve the
 * policy for shows the link once the browser does.
 *
 * @internal
 */

import { applyExperimentAssignment } from '@inth/sdk/engine';
import type { ConsentSnapshot } from '@inth/sdk/engine';
import { resolvePrivacyChoicesLink } from '@inth/sdk/surface-state';
import type { OptOutLinkVariant } from '@inth/sdk/surface-state';
import type { Translations } from '@inth/sdk/translations';

import { privacyChoicesLinkIconSvg } from '../parts/privacy-choices-link-icon.model';
import type { InthResolvedOptions } from '../inth-options.model';

/** Marks a stock link; the value is its `variant` prop, or empty. */
export const PRIVACY_CHOICES_LINK_ATTRIBUTE = 'data-inth-privacy-choices-link';

/** Marks a link that shows the resolved label, not slotted content. */
export const DEFAULT_LABEL_ATTRIBUTE = 'data-inth-default-label';

/** The opt-out icon's classes, or none under `noStyle`. */
export const ICON_CLASS_ATTRIBUTE = 'data-inth-icon-class';

/** The icon `cppaOptOutIconSvg` draws: the only unfocusable SVG child. */
const ICON_SELECTOR = ':scope > svg[focusable="false"]';

const hasIcon = (link: HTMLElement): boolean =>
	link.querySelector(ICON_SELECTOR) !== null;

/**
 * Show, hide and label the page's stock "Your Privacy Choices" links.
 *
 * @param snapshot - The current consent snapshot.
 * @param options - The integration's `presentation` and `experiment`.
 */
export const syncPrivacyChoicesLinks = function syncPrivacyChoicesLinks(
	snapshot: ConsentSnapshot,
	options: Pick<InthResolvedOptions, 'experiment' | 'presentation'>
): void {
	const links = document.querySelectorAll<HTMLElement>(
		`[${PRIVACY_CHOICES_LINK_ATTRIBUTE}]`
	);
	if (links.length === 0) {
		return;
	}
	const presentation = applyExperimentAssignment(
		options.presentation,
		options.experiment,
		snapshot.experiment
	);
	const translations = snapshot.translations?.translations as
		| Partial<Translations>
		| undefined;
	for (const link of links) {
		const variant = (link.getAttribute(PRIVACY_CHOICES_LINK_ATTRIBUTE) ||
			undefined) as OptOutLinkVariant | undefined;
		const state = resolvePrivacyChoicesLink(snapshot, translations, {
			variant: variant ?? presentation?.optOutLink,
		});
		link.hidden = state === null;
		// React renders nothing then, so its test id is gone too, and focus
		// returning after a choice or from the dialog skips a hidden link.
		if (!state) {
			link.removeAttribute('data-testid');
			continue;
		}
		link.setAttribute('data-testid', 'privacy-choices-link');
		link.setAttribute('data-inth-rights', snapshot.policyRule.rights.join(' '));
		if (state.variant === 'choices') {
			link.removeAttribute('data-opt-out-variant');
		} else {
			link.setAttribute('data-opt-out-variant', state.variant);
		}
		// Only a styled link carries the icon's class, and only it sizes
		// the icon on its own.
		const iconClass = link.getAttribute(ICON_CLASS_ATTRIBUTE) ?? undefined;
		const icon = state.icon
			? privacyChoicesLinkIconSvg(iconClass, iconClass !== undefined)
			: '';
		if (link.hasAttribute(DEFAULT_LABEL_ATTRIBUTE)) {
			if (link.textContent !== state.label || Boolean(icon) !== hasIcon(link)) {
				link.innerHTML = icon;
				link.append(state.label);
			}
			continue;
		}
		if (!icon) {
			link.querySelector(ICON_SELECTOR)?.remove();
		} else if (!hasIcon(link)) {
			link.insertAdjacentHTML('afterbegin', icon);
		}
	}
};
