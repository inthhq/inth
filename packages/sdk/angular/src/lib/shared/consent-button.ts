import { isPlatformBrowser } from '@angular/common';
import {
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	inject,
	input,
	PLATFORM_ID,
} from '@angular/core';
import buttonStyles from '@inth/sdk/ui/styles/components/button';

import { ConsentManager } from '../core/consent-manager';
import { ConsentTheme } from '../core/consent-theme';
import { holdIdleDialogWarming, warmDialog } from '../core/dialog-warming';
import { resolveNoStyle } from '../core/no-style';
import { resolveComponentStyles, toStyleAttribute } from '../core/slot-styles';
import { SURFACE_CLOSED } from '../core/surface-close';

/**
 * What a {@link ConsentButton} does when clicked.
 *
 * - `accept`: grant every category and close the surface.
 * - `reject`: keep only the necessary categories and close the surface.
 * - `save`: save the categories selected in the preference center.
 * - `customize`: open the consent dialog without recording a choice.
 * - `dismiss`: acknowledge a notice.
 */
export type ConsentButtonAction =
	| 'accept'
	| 'reject'
	| 'save'
	| 'customize'
	| 'dismiss';

const SAVE_TYPES = {
	accept: 'all',
	reject: 'necessary',
	save: 'custom',
} as const;

/** The button's color: the theme's `buttonPrimary` or `buttonSecondary`. */
export type ConsentButtonVariant = 'primary' | 'neutral';

/** The button's fill. */
export type ConsentButtonMode = 'filled' | 'stroke' | 'lighter' | 'ghost';

/** The button's size. */
export type ConsentButtonSize = 'medium' | 'small' | 'xsmall' | 'xxsmall';

/**
 * A `<button>` that records a consent choice, styled like the stock
 * surfaces' buttons.
 *
 * A button whose action is `customize` also starts loading the deferred
 * consent dialog in idle time and on hover or focus, so the first open
 * does not wait for its code. A click handler that calls
 * `preventDefault()` before this one runs cancels the action.
 *
 * @example
 * ```html
 * <button c15t-consent-button action="accept" variant="primary">Accept all</button>
 * <button c15t-consent-button action="customize">Customize</button>
 * ```
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'(click)': 'run($event)',
		'(focus)': 'warm()',
		'(pointerenter)': 'warm()',
		'[attr.data-mode]': 'resolvedNoStyle() ? null : mode()',
		'[attr.data-size]': 'resolvedNoStyle() ? null : size()',
		'[attr.data-variant]': 'resolvedNoStyle() ? null : variant()',
		'[class]': 'className()',
		'[style]': 'style()',
		type: 'button',
	},
	selector: 'button[c15t-consent-button]',
	template: '<ng-content />',
})
export class ConsentButton {
	readonly #consent = inject(ConsentManager);
	readonly #surfaceClosed = inject(SURFACE_CLOSED, { optional: true });
	readonly #theme = inject(ConsentTheme);

	/** What the button does when clicked. */
	readonly action = input.required<ConsentButtonAction>();
	/** The button's color. */
	readonly variant = input<ConsentButtonVariant>('neutral');
	/** The button's fill. */
	readonly mode = input<ConsentButtonMode>('stroke');
	/** The button's size. */
	readonly size = input<ConsentButtonSize>('small');
	/** Drop the stock classes. Defaults to the provider's `noStyle`. */
	readonly noStyle = input<boolean | undefined>(undefined);

	/** @internal */
	protected readonly resolvedNoStyle = resolveNoStyle(this.noStyle);

	readonly #resolved = computed(() => {
		const noStyle = this.resolvedNoStyle();
		return resolveComponentStyles(
			this.variant() === 'primary' ? 'buttonPrimary' : 'buttonSecondary',
			this.#theme.theme(),
			{ baseClassName: noStyle ? undefined : buttonStyles.button, noStyle },
			noStyle
		);
	});

	/** @internal */
	protected readonly className = computed(
		() => this.#resolved().className ?? ''
	);

	/** @internal */
	protected readonly style = computed(
		() => toStyleAttribute(this.#resolved().style) ?? ''
	);

	constructor() {
		if (!isPlatformBrowser(inject(PLATFORM_ID))) {
			return;
		}
		const destroyRef = inject(DestroyRef);
		afterNextRender(() => {
			if (this.action() === 'customize') {
				destroyRef.onDestroy(
					holdIdleDialogWarming(this.#theme.preloadDialog())
				);
			}
		});
	}

	/** @internal */
	protected warm(): void {
		if (this.action() === 'customize') {
			warmDialog();
		}
	}

	/**
	 * Performs the action, unless an earlier handler called
	 * `preventDefault()`.
	 *
	 * @param event - The click.
	 * @internal
	 */
	protected async run(event: Event): Promise<void> {
		if (event.defaultPrevented) {
			return;
		}
		const action = this.action();
		if (action === 'customize') {
			this.#consent.setActiveUI('dialog');
			return;
		}
		// The surface closes as soon as the choice is recorded locally. A
		// failed request is reported through `onError` and stays queued for
		// replay; a stale draft keeps the dialog open for review; an engine
		// that failed to load gives the surface back for another try. Either
		// way the click handler has nobody to rethrow the rejection to.
		try {
			await (action === 'dismiss'
				? this.#consent.dismissNotice()
				: this.#consent.saveConsents(SAVE_TYPES[action]));
			this.#surfaceClosed?.();
		} catch {
			// See above.
		}
	}
}
