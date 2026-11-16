import type { EmbeddedViewRef } from '@angular/core';
import {
	Directive,
	effect,
	inject,
	input,
	TemplateRef,
	ViewContainerRef,
} from '@angular/core';
import type { AllConsentNames, HasCondition } from '@c15t/core';

import { ConsentManager } from './consent-manager';

/** The template context of {@link IfConsent}. */
export interface IfConsentContext {
	/** The condition, as `let-condition`. */
	$implicit: HasCondition<AllConsentNames>;
	/** The condition, as `*c15tIfConsent="…; as condition"`. */
	c15tIfConsent: HasCondition<AllConsentNames>;
}

/**
 * Renders its template while a consent condition holds, else the `else`
 * template. The condition is the one `ConsentManager.has()` takes: a
 * category name or a boolean combination of them.
 *
 * Content that must not load before consent, such as an embed, stays out
 * of the DOM until the condition holds, and leaves it when consent is
 * withdrawn.
 *
 * @example
 * ```html
 * <iframe *c15tIfConsent="'marketing'; else blocked" src="https://example.com/embed"></iframe>
 * <ng-template #blocked>Accept marketing cookies to see this video.</ng-template>
 *
 * <app-chat *c15tIfConsent="{ and: ['functionality', 'experience'] }" />
 * ```
 */
@Directive({ selector: '[c15tIfConsent]' })
export class IfConsent {
	readonly #consent = inject(ConsentManager);
	readonly #template = inject<TemplateRef<IfConsentContext>>(TemplateRef);
	readonly #container = inject(ViewContainerRef);

	/** The consent condition. */
	readonly c15tIfConsent = input.required<HasCondition<AllConsentNames>>();

	/** Rendered while the condition does not hold. */
	readonly c15tIfConsentElse = input<TemplateRef<unknown> | null>(null);

	#shown: TemplateRef<unknown> | null | undefined;
	#view: EmbeddedViewRef<IfConsentContext> | undefined;

	constructor() {
		effect(() => {
			const condition = this.c15tIfConsent();
			const granted = this.#consent.has(condition);
			const next = granted ? this.#template : this.c15tIfConsentElse();
			if (next === this.#shown) {
				// Same branch, new condition: the content reads the new one.
				if (this.#view && this.#view.context.$implicit !== condition) {
					this.#view.context.$implicit = condition;
					this.#view.context.c15tIfConsent = condition;
					this.#view.markForCheck();
				}
				return;
			}
			this.#container.clear();
			this.#shown = next;
			this.#view = undefined;
			if (next === this.#template) {
				this.#view = this.#container.createEmbeddedView(this.#template, {
					$implicit: condition,
					c15tIfConsent: condition,
				});
			} else if (next) {
				this.#container.createEmbeddedView(next);
			}
		});
	}

	/**
	 * Narrows the template context for the type checker.
	 *
	 * @param _directive - The directive.
	 * @param context - The template context.
	 * @returns `true`.
	 */
	static ngTemplateContextGuard(
		_directive: IfConsent,
		// oxlint-disable-next-line no-unused-vars -- Angular reads the guard's type only.
		context: unknown
	): context is IfConsentContext {
		return true;
	}
}
