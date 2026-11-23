/**
 * The options a Privacy Choices prompt shows in place: the cookie
 * categories in the EU, the rights row and Preferences in the US. Loaded
 * on Customize, or at once by a side Drawer, with the stylesheets they
 * need.
 *
 * @packageDocumentation
 */

import {
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	inject,
	input,
	output,
	signal,
} from '@angular/core';
import { resolveSaleRight } from '@inth/sdk/engine';
import type { AllConsentNames, SaveUISource } from '@inth/sdk/engine';
import { resolvePreferencesRowCopy } from '@inth/sdk/surface-state';
import type { PrivacyChoicesPromptVariant } from '@inth/sdk/surface-state';
import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';
import styles from '@inth/sdk/ui/styles/components/privacy-choices';
import * as expand from '@inth/sdk/ui/styles/sheets/expand-deferred';
import * as privacyChoicesDialog from '@inth/sdk/ui/styles/sheets/privacy-choices-dialog-deferred';

import { ConsentManager } from '../../core/consent-manager';
import { ConsentStyles, SURFACE_SCOPES } from '../../core/consent-styles';
import type { SurfaceStyleSheet } from '../../core/consent-styles';
import { resolveNoStyle } from '../../core/no-style';
import {
	AdvertisingRow,
	CategoryGroup,
} from '../../privacy-choices/category-group';
import { ChevronIcon } from '../../privacy-choices/icons';
import { bool, cx } from '../../privacy-choices/parts';
import { hasSaleRight, SaleRightsRow } from '../../privacy-choices/rights-row';
import { SurfaceDraft } from '../../privacy-choices/surface-draft';

/**
 * The options' rules: the in-place panel, then the v6 rows over it. The
 * v6 sheet carries its own switch and category rows, so the classic
 * dialog sheet stays off the page.
 */
export const PANEL_SHEETS: readonly SurfaceStyleSheet[] = [
	expand,
	privacyChoicesDialog,
];

const NO_CATEGORIES: readonly AllConsentNames[] = [];

/**
 * The options for the prompt's variant (BNR-14, BNR-15):
 *
 * - EU: the cookie categories, staged on the prompt's draft until a Save,
 *   Accept or Reject.
 * - US opt-in: the rights row, which applies as in the dialog, then
 *   Preferences: the cookie categories behind a disclosure. The category
 *   that decides sale follows the rights row instead of having a switch of
 *   its own (LAW-05, CAT-08).
 * - US notice: the rights row, which applies at once (LAW-04).
 *
 * Banner panels always use accordions, never sheets (PERM-01).
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { style: 'display: contents' },
	imports: [AdvertisingRow, CategoryGroup, ChevronIcon, SaleRightsRow],
	selector: 'inth-pc-panel',
	template: `@if (variant() === 'choice') {
			<div
				inth-pc-category-group
				[idPrefix]="idPrefix()"
				testIdPrefix="consent-banner"
			></div>
		} @else if (variant() === 'us-consent' || variant() === 'notice') {
			@if (saleAvailable()) {
				<section
					inth-pc-rights-row
					[idPrefix]="idPrefix()"
					testIdPrefix="consent-banner"
					[uiSource]="uiSource()"
					slot="consentBannerRightsRow"
				></section>
			}
			@if (variant() === 'us-consent') {
				<div>
					<button
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
							><svg inth-pc-chevron></svg
						></span>
					</button>
					<div
						[attr.class]="cx(expandStyles.panel)"
						[attr.id]="preferencesPanelId()"
						[attr.data-open]="bool(preferencesOpen())"
						[attr.inert]="preferencesOpen() ? null : ''"
					>
						<div [attr.class]="cx(expandStyles.inner)">
							<div style="padding-top: 8px">
								<div
									inth-pc-category-group
									[idPrefix]="idPrefix()"
									testIdPrefix="consent-banner"
									[exclude]="saleExclude()"
								>
									@if (saleCategory()) {
										<div
											inth-pc-advertising-row
											[on]="saleOn()"
											[idPrefix]="idPrefix()"
										></div>
									}
								</div>
							</div>
						</div>
					</div>
				</div>
			}
		}`,
})
export class PrivacyChoicesPanel {
	readonly #consent = inject(ConsentManager);
	readonly #styles = inject(ConsentStyles);
	readonly #draft = inject(SurfaceDraft);

	readonly variant = input.required<PrivacyChoicesPromptVariant>();
	/** Prefix for element ids inside the panel (SR-05). */
	readonly idPrefix = input.required<string>();
	readonly uiSource = input<SaveUISource | undefined>(undefined);
	readonly noStyle = input<boolean | undefined>(undefined);
	/** Emits once the options render, so the prompt can focus the first one. */
	readonly ready = output();

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
	protected readonly saleAvailable = computed(() =>
		hasSaleRight(this.#consent.snapshot())
	);
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

	constructor() {
		effect(() => {
			this.#styles.ensure(PANEL_SHEETS, this.#noStyle(), SURFACE_SCOPES.banner);
		});
		afterNextRender(() => {
			this.ready.emit();
		});
	}

	/** @internal */
	protected cx(...names: (string | undefined)[]): string | null {
		return cx(this.#noStyle(), ...names);
	}
}
