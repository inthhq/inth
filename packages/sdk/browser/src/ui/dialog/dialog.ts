/**
 * The "Your Privacy Choices" dialog: one column whose body is the
 * only scroller, the statutory rights on its first view, the receipt, and
 * Preferences; in the EU, the cookie categories and a staged Save. On
 * phone, Preferences and EU vendor lists open as nested sheets, at most
 * two layers; desktop uses accordions only. Ported from `@inth/react`'s
 * `components/dialog/dialog.tsx`.
 *
 * @packageDocumentation
 * @internal
 */

import {
	announcementText,
	MAIN_LAYER,
	resolveCategoryTitle,
	resolveConsentPresentation,
	resolvePreferencesRowCopy,
	resolvePrivacyChoicesDialogCopy,
	resolvePrivacyChoicesRegime,
	resolveSaleRight,
	resolveVendorTableCopy,
} from '@inth/sdk-core';
import type {
	AllConsentNames,
	BannerCommitAction,
	ConsentSnapshot,
} from '@inth/sdk-core';
import { SURFACE_ROOT_ATTRIBUTE } from '@inth/sdk-core/runtime/page-globals';
import {
	attachBackdropGuard,
	attachLiveRegion,
	attachPageBlock,
	attachScrollFades,
	attachTopLayerTrap,
	revealDisclosure,
	scheduleReveal,
} from '@inth/sdk-ui/primitives/surface';
import type { LiveRegion, ScrollFades } from '@inth/sdk-ui/primitives/surface';
import { getTextDirection } from '@inth/sdk-ui/utils';
import { resolveLegalLinkEntries } from '@inth/sdk-ui/utils/legal-links';
import type { LegalLinkKeys } from '@inth/sdk-ui/utils/legal-links';

import { classes as styles } from '../../generated/ui/dialog';
import { classes as expandStyles } from '../../generated/ui/expand';
import type { ConsentDialogOptions } from '../../types';
import { advertisingRow, createCategoryGroup } from '../parts/category-group';
import {
	activeElementOf,
	cx,
	el,
	findInPage,
	focusFirstIn,
	icon,
	owned,
	patch,
} from '../parts/dom';
import type { PartChild, PartRef } from '../parts/dom';
import {
	commitDialogChoice,
	createPreferenceDraft,
	hasConsentUI,
	showConsentSurface,
	takeReceiptFocus,
} from '../parts/engine';
import { createRightsReceipt } from '../parts/receipt';
import { createSaleRightsRow } from '../parts/rights-row';
import {
	checkIcon,
	chevron,
	consentButton,
	prefersReducedMotionNow,
	surfaceBasics,
	watchPhoneLayout,
} from '../parts/shared';
import type { PartEnv } from '../parts/shared';
import type { Surface, SurfaceContext } from '../surface';
import { OPTIONS_SHEETS } from './sheets';

/** The "Saved" cue stays this long, on a timer, not an animation (MOT-03). */
const CUE_MS = 1700;
/** A closing sheet animates out this long, inert (NEST-03). */
const SHEET_EXIT_MS = 160;
/** The opener key of the Preferences row. */
const PREFERENCES_OPENER = 'preferences';
const PREFERENCES_SHEET = 'preferences';
const VENDOR_SHEET_PREFIX = 'vendors:';
/** Where focus goes when the dialog's opener is gone (FOC-03). */
const RETURN_TARGETS = [
	'[data-testid="privacy-choices-link"]:not([hidden])',
	'[data-testid="consent-dialog-trigger"]',
];
/** How many frames to wait for a returning banner, which may still be loading. */
const BANNER_RETURN_FRAMES = 60;

const closeIcon = () => icon(16, ['M18 6 6 18M6 6l12 12']);

/** The focused element, inside any shadow root on the way. */
const deepActiveElement = function deepActiveElement(): Element | null {
	let active = document.activeElement;
	while (active?.shadowRoot?.activeElement) {
		active = active.shadowRoot.activeElement;
	}
	return active;
};

interface LayerParams {
	env: PartEnv;
	layerRef: PartRef;
	titleRef: PartRef;
	bodyRef: PartRef;
	statusRef: PartRef;
	idPrefix: string;
	title: string;
	intro: string | null;
	closeLabel: string;
	onClose: () => void;
	footer: PartChild[];
	nested: boolean;
	top: boolean;
	closing: boolean;
	depth: number;
	eu: boolean;
	sheetId?: string;
	children: PartChild[];
}

