/**
 * The cookie categories as one bordered group with inline descriptions
 * (CAT-01, CAT-06), each with its vendors (CAT-09), on a preference draft.
 * Shared by the banner's options and the dialog, as
 * `CategoryGroup` is in `@inth/react`.
 *
 * @packageDocumentation
 * @internal
 */

import {
	consentTypes,
	planCategorySwitch,
	planVendorSwitch,
	resolveAdvertisingRowCopy,
	resolveCategoryTitle,
	resolvePrivacyChoicesCopy,
	resolveSwitchAnnouncement,
	resolveVendorTableCopy,
	vendorsListedUnder,
} from '@inth/sdk-core';
import type {
	AllConsentNames,
	CategorySwitchPlan,
	ResolvedVendor,
	SaveUISource,
} from '@inth/sdk-core';
import {
	revealDisclosure,
	scheduleReveal,
} from '@inth/sdk-ui/primitives/surface';

import { classes as styles } from '../../generated/ui/dialog';
import { classes as expandStyles } from '../../generated/ui/expand';
import type { BrowserSlotKey } from '../create-slot-applier';
import { cx, el, icon } from './el';
import { applyDialogCategories } from './engine';
import { chevron, choiceSwitch, isToggleClick } from './part-env.model';
import type { PartEnv } from './part-env.model';

/** Surfaces that render the category group, by their test-id prefix. */
export type CategoryGroupSurface = 'consent-banner' | 'consent-dialog';

/**
 * How a category shows its vendors: an accordion row, a phone sheet, the
 * table inline (inside that sheet), or none.
 */
export type VendorMode = 'accordion' | 'sheet' | 'inline' | 'none';

/** What {@link createCategoryGroup} renders each time. */
export interface CategoryGroupProps {
	/** Prefix for the rows' element ids, one per layer (SR-05). */
	idPrefix: string;
	testIdPrefix: CategoryGroupSurface;
	/** Categories to leave out, such as the one that decides sale (LAW-05). */
	exclude?: readonly AllConsentNames[];
	/** Show only this category, as a vendor sheet does (NEST-07). */
	only?: AllConsentNames;
	/** A row after the categories, such as the read-only advertising row. */
	footer?: HTMLElement | null;
	/** `'draft'` stages each switch; `'immediate'` applies it (LAW-04). */
	apply?: 'draft' | 'immediate';
	uiSource?: SaveUISource;
	vendors?: VendorMode;
	/** Opens a category's vendor sheet, for `vendors: 'sheet'`. */
	onOpenVendors?: (category: AllConsentNames, opener: string) => void;
	/** Called after an immediate change applied, for the "Saved" cue. */
	onApplied?: () => void;
	slotKey?: BrowserSlotKey;
	vendorTableSlotKey?: BrowserSlotKey;
}

/** One mounted category group: render, then run its effects. */
export interface CategoryGroup {
	render: (env: PartEnv, props: CategoryGroupProps) => HTMLElement;
	after: (env: PartEnv) => void;
	dispose: () => void;
}

/** The opener key for a category's vendor trigger, where focus returns (NEST-04). */
export const vendorOpenerKey = (category: AllConsentNames): string =>
	`vendors:${category}`;

const externalIcon = () =>
	icon(13, [
		'M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5',
	]);

interface VendorTableParams {
	env: PartEnv;
	category: AllConsentNames;
	categoryTitle: string;
	idPrefix: string;
	vendors: readonly ResolvedVendor[];
	shown: (vendor: ResolvedVendor) => boolean;
	onToggle: (vendor: ResolvedVendor, granted: boolean) => void;
	testIdPrefix: CategoryGroupSurface;
	slotKey?: BrowserSlotKey;
}

/**
 * A category's vendors as a boxed table (CAT-09): one line each, the
 * purpose cut off with its full text on hover, a privacy policy link named
 * for the vendor (CAT-07), and a small switch that is never disabled
 * (CAT-03). ARIA table roles keep its table semantics over a CSS grid.
 */
