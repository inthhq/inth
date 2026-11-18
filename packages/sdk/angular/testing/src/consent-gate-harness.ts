import {
	ContentContainerComponentHarness,
	HarnessPredicate,
} from '@angular/cdk/testing';
import type { BaseHarnessFilters } from '@angular/cdk/testing';

import { clickAction } from './click-action';

/** Filters for {@link ConsentGateHarness} instances. */
export type ConsentGateHarnessFilters = BaseHarnessFilters;

/**
 * Drives `<inth-consent-gate>`, which renders its content only while a
 * consent category is allowed.
 *
 * The gate renders in place, so the fixture's loader finds it. Tell gates
 * apart with `ConsentGateHarness.with({ selector: '.video' })`. The
 * harness is also a loader for what the gate holds: call `getHarness` on
 * it to drive the gated content.
 *
 * The gate fills itself one animation frame after its first render; the
 * harness waits for that frame before it reads the gate.
 *
 * The built-in placeholder shows while the category is denied. A gate
 * with a `inthConsentGatePlaceholder` template renders your markup
 * instead, and `isPlaceholderShown()` reports `false` for it: check your
 * own markup with `getText()` or a harness of your own.
 *
 * @example
 * ```ts
 * const loader = TestbedHarnessEnvironment.loader(fixture);
 * const gate = await loader.getHarness(ConsentGateHarness);
 * expect(await gate.isPlaceholderShown()).toBe(true);
 * await TestBed.inject(ConsentManager).saveConsents('all');
 * expect(await gate.isPlaceholderShown()).toBe(false);
 * ```
 */
export class ConsentGateHarness extends ContentContainerComponentHarness {
	/** Matches the gate's host element, which stays where you put it. */
	static hostSelector = 'inth-consent-gate';

	/**
	 * A predicate for a gate that matches `options`.
	 *
	 * @param options - Selector and ancestor filters.
	 * @returns A predicate to pass to a loader.
	 */
	static with(
		options: ConsentGateHarnessFilters = {}
	): HarnessPredicate<ConsentGateHarness> {
		return new HarnessPredicate(ConsentGateHarness, options);
	}

	/**
	 * The gate fills itself one animation frame after its first render.
	 * Wait for that frame where the harness shares the page's realm, as in
	 * a TestBed test, then let the fixture render.
	 */
	async #settle(): Promise<void> {
		await this.forceStabilize();
		if (typeof requestAnimationFrame === 'function') {
			// oxlint-disable-next-line promise/avoid-new -- A frame is the settle point.
			await new Promise<void>((resolve) => {
				requestAnimationFrame(() => resolve());
			});
			await this.forceStabilize();
		}
	}

	readonly #placeholder = this.locatorForOptional(
		'[data-testid="consent-gate-placeholder"]'
	);
	readonly #title = this.locatorForOptional(
		'[data-testid="consent-gate-title"]'
	);
	readonly #button = this.locatorForOptional(
		'[data-testid="consent-gate-button"]'
	);

	/** Whether the built-in placeholder shows in place of the content. */
	async isPlaceholderShown(): Promise<boolean> {
		await this.#settle();
		return (await this.#placeholder()) !== null;
	}

	/**
	 * The built-in placeholder's message, or `null` while it is not shown.
	 */
	async getPlaceholderText(): Promise<string | null> {
		await this.#settle();
		const title = await this.#title();
		return title ? title.text() : null;
	}

	/**
	 * Whether the built-in placeholder offers a button that opens the
	 * consent dialog. A strict policy that leaves the category out offers
	 * none, since no choice can allow the content.
	 */
	async canOpenPreferences(): Promise<boolean> {
		await this.#settle();
		return (await this.#button()) !== null;
	}

	/**
	 * Click the built-in placeholder's button: opens the consent dialog,
	 * where the visitor can allow the category.
	 *
	 * @throws {Error} When the built-in placeholder or its button is not shown.
	 */
	async openPreferences(): Promise<void> {
		await this.#settle();
		await clickAction(await this.#button(), 'consent gate', 'customize');
	}

	/** The gate's text: the content's, or the placeholder's. */
	async getText(): Promise<string> {
		await this.#settle();
		const host = await this.host();
		return host.text();
	}
}
