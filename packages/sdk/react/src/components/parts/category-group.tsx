'use client';

/**
 * The cookie categories as one bordered group with inline descriptions
 * (CAT-01, CAT-06), each with its vendors (CAT-09), on a preference draft.
 * Shared by the Privacy Choices banner panels and the dialog.
 */

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
import type { ConsentComponentSlotKey } from '@inth/sdk/schema/config';
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
import styles from '@inth/sdk/ui/styles/components/consent-dialog';
import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';

import { useTranslations } from '~/component-hooks/use-translations';
import { useConsentDraftSlice, useConsentDraftStore } from '~/draft';
import { useVendorChoice } from '~/hooks';
import { useTheme } from '~/hooks/use-theme';
import { useKernel, useKernelSelector } from '~/use-kernel-selector';
import { useUIConfig } from '~/use-ui-config';
import { inertProps } from '~/utils/inert-props';
import { getSlotProps, mergeSlotProps } from '~/utils/merge-slot-props';

import { ChoiceSwitch } from './choice-switch';
import { useSurfaceSession } from './use-surface-session';

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
		vendorTablePrefix: 'consent-banner-vendor-table-',
		vendorTriggerPrefix: 'consent-banner-vendor-trigger-',
	},
	'consent-dialog': {
		group: 'consent-dialog-category-group',
		switchPrefix: 'consent-dialog-category-switch-',
		vendorTablePrefix: 'consent-dialog-vendor-table-',
		vendorTriggerPrefix: 'consent-dialog-vendor-trigger-',
	},
} as const satisfies Record<CategoryGroupSurface, Record<string, string>>;

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

/** Props for {@link CategoryGroup}. */
export interface CategoryGroupProps {
	/**
	 * Prefix for the rows' element ids, one per layer, so a switch's
	 * `aria-labelledby` never resolves into another layer (SR-05).
	 */
	idPrefix: string;
	/** The surface it renders on, which prefixes its test ids. */
	testIdPrefix: CategoryGroupSurface;
	/**
	 * Categories to leave out, such as the one that decides sale in the US,
	 * which follows the rights row instead (LAW-05, CAT-08).
	 */
	exclude?: readonly AllConsentNames[];
	/** Show only this category, as a vendor sheet does (NEST-07). */
	only?: AllConsentNames;
	/** A row after the categories, such as the read-only advertising row. */
	footer?: ReactNode;
	noStyle?: boolean;
	/**
	 * `'draft'` stages each switch until a Save (EU, every banner panel).
	 * `'immediate'` applies each switch at once, as the US dialog does
	 * (LAW-04).
	 */
	apply?: 'draft' | 'immediate';
	/** Surface to attribute an immediate change to. */
	uiSource?: SaveUISource;
	vendors?: VendorMode;
	/** Opens a category's vendor sheet, for `vendors: 'sheet'`. */
	onOpenVendors?: (category: AllConsentNames, opener: string) => void;
	/** Called after an immediate change applied, for the dialog's "Saved" cue. */
	onApplied?: () => void;
	/** The `components` part that styles the group. */
	slotKey?: ConsentComponentSlotKey;
	/** The `components` part that styles each vendor table. */
	vendorTableSlotKey?: ConsentComponentSlotKey;
}

const NO_CATEGORIES: readonly AllConsentNames[] = [];

const cx = (noStyle: boolean | undefined, ...names: (string | undefined)[]) =>
	noStyle ? undefined : names.filter(Boolean).join(' ') || undefined;

/**
 * Whether a click on a row's text should toggle its switch (CAT-10): not
 * on a link or control, nor while the visitor selected text.
 */
const isToggleClick = function isToggleClick(
	event: MouseEvent<HTMLElement>
): boolean {
	const target = event.target as Element | null;
	if (target?.closest('a, button, input')) {
		return false;
	}
	const selection = event.currentTarget.ownerDocument.getSelection();
	return !selection || selection.isCollapsed;
};

