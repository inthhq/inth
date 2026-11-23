/**
 * The options the consent prompt shows in place: the cookie
 * categories in the EU, the rights row and Preferences in the US. Its own
 * chunk, loaded on Customize, or at once by a side Drawer, with the two
 * stylesheets it needs (`expand` and `dialog`), as React's prompt panel
 * loads them.
 *
 * Banner panels always use accordions, never sheets (PERM-01).
 *
 * @internal
 */

import {
	confirmSaleRight,
	planCategorySwitch,
	planVendorSwitch,
	pressSaleRight,
	resolveSaleRight,
	vendorsListedUnder,
} from '@inth/sdk/engine';
import type {
	AllConsentNames,
	CategorySwitchPlan,
	ConsentKernel,
	ResolvedVendor,
	RightOption,
	SaveUISource,
	SurfaceSession,
} from '@inth/sdk/engine';
import type { PreferenceDraft } from '@inth/sdk/preference-draft';
import { getOptOutReceiptData } from '@inth/sdk/surface-actions';
import {
	consentTypes,
	resolveAdvertisingRowCopy,
	resolveCategoryTitle,
	resolvePreferencesRowCopy,
	resolvePrivacyChoicesCopy,
	resolveSaleAnnouncement,
	resolveSaleRightCopy,
	resolveSwitchAnnouncement,
	resolveVendorTableCopy,
} from '@inth/sdk/surface-state';
import type {
	PrivacyChoicesPromptVariant,
	SaleAnnouncementOutcome,
} from '@inth/sdk/surface-state';
import type { Translations } from '@inth/sdk/translations';
import {
	revealDisclosure,
	revealInScrollBody,
	scheduleReveal,
} from '@inth/sdk/ui/primitives/surface';
import * as dialogSheet from '@inth/sdk/ui/styles/sheets/dialog';
import * as expandSheet from '@inth/sdk/ui/styles/sheets/expand';
import type { Theme } from '@inth/sdk/ui/theme';

import { resolveSlotBinding } from '../banner/theme-slots.model';
import { insertSheets } from '../parts/insert-sheets';
import { h, raw } from '../parts/vnode.model';
import type { VChild, VElement } from '../parts/vnode.model';
import type { PromptClassNames } from './prompt-class-names';
import { rightsBundleOf } from './prompt.model';

/** The options' rules: the in-place panel, then the dialog's rows over it. */
export const PANEL_SHEETS = [expandSheet, dialogSheet] as const;

/** What the prompt hands its options. */
export interface PanelContext {
	kernel: ConsentKernel;
	session: SurfaceSession;
	/** The prompt's draft, which Save records (EU-03). */
	draft: PreferenceDraft;
	variant: PrivacyChoicesPromptVariant;
	/** Prefix for element ids inside the panel (SR-05). */
	idPrefix: string;
	classNames: PromptClassNames;
	noStyle: boolean;
	theme?: Theme;
	uiSource: SaveUISource;
	/** Ask the prompt to render again. */
	invalidate: () => void;
}

/** The mounted options. */
export interface PromptPanel {
	/** The options' markup for the current state. */
	render: () => VChild;
	/**
	 * Handle a click inside the options.
	 *
	 * @returns Whether the click was the options'.
	 */
	click: (event: MouseEvent) => boolean;
	/** Focus and reveal effects, after the prompt patched the DOM. */
	afterRender: (root: HTMLElement) => void;
	dispose: () => void;
}

type TranslationBundle = Partial<Translations>;

const CHECK_PATH = '<path d="M20 6 9 17l-5-5"></path>';
const CHEVRON_DOWN = '<path d="m6 9 6 6 6-6"></path>';
const EXTERNAL_PATH =
	'<path d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"></path>';

/** A stroked 24px icon, as the React rows draw them. */
const icon = function icon(
	size: number,
	strokeWidth: string,
	paths: string
): VElement {
	return raw(
		'svg',
		{
			'aria-hidden': 'true',
			fill: 'none',
			height: String(size),
			stroke: 'currentColor',
			'stroke-linecap': 'round',
			'stroke-linejoin': 'round',
			'stroke-width': strokeWidth,
			viewBox: '0 0 24 24',
			width: String(size),
		},
		paths
	);
};

