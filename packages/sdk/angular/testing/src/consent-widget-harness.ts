import { ComponentHarness, HarnessPredicate } from '@angular/cdk/testing';
import type { BaseHarnessFilters } from '@angular/cdk/testing';
import type { AllConsentNames } from '@inth/angular';

import { clickAction } from './click-action';
import { SwitchHarness } from './switch-harness';

/** Filters for {@link ConsentWidgetHarness} instances. */
export type ConsentWidgetHarnessFilters = BaseHarnessFilters;

const ITEM_PREFIX = 'consent-widget-accordion-item-';

/**
 * Drives the preference center: `<c15t-consent-widget>` on a page, and
 * the same widget inside `<c15t-consent-dialog>`.
 *
 * A widget on a page renders in place, so the fixture's loader finds it.
 * The one inside the consent dialog renders into `<body>`: get it from
 * {@link ConsentDialogHarness.getWidget} or a
 * `TestbedHarnessEnvironment.documentRootLoader(fixture)`.
 *
 * The category switches stage a draft. `save()` records it; `acceptAll()`
 * and `rejectAll()` record a choice for every category.
 *
 * @example
 * ```ts
 * const loader = TestbedHarnessEnvironment.loader(fixture);
 * const widget = await loader.getHarness(ConsentWidgetHarness);
 * await widget.setCategory('measurement', true);
 * await widget.save();
 * expect(TestBed.inject(ConsentManager).has('measurement')).toBe(true);
 * ```
 */
export class ConsentWidgetHarness extends ComponentHarness {
	/** Matches the widget's root, on a page or inside the dialog. */
	static hostSelector = '[data-testid="consent-widget-root"]';

	/**
	 * A predicate for a widget that matches `options`.
	 *
	 * @param options - Selector and ancestor filters.
	 * @returns A predicate to pass to a loader.
	 */
	static with(
		options: ConsentWidgetHarnessFilters = {}
	): HarnessPredicate<ConsentWidgetHarness> {
		return new HarnessPredicate(ConsentWidgetHarness, options);
	}

	readonly #items = this.locatorForAll(`[data-testid^="${ITEM_PREFIX}"]`);

	#action(testId: string) {
		return this.locatorForOptional(
			`[data-testid="consent-widget-footer"] [data-testid="${testId}"]`
		)();
	}

	/**
	 * The categories the widget lists, in order, such as
	 * `['necessary', 'measurement', 'marketing']`.
	 */
	async getCategories(): Promise<AllConsentNames[]> {
		const items = await this.#items();
		const ids = await Promise.all(
			items.map((item) => item.getAttribute('data-testid'))
		);
		return ids
			.filter((id): id is string => id !== null)
			.map((id) => id.slice(ITEM_PREFIX.length) as AllConsentNames);
	}

	/**
	 * A category's title, in the active language.
	 *
	 * @param category - The category, such as `'marketing'`.
	 * @throws {Error} When the widget does not list `category`.
	 */
	async getCategoryTitle(category: AllConsentNames): Promise<string> {
		const title = await this.locatorFor(
			`[data-testid="consent-widget-accordion-trigger-${category}"]`
		)();
		return title.text();
	}

	/**
	 * The switch for one category.
	 *
	 * @param category - The category, such as `'marketing'`.
	 * @throws {Error} When the widget does not list `category`.
	 */
	getCategorySwitch(category: AllConsentNames): Promise<SwitchHarness> {
		return this.locatorFor(
			SwitchHarness.with({
				selector: `[data-testid="consent-widget-switch-${category}"]`,
			})
		)();
	}

	/**
	 * Whether a category's switch is on in the draft. Before a save, this
	 * can differ from `ConsentManager.has(category)`.
	 *
	 * @param category - The category, such as `'marketing'`.
	 */
	async isCategoryChecked(category: AllConsentNames): Promise<boolean> {
		return (await this.getCategorySwitch(category)).isChecked();
	}

	/**
	 * Whether a category's switch is locked, as `necessary` always is.
	 *
	 * @param category - The category, such as `'necessary'`.
	 */
	async isCategoryDisabled(category: AllConsentNames): Promise<boolean> {
		return (await this.getCategorySwitch(category)).isDisabled();
	}

	/**
	 * Flip a category's switch in the draft. Nothing is recorded until
	 * {@link ConsentWidgetHarness.save}.
	 *
	 * @param category - The category, such as `'marketing'`.
	 */
	async toggleCategory(category: AllConsentNames): Promise<void> {
		await (await this.getCategorySwitch(category)).toggle();
	}

	/**
	 * Set a category's switch in the draft. Nothing is recorded until
	 * {@link ConsentWidgetHarness.save}.
	 *
	 * @param category - The category, such as `'marketing'`.
	 * @param allowed - Whether the switch should be on.
	 */
	async setCategory(
		category: AllConsentNames,
		allowed: boolean
	): Promise<void> {
		const toggle = await this.getCategorySwitch(category);
		await (allowed ? toggle.check() : toggle.uncheck());
	}

	/**
	 * The footer actions the policy offers, such as
	 * `['reject', 'accept', 'save']`.
	 */
	async getActions(): Promise<string[]> {
		const buttons = await this.locatorForAll(
			'[data-testid="consent-widget-footer"] [data-action]'
		)();
		const actions = await Promise.all(
			buttons.map((button) => button.getAttribute('data-action'))
		);
		return actions.filter((action): action is string => action !== null);
	}

	/**
	 * Click Accept all: grants every category.
	 *
	 * @throws {Error} When the policy offers no accept action.
	 */
	async acceptAll(): Promise<void> {
		await clickAction(
			await this.#action('consent-widget-footer-accept-all-button'),
			'consent widget',
			'accept'
		);
	}

	/**
	 * Click Reject all: keeps only the necessary categories.
	 *
	 * @throws {Error} When the policy offers no reject action.
	 */
	async rejectAll(): Promise<void> {
		await clickAction(
			await this.#action('consent-widget-reject-button'),
			'consent widget',
			'reject'
		);
	}

	/**
	 * Click Save: records the switches as they are.
	 *
	 * @throws {Error} When the policy offers no save action.
	 */
	async save(): Promise<void> {
		await clickAction(
			await this.#action('consent-widget-footer-save-button'),
			'consent widget',
			'save'
		);
	}
}
