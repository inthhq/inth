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
	computed,
	Directive,
	effect,
	inject,
	input,
	output,
} from '@angular/core';
import * as dialog from '@inth/sdk/ui/styles/sheets/dialog-deferred';
import * as expand from '@inth/sdk/ui/styles/sheets/expand-deferred';

import { ConsentManager } from '../core/consent-manager';
import { ConsentStyles, SURFACE_SCOPES } from '../core/consent-styles';
import type { SurfaceStyleSheet } from '../core/consent-styles';
import { resolveNoStyle } from '../core/no-style-scope';
import { hasSaleRight } from '../parts/sale-rights-row';

/**
 * The options' rules: the in-place panel, then the dialog's rows over it.
 * The dialog sheet carries the switch and category rows.
 */
export const PANEL_SHEETS: readonly SurfaceStyleSheet[] = [expand, dialog];

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
