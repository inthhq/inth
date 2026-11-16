import { ComponentHarness, HarnessPredicate } from '@angular/cdk/testing';
import type { BaseHarnessFilters } from '@angular/cdk/testing';

/** Filters for {@link SwitchHarness} instances. */
export interface SwitchHarnessFilters extends BaseHarnessFilters {
	/** Only switches whose `aria-label` matches. */
	label?: string | RegExp;
	/** Only switches in this state. */
	checked?: boolean;
	/** Only switches that are, or are not, disabled. */
	disabled?: boolean;
}

/**
 * Drives a `[c15tSwitch]` element: your own switches, and the category and
 * vendor switches inside the stock consent widget and IAB dialog.
 *
 * The switch renders where you put it, so the fixture's loader finds your
 * own switches. A switch inside a portaled surface, such as the consent
 * dialog, is found from that surface's harness or from
 * `TestbedHarnessEnvironment.documentRootLoader(fixture)`.
 *
 * @example
 * ```ts
 * const loader = TestbedHarnessEnvironment.loader(fixture);
 * const marketing = await loader.getHarness(
 *   SwitchHarness.with({ label: 'Marketing' })
 * );
 * await marketing.check();
 * expect(await marketing.isChecked()).toBe(true);
 * ```
 */
export class SwitchHarness extends ComponentHarness {
	/** Matches the host of every `[c15tSwitch]`. */
	static hostSelector = '[data-slot="switch"]';

	/**
	 * A predicate for a switch that matches `options`.
	 *
	 * @param options - Label, state and selector filters.
	 * @returns A predicate to pass to a loader or a locator.
	 */
	static with(
		options: SwitchHarnessFilters = {}
	): HarnessPredicate<SwitchHarness> {
		return new HarnessPredicate(SwitchHarness, options)
			.addOption('label', options.label, (harness, label) =>
				HarnessPredicate.stringMatches(harness.getLabel(), label)
			)
			.addOption(
				'checked',
				options.checked,
				async (harness, checked) => (await harness.isChecked()) === checked
			)
			.addOption(
				'disabled',
				options.disabled,
				async (harness, disabled) => (await harness.isDisabled()) === disabled
			);
	}

	/** Whether the switch is on (`aria-checked="true"`). */
	async isChecked(): Promise<boolean> {
		const host = await this.host();
		return (await host.getAttribute('aria-checked')) === 'true';
	}

	/** Whether the switch ignores input, from its own input or a form. */
	async isDisabled(): Promise<boolean> {
		const host = await this.host();
		return (await host.getAttribute('disabled')) !== null;
	}

	/** The switch's `aria-label`, or `null` without one. */
	async getLabel(): Promise<string | null> {
		const host = await this.host();
		return host.getAttribute('aria-label');
	}

	/** Flip the switch. A disabled switch stays as it is. */
	async toggle(): Promise<void> {
		const host = await this.host();
		await host.click();
	}

	/** Turn the switch on, if it is off and enabled. */
	async check(): Promise<void> {
		if (!(await this.isChecked())) {
			await this.toggle();
		}
	}

	/** Turn the switch off, if it is on and enabled. */
	async uncheck(): Promise<void> {
		if (await this.isChecked()) {
			await this.toggle();
		}
	}

	/** Move focus to the switch. */
	async focus(): Promise<void> {
		const host = await this.host();
		await host.focus();
	}

	/** Move focus away from the switch. */
	async blur(): Promise<void> {
		const host = await this.host();
		await host.blur();
	}

	/** Whether the switch has focus. */
	async isFocused(): Promise<boolean> {
		const host = await this.host();
		return host.isFocused();
	}
}
