import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	input,
} from '@angular/core';
import buttonStyles from '@inth/sdk/ui/styles/components/button';
import { resolveActionAppearance } from '@inth/sdk/ui/theme';
import type { AllThemeKeys, ConsentActionKey } from '@inth/sdk/ui/theme';

import { ConsentTheme } from '../core/consent-theme';
import { resolveNoStyle } from '../core/no-style';
import type { ConsentButtonMode, ConsentButtonVariant } from '../shared';
import { slotPart } from './class-names';

/**
 * Actions the server-rendered banner's early-tap script would replay
 * through the stock surface actions. A choice button decides its own
 * click, so it opts out of that replay (`EARLY_TAP_OPT_OUT`, `data-early-tap`), as
 * React's `ConsentButton` with its own `onClick` does.
 */
const EARLY_TAP_ACTIONS = new Set(['accept', 'customize', 'dismiss', 'reject']);

/**
 * A choice button: styled like the stock consent buttons, with
 * the theme's action appearance, but it records nothing itself. The
 * surface that renders it decides the click, as React's `ConsentButton`
 * with `performDefaultAction={false}` does.
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.class]': 'part().className',
		'[attr.data-action]': 'consentAction() ?? null',
		'[attr.data-early-tap]': 'earlyTapOptOut()',
		'[attr.data-mode]': 'resolvedNoStyle() ? null : appearance().mode',
		'[attr.data-size]': 'resolvedNoStyle() ? null : "small"',
		'[attr.data-variant]': 'resolvedNoStyle() ? null : appearance().variant',
		'[attr.style]': 'part().style',
		type: 'button',
	},
	selector: 'button[inth-choice-button]',
	template: '<ng-content />',
})
export class ChoiceButton {
	readonly #theme = inject(ConsentTheme);

	/** The theme action whose appearance it takes, and its `data-action`. */
	readonly consentAction = input<ConsentActionKey | undefined>(undefined);
	/** Styled as the primary action. */
	readonly primary = input(false);
	/** A fixed color, in place of the action's appearance. */
	readonly variant = input<ConsentButtonVariant | undefined>(undefined);
	/** A fixed fill, in place of the action's appearance. */
	readonly mode = input<ConsentButtonMode | undefined>(undefined);
	/** The theme slot that styles it. Defaults to the primary or secondary button's. */
	readonly slot = input<AllThemeKeys | undefined>(undefined);
	/** A stock class after the button's own. */
	readonly baseClass = input<string | undefined>(undefined);
	/** Drop the stock classes. Defaults to the surface's `noStyle`. */
	readonly noStyle = input<boolean | undefined>(undefined);
	/**
	 * The surface replays a tap the early-tap script held on this button,
	 * as the consent prompt does, so the button leaves the script on.
	 */
	readonly earlyTap = input(false);

	/** @internal */
	protected readonly resolvedNoStyle = resolveNoStyle(this.noStyle);

	/** @internal */
	protected readonly appearance = computed(() => {
		const variant = this.variant();
		const mode = this.mode();
		if (variant || mode) {
			return { mode: mode ?? 'stroke', variant: variant ?? 'neutral' };
		}
		return resolveActionAppearance(
			this.#theme.theme(),
			this.consentAction() ?? 'save',
			this.primary()
		);
	});

	/** @internal */
	protected readonly part = computed(() =>
		slotPart(
			this.slot() ??
				(this.appearance().variant === 'primary'
					? 'buttonPrimary'
					: 'buttonSecondary'),
			this.#theme.theme(),
			this.resolvedNoStyle(),
			buttonStyles.button,
			this.baseClass()
		)
	);

	/** @internal */
	protected readonly earlyTapOptOut = computed(() =>
		!this.earlyTap() && EARLY_TAP_ACTIONS.has(this.consentAction() ?? '')
			? 'off'
			: null
	);
}
