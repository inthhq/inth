/**
 * The cookie categories as one bordered group with inline descriptions
 * (CAT-01, CAT-06), each with its vendors (CAT-09), on a preference draft.
 * Shared by the Privacy Choices banner panels and the dialog.
 *
 * @packageDocumentation
 */

import { NgTemplateOutlet } from '@angular/common';
import {
	afterRenderEffect,
	ChangeDetectionStrategy,
	Component,
	computed,
	ElementRef,
	inject,
	input,
	output,
	signal,
	untracked,
} from '@angular/core';
import {
	applyDialogCategories,
	planCategorySwitch,
	planVendorSwitch,
	vendorsListedUnder,
} from '@inth/sdk/engine';
import type {
	AllConsentNames,
	CategorySwitchPlan,
	ResolvedVendor,
	SaveUISource,
} from '@inth/sdk/engine';
import {
	consentTypes,
	resolveAdvertisingRowCopy,
	resolveCategoryTitle,
	resolvePrivacyChoicesCopy,
	resolveSwitchAnnouncement,
	resolveVendorTableCopy,
} from '@inth/sdk/surface-state';
import {
	revealDisclosure,
	scheduleReveal,
} from '@inth/sdk/ui/primitives/surface';
import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';
import styles from '@inth/sdk/ui/styles/components/privacy-choices';
import type { AllThemeKeys } from '@inth/sdk/ui/theme';

import { ConsentManager } from '../core/consent-manager';
import { ConsentTheme } from '../core/consent-theme';
import { resolveNoStyle } from '../core/no-style';
import { ChoiceSwitch } from './choice-switch';
import { ChevronIcon, ExternalIcon } from './icons';
import { bool, cx, slotPart } from './parts';
import { SurfaceDraft } from './surface-draft';
import { injectSurfaceSession } from './surface-session';

/** Surfaces that render the category group, by their test-id prefix. */
export type CategoryGroupSurface = 'consent-banner' | 'consent-dialog';

/**
 * The group's test ids on each surface, spelled out so each one matches
 * `internals/conformance/src/contract/test-ids.ts`. A switch's id is the
 * prefix plus its category; a vendor switch's, the prefix plus
 * `<category>-<vendor id>`.
 */
const GROUP_TEST_IDS = {
	'consent-banner': {
		group: 'consent-banner-category-group',
		switchPrefix: 'consent-banner-category-switch-',
		vendorSwitchPrefix: 'consent-banner-vendor-switch-',
		vendorTablePrefix: 'consent-banner-vendor-table-',
		vendorTriggerPrefix: 'consent-banner-vendor-trigger-',
	},
	'consent-dialog': {
		group: 'consent-dialog-category-group',
		switchPrefix: 'consent-dialog-category-switch-',
		vendorSwitchPrefix: 'consent-dialog-vendor-switch-',
		vendorTablePrefix: 'consent-dialog-vendor-table-',
		vendorTriggerPrefix: 'consent-dialog-vendor-trigger-',
	},
} as const satisfies Record<CategoryGroupSurface, Record<string, string>>;

type GroupTestIds = (typeof GROUP_TEST_IDS)[CategoryGroupSurface];

/**
 * How a category shows its vendors:
 *
 * - `'accordion'`: a "View N vendors" row that expands the table in place
 *   (desktop, every banner panel, the US preferences sheet).
 * - `'sheet'`: the same row opens a phone sheet (EU phone, NEST-02).
 * - `'inline'`: the table always shows (inside that sheet).
 * - `'none'`: no vendors.
 */
export type VendorMode = 'accordion' | 'sheet' | 'inline' | 'none';

/** A category's vendor trigger asked for its phone sheet. */
export interface OpenVendorsRequest {
	readonly category: AllConsentNames;
	/** Where focus returns when the sheet closes (NEST-04). */
	readonly opener: string;
}

const NO_CATEGORIES: readonly AllConsentNames[] = [];

/**
 * Whether a click on a row's text should toggle its switch (CAT-10): not
 * on a link or control, nor while the visitor selected text.
 */
