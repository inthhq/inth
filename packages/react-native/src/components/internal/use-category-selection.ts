/**
 * The switches on a consent surface's category list, held until the subject
 * saves. The rows come from `consent-category-rows.model.ts`.
 */

import { useCallback, useState } from 'react';

import type {
	AllConsentNames,
	OptionalConsentCategory,
} from '../../protocol/consent-vocabulary.model';
import type { ConsentCategoryRow } from './consent-category-rows.model';

/** What {@link useCategorySelection} hands a surface. */
export interface CategorySelection {
	/**
	 * The selection to write.
	 *
	 * Every category in scope, not only the ones that moved: pressing save is
	 * confirming the whole screen, and the core records exactly the categories it
	 * is handed.
	 *
	 * @returns A per-category decision ready for `save`.
	 */
	readonly commitSelection: () => Partial<
		Record<OptionalConsentCategory, boolean>
	>;
	/** Rows to render, with any pending switch applied. */
	readonly rows: readonly ConsentCategoryRow[];
	/** Forget pending switches, for when a surface closes. */
	readonly reset: () => void;
	/**
	 * Record a switch for one category.
	 *
	 * @param category - Category the subject moved.
	 * @param value - Position they moved it to.
	 */
	readonly toggle: (category: AllConsentNames, value: boolean) => void;
}

/**
 * Track switches on a category list until the subject saves.
 *
 * The state is the delta only: a row the subject never touched keeps whatever the
 * core reported, so an unrelated snapshot event arriving underneath an open sheet
 * cannot quietly move a switch the subject is looking at.
 *
 * @param rows - Rows to render.
 * @returns The visible rows plus the write payload.
 */
export const useCategorySelection = function useCategorySelection(
	rows: readonly ConsentCategoryRow[]
): CategorySelection {
	const [pending, setPending] = useState<Partial<Record<string, boolean>>>({});

	const toggle = useCallback((category: AllConsentNames, value: boolean) => {
		if (category === 'necessary') {
			return;
		}

		setPending((current) => ({ ...current, [category]: value }));
	}, []);

	const reset = useCallback(() => {
		setPending({});
	}, []);

	const visible: readonly ConsentCategoryRow[] = rows.map((row) => {
		const override = pending[row.key];

		return override === undefined ? row : { ...row, value: override };
	});

	const commitSelection = useCallback((): Partial<
		Record<OptionalConsentCategory, boolean>
	> => {
		const selection: Partial<Record<OptionalConsentCategory, boolean>> = {};

		for (const [category, value] of Object.entries(pending)) {
			if (category !== 'necessary' && value !== undefined) {
				selection[category as OptionalConsentCategory] = value;
			}
		}

		for (const row of rows) {
			const category = row.key;

			if (category !== 'necessary' && selection[category] === undefined) {
				selection[category] = row.value;
			}
		}

		return selection;
	}, [pending, rows]);

	return { commitSelection, reset, rows: visible, toggle };
};
