import { ComponentHarness, HarnessPredicate } from '@angular/cdk/testing';
import type { BaseHarnessFilters } from '@angular/cdk/testing';
import type { ConsentBannerButton } from '@inth/angular';

import { clickAction } from './click-action';

/** Filters for {@link ConsentBannerHarness} instances. */
export interface ConsentBannerHarnessFilters extends BaseHarnessFilters {
	/** Only a banner whose heading matches. */
	title?: string | RegExp;
	/** Only a banner asking for a choice, or only one showing a notice. */
	prompt?: 'choice' | 'notice';
}

/**
 * Drives `<inth-consent-banner>`, and the banner `<inth-provider>`
 * renders.
 *
 * The banner renders into `<body>`, outside the component that declares it,
 * so find it with `TestbedHarnessEnvironment.documentRootLoader(fixture)`.
 * The fixture's own loader does not see it. The harness exists only while
 * the banner is rendered: use `getHarnessOrNull` to check whether it shows.
 *
 * Await `fixture.whenStable()` once after `TestBed.createComponent()`, so
 * the consent runtime has started and chosen the banner before the first
 * query.
 *
 * The action methods click the stock buttons. A banner that replaces them
 * with an `inthConsentBannerAction` template keeps working if your buttons
 * set `data-action` to the action's id.
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
	/** Matches the banner's root, which is moved to `<body>`. */
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
		'[data-testid="consent-banner-footer"] [data-action]:not([data-action="right"])'
	);

	#action(action: ConsentBannerButton) {
		return this.locatorForOptional(
			`[data-testid="consent-banner-footer"] [data-action="${action}"]`
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
		return (await host.getAttribute('data-prompt')) === 'notice'
			? 'notice'
			: 'choice';
	}

	/**
	 * Whether the banner blocks the page: backdrop, scroll lock and focus
	 * trap.
	 */
	async isBlocking(): Promise<boolean> {
		const host = await this.host();
		return (await host.getAttribute('data-blocking')) === 'true';
	}

	/** The banner's shape, such as `bar` or `floating`. */
	async getVariant(): Promise<string | null> {
		const host = await this.host();
		return host.getAttribute('data-variant');
	}

	/** Where the banner sits, such as `bottom`. */
	async getPosition(): Promise<string | null> {
		const host = await this.host();
		return host.getAttribute('data-position');
	}

	/**
	 * The actions the banner offers, in the order they render, such as
	 * `['reject', 'accept', 'customize']`. The policy decides them.
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
	 * Click Customize: opens the consent dialog without recording a choice.
	 *
	 * @throws {Error} When the policy offers no customize action.
	 */
	async openPreferences(): Promise<void> {
		await clickAction(await this.#action('customize'), 'banner', 'customize');
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
