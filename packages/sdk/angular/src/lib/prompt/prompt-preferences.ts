/**
 * The US opt-in prompt's Preferences, which the options panel
 * (`prompt-options-panel.ts`) renders in place.
 *
 * @packageDocumentation
 */

import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	input,
	signal,
} from '@angular/core';
import { resolveSaleRight } from '@inth/sdk/engine';
import type { AllConsentNames } from '@inth/sdk/engine';
import { resolvePreferencesRowCopy } from '@inth/sdk/surface-state';
import styles from '@inth/sdk/ui/styles/components/consent-dialog';
import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';

import { ConsentManager } from '../core/consent-manager';
import { resolveNoStyle } from '../core/no-style-scope';
import { AdvertisingRow, CategoryGroup } from '../parts/category-group';
import { ChevronIcon } from '../parts/chevron-icon';
import { bool, cx } from '../parts/part-class-names.model';
import { SurfaceDraft } from '../parts/surface-draft';

const NO_CATEGORIES: readonly AllConsentNames[] = [];

/**
 * The US opt-in prompt's Preferences: a row that opens the cookie
 * categories in place. The category that decides sale shows as a row that
 * follows the rights row, with no switch of its own (LAW-05, CAT-08).
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [AdvertisingRow, CategoryGroup, ChevronIcon],
	selector: 'div[inth-prompt-preferences]',
	template: `<button
			type="button"
			[attr.class]="cx(styles.navRow)"
			[attr.aria-expanded]="bool(preferencesOpen())"
			[attr.aria-controls]="preferencesPanelId()"
			data-testid="consent-banner-preferences-row"
			(click)="preferencesOpen.set(!preferencesOpen())"
		>
			<span [attr.class]="cx(styles.navRowLabel)"
				>{{ preferencesCopy().title
				}}<span [attr.class]="cx(styles.navRowMeta)">{{
					preferencesCopy().summary + ' · ' + preferencesCopy().onCount
				}}</span></span
			>
			<span [attr.class]="cx(styles.chevron)"
				><svg inth-chevron-glyph></svg
			></span>
		</button>
		<div
			[attr.class]="cx(expandStyles.panel)"
			[attr.id]="preferencesPanelId()"
			[attr.data-open]="bool(preferencesOpen())"
			[attr.inert]="preferencesOpen() ? null : ''"
		>
			<div [attr.class]="cx(expandStyles.inner)">
				<div [attr.class]="cx(styles.preferencesBody)">
					<div
						inth-category-group
						[idPrefix]="idPrefix()"
						[testIdPrefix]="'consent-banner'"
						[exclude]="saleExclude()"
					>
						@if (saleCategory()) {
							<div
								inth-advertising-row
								[on]="saleOn()"
								[idPrefix]="idPrefix()"
							></div>
						}
					</div>
				</div>
			</div>
		</div>`,
})
export class PromptPreferences {
	readonly #consent = inject(ConsentManager);
	readonly #draft = inject(SurfaceDraft);

	/** Prefix for element ids inside the panel (SR-05). */
	readonly idPrefix = input.required<string>();
	readonly noStyle = input<boolean | undefined>(undefined);

	/** @internal */
	protected readonly styles = styles;
	/** @internal */
	protected readonly expandStyles = expandStyles;
	/** @internal */
	protected readonly bool = bool;

	readonly #noStyle = resolveNoStyle(this.noStyle);
	/** @internal */
	protected readonly preferencesOpen = signal(false);

	readonly #sale = computed(() => resolveSaleRight(this.#consent.snapshot()));
	/** @internal */
	protected readonly saleCategory = computed(() => {
		const right = this.#sale();
		return right.available ? right.category : null;
	});
	/** @internal */
	protected readonly saleExclude = computed((): readonly AllConsentNames[] => {
		const sale = this.saleCategory();
		return sale ? [sale] : NO_CATEGORIES;
	});
	/** @internal */
	protected readonly saleOn = computed(() => this.#sale().selected === 'allow');
	/** @internal */
	protected readonly preferencesCopy = computed(() => {
		const { displayedCategories, values } = this.#draft.state();
		const sale = this.saleCategory();
		const onCount = displayedCategories.filter(
			(name) => name !== 'necessary' && name !== sale && values[name]
		).length;
		return resolvePreferencesRowCopy(this.#consent.copy(), onCount);
	});
	/** @internal */
	protected readonly preferencesPanelId = computed(
		() => `${this.idPrefix()}-preferences`
	);

	/** @internal */
	protected cx(...names: (string | undefined)[]): string | null {
		return cx(this.#noStyle(), ...names);
	}
}
