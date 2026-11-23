/**
 * The persistent "Your Privacy Choices" link for the page's footer, as
 * `PrivacyChoicesLink` is in `@inth/react`.
 *
 * @packageDocumentation
 */

import { resolvePrivacyChoicesLink } from '@inth/sdk-core';
import type { OptOutLinkVariant, Translations } from '@inth/sdk-core';
import { CPPA_OPT_OUT_ICON } from '@inth/sdk-ui/utils/opt-out-icon';

import { classes } from '../generated/styles';
import type { ConsentClient } from '../consent-client.model';
import { createOptOutIcon } from './create-opt-out-icon';

/** The opt-out icon's height in the link, in CSS pixels. */
const OPT_OUT_ICON_HEIGHT = 14;

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
 * California opt-out icon beside the Privacy Choices titles. It is also
 * the way back into the dialog under an opt-in policy, in the US or the
 * EU: it reads "Your Privacy Choices" there, with no opt-out icon, since
 * no opt-out right is offered.
 *
 * The button is `hidden` before a policy resolves and while an external
 * consent source owns consent. The dialog returns focus to it when the
 * element that opened the dialog is gone.
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
			{ variant: options.variant ?? client.presentation?.optOutLink }
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
			const icon = createOptOutIcon(
				options.noStyle ? undefined : classes.legalLinks.optOutIcon
			);
			if (!options.noStyle) {
				// The legal links' `.optOutIcon` rule sizes it where the page
				// loads `@inth/sdk/styles.css`. Without that sheet the icon
				// still carries an intrinsic size from its glyph: 14px tall at
				// the viewBox's ratio. Attributes, not a `style` attribute,
				// which a strict CSP blocks.
				const [, , width = 30, height = 14] = CPPA_OPT_OUT_ICON.viewBox
					.split(/\s+/u)
					.map(Number);
				icon.setAttribute('height', String(OPT_OUT_ICON_HEIGHT));
				icon.setAttribute(
					'width',
					String(Math.round((OPT_OUT_ICON_HEIGHT * width) / height))
				);
				icon.style.verticalAlign = 'middle';
				icon.style.marginInlineEnd = '0.25em';
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
