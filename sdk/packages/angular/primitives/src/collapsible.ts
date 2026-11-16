import { computed, Directive, inject, input, model } from '@angular/core';
import {
	getCollapsibleState,
	getDataDisabled,
	toggleCollapsibleValue,
} from '@c15t/ui/primitives';

import { uniqueId } from './unique-id';

/**
 * A headless collapsible section. Bind `[(open)]`.
 *
 * @example
 * ```html
 * <div c15tCollapsible [(open)]="details">
 *   <button c15tCollapsibleTrigger>Details <span c15tCollapsibleIndicator></span></button>
 *   <div c15tCollapsibleContent>…</div>
 * </div>
 * ```
 */
@Directive({
	exportAs: 'c15tCollapsible',
	host: {
		'[attr.data-disabled]': 'dataDisabled()',
		'[attr.data-state]': 'dataState()',
		'data-slot': 'collapsible-root',
	},
	selector: '[c15tCollapsible]',
})
export class Collapsible {
	/** Whether the content is shown. */
	readonly open = model(false);
	/** Whether the trigger is ignored. */
	readonly disabled = input(false);

	/** @internal */
	readonly triggerId = uniqueId('c15t-collapsible-trigger');
	/** @internal */
	readonly contentId = uniqueId('c15t-collapsible-content');
	/** @internal */
	readonly dataState = computed(() => getCollapsibleState(this.open()));
	/** @internal */
	readonly dataDisabled = computed(() => getDataDisabled(this.disabled()));

	/** Toggle, unless disabled. */
	toggle(): void {
		if (!this.disabled()) {
			this.open.set(toggleCollapsibleValue(this.open()));
		}
	}
}

/** The `<button>` that toggles the collapsible. */
@Directive({
	host: {
		'(click)': 'root.toggle()',
		'[attr.aria-controls]': 'root.contentId',
		'[attr.aria-disabled]': 'root.disabled() || null',
		'[attr.aria-expanded]': 'root.open()',
		'[attr.data-disabled]': 'root.dataDisabled()',
		'[attr.data-state]': 'root.dataState()',
		'[attr.disabled]': 'root.disabled() ? "" : null',
		'[attr.type]': 'type()',
		'[id]': 'root.triggerId',
		'data-slot': 'collapsible-trigger',
	},
	selector: '[c15tCollapsibleTrigger]',
})
export class CollapsibleTrigger {
	/** @internal */
	protected readonly root = inject(Collapsible);
	/** The button's `type`. */
	readonly type = input<'button' | 'submit' | 'reset'>('button');
}

/** The collapsible's content. `inert` and `aria-hidden` while closed. */
@Directive({
	host: {
		'[attr.aria-hidden]': '!root.open()',
		'[attr.aria-labelledby]': 'root.triggerId',
		'[attr.data-state]': 'root.dataState()',
		'[attr.inert]': 'root.open() ? null : ""',
		'[id]': 'root.contentId',
		'data-slot': 'collapsible-content',
	},
	selector: '[c15tCollapsibleContent]',
})
export class CollapsibleContent {
	/** @internal */
	protected readonly root = inject(Collapsible);
}

/** An element that follows the collapsible's `data-state`, such as a chevron. */
@Directive({
	host: {
		'[attr.data-state]': 'root.dataState()',
		'data-slot': 'collapsible-indicator',
	},
	selector: '[c15tCollapsibleIndicator]',
})
export class CollapsibleIndicator {
	/** @internal */
	protected readonly root = inject(Collapsible);
}
