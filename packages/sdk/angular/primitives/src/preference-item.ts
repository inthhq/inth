import { NgTemplateOutlet } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	contentChild,
	Directive,
	inject,
	input,
	model,
	TemplateRef,
} from '@angular/core';
import { ɵresolveNoStyle as resolveNoStyle } from '@inth/angular';
import {
	getDataDisabled,
	getPreferenceItemState,
	PREFERENCE_ITEM_INTERNAL_SLOTS,
	PREFERENCE_ITEM_SLOTS,
	togglePreferenceItemValue,
} from '@inth/sdk/ui/primitives';
import { preferenceItemVariants } from '@inth/sdk/ui/styles/primitives';

import { uniqueId } from './unique-id';

const variants = preferenceItemVariants();

/**
 * One row of a preference list: a header with a trigger and controls, and
 * collapsible content. Bind `[(open)]` to control the content.
 *
 * The parts carry the stock `@inth/sdk/ui` classes unless `noStyle` is set
 * here or on the provider. Your own `class` attributes are kept either way.
 *
 * @example
 * ```html
 * <div inthPreferenceItem [(open)]="open">
 *   <div inthPreferenceItemHeader>
 *     <button inthPreferenceItemTrigger>
 *       <h3 inthPreferenceItemTitle>Analytics</h3>
 *     </button>
 *     <div inthPreferenceItemControl>
 *       <button inthSwitch [(checked)]="analytics" aria-label="Analytics"></button>
 *     </div>
 *   </div>
 *   <div inth-preference-item-content>Helps us understand how the site is used.</div>
 * </div>
 * ```
 */
@Directive({
	exportAs: 'inthPreferenceItem',
	host: {
		'[attr.data-disabled]': 'dataDisabled()',
		'[attr.data-slot]': 'slot',
		'[attr.data-state]': 'dataState()',
		'[class]': 'className()',
	},
	selector: '[inthPreferenceItem]',
})
export class PreferenceItem {
	readonly open = model(false);
	readonly disabled = input(false);
	/** Drop the stock classes. Defaults to the provider's `noStyle`. */
	readonly noStyle = input<boolean | undefined>(undefined);

	/** @internal */
	readonly triggerId = uniqueId('inth-preference-item-trigger');
	/** @internal */
	readonly contentId = uniqueId('inth-preference-item-content');
	/** @internal */
	protected readonly slot = PREFERENCE_ITEM_SLOTS.root;
	/** Whether the parts drop their stock classes. */
	readonly resolvedNoStyle = resolveNoStyle(this.noStyle);
	/** @internal */
	readonly dataState = computed(() => getPreferenceItemState(this.open()));
	/** @internal */
	protected readonly dataDisabled = computed(() =>
		getDataDisabled(this.disabled())
	);
	/** @internal */
	protected readonly className = computed(() =>
		this.resolvedNoStyle() ? '' : variants.root()
	);

	/** Toggle the content, unless disabled. */
	toggle(): void {
		if (!this.disabled()) {
			this.open.set(togglePreferenceItemValue(this.open()));
		}
	}
}

/** Shared host for the plain layout parts. @internal */
@Directive()
abstract class PreferenceItemPart {
	/** @internal */
	protected readonly item = inject(PreferenceItem);
	/** @internal */
	protected abstract readonly slot: string;
	/** @internal */
	protected abstract variant(): string;
	/** @internal */
	protected readonly className = computed(() =>
		this.item.resolvedNoStyle() ? '' : this.variant()
	);
}

const PART_HOST = {
	'[attr.data-slot]': 'slot',
	'[class]': 'className()',
};

/** The row's header. */
@Directive({ host: PART_HOST, selector: '[inthPreferenceItemHeader]' })
export class PreferenceItemHeader extends PreferenceItemPart {
	/** @internal */
	protected readonly slot = PREFERENCE_ITEM_SLOTS.header;
	/** @internal */
	protected variant(): string {
		return variants.header();
	}
}

/** Content before the title, such as an icon. */
@Directive({ host: PART_HOST, selector: '[inthPreferenceItemLeading]' })
export class PreferenceItemLeading extends PreferenceItemPart {
	/** @internal */
	protected readonly slot = PREFERENCE_ITEM_SLOTS.leading;
	/** @internal */
	protected variant(): string {
		return variants.leading();
	}
}

/** The row's title. Put it on an `<h3>`. */
@Directive({ host: PART_HOST, selector: '[inthPreferenceItemTitle]' })
export class PreferenceItemTitle extends PreferenceItemPart {
	/** @internal */
	protected readonly slot = PREFERENCE_ITEM_SLOTS.title;
	/** @internal */
	protected variant(): string {
		return variants.title();
	}
}

/** Secondary text under the title. */
@Directive({ host: PART_HOST, selector: '[inthPreferenceItemMeta]' })
export class PreferenceItemMeta extends PreferenceItemPart {
	/** @internal */
	protected readonly slot = PREFERENCE_ITEM_SLOTS.meta;
	/** @internal */
	protected variant(): string {
		return variants.meta();
	}
}

/** Extra content next to the control. */
@Directive({ host: PART_HOST, selector: '[inthPreferenceItemAuxiliary]' })
export class PreferenceItemAuxiliary extends PreferenceItemPart {
	/** @internal */
	protected readonly slot = PREFERENCE_ITEM_SLOTS.auxiliary;
	/** @internal */
	protected variant(): string {
		return variants.auxiliary();
	}
}

