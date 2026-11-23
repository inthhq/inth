/**
 * The options the consent prompt shows in place: the cookie
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
	Directive,
	effect,
	inject,
	input,
	output,
	signal,
} from '@angular/core';
import { resolveSaleRight } from '@inth/sdk/engine';
import type { AllConsentNames } from '@inth/sdk/engine';
import { resolvePreferencesRowCopy } from '@inth/sdk/surface-state';
import styles from '@inth/sdk/ui/styles/components/consent-dialog';
import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';
import * as dialog from '@inth/sdk/ui/styles/sheets/dialog-deferred';
import * as expand from '@inth/sdk/ui/styles/sheets/expand-deferred';

import { ConsentManager } from '../core/consent-manager';
import { ConsentStyles, SURFACE_SCOPES } from '../core/consent-styles';
import type { SurfaceStyleSheet } from '../core/consent-styles';
import { resolveNoStyle } from '../core/no-style';
import { AdvertisingRow, CategoryGroup } from '../parts/category-group';
import { bool, cx } from '../parts/class-names';
import { ChevronIcon } from '../parts/icons';
import { hasSaleRight } from '../parts/rights-row';
import { SurfaceDraft } from '../parts/surface-draft';

/**
 * The options' rules: the in-place panel, then the dialog's rows over it.
 * The dialog sheet carries the switch and category rows.
 */
export const PANEL_SHEETS: readonly SurfaceStyleSheet[] = [expand, dialog];

const NO_CATEGORIES: readonly AllConsentNames[] = [];

/**
 * The options for the prompt's variant (BNR-14, BNR-15):
 *
 * - EU: the cookie categories, staged on the prompt's draft until a Save,
 *   which applies them.
 * - US opt-in: the rights row, which applies as in the dialog, then
 *   Preferences: the cookie categories behind a disclosure. The category
 *   that decides sale follows the rights row instead of having a switch of
 *   its own (LAW-05, CAT-08).
 * - US notice: the rights row, which applies at once (LAW-04).
 *
 * Banner panels always use accordions, never sheets (PERM-01).
 *
 * The prompt renders the options itself, inside its deferred block; this
 * directive sits on an `<ng-container>` around them. A component would add
 * its own element between the scroll area and the options, which React's
 * markup has no counterpart for. It loads the options' stylesheets and
 * tells the prompt once they render.
 *
 * @internal
 */
@Directive({
	exportAs: 'inthPromptOptions',
	selector: '[inthPromptOptions]',
})
export class PromptOptionsPanel {
	readonly #consent = inject(ConsentManager);
	readonly #styles = inject(ConsentStyles);

	readonly noStyle = input<boolean | undefined>(undefined);
	/** Emits once the options render, so the prompt can focus the first one. */
	readonly ready = output();

	readonly #noStyle = resolveNoStyle(this.noStyle);
	/** Whether the rights row has a sale right to show. */
	readonly saleAvailable = computed(() =>
		hasSaleRight(this.#consent.snapshot())
	);

	constructor() {
		effect(() => {
			this.#styles.ensure(PANEL_SHEETS, this.#noStyle(), SURFACE_SCOPES.banner);
		});
		afterNextRender(() => {
			this.ready.emit();
		});
	}
}

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
