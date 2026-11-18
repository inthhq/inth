import { ComponentHarness, HarnessPredicate } from '@angular/cdk/testing';
import type { BaseHarnessFilters } from '@angular/cdk/testing';
import type { ConsentButtonAction } from '@inth/angular';

/** Filters for {@link ConsentButtonHarness} instances. */
export interface ConsentButtonHarnessFilters extends BaseHarnessFilters {
	/** Only buttons whose text matches. */
	text?: string | RegExp;
	/**
	 * Only buttons with this action. Read from `data-action`, or from a
	 * static `action="…"` attribute; a button bound with `[action]` and no
	 * `data-action` does not match.
	 */
	action?: ConsentButtonAction;
}

/**
 * Drives a `<button inth-consent-button>` in your own markup, such as a
 * custom banner or a footer link, and the buttons inside the stock
 * surfaces.
 *
 * Your buttons render in place, so the fixture's loader finds them. The
 * stock surfaces' buttons are inside portaled elements: find those from
 * the surface's harness or `TestbedHarnessEnvironment.documentRootLoader`.
 *
 * @example
 * ```ts
 * const loader = TestbedHarnessEnvironment.loader(fixture);
 * const accept = await loader.getHarness(
 *   ConsentButtonHarness.with({ action: 'accept' })
 * );
 * await accept.click();
 * expect(TestBed.inject(ConsentManager).has('marketing')).toBe(true);
 * ```
 */
export class ConsentButtonHarness extends ComponentHarness {
	/** Matches every `button[inth-consent-button]`. */
	static hostSelector = 'button[inth-consent-button]';

	/**
	 * A predicate for a button that matches `options`.
	 *
	 * @param options - Text, action and selector filters.
	 * @returns A predicate to pass to a loader.
	 */
	static with(
		options: ConsentButtonHarnessFilters = {}
	): HarnessPredicate<ConsentButtonHarness> {
		return new HarnessPredicate(ConsentButtonHarness, options)
			.addOption('text', options.text, (harness, text) =>
				HarnessPredicate.stringMatches(harness.getText(), text)
			)
			.addOption(
				'action',
				options.action,
				async (harness, action) => (await harness.getAction()) === action
			);
	}

	/** The button's text. */
	async getText(): Promise<string> {
		const host = await this.host();
		return host.text();
	}

	/**
	 * The button's action, from `data-action` or a static `action`
	 * attribute, or `null` when neither is in the DOM.
	 */
	async getAction(): Promise<ConsentButtonAction | null> {
		const host = await this.host();
		const action =
			(await host.getAttribute('data-action')) ??
			(await host.getAttribute('action'));
		return action as ConsentButtonAction | null;
	}

	/** Whether the button is disabled. */
	async isDisabled(): Promise<boolean> {
		const host = await this.host();
		return (await host.getAttribute('disabled')) !== null;
	}

	/**
	 * Click the button: records or opens what its action says. `accept`,
	 * `reject` and `save` record a choice, `customize` opens the dialog and
	 * `dismiss` acknowledges a notice.
	 */
	async click(): Promise<void> {
		const host = await this.host();
		await host.click();
	}
}
