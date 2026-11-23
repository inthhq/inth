import { isPlatformBrowser } from '@angular/common';
import {
	afterNextRender,
	computed,
	DestroyRef,
	Directive,
	effect,
	ElementRef,
	inject,
	input,
	PLATFORM_ID,
} from '@angular/core';
import type { PolicyRight } from '@inth/sdk/schema/types';
import { activateOptOutLink } from '@inth/sdk/surface-actions';
import { resolveOptOutLink } from '@inth/sdk/surface-state';
import legalLinkStyles from '@inth/sdk/ui/styles/components/legal-links';
import { CPPA_OPT_OUT_ICON } from '@inth/sdk/ui/utils';

import { ConsentManager } from '../core/consent-manager';
import { ConsentTheme } from '../core/consent-theme';
import { holdIdleDialogWarming, warmDialog } from '../core/dialog-warming';
import { OPT_OUT_ICON_SIZE } from '../shared/icons';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The icon's class and size. It takes its own size, as
 * `<inth-privacy-choices-link>` gives it, except under `noStyle`, which
 * leaves sizing to the host.
 */
const styleOptOutIcon = function styleOptOutIcon(
	svg: SVGSVGElement,
	noStyle: boolean
): void {
	const className = noStyle ? undefined : legalLinkStyles.optOutIcon;
	if (className) {
		svg.setAttribute('class', className);
	} else {
		svg.removeAttribute('class');
	}
	if (noStyle) {
		svg.removeAttribute('width');
		svg.removeAttribute('height');
	} else {
		svg.setAttribute('width', String(OPT_OUT_ICON_SIZE.width));
		svg.setAttribute('height', String(OPT_OUT_ICON_SIZE.height));
	}
};

const createOptOutIconElement = function createOptOutIconElement(
	doc: Document,
	noStyle: boolean
): SVGSVGElement {
	const svg = doc.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('focusable', 'false');
	svg.setAttribute('viewBox', CPPA_OPT_OUT_ICON.viewBox);
	styleOptOutIcon(svg, noStyle);
	for (const path of CPPA_OPT_OUT_ICON.paths) {
		const node = doc.createElementNS(SVG_NS, 'path');
		node.setAttribute('d', path.d);
		node.setAttribute('fill', path.fill);
		if (path.evenOdd) {
			node.setAttribute('clip-rule', 'evenodd');
			node.setAttribute('fill-rule', 'evenodd');
		}
		svg.append(node);
	}
	return svg;
};

/**
 * Turns the host, typically a footer `<button>` or `<a>`, into the control
 * that opens the consent dialog or exercises the opt-out right.
 *
 * Set `right="opt-out"` for a "Do Not Sell or Share" / "Your Privacy Choices"
 * link that opts out in one click and opens `<inth-opt-out-confirmation>`
 * under an opt-out policy. When `presentation.optOutLink` is set to either
 * "Privacy Choices" form, the mandated CPPA opt-out icon is prepended inside
 * the host element.
 *
 * @example
 * ```html
 * <button type="button" inthConsentDialogLink>Privacy settings</button>
 * <button type="button" inthConsentDialogLink right="opt-out"></button>
 * ```
 */
@Directive({
	host: {
		'(click)': 'open($event)',
		'(focus)': 'warm()',
		'(pointerenter)': 'warm()',
		'[attr.data-inth-rights]': 'offered() ? rights() : null',
		'[attr.data-opt-out-variant]': 'optOutLink()?.variant ?? null',
		'[attr.data-right]': 'right() ?? null',
		'[attr.data-testid]': 'offered() ? "consent-dialog-link" : null',
		'[attr.hidden]': 'offered() ? null : ""',
	},
	selector: '[inthConsentDialogLink]',
})
export class ConsentDialogLink {
	/** @internal */
	protected readonly consent = inject(ConsentManager);
	readonly #element = inject<ElementRef<HTMLElement>>(ElementRef);
	readonly #theme = inject(ConsentTheme);

	/**
	 * Persistent right this link exercises. Set to `'opt-out'` to record an
	 * opt-out in one click and open `<inth-opt-out-confirmation>` under an
	 * opt-out policy.
	 */
	readonly right = input<Exclude<PolicyRight, 'disclosure'> | undefined>(
		undefined
	);

	/**
	 * Whether the policy offers a way back to preferences. While it does
	 * not, the host is hidden and carries neither the test id nor the
	 * rights, as if it were not rendered.
	 */
	protected readonly offered = computed(() =>
		this.consent.hasConsentPreferences()
	);

	/** The rights the policy grants, space-separated. */
	protected readonly rights = computed(() =>
		this.consent.snapshot().policyRule.rights.join(' ')
	);

	/** @internal */
	protected readonly optOutLink = computed(() => {
		if (this.right() !== 'opt-out') {
			return null;
		}
		return resolveOptOutLink(
			this.consent.copy(),
			this.consent.presentation()?.optOutLink
		);
	});

	#icon: SVGSVGElement | null = null;
	#labelNode: Text | null = null;

	constructor() {
		const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
		const destroyRef = inject(DestroyRef);

		effect(() => {
			const link = this.optOutLink();
			const host = this.#element.nativeElement;
			const noStyle = this.#theme.noStyle();
			if (!link) {
				this.#icon?.remove();
				this.#icon = null;
				this.#labelNode?.remove();
				this.#labelNode = null;
				return;
			}
			const needsIcon = link.variant === 'privacy-choices';
			if (needsIcon) {
				if (this.#icon) {
					styleOptOutIcon(this.#icon, noStyle);
				} else {
					this.#icon = createOptOutIconElement(host.ownerDocument, noStyle);
					host.prepend(this.#icon);
				}
			} else if (this.#icon) {
				this.#icon.remove();
				this.#icon = null;
			}
			// Provide the statutory label when the host has no custom text.
			const customText = [...host.childNodes]
				.filter((node) => node !== this.#icon && node !== this.#labelNode)
				.map((node) => node.textContent ?? '')
				.join('')
				.trim();
			if (!customText) {
				if (this.#labelNode) {
					this.#labelNode.textContent = link.label;
				} else {
					this.#labelNode = host.ownerDocument.createTextNode(link.label);
					host.append(this.#labelNode);
				}
			} else if (this.#labelNode) {
				this.#labelNode.remove();
				this.#labelNode = null;
			}
		});

		if (!isBrowser) {
			return;
		}
		afterNextRender(() => {
			destroyRef.onDestroy(holdIdleDialogWarming(this.#theme.preloadDialog()));
		});
	}

	/**
	 * Runs the link action, unless a handler before it called `preventDefault()`.
	 *
	 * @internal
	 */
	protected open(event: Event): void {
		if (event.defaultPrevented) {
			return;
		}
		event.preventDefault();
		const link = this.optOutLink();
		if (link) {
			void activateOptOutLink(this.consent.kernel(), link.variant);
			return;
		}
		this.consent.setActiveUI('dialog');
	}

	/** @internal */
	protected warm(): void {
		warmDialog();
	}
}
