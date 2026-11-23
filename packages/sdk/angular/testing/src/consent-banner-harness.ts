import { ComponentHarness, HarnessPredicate } from '@angular/cdk/testing';
import type { BaseHarnessFilters } from '@angular/cdk/testing';
import type { AllConsentNames, ConsentBannerButton } from '@inth/angular';

import { clickAction } from './click-action';

const SWITCH_PREFIX = 'consent-banner-category-switch-';

/** Filters for {@link ConsentBannerHarness} instances. */
export interface ConsentBannerHarnessFilters extends BaseHarnessFilters {
	/** Only a banner whose heading matches. */
	title?: string | RegExp;
	/** Only a banner asking for a choice, or only one showing a notice. */
	prompt?: 'choice' | 'notice';
}

/**
 * Drives `<inth-consent-banner>`, and the banner `<inth-provider>`
 * renders: a Card, Banner or Drawer.
 *
 * The banner renders where `<inth-consent-banner>` sits, so both
 * `TestbedHarnessEnvironment.loader(fixture)` and
 * `TestbedHarnessEnvironment.documentRootLoader(fixture)` find it. The
 * harness exists only while the banner is rendered: use
 * `getHarnessOrNull` to check whether it shows.
 *
 * Await `fixture.whenStable()` once after `TestBed.createComponent()`, so
 * the consent runtime has started and chosen the banner before the first
 * query.
 *
 * Customize opens the options in the banner itself, not the consent
 * dialog: `openPreferences()` expands them, `setCategory()` stages a
 * switch, and `save()` records the switches.
 *
 * @example
 * ```ts
 * const fixture = TestBed.createComponent(AppComponent);
 * await fixture.whenStable();
 * const loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
 * const banner = await loader.getHarness(ConsentBannerHarness);
 * expect(await banner.getTitle()).toBe('We value your privacy');
 * await banner.acceptAll();
 * expect(TestBed.inject(ConsentManager).has('marketing')).toBe(true);
 * expect(await loader.getHarnessOrNull(ConsentBannerHarness)).toBeNull();
 * ```
 */
export class ConsentBannerHarness extends ComponentHarness {
	/** Matches the banner's root. */
	static hostSelector = '[data-testid="consent-banner-root"]';

	/**
	 * A predicate for a banner that matches `options`.
	 */
	static with(
		options: ConsentBannerHarnessFilters = {}
	): HarnessPredicate<ConsentBannerHarness> {
		return new HarnessPredicate(ConsentBannerHarness, options)
			.addOption('title', options.title, (harness, title) =>
				HarnessPredicate.stringMatches(harness.getTitle(), title)
			)
			.addOption(
				'prompt',
				options.prompt,
				async (harness, prompt) => (await harness.getPrompt()) === prompt
			);
	}

