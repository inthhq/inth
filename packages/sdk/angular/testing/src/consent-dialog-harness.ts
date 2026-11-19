import {
	ComponentHarness,
	HarnessPredicate,
	TestKey,
} from '@angular/cdk/testing';
import type { BaseHarnessFilters } from '@angular/cdk/testing';

import { ConsentWidgetHarness } from './consent-widget-harness';

/** Filters for {@link ConsentDialogHarness} instances. */
export interface ConsentDialogHarnessFilters extends BaseHarnessFilters {
	/** Only a dialog whose title matches. */
	title?: string | RegExp;
}

/**
 * Drives `<inth-consent-dialog>`: the preference center in a modal.
 *
 * The dialog renders into `<body>`, outside the component that declares it,
 * so find it with `TestbedHarnessEnvironment.documentRootLoader(fixture)`,
 * as you would Angular Material's `MatDialogHarness`. It exists only while
 * the dialog is open: use `getHarnessOrNull` to check whether it shows.
 *
 * The dialog's body loads with `@defer` when it first opens. The loader
 * waits for the fixture to be stable before it searches, which covers that
 * load in a TestBed test.
 *
 * @example
 * ```ts
 * TestBed.inject(ConsentManager).setActiveUI('dialog');
 * const loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
 * const dialog = await loader.getHarness(ConsentDialogHarness);
 * const widget = await dialog.getWidget();
 * await widget.setCategory('marketing', true);
 * await dialog.save();
 * expect(TestBed.inject(ConsentManager).has('marketing')).toBe(true);
 * ```
 */
export class ConsentDialogHarness extends ComponentHarness {
	/** Matches the dialog's content element, which is moved to `<body>`. */
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
	readonly #description = this.locatorFor(
		'[data-testid="consent-dialog-description"]'
	);

	async getTitle(): Promise<string> {
		return (await this.#title()).text();
	}

	/** The description text, including the legal links after it. */
	async getDescription(): Promise<string> {
		return (await this.#description()).text();
	}

	/**
	 * Whether the dialog blocks the page: backdrop, scroll lock and focus
	 * trap.
	 */
	async isBlocking(): Promise<boolean> {
		const host = await this.host();
		return (await host.getAttribute('data-blocking')) === 'true';
	}

	/** The preference center inside the dialog. */
	getWidget(): Promise<ConsentWidgetHarness> {
		return this.locatorFor(ConsentWidgetHarness)();
	}

	/**
	 * Press Escape in the dialog. It closes and records nothing. A dialog
	 * whose `open` input the parent sets asks the consent manager to close
	 * and stays until the parent sets `open` to `false`.
	 */
	async close(): Promise<void> {
		const host = await this.host();
		await host.sendKeys(TestKey.ESCAPE);
	}

	/**
	 * Click Accept all: grants every category and closes the dialog.
	 *
	 * @throws {Error} When the policy offers no accept action.
	 */
	async acceptAll(): Promise<void> {
		await (await this.getWidget()).acceptAll();
	}

	/**
	 * Click Reject all: keeps only the necessary categories and closes the
	 * dialog.
	 *
	 * @throws {Error} When the policy offers no reject action.
	 */
	async rejectAll(): Promise<void> {
		await (await this.getWidget()).rejectAll();
	}

	/**
	 * Click Save: records the switches as they are and closes the dialog.
	 *
	 * @throws {Error} When the policy offers no save action.
	 */
	async save(): Promise<void> {
		await (await this.getWidget()).save();
	}
}