/** Holds the row's control, such as a switch. */
@Directive({ host: PART_HOST, selector: '[inthPreferenceItemControl]' })
export class PreferenceItemControl extends PreferenceItemPart {
	/** @internal */
	protected readonly slot = PREFERENCE_ITEM_SLOTS.control;
	/** @internal */
	protected variant(): string {
		return variants.control();
	}
}

/** The `<button>` that toggles the row's content. */
@Directive({
	host: {
		'(click)': 'item.toggle()',
		'[attr.aria-controls]': 'item.contentId',
		'[attr.aria-disabled]': 'item.disabled() || null',
		'[attr.aria-expanded]': 'item.open()',
		'[attr.data-disabled]': 'dataDisabled()',
		'[attr.data-slot]': 'slot',
		'[attr.data-state]': 'item.dataState()',
		'[attr.disabled]': 'item.disabled() ? "" : null',
		'[attr.type]': 'type()',
		'[class]': 'className()',
		'[id]': 'item.triggerId',
	},
	selector: '[inthPreferenceItemTrigger]',
})
export class PreferenceItemTrigger extends PreferenceItemPart {
	readonly type = input<'button' | 'submit' | 'reset'>('button');
	/** @internal */
	protected readonly slot = PREFERENCE_ITEM_SLOTS.trigger;
	/** @internal */
	protected readonly dataDisabled = computed(() =>
		getDataDisabled(this.item.disabled())
	);
	/** @internal */
	protected variant(): string {
		return variants.trigger();
	}
}

/**
 * Marks the `<ng-template>` an `inth-preference-item-content` creates only from
 * the item's first open, for content too heavy to build up front.
 *
 * A marker, not any `TemplateRef` child: control flow such as `@if` is a
 * template too, and would otherwise render as the body with its condition
 * ignored.
 *
 * @example
 * ```html
 * <div inth-preference-item-content>
 *   <ng-template inthPreferenceItemBody><app-vendor-list /></ng-template>
 * </div>
 * ```
 */
@Directive({ selector: 'ng-template[inthPreferenceItemBody]' })
export class PreferenceItemBody {
	/** @internal */
	readonly template = inject(TemplateRef);
}

/**
 * The row's collapsible content. `inert` and `aria-hidden` while closed.
 *
 * The projected content renders from the first open and then stays, so the
 * close transition keeps it. For content that should not even be created
 * before then, such as a long vendor list, pass it as an
 * `<ng-template inthPreferenceItemBody>` child instead.
 *
 * @example
 * ```html
 * <div inth-preference-item-content>
 *   <ng-template inthPreferenceItemBody><app-vendor-list /></ng-template>
 * </div>
 * ```
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.aria-hidden]': '!item.open()',
		'[attr.aria-labelledby]': 'item.triggerId',
		'[attr.data-slot]': 'slot',
		'[attr.data-state]': 'item.dataState()',
		'[attr.inert]': 'item.open() ? null : ""',
		'[class]': 'contentClass()',
		'[id]': 'item.contentId',
	},
	imports: [NgTemplateOutlet],
	selector: '[inth-preference-item-content]',
	template: `<div
		[class]="viewportClass()"
		[attr.data-slot]="viewportSlot"
	>
		<div
			[class]="innerClass()"
			[attr.data-slot]="innerSlot"
		>
			@if (renderChildren()) {
				@if (body(); as body) {
					<ng-container [ngTemplateOutlet]="body.template" />
				}
				<ng-content />
			}
		</div>
	</div>`,
})
export class PreferenceItemContent {
	/** @internal */
	protected readonly item = inject(PreferenceItem);
	/** Render the content while the item has never been opened. */
	readonly forceMount = input(false);
	/**
	 * Drop the stock classes. Defaults to the item's `noStyle`.
	 */
	readonly noStyle = input<boolean | undefined>(undefined);
	/** Extra class for the inner wrapper. */
	readonly innerClassName = input<string | undefined>(undefined);
	/**
	 * Extra class for the viewport wrapper.
	 *
	 * @internal
	 */
	readonly viewportClassName = input<string | undefined>(undefined);

	/** @internal */
	protected readonly body = contentChild(PreferenceItemBody);
	/** @internal */
	protected readonly slot = PREFERENCE_ITEM_SLOTS.content;
	/** @internal */
	protected readonly viewportSlot =
		PREFERENCE_ITEM_INTERNAL_SLOTS.contentViewport;
	/** @internal */
	protected readonly innerSlot = PREFERENCE_ITEM_INTERNAL_SLOTS.contentInner;

	#opened = false;
	/** @internal */
	protected readonly renderChildren = computed(() => {
		if (this.forceMount() || this.item.open()) {
			this.#opened = true;
		}
		return this.#opened;
	});

	readonly #noStyle = computed(
		() => this.noStyle() ?? this.item.resolvedNoStyle()
	);
	/** @internal */
	protected readonly contentClass = computed(() =>
		this.#noStyle() ? '' : variants.content()
	);
	/** @internal */
	protected readonly viewportClass = computed(() =>
		this.#noStyle()
			? (this.viewportClassName() ?? '')
			: variants.contentViewport({ class: this.viewportClassName() })
	);
	/** @internal */
	protected readonly innerClass = computed(() =>
		this.#noStyle()
			? (this.innerClassName() ?? '')
			: variants.contentInner({ class: this.innerClassName() })
	);
}
