/**
 * The options a Privacy Choices prompt shows in place: the cookie
 * categories in the EU, the rights row and Preferences in the US. Loaded
 * on Customize, or at once by a side Drawer, with the stylesheets they
 * need, as `PrivacyChoicesPanel` is in `@inth/react`.
 *
 * @packageDocumentation
 * @internal
 */

import { resolvePreferencesRowCopy, resolveSaleRight } from '@inth/sdk-core';
import type { PrivacyChoicesPromptVariant, SaveUISource } from '@inth/sdk-core';

import { classes as styles } from '../../generated/privacy-choices/dialog';
import { classes as expandStyles } from '../../generated/privacy-choices/expand';
import { advertisingRow, createCategoryGroup } from './category-group';
import { cx, el } from './dom';
import type { PcChild } from './dom';
import { createSaleRightsRow } from './rights-row';
import { chevron } from './shared';
import type { PcEnv } from './shared';
import { OPTIONS_SHEETS } from './sheets';

/** What the panel renders each time. */
export interface PrivacyChoicesPanelProps {
	variant: PrivacyChoicesPromptVariant;
	/** Prefix for element ids inside the panel (SR-05). */
	idPrefix: string;
	uiSource?: SaveUISource;
}

/** One mounted panel. */
export interface PrivacyChoicesPanel {
	render: (env: PcEnv, props: PrivacyChoicesPanelProps) => PcChild[];
	after: (env: PcEnv) => void;
	dispose: () => void;
}

/**
 * The options for the prompt's variant (BNR-14, BNR-15):
 *
 * - EU: the cookie categories, staged on the prompt's draft until a Save,
 *   Accept or Reject.
 * - US opt-in: the rights row, which applies as in the dialog, then
 *   Preferences.
 * - US notice: the rights row, which applies at once (LAW-04).
 *
 * Banner panels always use accordions, never sheets (PERM-01).
 */
// oxlint-disable-next-line max-lines-per-function -- The panel and its US preferences disclosure.
export const createPrivacyChoicesPanel =
	function createPrivacyChoicesPanel(): PrivacyChoicesPanel {
		const rights = createSaleRightsRow();
		const categories = createCategoryGroup();
		const preferences = createCategoryGroup();
		let preferencesOpen = false;

		/**
		 * Preferences in a US panel: the cookie categories behind a disclosure.
		 * The category that decides sale follows the rights row instead of
		 * having a switch of its own (LAW-05, CAT-08).
		 */
		const usPreferences = function usPreferences(
			env: PcEnv,
			idPrefix: string
		): HTMLElement {
			const { noStyle, snapshot, draft } = env;
			const right = resolveSaleRight(snapshot);
			const sale = right.available ? right.category : null;
			const saleOn = right.selected === 'allow';
			const { displayedCategories, values } = draft.getState();
			const onCount = displayedCategories.filter(
				(name) => name !== 'necessary' && name !== sale && values[name]
			).length;
			const copy = resolvePreferencesRowCopy(env.t, onCount);
			const panelId = `${idPrefix}-preferences`;
			return el(
				'div',
				{},
				el(
					'button',
					{
						'aria-controls': panelId,
						'aria-expanded': preferencesOpen ? 'true' : 'false',
						class: cx(noStyle, styles.navRow),
						'data-testid': 'consent-banner-preferences-row',
						on: {
							click: () => {
								preferencesOpen = !preferencesOpen;
								env.rerender();
							},
						},
						type: 'button',
					},
					el(
						'span',
						{ class: cx(noStyle, styles.navRowLabel) },
						copy.title,
						el(
							'span',
							{ class: cx(noStyle, styles.navRowMeta) },
							`${copy.summary} · ${copy.onCount}`
						)
					),
					el('span', { class: cx(noStyle, styles.chevron) }, chevron())
				),
				el(
					'div',
					{
						class: cx(noStyle, expandStyles.panel),
						'data-open': preferencesOpen ? 'true' : 'false',
						id: panelId,
						inert: !preferencesOpen,
					},
					el(
						'div',
						{ class: cx(noStyle, expandStyles.inner) },
						el(
							'div',
							{ style: 'padding-top: 8px;' },
							preferences.render(env, {
								exclude: sale ? [sale] : [],
								footer: sale
									? advertisingRow(env, { idPrefix, on: saleOn })
									: null,
								idPrefix,
								testIdPrefix: 'consent-banner',
							})
						)
					)
				)
			);
		};

		return {
			after(env) {
				rights.after(env);
				categories.after(env);
				preferences.after(env);
			},
			dispose() {
				rights.dispose();
				categories.dispose();
				preferences.dispose();
			},
			render(env, props) {
				env.ctx.addSheets?.(OPTIONS_SHEETS);
				const row = () =>
					rights.render(env, {
						idPrefix: props.idPrefix,
						slotKey: 'consentBannerRightsRow',
						testIdPrefix: 'consent-banner',
						uiSource: props.uiSource,
					});
				if (props.variant === 'choice') {
					return [
						categories.render(env, {
							idPrefix: props.idPrefix,
							testIdPrefix: 'consent-banner',
						}),
					];
				}
				if (props.variant === 'us-consent') {
					return [row(), usPreferences(env, props.idPrefix)];
				}
				if (props.variant === 'notice') {
					return [row()];
				}
				return [];
			},
		};
	};