const vendorTable = function vendorTable(
	params: VendorTableParams
): HTMLElement {
	const { env, category, idPrefix, vendors, testIdPrefix } = params;
	const { noStyle, t } = env;
	const copy = resolveVendorTableCopy(t, {
		category: params.categoryTitle,
		count: vendors.length,
		onCount: 0,
		open: true,
	});
	const table = el(
		'div',
		{
			'aria-label': copy.table,
			class: cx(noStyle, styles.vendorTable),
			'data-testid': `${testIdPrefix}-vendor-table-${category}`,
			role: 'table',
		},
		el(
			'div',
			{ class: cx(noStyle, styles.vendorHead), role: 'row' },
			el('span', { role: 'columnheader' }, copy.vendorColumn),
			el('span', { role: 'columnheader' }, copy.purposeColumn),
			el(
				'span',
				{ role: 'columnheader' },
				el(
					'span',
					{ class: cx(noStyle, styles.visuallyHidden) },
					copy.policyColumn
				)
			),
			el(
				'span',
				{ role: 'columnheader' },
				el(
					'span',
					{ class: cx(noStyle, styles.visuallyHidden) },
					copy.switchColumn
				)
			)
		),
		...vendors.map((vendor) => {
			const name = vendor.name ?? vendor.id;
			const nameId = `${idPrefix}-vendor-${category}-${vendor.id}`;
			const purposeId = `${nameId}-purpose`;
			const toggleable = vendor.disabled !== true;
			const checked = params.shown(vendor);
			const row = el(
				'div',
				{
					class: cx(noStyle, styles.vendorRow),
					'data-row-toggle': toggleable ? '' : undefined,
					role: 'row',
				},
				el(
					'span',
					{ class: cx(noStyle, styles.vendorName), id: nameId, role: 'cell' },
					name
				),
				el(
					'span',
					{
						class: cx(noStyle, styles.vendorPurpose),
						id: purposeId,
						role: 'cell',
						title: vendor.description,
					},
					vendor.description
				),
				el(
					'span',
					{ role: 'cell' },
					vendor.privacyPolicyUrl
						? el(
								'a',
								{
									'aria-label': copy.policyLink(name),
									class: cx(noStyle, styles.vendorLink),
									href: vendor.privacyPolicyUrl,
									rel: 'noopener noreferrer',
									target: '_blank',
								},
								externalIcon()
							)
						: null
				),
				el(
					'span',
					{ role: 'cell' },
					toggleable
						? choiceSwitch({
								attrs: {
									'aria-describedby': vendor.description
										? purposeId
										: undefined,
									'aria-labelledby': nameId,
									'data-testid': `${testIdPrefix}-vendor-switch-${category}-${vendor.id}`,
								},
								checked,
								noStyle,
								onChange: (next) => params.onToggle(vendor, next),
								size: 'small',
							})
						: null
				)
			);
			row.onclick = (event) => {
				// The handler moves to the mounted row on a morph: read the row
				// from the event, since `row` may be a detached copy outside
				// the shadow root (CAT-10).
				if (
					toggleable &&
					isToggleClick(event, (event.currentTarget as Element | null) ?? row)
				) {
					params.onToggle(vendor, !checked);
				}
			};
			return row;
		})
	);
	return params.slotKey ? env.ctx.slot(table, params.slotKey) : table;
};

/** A category's "View N vendors" row: an accordion trigger, or a sheet's opener. */
const vendorTrigger = function vendorTrigger(params: {
	category: AllConsentNames;
	copy: ReturnType<typeof resolveVendorTableCopy>;
	mode: VendorMode;
	noStyle: boolean;
	onClick: () => void;
	open: boolean;
	panelId: string;
	testIdPrefix: CategoryGroupSurface;
}): HTMLElement {
	const { copy, mode, noStyle } = params;
	const accordion = mode === 'accordion';
	return el(
		'button',
		{
			'aria-controls': accordion ? params.panelId : undefined,
			'aria-expanded': accordion ? String(params.open) : undefined,
			'aria-haspopup': mode === 'sheet' ? 'dialog' : undefined,
			class: cx(noStyle, styles.vendorTrigger),
			'data-opener': vendorOpenerKey(params.category),
			'data-testid': `${params.testIdPrefix}-vendor-trigger-${params.category}`,
			on: { click: params.onClick },
			type: 'button',
		},
		// The name starts with the visible text (CAT-05).
		el(
			'span',
			{},
			copy.trigger,
			el(
				'span',
				{ class: cx(noStyle, styles.visuallyHidden) },
				` ${copy.triggerSuffix}`
			)
		),
		el(
			'span',
			{ class: cx(noStyle, styles.vendorMeta) },
			copy.onCount,
			// A sheet comes in from the end; an accordion opens downwards.
			el(
				'span',
				{
					class: cx(noStyle, styles.chevron),
					'data-direction': mode === 'sheet' ? 'end' : 'down',
				},
				chevron(mode === 'sheet' ? 'end' : 'down')
			)
		)
	);
};

