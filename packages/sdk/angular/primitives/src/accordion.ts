import {
	computed,
	Directive,
	effect,
	inject,
	input,
	model,
} from '@angular/core';
import type { Signal } from '@angular/core';
import type { AccordionType } from '@inth/sdk/ui/primitives';
import {
	getDataDisabled,
	getOpenState,
	isAccordionItemOpen,
	toggleAccordionValue,
} from '@inth/sdk/ui/primitives';

import { uniqueId } from './unique-id';

/**
 * A headless accordion. `type="single"` keeps one item open,
 * `type="multiple"` any number; bind `[(value)]` to the open item value or
 * values.
 *
 * @example
 * ```html
 * <div inthAccordion type="single" [collapsible]="true" [(value)]="open">
 *   <div inthAccordionItem value="analytics">
 *     <button inthAccordionTrigger>Analytics</button>
 *     <section inthAccordionContent>…</section>
 *   </div>
 * </div>
 * ```
 */
@Directive({
	exportAs: 'inthAccordion',
	host: { 'data-slot': 'accordion-root' },
	selector: '[inthAccordion]',
})
export class Accordion {
	/** One open item, or any number. */
	readonly type = input.required<AccordionType>();
	/** Whether a `single` accordion can close its open item. */
	readonly collapsible = input(false);
	/** The open item value (`single`) or values (`multiple`). */
	readonly value = model<string | string[] | undefined>(undefined);

	/** Each item's `disabled`, by its value. */
	readonly #disabled = new Map<string, Signal<boolean>>();

	/**
	 * Registers an item's `disabled`, so the root skips it too.
	 *
	 * @param itemValue - The item's `value`.
	 * @param disabled - The item's `disabled` input.
	 * @returns Removes the registration.
	 * @internal
	 */
	registerItem(itemValue: string, disabled: Signal<boolean>): () => void {
		this.#disabled.set(itemValue, disabled);
		return () => {
			if (this.#disabled.get(itemValue) === disabled) {
				this.#disabled.delete(itemValue);
			}
		};
	}

	/**
	 * Open or close one item, unless that item is disabled.
	 *
	 * @param itemValue - The item's `value`.
	 */
	toggleItem(itemValue: string): void {
		if (this.#disabled.get(itemValue)?.()) {
			return;
		}
		const value = this.value();
		this.value.set(
			toggleAccordionValue({
				collapsible: this.collapsible(),
				itemValue,
				type: this.type(),
				value: this.type() === 'multiple' ? (value ?? []) : value,
			})
		);
	}
}

/** One accordion item. */
@Directive({
	exportAs: 'inthAccordionItem',
	host: {
		'[attr.data-disabled]': 'dataDisabled()',
		'[attr.data-state]': 'dataState()',
		'data-slot': 'accordion-item',
	},
	selector: '[inthAccordionItem]',
})
export class AccordionItem {
	readonly #root = inject(Accordion);
	/** The item's value. */
	readonly value = input.required<string>();
	/** Whether the item ignores its trigger. */
	readonly disabled = input(false);

	/** @internal */
	readonly triggerId = uniqueId('inth-accordion-trigger');
	/** @internal */
	readonly contentId = uniqueId('inth-accordion-content');
	/** Whether the item is open. */
	readonly open = computed(() =>
		isAccordionItemOpen(this.#root.type(), this.#root.value(), this.value())
	);
	/** @internal */
	protected readonly dataState = computed(() => getOpenState(this.open()));
	/** @internal */
	protected readonly dataDisabled = computed(() =>
		getDataDisabled(this.disabled())
	);

	constructor() {
		// The root's own `toggleItem()` skips this item while it is disabled.
		effect((onCleanup) => {
			onCleanup(this.#root.registerItem(this.value(), this.disabled));
		});
	}

	/** Toggle this item, unless disabled. */
	toggle(): void {
		if (!this.disabled()) {
			this.#root.toggleItem(this.value());
		}
	}
}

/** The `<button>` that toggles its accordion item. */
@Directive({
	host: {
		'(click)': 'item.toggle()',
		'[attr.aria-controls]': 'item.contentId',
		'[attr.aria-disabled]': 'item.disabled() || null',
		'[attr.aria-expanded]': 'item.open()',
		'[attr.data-disabled]': 'dataDisabled()',
		'[attr.data-state]': 'dataState()',
		'[attr.disabled]': 'item.disabled() ? "" : null',
		'[attr.type]': 'type()',
		'[id]': 'item.triggerId',
		'data-slot': 'accordion-trigger',
	},
	selector: '[inthAccordionTrigger]',
})
export class AccordionTrigger {
	/** @internal */
	protected readonly item = inject(AccordionItem);
	/** The button's `type`. */
	readonly type = input<'button' | 'submit' | 'reset'>('button');
	/** @internal */
	protected readonly dataState = computed(() => getOpenState(this.item.open()));
	/** @internal */
	protected readonly dataDisabled = computed(() =>
		getDataDisabled(this.item.disabled())
	);
}

/**
 * The panel of an accordion item. Put it on a `<section>`. `inert` and
 * `aria-hidden` while closed, so focus cannot reach its controls.
 */
@Directive({
	host: {
		'[attr.aria-hidden]': '!item.open()',
		'[attr.aria-labelledby]': 'item.triggerId',
		'[attr.data-state]': 'dataState()',
		'[attr.inert]': 'item.open() ? null : ""',
		'[id]': 'item.contentId',
		'data-slot': 'accordion-content',
	},
	selector: '[inthAccordionContent]',
})
export class AccordionContent {
	/** @internal */
	protected readonly item = inject(AccordionItem);
	/** @internal */
	protected readonly dataState = computed(() => getOpenState(this.item.open()));
}
