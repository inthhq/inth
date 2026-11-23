import {
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	input,
	signal,
} from '@angular/core';
import type { KernelBranding } from '@inth/sdk/engine';
import styles from '@inth/sdk/ui/styles/components/branding';
import {
	resolveBrandingTag,
	resolveStyles,
	toStyleAttributeValue,
} from '@inth/sdk/ui/utils';
import type { BrandingSurface } from '@inth/sdk/ui/utils';

import { ConsentManager } from '../core/consent-manager';
import { ConsentTheme } from '../core/consent-theme';
import { resolveNoStyle } from '../core/no-style';
import { BrandMarkIcon } from './icons';

/**
 * Whether a surface renders its attribution. Wrap the
 * {@link Branding} host in `@if` with this.
 *
 * @param branding - `ConsentManager.branding()`.
 * @param hideBranding - The surface's `hideBranding` input.
 * @returns `true` unless the surface hides it or the backend sent `none`.
 */
export const shouldShowBranding = function shouldShowBranding(
	branding: KernelBranding,
	hideBranding: boolean
): boolean {
	return !hideBranding && branding !== 'none';
};

/**
 * The "Consent by" attribution link. The host is the `<a>`; render it only
 * when {@link shouldShowBranding} is `true`.
 *
 * @example
 * ```html
 * @if (showBranding()) {
 *   <a inth-branding [surface]="'banner'"></a>
 * }
 * ```
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.data-branding]': 'tag()?.brand',
		'[attr.data-testid]': 'tag()?.testId',
		'[attr.data-variant]': 'tag()?.variant',
		'[attr.href]': 'tag()?.href',
		'[class]': 'className()',
		'[style]': 'style()',
	},
	imports: [BrandMarkIcon],
	selector: 'a[inth-branding]',
	// No `dir` on the host: the copy follows the page direction and only
	// the wordmark is pinned to LTR.
	template: `@if (tag(); as tag) {
		<span
			[class]="tag.classes.content"
			data-slot="tag-content"
		>
			<span [class]="tag.classes.copy">
				<span [class]="tag.classes.text">{{
					translations().common.securedBy
				}}</span>
			</span>
			<span
				dir="ltr"
				[class]="tag.classes.wordmark"
			>
				@if (tag.brand === 'inth') {
					<svg
						inth-brand-mark-icon
						[mark]="'inth'"
					></svg>
				} @else {
					<span [class]="tag.classes.mark">
						<svg
							inth-brand-mark-icon
							[mark]="'c15t'"
						></svg>
					</span>
					<span [class]="tag.classes.label">c15t</span>
				}
			</span>
		</span>
	}`,
})
export class Branding {
	readonly #consent = inject(ConsentManager);
	readonly #theme = inject(ConsentTheme);

	/** The surface the tag sits on. */
	readonly surface = input.required<BrandingSurface>();
	/** Drop the stock classes. Defaults to the provider's `noStyle`. */
	readonly noStyle = input<boolean | undefined>(undefined);
	readonly #noStyle = resolveNoStyle(this.noStyle);

	/** @internal */
	protected readonly translations = this.#consent.copy;

	readonly #hostname = signal('');
	/** @internal */
	protected readonly tag = computed(() =>
		resolveBrandingTag({
			branding: this.#consent.branding(),
			hostname: this.#hostname(),
			noStyle: this.#noStyle(),
			styles,
			surface: this.surface(),
		})
	);

	readonly #style = computed(() => {
		const tag = this.tag();
		return tag
			? resolveStyles(
					tag.slot,
					this.#theme.theme(),
					{ baseClassName: tag.classes.root },
					this.#noStyle()
				)
			: {};
	});
	/** @internal */
	protected readonly className = computed(() => this.#style().className ?? '');
	/** @internal */
	protected readonly style = computed(
		() => toStyleAttributeValue(this.#style().style) ?? ''
	);

	constructor() {
		afterNextRender(() => {
			this.#hostname.set(window.location.hostname);
		});
	}
}