	readonly #title = this.locatorFor('[data-testid="consent-banner-title"]');
	readonly #description = this.locatorFor(
		'[data-testid="consent-banner-description"]'
	);
	readonly #actions = this.locatorForAll(
		'[data-testid="consent-banner-footer"] [data-action]'
	);
	// A notice opens its options from a rights link, not a Customize button.
	readonly #expand = this.locatorForOptional(
		'[data-testid="consent-banner-customize-button"], [data-testid="consent-banner-right-link-opt-out"]'
	);
	readonly #preferencesRow = this.locatorForOptional(
		'[data-testid="consent-banner-preferences-row"]'
	);
	readonly #save = this.locatorForOptional(
		'[data-testid="consent-banner-save-button"]'
	);

	#action(action: ConsentBannerButton) {
		return this.locatorForOptional(
			`[data-testid="consent-banner-footer"] [data-action="${action}"]`
		)();
	}

	#switch(category: AllConsentNames) {
		return this.locatorForOptional(
			`[data-testid="${SWITCH_PREFIX}${category}"]`
		)();
	}

	/** The heading text. */
	async getTitle(): Promise<string> {
		return (await this.#title()).text();
	}

	/** The description text, including the legal links after it. */
	async getDescription(): Promise<string> {
		return (await this.#description()).text();
	}

	/** Whether the banner asks for a choice or shows a notice. */
	async getPrompt(): Promise<'choice' | 'notice'> {
		const host = await this.host();
		return (await host.getAttribute('data-variant')) === 'notice'
			? 'notice'
			: 'choice';
	}

	/**
	 * Whether the banner blocks the page until a choice: backdrop, scroll
	 * lock and focus trap.
	 */
	async isBlocking(): Promise<boolean> {
		const host = await this.host();
		return (await host.getAttribute('data-blocking')) === 'true';
	}

	/**
	 * The container and where it sits, such as `card-start`,
	 * `banner-bottom` or `drawer-end`.
	 */
	async getPlacement(): Promise<string | null> {
		const host = await this.host();
		return host.getAttribute('data-placement');
	}

	/** Whether the options show in the banner, after Customize. */
	async isExpanded(): Promise<boolean> {
		const host = await this.host();
		return (await host.getAttribute('data-expanded')) === 'true';
	}

	/**
	 * The actions the banner offers, in the order they render, such as
	 * `['reject', 'accept', 'customize']`. The policy decides them. With the
	 * options open, Save takes Customize's place.
	 */
	async getActions(): Promise<string[]> {
		const buttons = await this.#actions();
		const actions = await Promise.all(
			buttons.map((button) => button.getAttribute('data-action'))
		);
		return actions.filter((action): action is string => action !== null);
	}

	/**
	 * Click Accept: grants every category and closes the banner.
	 *
	 * @throws {Error} When the policy offers no accept action.
	 */
	async acceptAll(): Promise<void> {
		await clickAction(await this.#action('accept'), 'banner', 'accept');
	}

	/**
	 * Click Reject: keeps only the necessary categories and closes the
	 * banner.
	 *
	 * @throws {Error} When the policy offers no reject action.
	 */
	async rejectAll(): Promise<void> {
		await clickAction(await this.#action('reject'), 'banner', 'reject');
	}

	/**
	 * Click Customize: opens the options in the banner, without recording a
	 * choice. The consent dialog does not open. The options are the cookie
	 * categories in the EU, and the rights and Preferences under a US
	 * policy; a notice opens them from its rights link. Does nothing when
	 * they already show.
	 *
	 * @throws {Error} When the banner offers no customize action, as a
	 * banner that shows its options from the start.
	 */
	async openPreferences(): Promise<void> {
		if (await this.isExpanded()) {
			return;
		}
		await clickAction(await this.#expand(), 'banner', 'customize');
	}

	/**
	 * Whether a category's switch is on, in the options.
	 *
	 * @param category - The category, such as `'marketing'`.
	 * @throws {Error} When the options have no switch for `category`.
	 */
	async isCategoryEnabled(category: AllConsentNames): Promise<boolean> {
		const element = await this.#switch(category);
		if (!element) {
			throw new Error(`The banner has no "${category}" switch.`);
		}
		return (await element.getAttribute('aria-checked')) === 'true';
	}

	/**
	 * Turn a category's switch on or off, opening the options and, under a
	 * US policy, Preferences first. The switch stays staged until `save()`.
	 *
	 * @param category - The category, such as `'marketing'`.
	 * @param enabled - The state to leave the switch in.
	 * @throws {Error} When the options have no switch for `category`, such
	 * as the US category that follows the sale choice.
	 */
	async setCategory(
		category: AllConsentNames,
		enabled: boolean
	): Promise<void> {
		const preferences = async () => {
			const row = await this.#preferencesRow();
			if (row && (await row.getAttribute('aria-expanded')) !== 'true') {
				await row.click();
			}
		};
		await this.openPreferences();
		await preferences();
		if ((await this.isCategoryEnabled(category)) !== enabled) {
			await (await this.#switch(category))?.click();
		}
	}

	/**
	 * Click Save in the open options: records the switches and closes the
	 * banner.
	 *
	 * @throws {Error} When the options are closed, or show no Save, as a
	 * notice.
	 */
	async save(): Promise<void> {
		await clickAction(await this.#save(), 'banner', 'save');
	}

	/**
	 * Acknowledge a notice. Records no category choice.
	 *
	 * @throws {Error} When the banner is not a notice.
	 */
	async dismiss(): Promise<void> {
		await clickAction(await this.#action('dismiss'), 'banner', 'dismiss');
	}
}
