/**
 * The persistent "Your Privacy Choices" link for the page's footer, as
 * `PrivacyChoicesLink` is in `@inth/react`.
 *
 * @packageDocumentation
 */

import {
	resolveConsentDesign,
	resolvePrivacyChoicesLink,
} from '@inth/sdk-core';
import type { OptOutLinkVariant, Translations } from '@inth/sdk-core';

import type { ConsentClient } from '../types';
import { createOptOutIcon } from './opt-out-icon';

/** Options for {@link createPrivacyChoicesLink}. */
export interface PrivacyChoicesLinkOptions {
	/**
	 * Override `presentation.optOutLink` for this link: `'privacy-choices'`,
	 * `'california-privacy-choices'`, or `'do-not-sell'`.
	 */
	variant?: OptOutLinkVariant;
	/** Link text instead of the resolved title. */
	label?: string;
	/** Class names for the button. */
	className?: string;
	/** Leave the opt-out icon unsized, for fully custom CSS. */
	noStyle?: boolean;
}

/** A mounted "Your Privacy Choices" link. */
export interface PrivacyChoicesLinkHandle {
	/** The button. Place it in the page, for example in the footer. */
	readonly element: HTMLButtonElement;
	/** Stop following the client. The button stays where it was placed. */
	destroy: () => void;
}

/**
 * A "Your Privacy Choices" button that opens the preference dialog. It
 * never records an opt-out on its own.
 *
 * Under an opt-out policy with the `opt-out` right it reads the title for
 * the configured `presentation.optOutLink` (or `variant`), with the
 * California opt-out icon beside the Privacy Choices titles. Under
 * `presentation.design: 'privacy-choices'` it is also the way back into
 * the dialog under an opt-in policy, in the US or the EU: it reads "Your
 * Privacy Choices" there, with no opt-out icon, since no opt-out right is
 * offered.
 *
 * The button is `hidden` when the active policy gives no opt-out right (on
 * the classic design), before a policy resolves, and while an external
 * consent source owns consent. The Privacy Choices dialog returns focus to
 * it when the element that opened the dialog is gone.
 *
 * @example
 * ```ts
 * const link = createPrivacyChoicesLink(inth);
 * document.querySelector('footer')?.append(link.element);
 * ```
 */
export const createPrivacyChoicesLink = function createPrivacyChoicesLink(
	client: ConsentClient,
	options: PrivacyChoicesLinkOptions = {}
): PrivacyChoicesLinkHandle {
	const element = document.createElement('button');
	element.type = 'button';
	element.setAttribute('data-testid', 'privacy-choices-link');
	if (options.className) {
		element.className = options.className;
	}
	element.addEventListener('click', () => {
		client.openDialog();
	});

	let rendered: string | null = null;
	const render = function render(): void {
		const snapshot = client.getSnapshot();
		const link = resolvePrivacyChoicesLink(
			snapshot,
			snapshot.translations?.translations as Partial<Translations> | undefined,
			{
				design: resolveConsentDesign(client.presentation),
				variant: options.variant ?? client.presentation?.optOutLink,
			}
		);
		const rights = snapshot.policyRule.rights.join(' ');
		const key = link
			? `${link.variant}|${link.label}|${link.icon ? 1 : 0}|${rights}`
			: '';
		if (key === rendered) {
			return;
		}
		rendered = key;
		element.hidden = link === null;
		if (!link) {
			element.replaceChildren();
			element.removeAttribute('data-inth-rights');
			element.removeAttribute('data-opt-out-variant');
			return;
		}
		element.setAttribute('data-inth-rights', rights);
		// A link that only reopens the dialog is not an opt-out link.
		if (link.variant === 'choices') {
			element.removeAttribute('data-opt-out-variant');
		} else {
			element.setAttribute('data-opt-out-variant', link.variant);
		}
		const label = options.label ?? link.label;
		if (link.icon) {
			const icon = createOptOutIcon();
			if (!options.noStyle) {
				// The stock stylesheet does not reach the page, so the icon
				// carries its own size.
				icon.setAttribute(
					'style',
					'display: inline-block; height: 1em; width: auto; aspect-ratio: 30 / 14; vertical-align: middle; margin-inline-end: 0.25em;'
				);
			}
			element.replaceChildren(icon, label);
		} else {
			element.replaceChildren(label);
		}
	};

	render();
	const unsubscribe = client.subscribe(render);
	return {
		destroy: unsubscribe,
		element,
	};
};
