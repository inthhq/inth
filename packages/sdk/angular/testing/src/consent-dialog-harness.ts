import {
	ComponentHarness,
	HarnessPredicate,
	TestKey,
} from '@angular/cdk/testing';
import type { BaseHarnessFilters } from '@angular/cdk/testing';
import type { AllConsentNames } from '@inth/angular';

import { clickAction } from './click-action';

/** Filters for {@link ConsentDialogHarness} instances. */
export interface ConsentDialogHarnessFilters extends BaseHarnessFilters {
	/** Only a dialog whose title matches. */
	title?: string | RegExp;
}

const SWITCH_PREFIX = 'consent-dialog-category-switch-';

/**
 * Drives `<inth-consent-dialog>`: the "Your Privacy Choices" dialog.
 *
 * In the EU it lists the cookie categories, and its switches stay staged
 * until Save, Accept all or Reject all records them. Under a US policy it
 * shows the rights and the receipt first, and the categories under
 * Preferences, where each switch applies at once; Done closes it.
 *
 * The dialog renders where `<inth-consent-dialog>` sits, so both
 * `TestbedHarnessEnvironment.loader(fixture)` and
 * `TestbedHarnessEnvironment.documentRootLoader(fixture)` find it. It
 * exists only while the dialog is open: use `getHarnessOrNull` to check
 * whether it shows.
 *
 * The dialog's body loads as a chunk of its own when it first opens. The
 * loader waits for the fixture to be stable before it searches, which
 * covers that load in a TestBed test.
 *
 * @example
 * ```ts
 * TestBed.inject(ConsentManager).setActiveUI('dialog');
 * const loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
 * const dialog = await loader.getHarness(ConsentDialogHarness);
 * await dialog.setCategory('marketing', true);
 * await dialog.save();
 * expect(TestBed.inject(ConsentManager).has('marketing')).toBe(true);
 * ```
 */
export class ConsentDialogHarness extends ComponentHarness {
	/** Matches the dialog's root, the backdrop around its card. */
	static hostSelector = '[data-testid="consent-dialog-root"]';

	/**
	 * A predicate for a dialog that matches `options`.
	 */
	static with(
		options: ConsentDialogHarnessFilters = {}
	): HarnessPredicate<ConsentDialogHarness> {
		return new HarnessPredicate(ConsentDialogHarness, options).addOption(
			'title',
			options.title,
			(harness, title) =>
				HarnessPredicate.stringMatches(harness.getTitle(), title)
		);
	}