/**
 * One card: the main dialog or a phone sheet. Only the top layer is modal;
 * a covered parent is inert, dims and steps back (NEST-03).
 */
const layer = function layer(params: LayerParams): HTMLElement {
	const { env, nested } = params;
	const { noStyle } = env;
	const { slot } = env.ctx;
	const titleId = `${params.idPrefix}-title`;
	return slot(
		el(
			'section',
			{
				'aria-labelledby': titleId,
				'aria-modal': params.top && !params.closing ? 'true' : undefined,
				class: cx(noStyle, styles.card),
				'data-nested': nested ? 'true' : undefined,
				'data-nested-open': params.depth > 0 ? '' : undefined,
				'data-regime': params.eu ? 'eu' : 'us',
				'data-sheet': params.sheetId,
				'data-state': params.closing ? 'closed' : 'open',
				'data-testid': nested ? 'consent-dialog-sheet' : 'consent-dialog-card',
				inert: !params.top || params.closing,
				ref: params.layerRef,
				role: 'dialog',
				style: `--consent-dialog-depth: ${params.depth};`,
			},
			slot(
				el(
					'header',
					{
						class: cx(noStyle, styles.header),
						'data-testid': nested ? undefined : 'consent-dialog-header',
					},
					el(
						'div',
						{},
						slot(
							el(
								'h2',
								{
									class: cx(noStyle, styles.title),
									'data-testid': nested ? undefined : 'consent-dialog-title',
									id: titleId,
									ref: params.titleRef,
									tabindex: '-1',
								},
								params.title
							),
							'consentDialogTitle'
						),
						params.intro
							? el(
									'p',
									{
										class: cx(noStyle, styles.intro),
										'data-testid': nested ? undefined : 'consent-dialog-intro',
									},
									params.intro
								)
							: null
					),
					el(
						'button',
						{
							'aria-label': params.closeLabel,
							class: cx(noStyle, styles.close),
							'data-testid': nested
								? 'consent-dialog-sheet-close'
								: 'consent-dialog-close',
							on: { click: params.onClose },
							type: 'button',
						},
						closeIcon()
					)
				),
				'consentDialogHeader'
			),
			slot(
				el(
					'div',
					{
						class: cx(noStyle, expandStyles.scroll, styles.body),
						'data-testid': nested ? undefined : 'consent-dialog-content',
						ref: params.bodyRef,
					},
					...params.children
				),
				'consentDialogContent'
			),
			slot(
				el(
					'footer',
					{
						class: cx(noStyle, styles.footer),
						'data-testid': nested ? undefined : 'consent-dialog-footer',
					},
					...params.footer
				),
				'consentDialogFooter'
			),
			owned(
				el('div', {
					class: cx(noStyle, styles.visuallyHidden),
					'data-testid': nested ? undefined : 'consent-dialog-status',
					ref: params.statusRef,
				})
			)
		),
		nested ? 'consentDialogSheet' : 'consentDialogCard'
	);
};

/**
 * Done, which closes and commits nothing (LAW-04). Its label never changes
 * (SR-07): the cue sits beside it, absolutely placed so Done never moves
 * (MOT-04). The cue's slot is always there, so Done keeps its node and
 * focus (FOC-06).
 */
const doneButton = function doneButton(
	env: PartEnv,
	params: {
		cue: number;
		label: string;
		cueLabel: string;
		testId: 'consent-dialog-done' | 'consent-dialog-sheet-done';
		onClick: () => void;
	}
): PartChild[] {
	const { noStyle } = env;
	return [
		el(
			'span',
			{ 'aria-hidden': 'true', class: cx(noStyle, styles.cueSlot) },
			params.cue > 0
				? el(
						'span',
						{
							class: cx(noStyle, styles.savedCue),
							'data-testid': 'consent-dialog-saved-cue',
						},
						checkIcon(),
						params.cueLabel
					)
				: null
		),
		consentButton({
			attrs: {
				'data-cue': params.cue > 0 ? 'true' : undefined,
				'data-testid': params.testId,
				on: { click: params.onClick },
			},
			children: [
				el(
					'span',
					{ 'aria-hidden': 'true', class: cx(noStyle, styles.doneCheck) },
					checkIcon()
				),
				params.label,
			],
			className: noStyle ? undefined : styles.done,
			env,
			isPrimary: true,
			slotKey: 'consentDialogDoneButton',
		}),
	];
};

/** The sheet showing, kept while it animates out. */
interface ShownSheet {
	id: string;
	closing: boolean;
}

