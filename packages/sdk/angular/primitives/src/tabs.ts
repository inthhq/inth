import {
	computed,
	Directive,
	DOCUMENT,
	inject,
	input,
	model,
} from '@angular/core';
import type { TabsOrientation } from '@inth/sdk/ui/primitives';
import {
	getDataDisabled,
	getNextTabValue,
	getTabPanelState,
	getTabState,
} from '@inth/sdk/ui/primitives';

import { uniqueId } from './unique-id';

/**
 * Headless tabs. Bind `[(value)]` to the selected tab. Arrow keys, Home and
 * End move between triggers.
 *
 * A panel stays in the DOM, `hidden`, while its tab is not selected. To
 * leave it out instead, wrap it in `@if (panel.selected())`.
 *
 * @example
 * ```html
 * <div inthTabs [(value)]="tab">
 *   <div inthTabsList aria-label="Preferences">
 *     <button inthTabsTrigger value="purposes">Purposes</button>
 *     <button inthTabsTrigger value="vendors">Vendors</button>
 *   </div>
 *   <div inthTabsContent value="purposes">…</div>
 *   <div inthTabsContent value="vendors">…</div>
 * </div>
 * ```
 */
@Directive({
	exportAs: 'inthTabs',
	host: {
		'[attr.data-disabled]': 'dataDisabled()',
		'[attr.data-orientation]': 'orientation()',
		'data-slot': 'tabs-root',
	},
	selector: '[inthTabs]',
})
export class Tabs {
	/** The selected tab's value. */
	readonly value = model<string | null>(null);
	/** Whether the triggers are ignored. */
	readonly disabled = input(false);
	/** Whether arrow keys wrap around. */
	readonly loop = input(true);
	/** Which arrow keys move between triggers. */
	readonly orientation = input<TabsOrientation>('horizontal');

	/** @internal */
	readonly baseId = uniqueId('inth-tabs');
	/** @internal */
	protected readonly dataDisabled = computed(() =>
		getDataDisabled(this.disabled())
	);

	/**
	 * Select a tab, unless the tabs are disabled.
	 */
	select(value: string): void {
		if (!this.disabled()) {
			this.value.set(value);
		}
	}
}

/** The element that holds the triggers: `role="tablist"`. */
@Directive({
	host: {
		'[attr.aria-orientation]': 'resolvedOrientation()',
		'[attr.data-disabled]': 'dataDisabled()',
		'[attr.data-orientation]': 'resolvedOrientation()',
		'data-slot': 'tabs-list',
		role: 'tablist',
	},
	selector: '[inthTabsList]',
})
export class TabsList {
	readonly #root = inject(Tabs);
	/** Overrides the root's orientation for this list. */
	readonly orientation = input<TabsOrientation | undefined>(undefined);
	/**
	 * The orientation in effect: this list's, else the root's.
	 *
	 * @internal
	 */
	readonly resolvedOrientation = computed(
		() => this.orientation() ?? this.#root.orientation()
	);
	/** @internal */
	protected readonly dataDisabled = computed(() =>
		getDataDisabled(this.#root.disabled())
	);
}

/** A `<button>` that selects one tab: `role="tab"`. */
@Directive({
	host: {
		'(click)': 'root.select(value())',
		'(keydown)': 'moveSelection($event)',
		'[attr.aria-controls]': 'contentId()',
		'[attr.aria-selected]': 'selected()',
		'[attr.data-disabled]': 'dataDisabled()',
		'[attr.data-state]': 'dataState()',
		'[attr.disabled]': 'root.disabled() ? "" : null',
		'[attr.tabindex]': 'selected() ? 0 : -1',
		'[attr.type]': 'type()',
		'[id]': 'triggerId()',
		'data-slot': 'tabs-trigger',
		role: 'tab',
	},
	selector: '[inthTabsTrigger]',
})
export class TabsTrigger {
	readonly #document = inject(DOCUMENT);
	/** @internal */
	protected readonly root = inject(Tabs);
	readonly #list = inject(TabsList, { optional: true });
	readonly value = input.required<string>();
	readonly type = input<'button' | 'submit' | 'reset'>('button');

	/** Whether this tab is selected. */
	readonly selected = computed(() => this.root.value() === this.value());
	/** @internal */
	protected readonly triggerId = computed(
		() => `${this.root.baseId}-trigger-${this.value()}`
	);
	/** @internal */
	protected readonly contentId = computed(
		() => `${this.root.baseId}-content-${this.value()}`
	);
	/** @internal */
	protected readonly dataState = computed(() => getTabState(this.selected()));
	/** @internal */
	protected readonly dataDisabled = computed(() =>
		getDataDisabled(this.root.disabled())
	);

	/** @internal */
	protected moveSelection(event: KeyboardEvent): void {
		const prefix = `${this.root.baseId}-trigger-`;
		const triggerValues = Array.from(
			this.#document.querySelectorAll<HTMLButtonElement>(
				`[data-slot="tabs-trigger"][id^="${prefix}"]`
			)
		).map((button) => button.id.slice(prefix.length));
		const value = this.value();
		const next = getNextTabValue({
			currentValue: value,
			key: event.key,
			loop: this.root.loop(),
			orientation: this.#list?.resolvedOrientation() ?? this.root.orientation(),
			triggerValues,
		});
		if (next !== value || event.key === 'Home' || event.key === 'End') {
			event.preventDefault();
			this.root.select(next);
			const button = this.#document.getElementById(`${prefix}${next}`);
			if (button instanceof HTMLElement) {
				button.focus();
			}
		}
	}
}

/** One tab's panel: `role="tabpanel"`, `hidden` while not selected. */
@Directive({
	exportAs: 'inthTabsContent',
	host: {
		'[attr.aria-labelledby]': 'triggerId()',
		'[attr.data-state]': 'dataState()',
		'[hidden]': '!selected()',
		'[id]': 'contentId()',
		'data-slot': 'tabs-content',
		role: 'tabpanel',
		tabindex: '0',
	},
	selector: '[inthTabsContent]',
})
export class TabsContent {
	readonly #root = inject(Tabs);
	readonly value = input.required<string>();

	/** Whether this panel's tab is selected. */
	readonly selected = computed(() => this.#root.value() === this.value());
	/** @internal */
	protected readonly triggerId = computed(
		() => `${this.#root.baseId}-trigger-${this.value()}`
	);
	/** @internal */
	protected readonly contentId = computed(
		() => `${this.#root.baseId}-content-${this.value()}`
	);
	/** @internal */
	protected readonly dataState = computed(() =>
		getTabPanelState(this.selected())
	);
}