/** The read-only US advertising row: it follows the sale choice (LAW-05, CAT-08). */
export const advertisingRow = function advertisingRow(
	env: PartEnv,
	params: {
		on: boolean;
		idPrefix: string;
		testId?: 'consent-dialog-advertising-row';
	}
): HTMLElement {
	const { noStyle } = env;
	const copy = resolveAdvertisingRowCopy(env.t, params.on);
	return el(
		'div',
		{
			class: cx(noStyle, styles.category),
			'data-category': 'advertising',
			'data-testid': params.testId,
		},
		el(
			'div',
			{ class: cx(noStyle, styles.categoryRow) },
			el(
				'div',
				{ class: cx(noStyle, styles.categoryText) },
				el(
					'span',
					{
						class: cx(noStyle, styles.categoryName),
						id: `${params.idPrefix}-advertising`,
					},
					copy.title
				),
				el(
					'span',
					{
						class: cx(noStyle, styles.categoryDescription),
						id: `${params.idPrefix}-advertising-description`,
					},
					copy.description
				)
			),
			el(
				'span',
				{
					'aria-describedby': `${params.idPrefix}-advertising-description`,
					class: cx(noStyle, styles.categoryState),
				},
				copy.state
			)
		)
	);
};

/**
 * One row per displayed category: its name and description inline, and a
 * switch named by both (SR-06). `necessary` shows "Always on". The
 * switches stage into the surface's draft, or apply at once in the US
 * dialog.
 *
 * A category's switch gates its vendors (CAT-02), a vendor switch is never
 * disabled (CAT-03), and changes the visitor did not press are announced
 * (CAT-04).
 */