const isToggleClick = function isToggleClick(event: MouseEvent): boolean {
	const target = event.target as Element | null;
	if (target?.closest('a, button, input')) {
		return false;
	}
	const current = event.currentTarget as Element | null;
	const selection = current?.ownerDocument.getSelection();
	return !selection || selection.isCollapsed;
};

/** The opener key for a category's vendor trigger, where focus returns (NEST-04). */
export const vendorOpenerKey = (category: AllConsentNames): string =>
	`vendors:${category}`;

/**
 * A category's vendors as a boxed table (CAT-09): one 40px line each, the
 * purpose cut off with its full text on hover, a privacy policy link named
 * for the vendor (CAT-07), and a small switch that is never disabled
 * (CAT-03). The host is the table's element.
 *
 * ARIA table roles keep the table's semantics; it lays out as a CSS grid
 * of 40px lines, which some engines drop from a restyled `<table>`.
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.aria-label]': 'copy().table',
		'[attr.class]': 'part().className',
		'[attr.data-testid]': 'testIds().vendorTablePrefix + category()',
		'[attr.style]': 'part().style',
		role: 'table',
	},
	imports: [ChoiceSwitch, ExternalIcon],
	selector: 'div[inth-pc-vendor-table]',
	template: `<div
			[attr.class]="cx(styles.vendorHead)"
			role="row"
		>
			<span role="columnheader">{{ copy().vendorColumn }}</span>
			<span role="columnheader">{{ copy().purposeColumn }}</span>
			<span role="columnheader"
				><span [attr.class]="cx(styles.visuallyHidden)">{{
					copy().policyColumn
				}}</span></span
			>
			<span role="columnheader"
				><span [attr.class]="cx(styles.visuallyHidden)">{{
					copy().switchColumn
				}}</span></span
			>
		</div>
		@for (vendor of vendors(); track vendor.id) {
			<div
				[attr.class]="cx(styles.vendorRow)"
				role="row"
				[attr.data-row-toggle]="vendor.disabled !== true ? '' : null"
				(click)="rowClick($event, vendor)"
			>
				<span
					[attr.class]="cx(styles.vendorName)"
					role="cell"
					[attr.id]="nameId(vendor)"
					>{{ vendor.name ?? vendor.id }}</span
				>
				<span
					[attr.class]="cx(styles.vendorPurpose)"
					role="cell"
					[attr.id]="nameId(vendor) + '-purpose'"
					[attr.title]="vendor.description ?? null"
					>{{ vendor.description }}</span
				>
				<span role="cell">
					@if (vendor.privacyPolicyUrl) {
						<a
							[attr.class]="cx(styles.vendorLink)"
							[attr.href]="vendor.privacyPolicyUrl"
							target="_blank"
							rel="noopener noreferrer"
							[attr.aria-label]="copy().policyLink(vendor.name ?? vendor.id)"
						>
							<svg inth-pc-external></svg>
						</a>
					}
				</span>
				<span role="cell">
					@if (vendor.disabled !== true) {
						<button
							inth-choice-switch
							[checked]="shown()(vendor)"
							size="small"
							[attr.aria-labelledby]="nameId(vendor)"
							[attr.aria-describedby]="
								vendor.description ? nameId(vendor) + '-purpose' : null
							"
							[attr.data-testid]="
								testIds().vendorSwitchPrefix + category() + '-' + vendor.id
							"
							(checkedChange)="toggled.emit({ granted: $event, vendor })"
						></button>
					}
				</span>
			</div>
		}`,
})
export class VendorTable {
	readonly #consent = inject(ConsentManager);
	readonly #theme = inject(ConsentTheme);

	readonly category = input.required<AllConsentNames>();
	readonly categoryTitle = input.required<string>();
	readonly idPrefix = input.required<string>();
	readonly vendors = input.required<readonly ResolvedVendor[]>();
	/** Each vendor's switch, as shown: on only while its category is on. */
	readonly shown = input.required<(vendor: ResolvedVendor) => boolean>();
	readonly testIds = input.required<GroupTestIds>();
	readonly slot = input<AllThemeKeys | undefined>(undefined);
	readonly noStyle = input<boolean | undefined>(undefined);
	/** A vendor's switch, or its row, asked for a new grant. */
	readonly toggled = output<{ vendor: ResolvedVendor; granted: boolean }>();

	/** @internal */
	protected readonly styles = styles;
	readonly #noStyle = resolveNoStyle(this.noStyle);

	/** @internal */
	protected readonly copy = computed(() =>
		resolveVendorTableCopy(this.#consent.copy(), {
			category: this.categoryTitle(),
			count: this.vendors().length,
			onCount: 0,
			open: true,
		})
	);
	/** @internal */
	protected readonly part = computed(() =>
		slotPart(
			this.slot(),
			this.#theme.theme(),
			this.#noStyle(),
			styles.vendorTable
		)
	);

	/** @internal */
	protected cx(...names: (string | undefined)[]): string | null {
		return cx(this.#noStyle(), ...names);
	}

	/** @internal */
	protected nameId(vendor: ResolvedVendor): string {
		return `${this.idPrefix()}-vendor-${this.category()}-${vendor.id}`;
	}

	/**
	 * A pointer shortcut like a label's; the switch stays the only keyboard
	 * and focus target (CAT-10).
	 *
	 * @internal
	 */
	protected rowClick(event: MouseEvent, vendor: ResolvedVendor): void {
		if (vendor.disabled !== true && isToggleClick(event)) {
			this.toggled.emit({ granted: !this.shown()(vendor), vendor });
		}
	}
}

