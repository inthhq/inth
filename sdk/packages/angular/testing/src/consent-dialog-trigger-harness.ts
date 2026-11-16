import { ComponentHarness, HarnessPredicate } from '@angular/cdk/testing';
import type { BaseHarnessFilters } from '@angular/cdk/testing';

/** Filters for {@link ConsentDialogTriggerHarness} instances. */
export interface ConsentDialogTriggerHarnessFilters extends BaseHarnessFilters {
	/** Only a trigger whose accessible name matches. */
	label?: string | RegExp;
}

/**
 * Drives `<c15t-consent-dialog-trigger>`, the floating button that reopens
 * the consent dialog, and the trigger `<c15t-consent-dialog>` renders with
 * `showTrigger`.
 *
 * The trigger renders into `<body>`, so find it with
 * `TestbedHarnessEnvironment.documentRootLoader(fixture)`. It exists only
 * while it shows: after a policy is resolved, and not while the dialog is
 * open. With `<c15t-consent-dev-tools>` mounted, the harness drives the
 * toolbar's preferences button.
 *
 * @example
 * ```ts
 * const loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
 * const trigger = await loader.getHarness(ConsentDialogTriggerHarness);
 * await trigger.openPreferences();
 * expect(await loader.getHarness(ConsentDialogHarness)).toBeTruthy();
 * ```
 */
export class ConsentDialogTriggerHarness extends ComponentHarness {
	/** Matches the trigger button, which is moved to `<body>`. */
	static hostSelector = '[data-testid="consent-dialog-trigger"]';

	/**
	 * A predicate for a trigger that matches `options`.
	 *
	 * @param options - Label and selector filters.
	 * @returns A predicate to pass to a loader.
	 */
	static with(
		options: ConsentDialogTriggerHarnessFilters = {}
	): HarnessPredicate<ConsentDialogTriggerHarness> {
		return new HarnessPredicate(ConsentDialogTriggerHarness, options).addOption(
			'label',
			options.label,
			(harness, label) =>
				HarnessPredicate.stringMatches(harness.getLabel(), label)
		);
	}

	/** The button's accessible name, `Open privacy settings` by default. */
	async getLabel(): Promise<string | null> {
		const host = await this.host();
		return host.getAttribute('aria-label');
	}

	/**
	 * Click the trigger: opens the consent dialog, unless a `triggerClick`
	 * handler calls `preventDefault()`. The trigger hides while the dialog
	 * is open, so this harness is stale afterwards.
	 */
	async openPreferences(): Promise<void> {
		const host = await this.host();
		await host.click();
	}
}
