import { ComponentHarness, HarnessPredicate } from '@angular/cdk/testing';
import type { BaseHarnessFilters } from '@angular/cdk/testing';

import { clickAction } from './click-action';
import { SwitchHarness } from './switch-harness';
import type { SwitchHarnessFilters } from './switch-harness';

/** A tab of the IAB preference center. */
export type IABConsentDialogTab = 'purposes' | 'vendors';

/** Filters for {@link IABConsentDialogHarness} instances. */
export interface IABConsentDialogHarnessFilters extends BaseHarnessFilters {
	/** Only a dialog whose title matches. */
	title?: string | RegExp;
}

/** The tab panel that shows. */
const VISIBLE_PANEL = '[role="tabpanel"]:not([hidden])';

/**
 * Drives `<inth-iab-consent-dialog>`, the IAB TCF preference center.
 *
 * The dialog renders into `<body>`, so find it with
 * `TestbedHarnessEnvironment.documentRootLoader(fixture)`. It exists only
 * while it is open. Like the IAB banner, it renders after the IAB code and
 * the vendor list load, which `fixture.whenStable()` does not wait for, so
 * poll `getHarnessOrNull` until it appears. The TC string is encoded
 * after an action's click returns: wait for `ConsentManager.iab()` to
 * change before you assert on it.
 *
 * Purpose, stack and special feature switches carry the purpose's name as
 * their label: get them with `getSwitches({ label: '…' })`. A switch
 * changes the draft; `save()` records it.
 *
 * @example
 * ```ts
 * const loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
 * const dialog = await loader.getHarness(IABConsentDialogHarness);
 * const [storage] = await dialog.getSwitches({
 *   label: 'Store and/or access information on a device',
 * });
 * await storage.check();
 * await dialog.save();
 * ```
 */
export class IABConsentDialogHarness extends ComponentHarness {
	/** Matches the dialog's root, which is moved to `<body>`. */
	static hostSelector = '[data-testid="iab-consent-dialog-root"]';

	/**
	 * A predicate for a dialog that matches `options`.
	 *
	 * @param options - Title and selector filters.
	 * @returns A predicate to pass to a loader.
	 */
	static with(
		options: IABConsentDialogHarnessFilters = {}
	): HarnessPredicate<IABConsentDialogHarness> {
		return new HarnessPredicate(IABConsentDialogHarness, options).addOption(
			'title',
			options.title,
			(harness, title) =>
				HarnessPredicate.stringMatches(harness.getTitle(), title)
		);
	}

	readonly #card = this.locatorFor('[data-testid="iab-consent-dialog-card"]');
	readonly #title = this.locatorFor(
		'[data-testid="iab-consent-dialog-card"] h2'
	);
	readonly #description = this.locatorFor(
		'[data-testid="iab-consent-dialog-card"] [id^="iab-consent-dialog-description"]'
	);
	readonly #close = this.locatorFor('[data-testid="iab-consent-dialog-close"]');
	readonly #selectedTab = this.locatorForOptional(
		'[role="tab"][aria-selected="true"]'
	);

	#action(action: string) {
		return this.locatorForOptional(`button[data-action="${action}"]`)();
	}

	/** The dialog's title. */
	async getTitle(): Promise<string> {
		return (await this.#title()).text();
	}

	/** The description under the title. */
	async getDescription(): Promise<string> {
		return (await this.#description()).text();
	}

	/** Whether the dialog blocks the page with a modal backdrop. */
	async isBlocking(): Promise<boolean> {
		return (await (await this.#card()).getAttribute('aria-modal')) === 'true';
	}

	/** The tab that shows: `purposes` or `vendors`. */
	async getSelectedTab(): Promise<IABConsentDialogTab | null> {
		const tab = await this.#selectedTab();
		return tab
			? ((await tab.getAttribute('value')) as IABConsentDialogTab | null)
			: null;
	}

	/**
	 * Show a tab.
	 *
	 * @param tab - `purposes` or `vendors`.
	 */
	async selectTab(tab: IABConsentDialogTab): Promise<void> {
		const trigger = await this.locatorFor(`[role="tab"][value="${tab}"]`)();
		await trigger.click();
	}

	/**
	 * The switches on the tab that shows, such as one per purpose.
	 *
	 * @param filters - Label and state filters.
	 */
	getSwitches(filters: SwitchHarnessFilters = {}): Promise<SwitchHarness[]> {
		// A tab visited once stays rendered, hidden: only the one that shows.
		return this.locatorForAll(
			SwitchHarness.with({ ...filters, ancestor: VISIBLE_PANEL })
		)();
	}

	/** Click the close button. Records nothing. */
	async close(): Promise<void> {
		await (await this.#close()).click();
	}

	/** Click Accept all: consents to every purpose and vendor. */
	async acceptAll(): Promise<void> {
		await clickAction(await this.#action('accept'), 'IAB dialog', 'accept');
	}

	/** Click Reject all: refuses every purpose and vendor that needs consent. */
	async rejectAll(): Promise<void> {
		await clickAction(await this.#action('reject'), 'IAB dialog', 'reject');
	}

	/** Click Save: records the switches as they are. */
	async save(): Promise<void> {
		await clickAction(await this.#action('customize'), 'IAB dialog', 'save');
	}
}