/**
 * The read-only US advertising row: it follows the sale choice (LAW-05,
 * CAT-08). The host is the row's category element, so it takes the group's
 * row dividers.
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.class]': 'cx(styles.category)',
		'[attr.data-testid]': 'testId() ?? null',
		'data-category': 'advertising',
	},
	selector: 'div[inth-pc-advertising-row]',
	template: `<div [attr.class]="cx(styles.categoryRow)">
		<div [attr.class]="cx(styles.categoryText)">
			<span
				[attr.class]="cx(styles.categoryName)"
				[attr.id]="idPrefix() + '-advertising'"
				>{{ copy().title }}</span
			>
			<span
				[attr.class]="cx(styles.categoryDescription)"
				[attr.id]="idPrefix() + '-advertising-description'"
				>{{ copy().description }}</span
			>
		</div>
		<span
			[attr.class]="cx(styles.categoryState)"
			[attr.aria-describedby]="idPrefix() + '-advertising-description'"
			>{{ copy().state }}</span
		>
	</div>`,
})
export class AdvertisingRow {
	readonly #consent = inject(ConsentManager);

	readonly on = input.required<boolean>();
	readonly idPrefix = input.required<string>();
	readonly testId = input<'consent-dialog-advertising-row' | undefined>(
		undefined
	);
	readonly noStyle = input<boolean | undefined>(undefined);

	/** @internal */
	protected readonly styles = styles;
	readonly #noStyle = resolveNoStyle(this.noStyle);

	/** @internal */
	protected readonly copy = computed(() =>
		resolveAdvertisingRowCopy(this.#consent.copy(), this.on())
	);

	/** @internal */
	protected cx(...names: (string | undefined)[]): string | null {
		return cx(this.#noStyle(), ...names);
	}
}

/** One category row's view model. */
interface CategoryRow {
	readonly name: AllConsentNames;
	readonly title: string;
	readonly nameId: string;
	readonly descriptionId: string;
	readonly description: string | undefined;
	readonly required: boolean;
	readonly checked: boolean;
	readonly listed: ResolvedVendor[];
	readonly open: boolean;
	readonly tablePanelId: string;
	readonly trigger: ReturnType<typeof resolveVendorTableCopy>;
	readonly showTrigger: boolean;
}

/**
 * One row per displayed category: its name and one-sentence description
 * inline, and a switch named by both (SR-06). `necessary` shows "Always
 * on". The switches stage into the surface's draft, or apply at once in
 * the US dialog. Content between the tags, such as the advertising row,
 * follows the categories. The host is the group's element.
 *
 * A category's switch gates its vendors (CAT-02): turning it on with no
 * vendor on turns them all on, and turning off its last vendor turns it
 * off. A vendor switch is never disabled: turning one on under an off
 * category turns the category on with only that vendor (CAT-03). Changes
 * the visitor did not press are announced (CAT-04).
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.class]': 'groupPart().className',
		'[attr.data-testid]': 'testIds().group',
		'[attr.style]': 'groupPart().style',
	},
	imports: [ChevronIcon, ChoiceSwitch, NgTemplateOutlet, VendorTable],
	selector: 'div[inth-pc-category-group]',
	template: `@for (row of rows(); track row.name) {
			<div
				[attr.class]="cx(styles.category)"
				[attr.data-category]="row.name"
			>
				<div
					[attr.class]="cx(styles.categoryRow)"
					[attr.data-row-toggle]="row.required ? null : ''"
					(click)="rowClick($event, row)"
				>
					<div [attr.class]="cx(styles.categoryText)">
						<span
							[attr.class]="cx(styles.categoryName)"
							[attr.id]="row.nameId"
							>{{ row.title }}</span
						>
						@if (row.description) {
							<span
								[attr.class]="cx(styles.categoryDescription)"
								[attr.id]="row.descriptionId"
								>{{ row.description }}</span
							>
						}
					</div>
					@if (row.required) {
						<span [attr.class]="cx(styles.categoryState)">{{
							alwaysOn()
						}}</span>
					} @else {
						<button
							inth-choice-switch
							[checked]="row.checked"
							[attr.aria-labelledby]="row.nameId"
							[attr.aria-describedby]="
								row.description ? row.descriptionId : null
							"
							[attr.data-testid]="testIds().switchPrefix + row.name"
							(checkedChange)="toggleCategory(row, $event)"
						></button>
					}
				</div>
				@if (row.showTrigger) {
					<button
						type="button"
						[attr.class]="cx(styles.vendorTrigger)"
						[attr.aria-expanded]="
							vendorMode() === 'accordion' ? bool(row.open) : null
						"
						[attr.aria-controls]="
							vendorMode() === 'accordion' ? row.tablePanelId : null
						"
						[attr.aria-haspopup]="vendorMode() === 'sheet' ? 'dialog' : null"
						[attr.data-opener]="openerKey(row.name)"
						[attr.data-testid]="testIds().vendorTriggerPrefix + row.name"
						(click)="triggerClick(row)"
					>
						<!-- The name starts with the visible text (CAT-05). -->
						<span
							>{{ row.trigger.trigger
							}}<span [attr.class]="cx(styles.visuallyHidden)">{{
								' ' + row.trigger.triggerSuffix
							}}</span></span
						>
						<span [attr.class]="cx(styles.vendorMeta)"
							>{{ row.trigger.onCount
							}}<span [attr.class]="cx(styles.chevron)"
								><svg
									inth-pc-chevron
									[direction]="vendorMode() === 'sheet' ? 'end' : 'down'"
								></svg></span
						></span>
					</button>
				}
				@if (vendorMode() === 'accordion' && row.listed.length > 0) {
					<div
						[attr.class]="cx(styles.disclosure)"
						[attr.id]="row.tablePanelId"
						[attr.data-open]="bool(row.open)"
						[attr.inert]="row.open ? null : ''"
					>
						<div [attr.class]="cx(styles.disclosureInner)">
							<ng-container
								[ngTemplateOutlet]="table"
								[ngTemplateOutletContext]="{ $implicit: row }"
							/>
						</div>
					</div>
				}
				@if (vendorMode() === 'inline' && row.listed.length > 0) {
					<ng-container
						[ngTemplateOutlet]="table"
						[ngTemplateOutletContext]="{ $implicit: row }"
					/>
				}
			</div>
		}
		<ng-content />
		<ng-template
			#table
			let-row
		>
			<div
				inth-pc-vendor-table
				[category]="row.name"
				[categoryTitle]="row.title"
				[idPrefix]="idPrefix()"
				[vendors]="row.listed"
				[shown]="shownFor(row)"
				[testIds]="testIds()"
				[slot]="vendorTableSlot()"
				(toggled)="toggleVendor(row, $event.vendor, $event.granted)"
			></div>
		</ng-template>`,
})
export class CategoryGroup {
	readonly #consent = inject(ConsentManager);
	readonly #theme = inject(ConsentTheme);
	readonly #draft = inject(SurfaceDraft);
	readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

	/**
	 * Prefix for the rows' element ids, one per layer, so a switch's
	 * `aria-labelledby` never resolves into another layer (SR-05).
	 */
	readonly idPrefix = input.required<string>();
	/** The surface it renders on, which prefixes its test ids. */
	readonly testIdPrefix = input.required<CategoryGroupSurface>();
	/**
	 * Categories to leave out, such as the one that decides sale in the US,
	 * which follows the rights row instead (LAW-05, CAT-08).
	 */
	readonly exclude = input<readonly AllConsentNames[]>(NO_CATEGORIES);
	/** Show only this category, as a vendor sheet does (NEST-07). */
	readonly only = input<AllConsentNames | undefined>(undefined);
	/**
	 * `'draft'` stages each switch until a Save (EU, every banner panel).
	 * `'immediate'` applies each switch at once, as the US dialog does
	 * (LAW-04).
	 */
	readonly apply = input<'draft' | 'immediate'>('draft');
	/** Surface to attribute an immediate change to. */
	readonly uiSource = input<SaveUISource | undefined>(undefined);
	readonly vendorMode = input<VendorMode>('accordion', { alias: 'vendors' });
	/** The theme slot that styles the group. */
	readonly slot = input<AllThemeKeys | undefined>(undefined);
	/** The theme slot that styles each vendor table. */
	readonly vendorTableSlot = input<AllThemeKeys | undefined>(undefined);
	readonly noStyle = input<boolean | undefined>(undefined);
	/** A category's vendor trigger asked for its sheet, for `vendors: 'sheet'`. */
	readonly openVendors = output<OpenVendorsRequest>();
	/** Emits after an immediate change applied, for the dialog's "Saved" cue. */
	readonly applied = output();

	/** @internal */
	protected readonly styles = styles;
	/** @internal */
	protected readonly bool = bool;
	/** @internal */
	protected readonly openerKey = vendorOpenerKey;

	readonly #noStyle = resolveNoStyle(this.noStyle);
	readonly #surface = injectSurfaceSession();
	readonly #openVendors = signal<Partial<Record<AllConsentNames, boolean>>>({});
	/** The category whose table just opened, to reveal once it renders. */
	readonly #revealing = signal<AllConsentNames | null>(null);

	/** @internal */
	protected readonly testIds = computed(
		() => GROUP_TEST_IDS[this.testIdPrefix()]
	);
	/** @internal */
	protected readonly groupPart = computed(() =>
		slotPart(
			this.slot(),
			this.#theme.theme(),
			this.#noStyle(),
			expandStyles.group
		)
	);
	/** @internal */
	protected readonly alwaysOn = computed(
		() => resolvePrivacyChoicesCopy(this.#consent.copy()).alwaysOn
	);

	/** @internal */
	protected readonly rows = computed((): CategoryRow[] => {
		const translations = this.#consent.copy();
		const draft = this.#draft.state();
		const exclude = this.exclude();
		const only = this.only();
		const open = this.#openVendors();
		const mode = this.vendorMode();
		return draft.displayedCategories
			.filter(
				(name) =>
					!exclude.includes(name) && (only === undefined || name === only)
			)
			.map((name) => {
				const nameId = `${this.idPrefix()}-category-${name}`;
				const required = name === 'necessary';
				const checked = required || draft.values[name] === true;
				const listed = this.#vendorsOf(name);
				const title = resolveCategoryTitle(translations, name);
				const vendorsOn = listed.filter(
					(vendor) => checked && this.#granted(vendor)
				).length;
				const isOpen = open[name] === true;
				return {
					checked,
					description:
						translations.consentTypes[name]?.description ??
						consentTypes.find((type) => type.name === name)?.description,
					descriptionId: `${nameId}-description`,
					listed,
					name,
					nameId,
					open: isOpen,
					required,
					showTrigger:
						listed.length > 0 && (mode === 'accordion' || mode === 'sheet'),
					tablePanelId: `${this.idPrefix()}-vendors-${name}`,
					title,
					trigger: resolveVendorTableCopy(translations, {
						category: title,
						count: listed.length,
						onCount: vendorsOn,
						open: isOpen,
					}),
				};
			});
	});

	constructor() {
		// Bring an opened vendor table into view without scrolling its trigger
		// out (LAY-05), unless the surface moved on (PERM-16).
		afterRenderEffect((onCleanup) => {
			const category = this.#revealing();
			if (!category) {
				return;
			}
			untracked(() => {
				this.#revealing.set(null);
				const session = this.#surface.session();
				const { token } = session.getState();
				const host = this.#host.nativeElement;
				const cancel = scheduleReveal(
					() => {
						const trigger = host.querySelector<HTMLElement>(
							`[data-opener="${vendorOpenerKey(category)}"]`
						);
						const panel = host.ownerDocument.getElementById(
							`${this.idPrefix()}-vendors-${category}`
						);
						if (trigger && panel) {
							revealDisclosure(trigger, panel);
						}
					},
					{ isCurrent: () => session.isCurrent(token) }
				);
				onCleanup(cancel);
			});
		});
	}

	/** @internal */
	protected cx(...names: (string | undefined)[]): string | null {
		return cx(this.#noStyle(), ...names);
	}

	#vendorsOf(category: AllConsentNames): ResolvedVendor[] {
		if (this.vendorMode() === 'none') {
			return [];
		}
		const snapshot = this.#consent.snapshot();
		return vendorsListedUnder(
			{
				model: snapshot.model,
				vendorChoice: this.#consent.vendorChoice(),
				vendors: snapshot.vendors,
			},
			category
		);
	}

	#granted(vendor: ResolvedVendor): boolean {
		return this.#draft.state().vendors[vendor.id] ?? true;
	}

	/** @internal */
	protected shownFor(row: CategoryRow): (vendor: ResolvedVendor) => boolean {
		return (vendor) => row.checked && this.#granted(vendor);
	}

	/** Stage a plan, apply it in the US dialog, and announce it. */
	#commit(
		category: AllConsentNames,
		plan: CategorySwitchPlan,
		changes: { name: string; on: boolean }[]
	): void {
		const draft = this.#draft.draft();
		draft.set(category, plan.on);
		for (const [id, value] of Object.entries(plan.vendors)) {
			draft.setVendor(id, value);
		}
		const applied = this.apply() === 'immediate';
		if (applied) {
			void applyDialogCategories(this.#consent.kernel(), draft, [category], {
				uiSource: this.uiSource(),
			});
			this.applied.emit();
		}
		if (applied || changes.length > 1) {
			this.#surface
				.session()
				.announce(
					resolveSwitchAnnouncement(this.#consent.copy(), { applied, changes })
				);
		}
	}

	#stateOf(row: CategoryRow) {
		return {
			on: this.#draft.state().values[row.name] === true,
			vendors: Object.fromEntries(
				row.listed
					.filter((vendor) => vendor.disabled !== true)
					.map((vendor) => [vendor.id, this.#granted(vendor)])
			),
		};
	}

	/** @internal */
	protected toggleCategory(row: CategoryRow, on: boolean): void {
		const plan = planCategorySwitch(this.#stateOf(row), on);
		this.#commit(row.name, plan, [{ name: row.title, on }]);
	}

	/** @internal */
	protected toggleVendor(
		row: CategoryRow,
		vendor: ResolvedVendor,
		on: boolean
	): void {
		const plan = planVendorSwitch(this.#stateOf(row), vendor.id, on);
		const changes = [{ name: vendor.name ?? vendor.id, on }];
		if (plan.categoryChanged) {
			changes.push({ name: row.title, on: plan.on });
		}
		this.#commit(row.name, plan, changes);
	}

	/**
	 * A pointer shortcut like a label's; the switch stays the only keyboard
	 * and focus target (CAT-10).
	 *
	 * @internal
	 */
	protected rowClick(event: MouseEvent, row: CategoryRow): void {
		if (!row.required && isToggleClick(event)) {
			this.toggleCategory(row, !row.checked);
		}
	}

	/** @internal */
	protected triggerClick(row: CategoryRow): void {
		if (this.vendorMode() === 'sheet') {
			this.openVendors.emit({
				category: row.name,
				opener: vendorOpenerKey(row.name),
			});
			return;
		}
		if (!row.open) {
			this.#revealing.set(row.name);
		}
		this.#openVendors.update((state) => ({ ...state, [row.name]: !row.open }));
	}
}
