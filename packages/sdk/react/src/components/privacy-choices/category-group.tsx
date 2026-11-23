'use client';

/**
 * The cookie categories as one bordered group with inline descriptions
 * (CAT-01, CAT-06), on a preference draft. Shared by the Privacy Choices
 * banner panels and the dialog.
 */

import type { AllConsentNames } from '@inth/sdk/engine';
import {
	consentTypes,
	resolveCategoryTitle,
	resolvePrivacyChoicesCopy,
} from '@inth/sdk/surface-state';
import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';
import styles from '@inth/sdk/ui/styles/components/privacy-choices';
import type { MouseEvent, ReactNode } from 'react';

import { useTranslations } from '~/component-hooks/use-translations';
import { useConsentDraftSlice, useConsentDraftStore } from '~/draft';
import { useTheme } from '~/hooks/use-theme';

import { ChoiceSwitch } from './switch';

/** Surfaces that render the category group, by their test-id prefix. */
export type CategoryGroupSurface = 'consent-banner';

/**
 * The group's test ids on each surface, spelled out so each one matches
 * `internals/conformance/src/contract/test-ids.ts`. A switch's id is the
 * prefix plus its category.
 */
const GROUP_TEST_IDS = {
	'consent-banner': {
		group: 'consent-banner-category-group',
		switchPrefix: 'consent-banner-category-switch-',
	},
} as const satisfies Record<CategoryGroupSurface, Record<string, string>>;

/** Props for {@link CategoryGroup}. */
export interface CategoryGroupProps {
	/**
	 * Prefix for the rows' element ids, one per layer, so a switch's
	 * `aria-labelledby` never resolves into another layer (SR-05).
	 */
	idPrefix: string;
	/** The surface it renders on, which prefixes its test ids. */
	testIdPrefix: CategoryGroupSurface;
	/**
	 * Categories to leave out, such as the one that decides sale in the US,
	 * which follows the rights row instead (LAW-05, CAT-08).
	 */
	exclude?: readonly AllConsentNames[];
	/** A row after the categories, such as the read-only advertising row. */
	footer?: ReactNode;
	noStyle?: boolean;
}

const NO_CATEGORIES: readonly AllConsentNames[] = [];

const cx = (noStyle: boolean | undefined, ...names: (string | undefined)[]) =>
	noStyle ? undefined : names.filter(Boolean).join(' ') || undefined;

/**
 * Whether a click on a row's text should toggle its switch (CAT-10): not
 * on a link, nor while the visitor selected text.
 */
const isToggleClick = function isToggleClick(
	event: MouseEvent<HTMLElement>
): boolean {
	const target = event.target as Element | null;
	if (target?.closest('a, button, input')) {
		return false;
	}
	const selection = event.currentTarget.ownerDocument.getSelection();
	return !selection || selection.isCollapsed;
};

/**
 * One row per displayed category: its name and one-sentence description
 * inline, and a switch named by both (SR-06). `necessary` shows on and
 * cannot be turned off. The switches stage into the nearest consent draft;
 * a Save elsewhere records it.
 *
 * @internal
 */
export const CategoryGroup = ({
	idPrefix,
	testIdPrefix,
	exclude = NO_CATEGORIES,
	footer,
	noStyle: localNoStyle,
}: CategoryGroupProps) => {
	const translations = useTranslations();
	const draft = useConsentDraftStore();
	const displayed = useConsentDraftSlice(
		draft,
		(state) => state.displayedCategories
	);
	const values = useConsentDraftSlice(draft, (state) => state.values);
	const { noStyle: themeNoStyle } = useTheme();
	const noStyle = localNoStyle ?? themeNoStyle;
	const rows = displayed.filter((name) => !exclude.includes(name));
	const { alwaysOn } = resolvePrivacyChoicesCopy(translations);

	return (
		<div
			className={noStyle ? undefined : expandStyles.group}
			data-testid={GROUP_TEST_IDS[testIdPrefix].group}
		>
			{rows.map((name) => {
				const nameId = `${idPrefix}-category-${name}`;
				const descriptionId = `${nameId}-description`;
				const required = name === 'necessary';
				const checked = required || values[name] === true;
				const description =
					translations.consentTypes[name]?.description ??
					consentTypes.find((type) => type.name === name)?.description;
				const toggle = (event: MouseEvent<HTMLElement>) => {
					if (!required && isToggleClick(event)) {
						draft.set(name, !checked);
					}
				};
				return (
					<div
						key={name}
						className={cx(noStyle, styles.category)}
						data-category={name}
					>
						{/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- A pointer shortcut like a label's; the switch stays the only keyboard and focus target (CAT-10). */}
						<div
							className={cx(noStyle, styles.categoryRow)}
							data-row-toggle={required ? undefined : ''}
							onClick={toggle}
						>
							<div className={cx(noStyle, styles.categoryText)}>
								<span
									className={cx(noStyle, styles.categoryName)}
									id={nameId}
								>
									{resolveCategoryTitle(translations, name)}
								</span>
								{description ? (
									<span
										className={cx(noStyle, styles.categoryDescription)}
										id={descriptionId}
									>
										{description}
									</span>
								) : null}
							</div>
							{required ? (
								<span className={cx(noStyle, styles.categoryState)}>
									{alwaysOn}
								</span>
							) : (
								<ChoiceSwitch
									checked={checked}
									noStyle={noStyle}
									aria-labelledby={nameId}
									aria-describedby={description ? descriptionId : undefined}
									data-testid={GROUP_TEST_IDS[testIdPrefix].switchPrefix + name}
									onCheckedChange={(next) => draft.set(name, next)}
								/>
							)}
						</div>
					</div>
				);
			})}
			{footer}
		</div>
	);
};