// oxlint-disable-next-line max-lines-per-function -- The group, its vendors and their shared toggle rules stay together.
export const createCategoryGroup =
	function createCategoryGroup(): CategoryGroup {
		const openVendors = new Set<AllConsentNames>();
		let revealing: AllConsentNames | null = null;
		let cancelReveal: (() => void) | undefined;
		let lastIdPrefix = '';

		const render = function render(
			env: PartEnv,
			props: CategoryGroupProps
		): HTMLElement {
			const { kernel, t, session, draft, snapshot, noStyle } = env;
			const {
				idPrefix,
				testIdPrefix,
				exclude = [],
				only,
				apply = 'draft',
				vendors: vendorMode = 'accordion',
			} = props;
			lastIdPrefix = idPrefix;
			const draftState = draft.getState();
			const displayed = draftState.displayedCategories;
			const { values } = draftState;
			const grants = draftState.vendors;
			const rows = displayed.filter(
				(name) =>
					!exclude.includes(name) && (only === undefined || name === only)
			);
			const { alwaysOn } = resolvePrivacyChoicesCopy(t);
			const vendorsOf = (category: AllConsentNames): ResolvedVendor[] =>
				vendorMode === 'none'
					? []
					: vendorsListedUnder(
							{
								model: snapshot.model,
								vendorChoice: snapshot.vendorChoice,
								vendors: snapshot.vendors,
							},
							category
						);
			const titleOf = (category: AllConsentNames) =>
				resolveCategoryTitle(t, category);
			const granted = (vendor: ResolvedVendor) => grants[vendor.id] ?? true;

			/** Stage a plan, apply it in the US dialog, and announce it. */
			const commit = (
				category: AllConsentNames,
				plan: CategorySwitchPlan,
				changes: { name: string; on: boolean }[]
			) => {
				draft.set(category, plan.on);
				for (const [id, value] of Object.entries(plan.vendors)) {
					draft.setVendor(id, value);
				}
				const applied = apply === 'immediate';
				if (applied) {
					void applyDialogCategories(kernel, draft, [category], {
						uiSource: props.uiSource,
					});
					props.onApplied?.();
				}
				if (applied || changes.length > 1) {
					session.announce(resolveSwitchAnnouncement(t, { applied, changes }));
				}
			};
			const stateOf = (
				category: AllConsentNames,
				listed: ResolvedVendor[]
			) => ({
				on: values[category] === true,
				vendors: Object.fromEntries(
					listed
						.filter((vendor) => vendor.disabled !== true)
						.map((vendor) => [vendor.id, granted(vendor)])
				),
			});
			const toggleCategory = (
				category: AllConsentNames,
				listed: ResolvedVendor[],
				on: boolean
			) => {
				const plan = planCategorySwitch(stateOf(category, listed), on);
				commit(category, plan, [{ name: titleOf(category), on }]);
			};
			const toggleVendor = (
				category: AllConsentNames,
				listed: ResolvedVendor[],
				vendor: ResolvedVendor,
				on: boolean
			) => {
				const plan = planVendorSwitch(stateOf(category, listed), vendor.id, on);
				const changes = [{ name: vendor.name ?? vendor.id, on }];
				if (plan.categoryChanged) {
					changes.push({ name: titleOf(category), on: plan.on });
				}
				commit(category, plan, changes);
			};

			const group = el(
				'div',
				{
					class: cx(noStyle, expandStyles.group),
					'data-testid': `${testIdPrefix}-category-group`,
				},
				...rows.map((name) => {
					const nameId = `${idPrefix}-category-${name}`;
					const descriptionId = `${nameId}-description`;
					const required = name === 'necessary';
					const checked = required || values[name] === true;
					const description =
						t.consentTypes?.[name]?.description ??
						consentTypes.find((type) => type.name === name)?.description;
					const listed = vendorsOf(name);
					const vendorsOn = listed.filter(
						(vendor) => checked && granted(vendor)
					).length;
					const open = openVendors.has(name);
					const tablePanelId = `${idPrefix}-vendors-${name}`;
					const triggerCopy = resolveVendorTableCopy(t, {
						category: titleOf(name),
						count: listed.length,
						onCount: vendorsOn,
						open,
					});
					const table =
						listed.length > 0
							? vendorTable({
									category: name,
									categoryTitle: titleOf(name),
									env,
									idPrefix,
									onToggle: (vendor, on) =>
										toggleVendor(name, listed, vendor, on),
									shown: (vendor) => checked && granted(vendor),
									slotKey: props.vendorTableSlotKey,
									testIdPrefix,
									vendors: listed,
								})
							: null;
					const showTrigger =
						listed.length > 0 &&
						(vendorMode === 'accordion' || vendorMode === 'sheet');
					const row = el(
						'div',
						{
							class: cx(noStyle, styles.categoryRow),
							'data-row-toggle': required ? undefined : '',
						},
						el(
							'div',
							{ class: cx(noStyle, styles.categoryText) },
							el(
								'span',
								{ class: cx(noStyle, styles.categoryName), id: nameId },
								titleOf(name)
							),
							description
								? el(
										'span',
										{
											class: cx(noStyle, styles.categoryDescription),
											id: descriptionId,
										},
										description
									)
								: null
						),
						required
							? el(
									'span',
									{ class: cx(noStyle, styles.categoryState) },
									alwaysOn
								)
							: choiceSwitch({
									attrs: {
										'aria-describedby': description ? descriptionId : undefined,
										'aria-labelledby': nameId,
										'data-testid': `${testIdPrefix}-category-switch-${name}`,
									},
									checked,
									noStyle,
									onChange: (next) => toggleCategory(name, listed, next),
								})
					);
					row.onclick = (event) => {
						if (
							!required &&
							isToggleClick(
								event,
								(event.currentTarget as Element | null) ?? row
							)
						) {
							toggleCategory(name, listed, !checked);
						}
					};
					const trigger = showTrigger
						? vendorTrigger({
								category: name,
								copy: triggerCopy,
								mode: vendorMode,
								noStyle,
								onClick: () => {
									if (vendorMode === 'sheet') {
										props.onOpenVendors?.(name, vendorOpenerKey(name));
										return;
									}
									if (open) {
										openVendors.delete(name);
									} else {
										revealing = name;
										openVendors.add(name);
									}
									env.rerender();
								},
								open,
								panelId: tablePanelId,
								testIdPrefix,
							})
						: null;
					return el(
						'div',
						{ class: cx(noStyle, styles.category), 'data-category': name },
						row,
						trigger,
						vendorMode === 'accordion' && table
							? el(
									'div',
									{
										class: cx(noStyle, styles.disclosure),
										'data-open': open ? 'true' : 'false',
										id: tablePanelId,
										inert: !open,
									},
									el(
										'div',
										{ class: cx(noStyle, styles.disclosureInner) },
										table
									)
								)
							: null,
						vendorMode === 'inline' ? table : null
					);
				}),
				props.footer ?? null
			);
			return props.slotKey ? env.ctx.slot(group, props.slotKey) : group;
		};

		const after = function after(env: PartEnv): void {
			// Bring an opened vendor table into view without scrolling its trigger
			// out (LAY-05), unless the surface moved on (PERM-16).
			const category = revealing;
			if (!category || !openVendors.has(category)) {
				return;
			}
			revealing = null;
			const { session } = env;
			const { token } = session.getState();
			const root = env.ctx.root.getRootNode() as Document | ShadowRoot;
			cancelReveal?.();
			cancelReveal = scheduleReveal(
				() => {
					const trigger = root.querySelector(
						`[data-opener="${vendorOpenerKey(category)}"][aria-controls="${lastIdPrefix}-vendors-${category}"]`
					);
					const panel = root.querySelector(
						`[id="${lastIdPrefix}-vendors-${category}"]`
					);
					if (trigger && panel) {
						revealDisclosure(trigger, panel);
					}
				},
				{ isCurrent: () => session.isCurrent(token) }
			);
		};

		return {
			after,
			dispose() {
				cancelReveal?.();
			},
			render,
		};
	};