/**
 * The dialog with its own preference draft, so the EU's
 * switches stay staged until Save (EU-02) and the US's apply one by one.
 */
// oxlint-disable-next-line max-lines-per-function, max-statements, complexity -- One controller owns the dialog's layers, focus and keys so they stay in step, as the React component does.
export const createConsentDialog = function createConsentDialog(
	ctx: SurfaceContext,
	options: ConsentDialogOptions
): Surface {
	const { kernel } = ctx.client;
	const { noStyle } = ctx;
	const disableAnimation = options.disableAnimation ?? ctx.disableAnimation;
	const prefix = 'inth-pcd';
	const draft = createPreferenceDraft(kernel, {
		defaults: ctx.client.presentation?.preferences?.defaults,
	});
	const { session } = surfaceBasics(kernel, kernel.getSnapshot());
	// Keep the draft in step with the dialog: unsaved EU edits are dropped
	// whenever it closes (EU-02).
	const stopDraftReset = session.attachDraft(draft);

	const mainRef: PartRef = { current: null };
	const mainTitleRef: PartRef = { current: null };
	const bodyRef: PartRef = { current: null };
	const mainStatusRef: PartRef = { current: null };
	const sheetRef: PartRef = { current: null };
	const sheetTitleRef: PartRef = { current: null };
	const sheetBodyRef: PartRef = { current: null };
	const sheetStatusRef: PartRef = { current: null };
	const preferencesTriggerRef: PartRef = { current: null };
	const preferencesPanelRef: PartRef = { current: null };

	const rights = createSaleRightsRow();
	const receipt = createRightsReceipt();
	const mainGroup = createCategoryGroup();
	const sheetGroup = createCategoryGroup();

	let snapshot: ConsentSnapshot | null = null;
	let backdrop: HTMLElement | null = null;
	let isOpen = false;
	let opener: Element | null = null;
	let preferencesOpen = false;
	let cue = 0;
	let cueCount = 0;
	let lastCue = 0;
	let cueTimer: ReturnType<typeof setTimeout> | undefined;
	/** The frame that looks for the returning banner to focus. */
	let bannerFrame = 0;
	let shownSheet: ShownSheet | null = null;
	let sheetTimer: ReturnType<typeof setTimeout> | undefined;
	let rendering = false;
	let renderAgain = false;
	let destroyed = false;
	/** Renders the surface; assigned below, called by its listeners. */
	let render = (): void => undefined;

	let releaseOpen: (() => void) | undefined;
	let releaseSheet: (() => void) | undefined;
	let trappedSheet: HTMLElement | null = null;
	let releaseGuard: (() => void) | undefined;
	let keysAttached = false;
	let stopBodyFades: ScrollFades | undefined;
	let fadedBody: HTMLElement | null = null;
	let stopSheetFades: ScrollFades | undefined;
	let fadedSheetBody: HTMLElement | null = null;
	let cancelPreferencesReveal: (() => void) | undefined;
	let revealedPreferences = false;
	const regions = new Map<HTMLElement, LiveRegion>();

	const phoneLayout = watchPhoneLayout(() => {
		render();
	});
	const stopSession = session.subscribe(() => {
		render();
	});
	const stopDraft = draft.subscribe(() => {
		render();
	});

	const showCue = () => {
		cueCount += 1;
		cue = cueCount;
		if (cueTimer !== undefined) {
			clearTimeout(cueTimer);
		}
		cueTimer = setTimeout(() => {
			cueTimer = undefined;
			cue = 0;
			render();
		}, CUE_MS);
		render();
	};

	/** Focus the banner card once it renders again. */
	const focusReturningBanner = function focusReturningBanner(): void {
		let frames = 0;
		cancelAnimationFrame(bannerFrame);
		const attempt = () => {
			bannerFrame = 0;
			const card = findInPage('[data-testid="consent-banner-card"]', ctx.root);
			if (card) {
				card.focus({ preventScroll: true });
				return;
			}
			frames += 1;
			if (frames < BANNER_RETURN_FRAMES) {
				bannerFrame = requestAnimationFrame(attempt);
			}
		};
		bannerFrame = requestAnimationFrame(attempt);
	};

	const onKeyDown = function onKeyDown(event: KeyboardEvent): void {
		if (event.key !== 'Escape' || event.defaultPrevented) {
			return;
		}
		// The top sheet, then an open confirmation, then the dialog (FOC-04).
		const outcome = session.escape({ blocking: true, focusInside: true });
		if (outcome !== 'ignore') {
			event.preventDefault();
		}
	};

	const close = () => showConsentSurface(kernel, 'none');
	const popSheet = () => {
		session.popSheet();
	};
	const pushSheet = (sheet: string, openerKey: string) => {
		session.pushSheet(sheet, openerKey);
	};

	const clearSheetTimer = function clearSheetTimer(): void {
		if (sheetTimer !== undefined) {
			clearTimeout(sheetTimer);
			sheetTimer = undefined;
		}
	};

	const followSheets = function followSheets(env: PartEnv): void {
		const topSheet = env.state.sheets[env.state.sheets.length - 1] ?? null;
		// Nothing is left to animate under reduced motion, on desktop or in a
		// closed dialog, so a sheet leaves at once there (NEST-06).
		const exitsAtOnce =
			prefersReducedMotionNow() || disableAnimation || !env.phone || !isOpen;
		if (topSheet && (shownSheet?.id !== topSheet.id || shownSheet.closing)) {
			// A sheet reopened while it animates out shows again at once, and
			// its exit timer goes with the closing state (NEST-03).
			clearSheetTimer();
			shownSheet = { closing: false, id: topSheet.id };
		} else if (
			!topSheet &&
			shownSheet &&
			(exitsAtOnce || !shownSheet.closing)
		) {
			clearSheetTimer();
			shownSheet = exitsAtOnce ? null : { ...shownSheet, closing: true };
			const exiting = shownSheet;
			if (exiting) {
				sheetTimer = setTimeout(() => {
					sheetTimer = undefined;
					// Clears only the exit it was set for, never a sheet shown
					// since.
					if (shownSheet === exiting) {
						shownSheet = null;
						render();
					}
				}, SHEET_EXIT_MS);
			}
		}
	};

	// oxlint-disable-next-line max-lines-per-function, complexity -- The tree mirrors the React component's.
	const build = function build(env: PartEnv): HTMLElement {
		const { snapshot: snap, t, phone } = env;
		// The model and the US markers decide the body, never the prompt: an
		// EU opt-in policy that shows no banner still gets the EU dialog.
		const eu = resolvePrivacyChoicesRegime(snap.policyRule) === 'eu';
		// Phone sheets take the prompt's resolved phone edge style, which the
		// policy and a Card's own rule (always inset) have already settled.
		const edgeStyle =
			resolveConsentPresentation({
				policy: snap.policyRule,
				presentation: ctx.client.presentation,
				surface: 'prompt',
			}).container?.phone.edgeStyle ?? 'inset';
		const copy = resolvePrivacyChoicesDialogCopy(t, { eu });
		const sale = resolveSaleRight(snap);
		const gpcLocked = sale.available && sale.lock === 'gpc-active';
		const sheetOpen = Boolean(shownSheet && !shownSheet.closing);
		const commit = (action: BannerCommitAction) => {
			commitDialogChoice(kernel, action, { draft, uiSource: 'dialog' });
		};

		// The footer shows the regime's one link: the Cookie Policy for the
		// EU, the Privacy Policy for the US. `legalLinks` omitted shows it,
		// `null` hides it, and a list shows it only when its key is listed.
		const legalKey = eu ? 'cookiePolicy' : 'privacyPolicy';
		const legalKeys: LegalLinkKeys =
			options.legalLinks === undefined
				? [legalKey]
				: (options.legalLinks?.filter((key) => key === legalKey) ?? []);
		const [legal] = resolveLegalLinkEntries(
			ctx.legalLinks,
			legalKeys,
			t.legalLinks ?? {}
		);
		const legalLink = legal
			? el(
					'a',
					{
						class: cx(noStyle, styles.quietLink),
						'data-testid': eu
							? 'consent-dialog-legal-link-cookiePolicy'
							: 'consent-dialog-legal-link-privacyPolicy',
						href: legal.href,
						rel: legal.rel,
						target: legal.target,
					},
					legal.label
				)
			: el('span');

		const saleCategory = sale.category;
		const usExclude: AllConsentNames[] = saleCategory ? [saleCategory] : [];
		const usCategories = (group: typeof mainGroup, idPrefix: string) =>
			group.render(env, {
				apply: 'immediate',
				exclude: usExclude,
				footer: sale.available
					? advertisingRow(env, {
							idPrefix: prefix,
							on: sale.selected === 'allow',
							testId: 'consent-dialog-advertising-row',
						})
					: null,
				idPrefix,
				onApplied: showCue,
				slotKey: 'consentDialogCategoryGroup',
				testIdPrefix: 'consent-dialog',
				uiSource: 'dialog',
				vendorTableSlotKey: 'consentDialogVendorTable',
				vendors: 'accordion',
			});

		const { displayedCategories, values } = draft.getState();
		const preferencesCount = displayedCategories.filter(
			(name) => name !== 'necessary' && name !== saleCategory && values[name]
		).length;
		const preferencesCopy = resolvePreferencesRowCopy(t, preferencesCount);
		const preferencesPanelId = `${prefix}-preferences`;
		const preferencesRow: PartChild[] = [
			env.ctx.slot(
				el(
					'button',
					{
						'aria-controls': phone ? undefined : preferencesPanelId,
						'aria-expanded': phone ? undefined : String(preferencesOpen),
						'aria-haspopup': phone ? 'dialog' : undefined,
						class: cx(noStyle, styles.navRow),
						'data-opener': PREFERENCES_OPENER,
						'data-testid': 'consent-dialog-preferences-row',
						on: {
							click: () => {
								if (phone) {
									pushSheet(PREFERENCES_SHEET, PREFERENCES_OPENER);
								} else {
									preferencesOpen = !preferencesOpen;
									render();
								}
							},
						},
						ref: preferencesTriggerRef,
						type: 'button',
					},
					el(
						'span',
						{ class: cx(noStyle, styles.navRowLabel) },
						preferencesCopy.title,
						el(
							'span',
							{ class: cx(noStyle, styles.navRowMeta) },
							`${preferencesCopy.summary} · ${preferencesCopy.onCount}`
						)
					),
					el(
						'span',
						{
							class: cx(noStyle, styles.chevron),
							'data-direction': phone ? 'end' : 'down',
						},
						chevron(phone ? 'end' : 'down')
					)
				),
				'consentDialogPreferencesRow'
			),
			phone
				? null
				: el(
						'div',
						{
							class: cx(noStyle, styles.disclosure),
							'data-open': preferencesOpen ? 'true' : 'false',
							'data-testid': 'consent-dialog-preferences-panel',
							id: preferencesPanelId,
							inert: !preferencesOpen,
							ref: preferencesPanelRef,
						},
						el(
							'div',
							{ class: cx(noStyle, styles.disclosureInner) },
							el(
								'div',
								{ class: cx(noStyle, styles.preferencesPanel) },
								usCategories(mainGroup, `${prefix}-main`)
							)
						)
					),
		];

		const usBody: PartChild[] = [
			rights.render(env, {
				idPrefix: `${prefix}-main`,
				onRecorded: showCue,
				slotKey: 'consentDialogRightsRow',
				testIdPrefix: 'consent-dialog',
				uiSource: 'dialog',
			}),
			receipt.render(env, {
				idPrefix: `${prefix}-main`,
				slotKey: 'consentDialogReceipt',
			}),
			...preferencesRow,
		];
		const euBody = (): PartChild[] => [
			mainGroup.render(env, {
				idPrefix: `${prefix}-main`,
				onOpenVendors: (category, openerKey) =>
					pushSheet(`${VENDOR_SHEET_PREFIX}${category}`, openerKey),
				slotKey: 'consentDialogCategoryGroup',
				testIdPrefix: 'consent-dialog',
				vendorTableSlotKey: 'consentDialogVendorTable',
				vendors: phone ? 'sheet' : 'accordion',
			}),
		];

		const euActions = () =>
			el(
				'div',
				{ class: cx(noStyle, styles.footerActions) },
				consentButton({
					attrs: {
						'data-testid': 'consent-dialog-reject-all',
						on: { click: () => commit('refuse') },
					},
					children: [copy.rejectAll],
					consentAction: 'reject',
					env,
					mode: 'stroke',
					variant: 'neutral',
				}),
				consentButton({
					attrs: {
						'data-testid': 'consent-dialog-accept-all',
						on: { click: () => commit('allow') },
					},
					children: [copy.acceptAll],
					consentAction: 'accept',
					env,
					mode: 'stroke',
					variant: 'neutral',
				}),
				consentButton({
					attrs: {
						'data-testid': 'consent-dialog-save-button',
						// Enabled only once what would run differs from the record (EU-03).
						disabled: !draft.getState().hasEffectiveChanges,
						on: { click: () => commit('save') },
					},
					children: [copy.save],
					consentAction: 'save',
					env,
					isPrimary: true,
					slotKey: 'consentDialogSaveButton',
				})
			);
		const usActions = () =>
			el(
				'div',
				{ class: cx(noStyle, styles.footerActions) },
				...doneButton(env, {
					cue: shownSheet ? 0 : cue,
					cueLabel: copy.savedCue,
					label: copy.done,
					onClick: close,
					testId: 'consent-dialog-done',
				})
			);

		// The phone sheet on top: Preferences in the US, a category's
		// vendors in the EU. Its ids carry their own prefix (SR-05).
		let sheet: HTMLElement | null = null;
		if (shownSheet) {
			const sheetPrefix = `${prefix}-sheet`;
			const { closing } = shownSheet;
			const vendorCategory = shownSheet.id.startsWith(VENDOR_SHEET_PREFIX)
				? (shownSheet.id.slice(VENDOR_SHEET_PREFIX.length) as AllConsentNames)
				: null;
			const sheetFooter: PartChild[] = [
				el('span', { class: cx(noStyle, styles.footerNote) }, copy.sheetNote),
				el(
					'div',
					{ class: cx(noStyle, styles.footerActions) },
					...doneButton(env, {
						cue: eu ? 0 : cue,
						cueLabel: copy.savedCue,
						label: copy.done,
						onClick: popSheet,
						testId: 'consent-dialog-sheet-done',
					})
				),
			];
			const common = {
				bodyRef: sheetBodyRef,
				closing,
				depth: 0,
				env,
				eu,
				footer: sheetFooter,
				idPrefix: sheetPrefix,
				layerRef: sheetRef,
				nested: true,
				onClose: popSheet,
				sheetId: shownSheet.id,
				statusRef: sheetStatusRef,
				titleRef: sheetTitleRef,
				top: true,
			};
			if (vendorCategory) {
				const vendorCopy = resolveVendorTableCopy(t, {
					category: resolveCategoryTitle(t, vendorCategory),
					count: 0,
					onCount: 0,
					open: true,
				});
				sheet = layer({
					...common,
					children: [
						sheetGroup.render(env, {
							idPrefix: sheetPrefix,
							only: vendorCategory,
							slotKey: 'consentDialogCategoryGroup',
							testIdPrefix: 'consent-dialog',
							vendorTableSlotKey: 'consentDialogVendorTable',
							vendors: 'inline',
						}),
					],
					closeLabel: vendorCopy.close,
					intro: copy.vendorSheetIntro,
					title: vendorCopy.table,
				});
			} else {
				sheet = layer({
					...common,
					children: [usCategories(sheetGroup, sheetPrefix)],
					closeLabel: copy.preferencesClose,
					intro: copy.preferencesIntro,
					title: copy.preferencesTitle,
				});
			}
		}

		// The GPC note replaces the intro, never both (LAY-04).
		const intro = !eu && gpcLocked ? null : copy.intro;
		// The root takes the `consentDialog` slot and part.
		return env.ctx.slot(
			el(
				'div',
				{
					class: cx(noStyle, styles.backdrop),
					'data-animation': disableAnimation ? 'off' : undefined,
					'data-edge-style': edgeStyle,
					'data-layout': phone ? 'phone' : 'desktop',
					'data-regime': eu ? 'eu' : 'us',
					'data-testid': 'consent-dialog-root',
					dir: getTextDirection(snap.translations?.language),
					[SURFACE_ROOT_ATTRIBUTE]: 'dialog',
				},
				layer({
					bodyRef,
					children: eu ? euBody() : usBody,
					closeLabel: copy.close,
					closing: false,
					depth: sheetOpen ? 1 : 0,
					env,
					eu,
					footer: [legalLink, eu ? euActions() : usActions()],
					idPrefix: `${prefix}-main`,
					intro,
					layerRef: mainRef,
					nested: false,
					onClose: close,
					statusRef: mainStatusRef,
					title: copy.title,
					titleRef: mainTitleRef,
					top: !sheetOpen,
				}),
				sheet
			),
			'consentDialog'
		);
	};

	/** Each layer's own status region (SR-01), silent while it closes (SR-02). */
	const renderStatuses = function renderStatuses(env: PartEnv): void {
		const { state } = env;
		const sheetOpen = Boolean(shownSheet && !shownSheet.closing);
		const mainStatus =
			state.announcement?.layer === MAIN_LAYER && state.sheets.length === 0
				? announcementText(state.announcement)
				: '';
		const sheetStatus =
			shownSheet && state.announcement?.layer === shownSheet.id
				? announcementText(state.announcement)
				: '';
		const wanted = new Map<HTMLElement, string>();
		if (mainStatusRef.current?.isConnected) {
			wanted.set(mainStatusRef.current, sheetOpen ? '' : mainStatus);
		}
		if (shownSheet && sheetStatusRef.current?.isConnected) {
			wanted.set(sheetStatusRef.current, shownSheet.closing ? '' : sheetStatus);
		}
		for (const [element, region] of regions) {
			if (!wanted.has(element)) {
				region();
				regions.delete(element);
			}
		}
		for (const [element, text] of wanted) {
			let region = regions.get(element);
			if (!region) {
				region = attachLiveRegion(element);
				regions.set(element, region);
			}
			region.render(text);
		}
	};

	// oxlint-disable-next-line max-statements, complexity -- The React component's effects, in its order.
	const effects = function effects(env: PartEnv): void {
		const { state, phone } = env;
		// Desktop never nests, and a viewport change drops open sheets
		// (NEST-01, NEST-06).
		if (!phone && state.sheets.length > 0) {
			session.popSheet();
		}

		// Open: the page is inert, focus moves to the title and is trapped
		// in the top layer, and returns to the opener on close (FOC-01..03).
		if (backdrop && mainRef.current && !releaseOpen) {
			const release = attachPageBlock(backdrop);
			// Back from an opt-out (after its revocation reload, or from a
			// one-click opt-out link), the dialog opens on the receipt that
			// confirms it.
			const receiptElement = takeReceiptFocus(kernel)
				? mainRef.current.querySelector<HTMLElement>(
						'[data-testid="consent-dialog-receipt"][data-open="true"]'
					)
				: null;
			const untrap = attachTopLayerTrap(mainRef.current, {
				initialFocus: receiptElement ?? mainTitleRef.current,
				returnFocus: () => {
					const target = opener;
					opener = null;
					// Closing without a decision brings the banner back; focus
					// moves to it once it renders (BNR-05, FOC-03).
					if (kernel.getSnapshot().activeUI === 'banner') {
						focusReturningBanner();
					}
					// The page is released by now, so an opener or a fallback that
					// cannot take focus (inside a hidden footer) is skipped.
					if (target instanceof HTMLElement && target.isConnected) {
						target.focus({ preventScroll: true });
						if (activeElementOf(target) === target) {
							return target;
						}
					}
					for (const selector of RETURN_TARGETS) {
						const fallback = focusFirstIn(selector, ctx.root);
						if (fallback) {
							return fallback;
						}
					}
					return null;
				},
			});
			releaseOpen = () => {
				// Release the page first: focus can't return to an inert opener.
				release();
				untrap();
			};
		}

		// A sheet is the top layer while it shows: it holds focus, and
		// closing it returns focus to the row that opened it (NEST-04).
		const sheetOpen = Boolean(shownSheet && !shownSheet.closing);
		const sheetElement = sheetOpen ? sheetRef.current : null;
		if (sheetElement !== trappedSheet) {
			releaseSheet?.();
			releaseSheet = undefined;
			trappedSheet = sheetElement;
			if (sheetElement) {
				const { sheets } = session.getState();
				const openerKey = sheets[sheets.length - 1]?.opener ?? '';
				releaseSheet = attachTopLayerTrap(sheetElement, {
					initialFocus: sheetTitleRef.current,
					returnFocus: () =>
						mainRef.current?.querySelector<HTMLElement>(
							`[data-opener="${openerKey}"]`
						) ?? mainTitleRef.current,
				});
			}
		}

		if (!keysAttached) {
			document.addEventListener('keydown', onKeyDown);
			keysAttached = true;
		}

		// A tap on the dimmed parent closes only the sheet, and the tap's
		// click never lands on what is under it (NEST-04, NEST-05).
		if (backdrop && !releaseGuard) {
			releaseGuard = attachBackdropGuard(backdrop, {
				isBackdrop: (target) =>
					session.getState().sheets.length > 0 &&
					!(sheetRef.current?.contains(target) ?? false),
				onBackdrop: () => {
					session.popSheet();
				},
			});
		}

		// Scroll-edge fades on each body (LAY-08).
		const body = bodyRef.current?.isConnected ? bodyRef.current : null;
		if (body === fadedBody) {
			// The content may have changed height under the same body.
			stopBodyFades?.update();
		} else {
			stopBodyFades?.();
			stopBodyFades = body ? attachScrollFades(body) : undefined;
			fadedBody = body;
		}
		const sheetBody =
			shownSheet && sheetBodyRef.current?.isConnected
				? sheetBodyRef.current
				: null;
		if (sheetBody === fadedSheetBody) {
			stopSheetFades?.update();
		} else {
			stopSheetFades?.();
			stopSheetFades = sheetBody ? attachScrollFades(sheetBody) : undefined;
			fadedSheetBody = sheetBody;
		}

		// Opening Preferences reveals as much of it as fits without
		// scrolling its row out (LAY-05).
		if (preferencesOpen && !revealedPreferences) {
			revealedPreferences = true;
			const { token } = session.getState();
			cancelPreferencesReveal = scheduleReveal(
				() => {
					const trigger = preferencesTriggerRef.current;
					const panel = preferencesPanelRef.current;
					if (trigger && panel) {
						revealDisclosure(trigger, panel, { body: bodyRef.current });
					}
				},
				{ isCurrent: () => session.isCurrent(token) }
			);
		} else if (!preferencesOpen && revealedPreferences) {
			revealedPreferences = false;
			cancelPreferencesReveal?.();
			cancelPreferencesReveal = undefined;
		}

		// Replay the "Saved" cue on every change (SR-07, MOT-03).
		if (cue > 0 && cue !== lastCue && backdrop) {
			for (const node of backdrop.querySelectorAll(
				'[data-testid="consent-dialog-saved-cue"]'
			)) {
				node.replaceWith(node.cloneNode(true));
			}
		}
		lastCue = cue;

		renderStatuses(env);
		rights.after(env);
		receipt.after(env);
		mainGroup.after(env);
		sheetGroup.after(env);
	};

	const teardown = function teardown(): void {
		releaseSheet?.();
		releaseSheet = undefined;
		trappedSheet = null;
		releaseGuard?.();
		releaseGuard = undefined;
		stopBodyFades?.();
		stopBodyFades = undefined;
		fadedBody = null;
		stopSheetFades?.();
		stopSheetFades = undefined;
		fadedSheetBody = null;
		cancelPreferencesReveal?.();
		cancelPreferencesReveal = undefined;
		revealedPreferences = false;
		for (const region of regions.values()) {
			region();
		}
		regions.clear();
		if (keysAttached) {
			document.removeEventListener('keydown', onKeyDown);
			keysAttached = false;
		}
		backdrop?.remove();
		backdrop = null;
		// The trap returns focus once the dialog has left the page.
		releaseOpen?.();
		releaseOpen = undefined;
		clearSheetTimer();
		shownSheet = null;
		// A closed dialog starts over: Preferences folded.
		preferencesOpen = false;
	};

	render = (): void => {
		if (destroyed || !snapshot) {
			return;
		}
		if (rendering) {
			renderAgain = true;
			return;
		}
		rendering = true;
		try {
			const open =
				(snapshot.activeUI ?? 'none') === 'dialog' &&
				snapshot.policyRule.model !== 'iab' &&
				hasConsentUI(snapshot);
			if (!open) {
				if (isOpen) {
					isOpen = false;
					teardown();
				}
				return;
			}
			if (!isOpen) {
				isOpen = true;
				opener = deepActiveElement();
			}
			const { t } = surfaceBasics(kernel, snapshot);
			const env: PartEnv = {
				ctx,
				draft,
				kernel,
				noStyle,
				phone: phoneLayout.matches(),
				rerender: render,
				session,
				snapshot,
				state: session.getState(),
				t,
			};
			followSheets(env);
			ctx.addSheets?.(OPTIONS_SHEETS);
			backdrop = patch(backdrop, build(env), ctx.root);
			effects(env);
		} finally {
			rendering = false;
		}
		if (renderAgain) {
			renderAgain = false;
			render();
		}
	};

	return {
		destroy() {
			destroyed = true;
			if (isOpen) {
				isOpen = false;
				teardown();
			}
			if (cueTimer !== undefined) {
				clearTimeout(cueTimer);
				cueTimer = undefined;
			}
			cancelAnimationFrame(bannerFrame);
			bannerFrame = 0;
			rights.dispose();
			receipt.dispose();
			mainGroup.dispose();
			sheetGroup.dispose();
			phoneLayout.stop();
			stopSession();
			stopDraft();
			stopDraftReset();
		},
		sync(next) {
			snapshot = next;
			render();
		},
	};
};