	readonly #title = this.locatorFor('[data-testid="consent-dialog-title"]');
	readonly #intro = this.locatorForOptional(
		'[data-testid="consent-dialog-intro"]'
	);
	readonly #modal = this.locatorForOptional('[aria-modal="true"]');
	readonly #switches = this.locatorForAll(`[data-testid^="${SWITCH_PREFIX}"]`);
	readonly #preferencesRow = this.locatorForOptional(
		'[data-testid="consent-dialog-preferences-row"]'
	);
	readonly #sheet = this.locatorForOptional(
		'[data-testid="consent-dialog-sheet"]'
	);

	#footerButton(testId: string) {
		return this.locatorForOptional(
			`[data-testid="consent-dialog-footer"] [data-testid="${testId}"]`
		)();
	}

	#switch(category: AllConsentNames) {
		return this.locatorForOptional(
			`[data-testid="${SWITCH_PREFIX}${category}"]`
		)();
	}

	/** The dialog's title. */
	async getTitle(): Promise<string> {
		return (await this.#title()).text();
	}

	/**
	 * The one-line intro under the title, or `null` when there is none: under
	 * a US policy, the Global Privacy Control note replaces it.
	 */
	async getDescription(): Promise<string | null> {
		const intro = await this.#intro();
		return intro ? intro.text() : null;
	}

	/**
	 * Whether the dialog blocks the page. The dialog always does while it
	 * is open: its top layer is a modal, and the page under it is inert.
	 */
	async isBlocking(): Promise<boolean> {
		return (await this.#modal()) !== null;
	}

	/**
	 * Whether the dialog is the EU one, with its categories and a staged
	 * Save, or the US one, with the rights first.
	 */
	async getRegime(): Promise<'eu' | 'us'> {
		const host = await this.host();
		return (await host.getAttribute('data-regime')) === 'eu' ? 'eu' : 'us';
	}

	/**
	 * Open Preferences under a US policy: the categories expand in place on
	 * a desktop, and open as a sheet on a phone. Does nothing when they
	 * already show.
	 *
	 * @throws {Error} When the dialog has no Preferences, as in the EU.
	 */
	async openPreferences(): Promise<void> {
		const row = await this.#preferencesRow();
		if (!row) {
			throw new Error('The dialog offers no "preferences" action.');
		}
		const expanded = await row.getAttribute('aria-expanded');
		// A phone opens a sheet, which has no `aria-expanded`.
		if (expanded === 'true' || (expanded === null && (await this.#sheet()))) {
			return;
		}
		await row.click();
	}

	/**
	 * The categories that have a switch, in order, such as
	 * `['measurement', 'marketing']`. The necessary category has none.
	 * Under a US policy, open Preferences first, or the list is empty on a
	 * phone.
	 */
	async getCategories(): Promise<AllConsentNames[]> {
		const switches = await this.#switches();
		const ids = await Promise.all(
			switches.map((element) => element.getAttribute('data-testid'))
		);
		return ids
			.filter((id): id is string => id !== null)
			.map((id) => id.slice(SWITCH_PREFIX.length) as AllConsentNames);
	}

	/**
	 * Whether a category's switch is on.
	 *
	 * @param category - The category, such as `'marketing'`.
	 * @throws {Error} When the dialog has no switch for `category`.
	 */
	async isCategoryEnabled(category: AllConsentNames): Promise<boolean> {
		const element = await this.#switch(category);
		if (!element) {
			throw new Error(`The dialog has no "${category}" switch.`);
		}
		return (await element.getAttribute('aria-checked')) === 'true';
	}

	/**
	 * Turn a category's switch on or off. In the EU it stays staged until
	 * `save()`. Under a US policy it opens Preferences first, and the
	 * change applies at once.
	 *
	 * @param category - The category, such as `'marketing'`.
	 * @param enabled - The state to leave the switch in.
	 * @throws {Error} When the dialog has no switch for `category`, such as
	 * the US category that follows the sale choice.
	 */
	async setCategory(
		category: AllConsentNames,
		enabled: boolean
	): Promise<void> {
		if (await this.#preferencesRow()) {
			await this.openPreferences();
		}
		if ((await this.isCategoryEnabled(category)) !== enabled) {
			await (await this.#switch(category))?.click();
		}
	}

	/**
	 * Press Escape in the dialog. It closes and records nothing, as Close
	 * and Done do. Escape closes an open sheet or confirmation first. A
	 * dialog whose `open` input the parent sets closes through the consent
	 * manager and emits `openChange(false)`.
	 */
	async close(): Promise<void> {
		const host = await this.host();
		await host.sendKeys(TestKey.ESCAPE);
	}

	/**
	 * Click Accept all: grants every category and closes the dialog.
	 *
	 * @throws {Error} When the dialog offers no Accept all, as under a US
	 * policy.
	 */
	async acceptAll(): Promise<void> {
		await clickAction(
			await this.#footerButton('consent-dialog-accept-all'),
			'dialog',
			'accept'
		);
	}

	/**
	 * Click Reject all: keeps only the necessary categories and closes the
	 * dialog.
	 *
	 * @throws {Error} When the dialog offers no Reject all, as under a US
	 * policy.
	 */
	async rejectAll(): Promise<void> {
		await clickAction(
			await this.#footerButton('consent-dialog-reject-all'),
			'dialog',
			'reject'
		);
	}

	/**
	 * Click Save: records the staged switches and closes the dialog.
	 *
	 * @throws {Error} When the dialog offers no Save, as under a US policy,
	 * or when Save is disabled because no switch differs from the recorded
	 * choice.
	 */
	async save(): Promise<void> {
		const button = await this.#footerButton('consent-dialog-save-button');
		if (button && (await button.getProperty<boolean>('disabled'))) {
			throw new Error(
				'The dialog\'s "save" action is disabled: no switch differs from the recorded choice.'
			);
		}
		await clickAction(button, 'dialog', 'save');
	}
}