const Chevron = ({ direction }: { direction: 'down' | 'end' }) => (
	<svg
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<path d={direction === 'down' ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6'} />
	</svg>
);

const ExternalIcon = () => (
	<svg
		width="13"
		height="13"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<path d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
	</svg>
);

/** The opener key for a category's vendor trigger, where focus returns (NEST-04). */
export const vendorOpenerKey = (category: AllConsentNames): string =>
	`vendors:${category}`;

interface VendorTableProps {
	category: AllConsentNames;
	categoryTitle: string;
	idPrefix: string;
	vendors: readonly ResolvedVendor[];
	/** Each vendor's switch, as shown: on only while its category is on. */
	shown: (vendor: ResolvedVendor) => boolean;
	onToggle: (vendor: ResolvedVendor, granted: boolean) => void;
	testIds: (typeof GROUP_TEST_IDS)[CategoryGroupSurface];
	noStyle?: boolean;
	slotKey?: ConsentComponentSlotKey;
}

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The vendor table lays out as a CSS grid of 40px lines; ARIA table roles keep its table semantics, which some engines drop from a <table> restyled as a grid. */
/**
 * A category's vendors as a boxed table (CAT-09): one 40px line each, the
 * purpose cut off with its full text on hover, a privacy policy link named
 * for the vendor (CAT-07), and a small switch that is never disabled
 * (CAT-03).
 */
const VendorTable = ({
	category,
	categoryTitle,
	idPrefix,
	vendors,
	shown,
	onToggle,
	testIds,
	noStyle,
	slotKey,
}: VendorTableProps) => {
	const translations = useTranslations();
	const { components } = useUIConfig();
	const copy = resolveVendorTableCopy(translations, {
		category: categoryTitle,
		count: vendors.length,
		onCount: 0,
		open: true,
	});
	const tableProps = mergeSlotProps(getSlotProps(components, slotKey), {
		baseClassName: styles.vendorTable,
		noStyle,
	});
	return (
		<div
			{...tableProps}
			role="table"
			aria-label={copy.table}
			data-testid={testIds.vendorTablePrefix + category}
		>
			<div
				className={cx(noStyle, styles.vendorHead)}
				role="row"
			>
				<span role="columnheader">{copy.vendorColumn}</span>
				<span role="columnheader">{copy.purposeColumn}</span>
				<span role="columnheader">
					<span className={cx(noStyle, styles.visuallyHidden)}>
						{copy.policyColumn}
					</span>
				</span>
				<span role="columnheader">
					<span className={cx(noStyle, styles.visuallyHidden)}>
						{copy.switchColumn}
					</span>
				</span>
			</div>
			{vendors.map((vendor) => {
				const name = vendor.name ?? vendor.id;
				const nameId = `${idPrefix}-vendor-${category}-${vendor.id}`;
				const purposeId = `${nameId}-purpose`;
				const toggleable = vendor.disabled !== true;
				const checked = shown(vendor);
				return (
					// oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- A pointer shortcut like a label's; the switch stays the only keyboard and focus target (CAT-10).
					<div
						key={vendor.id}
						className={cx(noStyle, styles.vendorRow)}
						role="row"
						data-row-toggle={toggleable ? '' : undefined}
						onClick={(event) => {
							if (toggleable && isToggleClick(event)) {
								onToggle(vendor, !checked);
							}
						}}
					>
						<span
							className={cx(noStyle, styles.vendorName)}
							role="cell"
							id={nameId}
						>
							{name}
						</span>
						<span
							className={cx(noStyle, styles.vendorPurpose)}
							role="cell"
							id={purposeId}
							title={vendor.description}
						>
							{vendor.description}
						</span>
						<span role="cell">
							{vendor.privacyPolicyUrl ? (
								<a
									className={cx(noStyle, styles.vendorLink)}
									href={vendor.privacyPolicyUrl}
									target="_blank"
									rel="noopener noreferrer"
									aria-label={copy.policyLink(name)}
								>
									<ExternalIcon />
								</a>
							) : null}
						</span>
						<span role="cell">
							{toggleable ? (
								<ChoiceSwitch
									checked={checked}
									size="small"
									noStyle={noStyle}
									aria-labelledby={nameId}
									aria-describedby={vendor.description ? purposeId : undefined}
									data-testid={
										testIds.group === 'consent-dialog-category-group'
											? `consent-dialog-vendor-switch-${category}-${vendor.id}`
											: `consent-banner-vendor-switch-${category}-${vendor.id}`
									}
									onCheckedChange={(next) => onToggle(vendor, next)}
								/>
							) : null}
						</span>
					</div>
				);
			})}
		</div>
	);
};

/* oxlint-enable jsx-a11y/prefer-tag-over-role */

/** The read-only US advertising row: it follows the sale choice (LAW-05, CAT-08). */
export const AdvertisingRow = ({
	on,
	idPrefix,
	noStyle,
	testId,
}: {
	on: boolean;
	idPrefix: string;
	noStyle?: boolean;
	testId?: 'consent-dialog-advertising-row';
}) => {
	const translations = useTranslations();
	const copy = resolveAdvertisingRowCopy(translations, on);
	return (
		<div
			className={cx(noStyle, styles.category)}
			data-category="advertising"
			data-testid={testId}
		>
			<div className={cx(noStyle, styles.categoryRow)}>
				<div className={cx(noStyle, styles.categoryText)}>
					<span
						className={cx(noStyle, styles.categoryName)}
						id={`${idPrefix}-advertising`}
					>
						{copy.title}
					</span>
					<span
						className={cx(noStyle, styles.categoryDescription)}
						id={`${idPrefix}-advertising-description`}
					>
						{copy.description}
					</span>
				</div>
				<span
					className={cx(noStyle, styles.categoryState)}
					aria-describedby={`${idPrefix}-advertising-description`}
				>
					{copy.state}
				</span>
			</div>
		</div>
	);
};

/**
 * One row per displayed category: its name and one-sentence description
 * inline, and a switch named by both (SR-06). `necessary` shows "Always
 * on". The switches stage into the nearest consent draft, or apply at once
 * in the US dialog.
 *
 * A category's switch gates its vendors (CAT-02): turning it on with no
 * vendor on turns them all on, and turning off its last vendor turns it
 * off. A vendor switch is never disabled: turning one on under an off
 * category turns the category on with only that vendor (CAT-03). Changes
 * the visitor did not press are announced (CAT-04).
 *
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function -- The group, its vendors and their shared toggle rules stay together.
export const CategoryGroup = ({
	idPrefix,
	testIdPrefix,
	exclude = NO_CATEGORIES,
	only,
	footer,
	noStyle: localNoStyle,
	apply = 'draft',
	uiSource,
	vendors: vendorMode = 'accordion',
	onOpenVendors,
	onApplied,
	slotKey,
	vendorTableSlotKey,
}: CategoryGroupProps) => {
	const kernel = useKernel();
	const translations = useTranslations();
	const { components } = useUIConfig();
	const { session } = useSurfaceSession();
	const draft = useConsentDraftStore();
	const displayed = useConsentDraftSlice(
		draft,
		(state) => state.displayedCategories
	);
	const values = useConsentDraftSlice(draft, (state) => state.values);
	const grants = useConsentDraftSlice(draft, (state) => state.vendors);
	const model = useKernelSelector((snapshot) => snapshot.model);
	const declared = useKernelSelector((snapshot) => snapshot.vendors);
	const vendorChoice = useVendorChoice();
	const { noStyle: themeNoStyle } = useTheme();
	const noStyle = localNoStyle ?? themeNoStyle;
	const [openVendors, setOpenVendors] = useState<
		Partial<Record<AllConsentNames, boolean>>
	>({});
	const triggerRefs = useRef(new Map<AllConsentNames, HTMLButtonElement>());
	const panelRefs = useRef(new Map<AllConsentNames, HTMLDivElement>());
	const revealing = useRef<AllConsentNames | null>(null);
	const testIds = GROUP_TEST_IDS[testIdPrefix];
	const rows = displayed.filter(
		(name) => !exclude.includes(name) && (only === undefined || name === only)
	);
	const { alwaysOn } = resolvePrivacyChoicesCopy(translations);

	// Bring an opened vendor table into view without scrolling its trigger
	// out (LAY-05), unless the surface moved on (PERM-16).
	useEffect(() => {
		const category = revealing.current;
		if (!category || !openVendors[category]) {
			return;
		}
		revealing.current = null;
		const { token } = session.getState();
		return scheduleReveal(
			() => {
				const trigger = triggerRefs.current.get(category);
				const panel = panelRefs.current.get(category);
				if (trigger && panel) {
					revealDisclosure(trigger, panel);
				}
			},
			{ isCurrent: () => session.isCurrent(token) }
		);
	}, [openVendors, session]);

	const vendorsOf = (category: AllConsentNames): ResolvedVendor[] =>
		vendorMode === 'none'
			? []
			: vendorsListedUnder(
					{ model, vendorChoice, vendors: declared },
					category
				);
	const titleOf = (category: AllConsentNames) =>
		resolveCategoryTitle(translations, category);
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
			void applyDialogCategories(kernel, draft, [category], { uiSource });
			onApplied?.();
		}
		if (applied || changes.length > 1) {
			session.announce(
				resolveSwitchAnnouncement(translations, { applied, changes })
			);
		}
	};

	const stateOf = (category: AllConsentNames, listed: ResolvedVendor[]) => ({
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

	const groupProps = mergeSlotProps(getSlotProps(components, slotKey), {
		baseClassName: expandStyles.group,
		noStyle,
	});

	// A sheet comes in from the end; an accordion opens downwards.
	const chevronDirection = vendorMode === 'sheet' ? 'end' : 'down';

	return (
		<div
			{...groupProps}
			data-testid={testIds.group}
		>
			{rows.map((name) => {
				const nameId = `${idPrefix}-category-${name}`;
				const descriptionId = `${nameId}-description`;
				const required = name === 'necessary';
				const checked = required || values[name] === true;
				const description =
					translations.consentTypes[name]?.description ??
					consentTypes.find((type) => type.name === name)?.description;
				const listed = vendorsOf(name);
				const vendorsOn = listed.filter(
					(vendor) => checked && granted(vendor)
				).length;
				const open = openVendors[name] === true;
				const tablePanelId = `${idPrefix}-vendors-${name}`;
				const triggerCopy = resolveVendorTableCopy(translations, {
					category: titleOf(name),
					count: listed.length,
					onCount: vendorsOn,
					open,
				});
				const table =
					listed.length > 0 ? (
						<VendorTable
							category={name}
							categoryTitle={titleOf(name)}
							idPrefix={idPrefix}
							vendors={listed}
							shown={(vendor) => checked && granted(vendor)}
							onToggle={(vendor, on) => toggleVendor(name, listed, vendor, on)}
							testIds={testIds}
							noStyle={noStyle}
							slotKey={vendorTableSlotKey}
						/>
					) : null;
				const showTrigger =
					listed.length > 0 &&
					(vendorMode === 'accordion' || vendorMode === 'sheet');
				return (
					<div
						key={name}
						className={cx(noStyle, styles.category)}
						data-category={name}
					>
						{/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- A pointer shortcut like a label's; the switch stays the only keyboard and focus target (CAT-10). */}
						<div
							className={cx(noStyle, styles.categoryRow)}
							data-row-toggle={required ? undefined : ''}
							onClick={(event) => {
								if (!required && isToggleClick(event)) {
									toggleCategory(name, listed, !checked);
								}
							}}
						>
							<div className={cx(noStyle, styles.categoryText)}>
								<span
									className={cx(noStyle, styles.categoryName)}
									id={nameId}
								>
									{titleOf(name)}
								</span>
								{description ? (
									<span
										className={cx(noStyle, styles.categoryDescription)}
										id={descriptionId}
									>
										{description}
									</span>
								) : null}
							</div>
							{required ? (
								<span className={cx(noStyle, styles.categoryState)}>
									{alwaysOn}
								</span>
							) : (
								<ChoiceSwitch
									checked={checked}
									noStyle={noStyle}
									aria-labelledby={nameId}
									aria-describedby={description ? descriptionId : undefined}
									data-testid={testIds.switchPrefix + name}
									onCheckedChange={(next) => toggleCategory(name, listed, next)}
								/>
							)}
						</div>
						{showTrigger ? (
							<button
								ref={(element) => {
									if (element) {
										triggerRefs.current.set(name, element);
									} else {
										triggerRefs.current.delete(name);
									}
								}}
								type="button"
								className={cx(noStyle, styles.vendorTrigger)}
								aria-expanded={vendorMode === 'accordion' ? open : undefined}
								aria-controls={
									vendorMode === 'accordion' ? tablePanelId : undefined
								}
								aria-haspopup={vendorMode === 'sheet' ? 'dialog' : undefined}
								data-opener={vendorOpenerKey(name)}
								data-testid={testIds.vendorTriggerPrefix + name}
								onClick={() => {
									if (vendorMode === 'sheet') {
										onOpenVendors?.(name, vendorOpenerKey(name));
										return;
									}
									if (!open) {
										revealing.current = name;
									}
									setOpenVendors((state) => ({ ...state, [name]: !open }));
								}}
							>
								{/* The name starts with the visible text (CAT-05). */}
								<span>
									{triggerCopy.trigger}
									<span className={cx(noStyle, styles.visuallyHidden)}>
										{` ${triggerCopy.triggerSuffix}`}
									</span>
								</span>
								<span className={cx(noStyle, styles.vendorMeta)}>
									{triggerCopy.onCount}
									<span
										className={cx(noStyle, styles.chevron)}
										data-direction={chevronDirection}
									>
										<Chevron direction={chevronDirection} />
									</span>
								</span>
							</button>
						) : null}
						{vendorMode === 'accordion' && table ? (
							<div
								ref={(element) => {
									if (element) {
										panelRefs.current.set(name, element);
									} else {
										panelRefs.current.delete(name);
									}
								}}
								className={cx(noStyle, styles.disclosure)}
								id={tablePanelId}
								data-open={open}
								{...inertProps(!open)}
							>
								<div className={cx(noStyle, styles.disclosureInner)}>
									{table}
								</div>
							</div>
						) : null}
						{vendorMode === 'inline' ? table : null}
					</div>
				);
			})}
			{footer}
		</div>
	);
};
