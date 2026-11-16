import { ComponentHarness, HarnessPredicate } from '@angular/cdk/testing';
import type { BaseHarnessFilters } from '@angular/cdk/testing';

import { clickAction } from './click-action';

/** Filters for {@link IABConsentBannerHarness} instances. */
export interface IABConsentBannerHarnessFilters extends BaseHarnessFilters {
	/** Only a banner whose heading matches. */
	title?: string | RegExp;
}

/**
 * Drives `<c15t-iab-consent-banner>`, the first layer of an IAB TCF CMP.
 *
 * The banner renders into `<body>`, so find it with
 * `TestbedHarnessEnvironment.documentRootLoader(fixture)`. It renders once
 * the Global Vendor List is loaded and the resolved policy uses the `iab`
 * model, and exists only while it shows. The IAB code and the vendor list
 * load in the background, and `fixture.whenStable()` does not wait for
 * them: poll `getHarnessOrNull` until the banner appears, for example
 * with Vitest's `vi.waitFor`.
 *
 * @example
 * ```ts
 * const loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
 * const banner = await vi.waitFor(async () => {
 *   const found = await loader.getHarnessOrNull(IABConsentBannerHarness);
 *   expect(found).not.toBeNull();
 *   return found!;
 * });
 * await banner.acceptAll();
 * await vi.waitFor(() =>
 *   expect(TestBed.inject(ConsentManager).iab()?.purposeConsents[1]).toBe(true)
 * );
 * ```
 */
export class IABConsentBannerHarness extends ComponentHarness {
	/** Matches the banner's root, which is moved to `<body>`. */
	static hostSelector = '[data-testid="iab-consent-banner-root"]';

	/**
	 * A predicate for a banner that matches `options`.
	 *
	 * @param options - Title and selector filters.
	 * @returns A predicate to pass to a loader.
	 */
	static with(
		options: IABConsentBannerHarnessFilters = {}
	): HarnessPredicate<IABConsentBannerHarness> {
		return new HarnessPredicate(IABConsentBannerHarness, options).addOption(
			'title',
			options.title,
			(harness, title) =>
				HarnessPredicate.stringMatches(harness.getTitle(), title)
		);
	}

	readonly #title = this.locatorFor(
		'[data-testid="iab-consent-banner-header"] h2'
	);
	readonly #description = this.locatorFor(
		'[data-testid="iab-consent-banner-header"] p'
	);
	readonly #purposes = this.locatorForAll(
		'[data-testid="iab-consent-banner-header"] li'
	);
	readonly #partners = this.locatorFor(
		'[data-testid="iab-consent-banner-partners-link"]'
	);

	#action(action: string) {
		return this.locatorForOptional(
			`[data-testid="iab-consent-banner-${action}-button"]`
		)();
	}

	/** The heading text. */
	async getTitle(): Promise<string> {
		return (await this.#title()).text();
	}

	/** The description, with the partner count link in it. */
	async getDescription(): Promise<string> {
		return (await this.#description()).text();
	}

	/**
	 * The purposes and stacks the banner lists, in order. When the list is
	 * cut short, the last entry is the "and N more" line.
	 */
	async getPurposes(): Promise<string[]> {
		const items = await this.#purposes();
		return Promise.all(items.map((item) => item.text()));
	}

	/** Click Accept all: consents to every purpose and vendor. */
	async acceptAll(): Promise<void> {
		await clickAction(await this.#action('accept'), 'IAB banner', 'accept');
	}

	/** Click Reject all: refuses every purpose and vendor that needs consent. */
	async rejectAll(): Promise<void> {
		await clickAction(await this.#action('reject'), 'IAB banner', 'reject');
	}

	/**
	 * Click Customize: opens the IAB dialog on the purposes tab without
	 * recording a choice.
	 */
	async openPreferences(): Promise<void> {
		await clickAction(
			await this.#action('customize'),
			'IAB banner',
			'customize'
		);
	}

	/**
	 * Click the partner count link: opens the IAB dialog on the vendors
	 * tab without recording a choice.
	 */
	async openVendors(): Promise<void> {
		await (await this.#partners()).click();
	}
}
