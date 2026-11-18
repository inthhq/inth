import {
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	input,
	signal,
} from '@angular/core';
import styles from '@inth/sdk/ui/styles/components/branding';

import { ConsentManager } from '../core/consent-manager';
import { ConsentTheme } from '../core/consent-theme';
import { resolveNoStyle } from '../core/no-style';
import { resolveComponentStyles, toStyleAttribute } from '../core/slot-styles';
import { BrandMarkIcon, InthLogo } from './icons';
import { resolvedTranslations } from './translations';

/** The attribution a surface shows. */
export type ResolvedBranding = 'c15t' | 'inth' | 'none';

/** Where the attribution sits. */
export type BrandingVariant = 'footer' | 'dialog-tag' | 'banner-tag';

/** The theme slots that style the attribution. */
export type BrandingThemeKey =
	| 'consentBannerTag'
	| 'consentDialogTag'
	| 'consentWidgetTag'
	| 'iabConsentBannerTag'
	| 'iabConsentDialogTag';

/**
 * Maps the snapshot's `branding` to the attribution shown.
 *
 * @param value - `ConsentManager.branding()`.
 * @returns `none`, `inth` (also for `consent`), or `c15t`.
 */
export const resolveBranding = function resolveBranding(
	value: string
): ResolvedBranding {
	if (value === 'none') {
		return 'none';
	}
	if (value === 'inth' || value === 'consent') {
		return 'inth';
	}
	return 'c15t';
};

/**
 * Whether a surface renders its attribution. Wrap the
 * {@link Branding} host in `@if` with this.
 *
 * @param branding - `ConsentManager.branding()`.
 * @param hideBranding - The surface's `hideBranding` input.
 * @returns `true` when the attribution shows.
 */
export const shouldShowBranding = function shouldShowBranding(
	branding: string,
	hideBranding: boolean
): boolean {
	return !hideBranding && resolveBranding(branding) !== 'none';
};

/**
 * The "Secured by c15t" (or INTH) attribution link. The host is the `<a>`;
 * render it only when {@link shouldShowBranding} is `true`.
 *
 * @example
 * ```html
 * @if (showBranding()) {
 *   <a c15t-branding variant="banner-tag" themeKey="consentBannerTag"></a>
 * }
 * ```
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.data-branding]': 'resolved()',
		'[attr.data-variant]': 'variant()',
		'[class]': 'className()',
		'[href]': 'href()',
		'[style]': 'style()',
	},
	imports: [BrandMarkIcon, InthLogo],
	selector: 'a[c15t-branding]',
	// No `dir` on the host: the copy follows the page direction and only
	// the wordmark is pinned to LTR.
	// Under `noStyle` the content drops its class; the wordmark inside keeps
	// its own, as React's `Branding` does.
	template: `<span
		[class]="contentClass()"
		data-slot="tag-content"
	>
		<span [class]="classes.brandingCopy || ''">
			<span [class]="classes.brandingText || ''">{{
				translations().common.securedBy
			}}</span>
		</span>
		@if (resolved() === 'inth') {
			<span
				dir="ltr"
				[class]="
					(classes.brandingWordmark || '') + ' ' + (classes.brandingInth || '')
				"
			>
				<svg
					c15t-inth-logo
					aria-hidden="true"
				></svg>
			</span>
		} @else {
			<span
				dir="ltr"
				[class]="
					(classes.brandingWordmark || '') + ' ' + (classes.brandingC15T || '')
				"
			>
				<span [class]="classes.brandingC15TMark || ''">
					<svg
						c15t-brand-mark-icon
						aria-hidden="true"
					></svg>
				</span>
				<span [class]="classes.brandingWordmarkLabel || ''">c15t</span>
			</span>
		}
	</span>`,
})
export class Branding {
	readonly #consent = inject(ConsentManager);
	readonly #theme = inject(ConsentTheme);

	/** Drop the stock classes. Defaults to the provider's `noStyle`. */
	readonly noStyle = input<boolean | undefined>(undefined);
	readonly #noStyle = resolveNoStyle(this.noStyle);
	/** @internal */
	protected readonly contentClass = computed(() =>
		this.#noStyle() ? '' : this.classes.brandingContent || ''
	);
	/** Where the attribution sits. */
	readonly variant = input<BrandingVariant>('footer');
	/** The theme slot that styles it. */
	readonly themeKey = input<BrandingThemeKey>('consentDialogTag');

	/** @internal */
	protected readonly classes = styles;
	/** @internal */
	protected readonly translations = resolvedTranslations(this.#consent);
	/** @internal */
	protected readonly resolved = computed(() =>
		resolveBranding(this.#consent.branding())
	);

	readonly #hostname = signal('');
	/** @internal */
	protected readonly href = computed(() => {
		const host = this.#hostname();
		const ref = host ? `?ref=${host}` : '';
		return this.resolved() === 'inth'
			? `https://inth.com${ref}`
			: `https://c15t.com${ref}`;
	});

	readonly #style = computed(() => {
		const variant = this.variant();
		const baseClassName = [
			styles.branding,
			variant === 'footer' ? '' : styles.brandingTag,
			variant === 'dialog-tag' ? styles.brandingTagDialog : '',
			variant === 'banner-tag' ? styles.brandingTagBanner : '',
		]
			.filter(Boolean)
			.join(' ');
		return resolveComponentStyles(
			this.themeKey(),
			this.#theme.theme(),
			{ baseClassName },
			this.#noStyle()
		);
	});
	/** @internal */
	protected readonly className = computed(() => this.#style().className ?? '');
	/** @internal */
	protected readonly style = computed(
		() => toStyleAttribute(this.#style().style) ?? ''
	);

	constructor() {
		afterNextRender(() => {
			this.#hostname.set(window.location.hostname);
		});
	}
}
