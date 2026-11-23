import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	input,
} from '@angular/core';
import { resolveStyles, toStyleAttributeValue } from '@inth/sdk/ui/utils';

import { ConsentTheme } from '../core/consent-theme';
import { resolveNoStyle } from '../core/no-style-scope';

/**
 * The overlay class names, from the caller's own style map. The overlay
 * imports none itself, so a page with only the banner does not ship the
 * dialog or IAB class maps.
 */
export interface OverlayStyles {
	readonly overlay?: string;
	readonly overlayVisible?: string;
	readonly overlayEntering?: string;
	readonly overlayHidden?: string;
}

/** Which surface the overlay sits behind. */
export type OverlayVariant = 'banner' | 'dialog' | 'iab-banner' | 'iab-dialog';

const THEME_KEYS = {
	banner: 'consentBannerOverlay',
	dialog: 'consentDialogOverlay',
	'iab-banner': 'iabConsentBannerOverlay',
	'iab-dialog': 'iabConsentDialogOverlay',
} as const;

const TEST_IDS = {
	banner: 'consent-banner-overlay',
	dialog: 'consent-dialog-overlay',
	'iab-banner': 'iab-consent-banner-overlay',
	'iab-dialog': 'iab-consent-dialog-overlay',
} as const;

/**
 * The backdrop behind a blocking surface. The host is the overlay `<div>`.
 *
 * @example
 * ```html
 * <div inth-overlay [styles]="styles" variant="dialog" [visible]="open()"></div>
 * ```
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.data-entry]': 'lateEntry() ? "late" : null',
		'[attr.data-testid]': 'testId()',
		'[class]': 'className()',
		'[style]': 'style()',
		'aria-hidden': 'true',
	},
	selector: 'div[inth-overlay]',
	template: '',
})
export class Overlay {
	readonly #theme = inject(ConsentTheme);

	/** The overlay class names from the surface's style map. */
	readonly styles = input.required<OverlayStyles>();
	/** Which surface the overlay sits behind. */
	readonly variant = input<OverlayVariant>('banner');
	/** Show the overlay. A hidden one fades out. */
	readonly visible = input(true);
	/**
	 * Add the entering class on a visible overlay. Defaults to the theme's
	 * animation setting.
	 */
	readonly entering = input<boolean | undefined>(undefined);
	/** Mark the mount `data-entry="late"`, for a surface that arrives late. */
	readonly lateEntry = input(false);
	/** Drop the stock classes. Defaults to the surface's `noStyle`. */
	readonly noStyle = input<boolean | undefined>(undefined);
	readonly #noStyle = resolveNoStyle(this.noStyle);

	/** @internal */
	protected readonly testId = computed(() => TEST_IDS[this.variant()]);

	readonly #style = computed(() =>
		resolveStyles(
			THEME_KEYS[this.variant()],
			this.#theme.theme(),
			{ baseClassName: this.styles().overlay },
			this.#noStyle()
		)
	);

	/** @internal */
	protected readonly className = computed(() => {
		const base = this.#style().className || '';
		if (this.#noStyle()) {
			return base;
		}
		const styles = this.styles();
		if (!this.visible()) {
			return `${base} ${styles.overlayHidden}`;
		}
		const entering =
			(this.entering() ?? !this.#theme.disableAnimation()) &&
			styles.overlayEntering;
		return `${base} ${styles.overlayVisible}${entering ? ` ${entering}` : ''}`;
	});

	/** @internal */
	protected readonly style = computed(
		() => toStyleAttributeValue(this.#style().style) ?? ''
	);
}