const bool = (value: boolean): string => (value ? 'true' : 'false');
const flag = (value: boolean): string | undefined => (value ? '' : undefined);

/**
 * Whether a click on a row's text toggles its switch (CAT-10): not on a
 * link or control, nor while the visitor selected text.
 */
const isToggleClick = function isToggleClick(
	event: MouseEvent,
	row: Element
): boolean {
	const target = event.target as Element | null;
	if (target?.closest('a, button, input')) {
		return false;
	}
	const selection = row.ownerDocument.getSelection();
	return !selection || selection.isCollapsed;
};

/**
 * Start the options for a prompt: their sheets go in at once, and the
 * returned panel renders and handles them.
 *
 * @param context - The prompt's kernel, session, draft and classes.
 * @param styles - Where and how to insert the sheets; `null` inserts none.
 */
export const createPromptPanel = function createPromptPanel(
	context: PanelContext,
	styles: { nonce?: string } | null
): PromptPanel {
	if (styles) {
		insertSheets(PANEL_SHEETS, styles.nonce);
	}
	const { kernel, session, draft, idPrefix } = context;
	const { dialog: choices, expand } = context.classNames;
	// The prompt updates `noStyle` and the theme (an experiment arm can
	// change it) on the context before each render, so they are read live.
	let { noStyle, theme } = context;
	const cls = (...names: (string | undefined)[]): string | undefined =>
		noStyle ? undefined : names.filter(Boolean).join(' ') || undefined;

	const openVendors = new Map<AllConsentNames, boolean>();
	let preferencesOpen = false;
	let revealing: AllConsentNames | null = null;
	let wasConfirmationOpen = false;
	let lastNudges = 0;
	let cancelReveal: (() => void) | undefined;
	let cancelVendorReveal: (() => void) | undefined;

	const bundle = (): TranslationBundle | undefined =>
		kernel.getSnapshot().translations?.translations as
			| TranslationBundle
			| undefined;
	const titleOf = (category: AllConsentNames): string =>
		resolveCategoryTitle(bundle(), category);
	const vendorsOf = (category: AllConsentNames): ResolvedVendor[] =>
		vendorsListedUnder(kernel.getSnapshot(), category);
	const granted = (vendor: ResolvedVendor): boolean =>
		draft.getState().vendors[vendor.id] ?? true;
	const rightsBundle = () =>
		rightsBundleOf(kernel.getSnapshot(), getOptOutReceiptData(kernel));

	const rightIds = {
		cancel: `${idPrefix}-sale-confirm-cancel`,
		confirmDescription: `${idPrefix}-sale-confirm-description`,
		confirmTitle: `${idPrefix}-sale-confirm-title`,
		description: `${idPrefix}-sale-description`,
		panel: `${idPrefix}-sale-confirm`,
		title: `${idPrefix}-sale-title`,
	};

	/** A stock consent button with an explicit neutral stroke, as the confirmation uses. */
	const neutralButton = (
		label: string,
		attrs: Record<string, string | undefined>
	): VElement => {
		const slot = resolveSlotBinding(
			theme,
			'buttonSecondary',
			noStyle ? '' : (context.classNames.button.button ?? '')
		);
		return h(
			'button',
			{
				class: slot.class || undefined,
				'data-mode': noStyle ? undefined : 'stroke',
				'data-size': noStyle ? undefined : 'small',
				'data-variant': noStyle ? undefined : 'neutral',
				style: slot.style,
				type: 'button',
				...attrs,
			},
			label
		);
	};

	/** The sale row (LAW-01, RIGHT-01..06, GPC-03, GPC-04). */
	const renderRights = (): VElement | null => {
		const snapshot = kernel.getSnapshot();
		const right = resolveSaleRight(snapshot);
		if (!right.available || right.category === null) {
			return null;
		}
		const state = session.getState();
		const open = state.confirmation?.right === 'sale';
		const nudges = open ? (state.confirmation?.nudges ?? 0) : 0;
		const { model } = snapshot.evaluationPolicy;
		const copy = resolveSaleRightCopy(bundle(), {
			bundle: rightsBundle(),
			locked: right.locked,
			model,
			selected: right.selected,
			source: right.source,
		});
		const binding = resolveSlotBinding(
			theme,
			'consentBannerRightsRow',
			noStyle ? '' : (choices.right ?? '')
		);
		const options: RightOption[] = ['protect', 'allow'];
		return h(
			'section',
			{
				'aria-labelledby': rightIds.title,
				class: binding.class || undefined,
				'data-testid': 'consent-banner-rights-row-sale',
				style: binding.style,
			},
			h(
				'div',
				{},
				h(
					'h3',
					{ class: cls(choices.rightTitle), id: rightIds.title },
					copy.title
				),
				right.locked
					? null
					: h(
							'p',
							{
								class: cls(choices.rightDescription),
								id: rightIds.description,
							},
							copy.description
						)
			),
			right.locked
				? h(
						'div',
						{ class: cls(choices.note), id: rightIds.description },
						h('span', {}, copy.description)
					)
				: null,
			h(
				'div',
				{
					'aria-describedby': rightIds.description,
					'aria-label': copy.groupLabel,
					class: cls(choices.segmented),
					'data-selected': right.selected === 'protect' ? '0' : '1',
					role: 'group',
				},
				h('span', {
					'aria-hidden': 'true',
					class: cls(choices.segmentedThumb),
				}),
				options.map((option) => {
					const pressed = right.selected === option;
					return h(
						'button',
						{
							// Under GPC only the unselected option is disabled (GPC-03).
							'aria-disabled': right.locked && !pressed ? 'true' : undefined,
							'aria-pressed': bool(pressed),
							class: cls(choices.segmentedOption),
							'data-right-option': option,
							'data-testid': `consent-banner-right-option-sale-${option}`,
							type: 'button',
						},
						h(
							'span',
							{ 'aria-hidden': 'true', class: cls(choices.segmentedCheck) },
							icon(13, '2.5', CHECK_PATH)
						),
						option === 'protect' ? copy.protect : copy.allow
					);
				})
			),
			h(
				'div',
				{
					class: cls(expand.panel, choices.bleed),
					'data-open': bool(open),
					id: rightIds.panel,
					inert: flag(!open),
				},
				h(
					'div',
					{ class: cls(expand.inner) },
					h(
						'div',
						{
							'aria-describedby': rightIds.confirmDescription,
							'aria-labelledby': rightIds.confirmTitle,
							class: cls(choices.confirm),
							'data-nudged': bool(nudges > 0),
							'data-testid': 'consent-banner-confirm',
							role: 'group',
						},
						h(
							'p',
							{ class: cls(choices.confirmTitle), id: rightIds.confirmTitle },
							copy.confirmTitle
						),
						h(
							'p',
							{
								class: cls(choices.confirmDescription),
								id: rightIds.confirmDescription,
							},
							copy.confirmDescription
						),
						h(
							'div',
							{ class: cls(choices.confirmActions) },
							neutralButton(copy.confirmCancel, {
								'data-testid': 'consent-banner-confirm-cancel',
								id: rightIds.cancel,
							}),
							neutralButton(copy.confirmAllow, {
								'data-testid': 'consent-banner-confirm-allow',
							})
						)
					)
				)
			)
		);
	};

	/** The read-only US advertising row: it follows the sale choice (LAW-05, CAT-08). */
	const renderAdvertising = (on: boolean): VElement => {
		const copy = resolveAdvertisingRowCopy(bundle(), on);
		return h(
			'div',
			{ class: cls(choices.category), 'data-category': 'advertising' },
			h(
				'div',
				{ class: cls(choices.categoryRow) },
				h(
					'div',
					{ class: cls(choices.categoryText) },
					h(
						'span',
						{ class: cls(choices.categoryName), id: `${idPrefix}-advertising` },
						copy.title
					),
					h(
						'span',
						{
							class: cls(choices.categoryDescription),
							id: `${idPrefix}-advertising-description`,
						},
						copy.description
					)
				),
				h(
					'span',
					{
						'aria-describedby': `${idPrefix}-advertising-description`,
						class: cls(choices.categoryState),
					},
					copy.state
				)
			)
		);
	};

	/** A `role="switch"` button named and described by its row (SR-06). */
	const choiceSwitch = (
		checked: boolean,
		attrs: Record<string, string | undefined>,
		small = false
	): VElement =>
		h('button', {
			...attrs,
			'aria-checked': bool(checked),
			class: cls(choices.switch),
			'data-size': small ? 'small' : undefined,
			'data-state': checked ? 'checked' : 'unchecked',
			role: 'switch',
			type: 'button',
		});

	/** A category's vendors as a boxed table (CAT-09). */
	const renderVendorTable = (
		category: AllConsentNames,
		vendors: readonly ResolvedVendor[],
		checked: boolean
	): VElement => {
		const copy = resolveVendorTableCopy(bundle(), {
			category: titleOf(category),
			count: vendors.length,
			onCount: 0,
			open: true,
		});
		return h(
			'div',
			{
				'aria-label': copy.table,
				class: cls(choices.vendorTable),
				'data-testid': `consent-banner-vendor-table-${category}`,
				role: 'table',
			},
			h(
				'div',
				{ class: cls(choices.vendorHead), role: 'row' },
				h('span', { role: 'columnheader' }, copy.vendorColumn),
				h('span', { role: 'columnheader' }, copy.purposeColumn),
				h(
					'span',
					{ role: 'columnheader' },
					h('span', { class: cls(choices.visuallyHidden) }, copy.policyColumn)
				),
				h(
					'span',
					{ role: 'columnheader' },
					h('span', { class: cls(choices.visuallyHidden) }, copy.switchColumn)
				)
			),
			vendors.map((vendor) => {
				const name = vendor.name ?? vendor.id;
				const nameId = `${idPrefix}-vendor-${category}-${vendor.id}`;
				const purposeId = `${nameId}-purpose`;
				const toggleable = vendor.disabled !== true;
				return h(
					'div',
					{
						class: cls(choices.vendorRow),
						'data-row-toggle': toggleable ? '' : undefined,
						role: 'row',
					},
					h(
						'span',
						{ class: cls(choices.vendorName), id: nameId, role: 'cell' },
						name
					),
					h(
						'span',
						{
							class: cls(choices.vendorPurpose),
							id: purposeId,
							role: 'cell',
							title: vendor.description,
						},
						vendor.description
					),
					h(
						'span',
						{ role: 'cell' },
						vendor.privacyPolicyUrl
							? h(
									'a',
									{
										'aria-label': copy.policyLink(name),
										class: cls(choices.vendorLink),
										href: vendor.privacyPolicyUrl,
										rel: 'noopener noreferrer',
										target: '_blank',
									},
									icon(13, '2', EXTERNAL_PATH)
								)
							: null
					),
					h(
						'span',
						{ role: 'cell' },
						toggleable
							? choiceSwitch(
									checked && granted(vendor),
									{
										'aria-describedby': vendor.description
											? purposeId
											: undefined,
										'aria-labelledby': nameId,
										'data-testid': `consent-banner-vendor-switch-${category}-${vendor.id}`,
									},
									true
								)
							: null
					)
				);
			})
		);
	};

	/**
	 * One row per displayed category, `necessary` as "Always on", each with
	 * its vendors behind an accordion; the switches stage into the draft.
	 */
	const renderCategories = (
		exclude: readonly AllConsentNames[],
		footer: VChild
	): VElement => {
		const state = draft.getState();
		const { alwaysOn } = resolvePrivacyChoicesCopy(bundle());
		const rows = state.displayedCategories.filter(
			(name) => !exclude.includes(name)
		);
		const translations = bundle();
		return h(
			'div',
			{
				class: cls(expand.group),
				'data-testid': 'consent-banner-category-group',
			},
			rows.map((name) => {
				const nameId = `${idPrefix}-category-${name}`;
				const descriptionId = `${nameId}-description`;
				const required = name === 'necessary';
				const checked = required || state.values[name] === true;
				const description =
					translations?.consentTypes?.[name]?.description ??
					consentTypes.find((type) => type.name === name)?.description;
				const listed = vendorsOf(name);
				const vendorsOn = listed.filter(
					(vendor) => checked && granted(vendor)
				).length;
				const open = openVendors.get(name) === true;
				const tablePanelId = `${idPrefix}-vendors-${name}`;
				const triggerCopy = resolveVendorTableCopy(translations, {
					category: titleOf(name),
					count: listed.length,
					onCount: vendorsOn,
					open,
				});
				return h(
					'div',
					{ class: cls(choices.category), 'data-category': name },
					h(
						'div',
						{
							class: cls(choices.categoryRow),
							'data-row-toggle': required ? undefined : '',
						},
						h(
							'div',
							{ class: cls(choices.categoryText) },
							h(
								'span',
								{ class: cls(choices.categoryName), id: nameId },
								titleOf(name)
							),
							description
								? h(
										'span',
										{
											class: cls(choices.categoryDescription),
											id: descriptionId,
										},
										description
									)
								: null
						),
						required
							? h('span', { class: cls(choices.categoryState) }, alwaysOn)
							: choiceSwitch(checked, {
									'aria-describedby': description ? descriptionId : undefined,
									'aria-labelledby': nameId,
									'data-testid': `consent-banner-category-switch-${name}`,
								})
					),
					listed.length > 0
						? h(
								'button',
								{
									'aria-controls': tablePanelId,
									'aria-expanded': bool(open),
									class: cls(choices.vendorTrigger),
									'data-opener': `vendors:${name}`,
									'data-testid': `consent-banner-vendor-trigger-${name}`,
									type: 'button',
								},
								// The name starts with the visible text (CAT-05).
								h(
									'span',
									{},
									triggerCopy.trigger,
									h(
										'span',
										{ class: cls(choices.visuallyHidden) },
										` ${triggerCopy.triggerSuffix}`
									)
								),
								h(
									'span',
									{ class: cls(choices.vendorMeta) },
									triggerCopy.onCount,
									h(
										'span',
										{
											class: cls(choices.chevron),
											// Banner panels open accordions downwards (PERM-01).
											'data-direction': 'down',
										},
										icon(14, '2', CHEVRON_DOWN)
									)
								)
							)
						: null,
					listed.length > 0
						? h(
								'div',
								{
									class: cls(choices.disclosure),
									'data-open': bool(open),
									id: tablePanelId,
									inert: flag(!open),
								},
								h(
									'div',
									{ class: cls(choices.disclosureInner) },
									renderVendorTable(name, listed, checked)
								)
							)
						: null
				);
			}),
			footer
		);
	};

	/**
	 * Preferences in a US panel: the categories behind a disclosure. The
	 * category that decides sale follows the rights row instead (LAW-05).
	 */
	const renderUsPreferences = (): VElement => {
		const right = resolveSaleRight(kernel.getSnapshot());
		const sale = right.available ? right.category : null;
		const state = draft.getState();
		const onCount = state.displayedCategories.filter(
			(name) => name !== 'necessary' && name !== sale && state.values[name]
		).length;
		const copy = resolvePreferencesRowCopy(bundle(), onCount);
		const panelId = `${idPrefix}-preferences`;
		return h(
			'div',
			{},
			h(
				'button',
				{
					'aria-controls': panelId,
					'aria-expanded': bool(preferencesOpen),
					class: cls(choices.navRow),
					'data-testid': 'consent-banner-preferences-row',
					type: 'button',
				},
				h(
					'span',
					{ class: cls(choices.navRowLabel) },
					copy.title,
					h(
						'span',
						{ class: cls(choices.navRowMeta) },
						`${copy.summary} · ${copy.onCount}`
					)
				),
				h('span', { class: cls(choices.chevron) }, icon(14, '2', CHEVRON_DOWN))
			),
			h(
				'div',
				{
					class: cls(expand.panel),
					'data-open': bool(preferencesOpen),
					id: panelId,
					inert: flag(!preferencesOpen),
				},
				h(
					'div',
					{ class: cls(expand.inner) },
					h(
						'div',
						{ class: cls(choices.preferencesBody) },
						renderCategories(
							sale ? [sale] : [],
							sale ? renderAdvertising(right.selected === 'allow') : null
						)
					)
				)
			)
		);
	};

	/** Stage a plan and announce the changes the visitor did not press (CAT-04). */
	const commit = (
		category: AllConsentNames,
		plan: CategorySwitchPlan,
		changes: { name: string; on: boolean }[]
	): void => {
		draft.set(category, plan.on);
		for (const [id, value] of Object.entries(plan.vendors)) {
			draft.setVendor(id, value);
		}
		if (changes.length > 1) {
			session.announce(
				resolveSwitchAnnouncement(bundle(), { applied: false, changes })
			);
		}
	};

	const stateOf = (category: AllConsentNames, listed: ResolvedVendor[]) => ({
		on: draft.getState().values[category] === true,
		vendors: Object.fromEntries(
			listed
				.filter((vendor) => vendor.disabled !== true)
				.map((vendor) => [vendor.id, granted(vendor)])
		),
	});

	const toggleCategory = (category: AllConsentNames, on: boolean): void => {
		const listed = vendorsOf(category);
		const plan = planCategorySwitch(stateOf(category, listed), on);
		commit(category, plan, [{ name: titleOf(category), on }]);
	};

	const toggleVendor = (
		category: AllConsentNames,
		vendorId: string,
		on: boolean
	): void => {
		const listed = vendorsOf(category);
		const vendor = listed.find((entry) => entry.id === vendorId);
		if (!vendor || vendor.disabled === true) {
			return;
		}
		const plan = planVendorSwitch(stateOf(category, listed), vendor.id, on);
		const changes = [{ name: vendor.name ?? vendor.id, on }];
		if (plan.categoryChanged) {
			changes.push({ name: titleOf(category), on: plan.on });
		}
		commit(category, plan, changes);
	};

	/** Say what the row recorded, ending in "Saved." (LAW-04). */
	const recorded = (outcome: SaleAnnouncementOutcome): void => {
		session.announce(
			resolveSaleAnnouncement(bundle(), {
				bundle: rightsBundle(),
				model: kernel.getSnapshot().evaluationPolicy.model,
				outcome,
			})
		);
	};

	const press = (option: RightOption): void => {
		const { outcome } = pressSaleRight(kernel, option, {
			uiSource: context.uiSource,
		});
		if (outcome === 'nudge') {
			session.announce(resolvePrivacyChoicesCopy(bundle()).nudge);
		} else if (outcome === 'apply-protect') {
			recorded('protect');
		} else if (outcome === 'apply-allow') {
			recorded('allow');
		} else if (outcome === 'record-default') {
			recorded('recorded');
		}
	};

	const switchValue = (element: Element): boolean =>
		element.getAttribute('aria-checked') === 'true';
	/** The vendor id a vendor switch's test id ends in. */
	const vendorOf = (sw: Element, category: AllConsentNames): string | null => {
		const prefix = `consent-banner-vendor-switch-${category}-`;
		const testId = sw.getAttribute('data-testid') ?? '';
		return testId.startsWith(prefix) ? testId.slice(prefix.length) : null;
	};

	// oxlint-disable-next-line complexity -- One delegated handler for every control in the options.
	const click = (event: MouseEvent): boolean => {
		const target = event.target as Element | null;
		const control = target?.closest<HTMLElement>('[data-testid], [role="row"]');
		if (!control) {
			return false;
		}
		const testId = control.getAttribute('data-testid') ?? '';
		const categoryOf = (element: Element): AllConsentNames | null =>
			(element.closest('[data-category]')?.getAttribute('data-category') ??
				null) as AllConsentNames | null;
		if (testId.startsWith('consent-banner-category-switch-')) {
			const category = categoryOf(control);
			if (category) {
				toggleCategory(category, !switchValue(control));
			}
			return true;
		}
		if (testId.startsWith('consent-banner-vendor-switch-')) {
			const category = categoryOf(control);
			const vendor = category ? vendorOf(control, category) : null;
			if (category && vendor) {
				toggleVendor(category, vendor, !switchValue(control));
			}
			return true;
		}
		if (testId.startsWith('consent-banner-vendor-trigger-')) {
			const category = categoryOf(control);
			if (category) {
				const open = openVendors.get(category) === true;
				if (!open) {
					revealing = category;
				}
				openVendors.set(category, !open);
				context.invalidate();
			}
			return true;
		}
		if (testId === 'consent-banner-preferences-row') {
			preferencesOpen = !preferencesOpen;
			context.invalidate();
			return true;
		}
		if (testId.startsWith('consent-banner-right-option-sale-')) {
			const option = control.getAttribute('data-right-option');
			if (option === 'protect' || option === 'allow') {
				press(option);
			}
			return true;
		}
		if (testId === 'consent-banner-confirm-cancel') {
			session.closeConfirmation();
			return true;
		}
		if (testId === 'consent-banner-confirm-allow') {
			if (confirmSaleRight(kernel, { uiSource: context.uiSource })) {
				recorded('allow');
			}
			return true;
		}
		// A pointer shortcut like a label's; the switch stays the only
		// keyboard and focus target (CAT-10).
		const row = target?.closest<HTMLElement>('[data-row-toggle]');
		if (row && isToggleClick(event, row)) {
			const sw = row.querySelector('[role="switch"]');
			const category = categoryOf(row);
			if (!(sw && category)) {
				return false;
			}
			const vendor =
				row.getAttribute('role') === 'row' ? vendorOf(sw, category) : null;
			if (vendor) {
				toggleVendor(category, vendor, !switchValue(sw));
			} else {
				toggleCategory(category, !switchValue(sw));
			}
			return true;
		}
		return false;
	};

	const render = (): VChild => {
		({ noStyle, theme } = context);
		const { variant } = context;
		if (variant === 'choice') {
			return renderCategories([], null);
		}
		if (variant === 'us-consent') {
			return [renderRights(), renderUsPreferences()];
		}
		if (variant === 'notice') {
			return renderRights();
		}
		return null;
	};

	// Bring an opened vendor table into view without scrolling its
	// trigger out (LAY-05), unless the surface moved on (PERM-16).
	const revealVendors = (root: HTMLElement): void => {
		if (!revealing) {
			return;
		}
		const category = revealing;
		revealing = null;
		const { token } = session.getState();
		// Kept so a dispose cancels it, as React's surface does on unmount.
		cancelVendorReveal?.();
		cancelVendorReveal = scheduleReveal(
			() => {
				const trigger = root.querySelector(
					`[data-testid="consent-banner-vendor-trigger-${category}"]`
				);
				const panel = root.ownerDocument.getElementById(
					`${idPrefix}-vendors-${category}`
				);
				if (trigger && panel) {
					revealDisclosure(trigger, panel);
				}
			},
			{ isCurrent: () => session.isCurrent(token) }
		);
	};

	const afterRender = (root: HTMLElement): void => {
		const state = session.getState();
		const open = state.confirmation?.right === 'sale';
		const nudges = open ? (state.confirmation?.nudges ?? 0) : 0;
		const confirm = root.querySelector<HTMLElement>(
			'[data-testid="consent-banner-confirm"]'
		);
		const cancel = root.querySelector<HTMLElement>(
			'[data-testid="consent-banner-confirm-cancel"]'
		);
		// Focus follows the confirmation: Cancel when it opens (RIGHT-06),
		// the invoking Allow when it closes from inside it.
		if (open && !wasConfirmationOpen) {
			cancel?.focus({ preventScroll: true });
			const { token } = session.getState();
			cancelReveal?.();
			cancelReveal = scheduleReveal(
				() => {
					if (confirm) {
						revealInScrollBody(confirm);
					}
				},
				{ isCurrent: () => session.isCurrent(token) }
			);
		} else if (
			!open &&
			wasConfirmationOpen &&
			confirm &&
			(confirm.contains(document.activeElement) ||
				document.activeElement === document.body)
		) {
			root
				.querySelector<HTMLElement>(
					'[data-testid="consent-banner-right-option-sale-allow"]'
				)
				?.focus({ preventScroll: true });
		}
		wasConfirmationOpen = open;
		// Replay the shake on every nudge; the red ring stays until it closes.
		if (confirm && nudges > 0 && nudges !== lastNudges) {
			confirm.dataset.nudged = 'false';
			void confirm.offsetWidth;
			confirm.dataset.nudged = 'true';
			cancel?.focus({ preventScroll: true });
		}
		lastNudges = nudges;
		revealVendors(root);
	};

	return {
		afterRender,
		click,
		dispose() {
			cancelReveal?.();
			cancelVendorReveal?.();
		},
		render,
	};
};
