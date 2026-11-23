'use client';

/**
 * The "Your Privacy Choices" dialog (v6): one column whose body is the
 * only scroller, the statutory rights on its first view, the receipt, and
 * Preferences; in the EU, the cookie categories and a staged Save. On
 * phone, Preferences and EU vendor lists open as nested sheets, at most
 * two layers; desktop uses accordions only.
 */

import {
	commitDialogChoice,
	MAIN_LAYER,
	resolveSaleRight,
} from '@inth/sdk/engine';
import type { AllConsentNames, BannerCommitAction } from '@inth/sdk/engine';
import { showConsentSurface } from '@inth/sdk/surface-actions';
import {
	announcementText,
	resolveCategoryTitle,
	resolvePreferencesRowCopy,
	resolvePrivacyChoicesDialogCopy,
	resolvePrivacyChoicesVariant,
	resolveVendorTableCopy,
} from '@inth/sdk/surface-state';
import {
	attachBackdropGuard,
	attachLiveRegion,
	attachPageBlock,
	attachScrollFades,
	attachTopLayerTrap,
	revealDisclosure,
	scheduleReveal,
} from '@inth/sdk/ui/primitives/surface';
import type { LiveRegion } from '@inth/sdk/ui/primitives/surface';
import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';
import styles from '@inth/sdk/ui/styles/components/privacy-choices';
import { resolveLegalLinkEntries } from '@inth/sdk/ui/utils';
import {
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';

import { useTranslations } from '~/component-hooks/use-translations';
import {
	AdvertisingRow,
	CategoryGroup,
} from '~/components/privacy-choices/category-group';
import { RightsReceipt } from '~/components/privacy-choices/receipt';
import { SaleRightsRow } from '~/components/privacy-choices/rights-row';
import { usePhoneLayout } from '~/components/privacy-choices/use-phone-layout';
import { useSurfaceSession } from '~/components/privacy-choices/use-surface-session';
import { ConsentButton } from '~/components/shared/primitives/button';
import {
	useLegalLinksConfig,
	useLegalLinkTranslations,
} from '~/components/shared/primitives/legal-links';
import { toSaveUISource } from '~/context/consent-tracking-context';
import {
	ConsentDraftProvider,
	useConsentDraftSlice,
	useConsentDraftStore,
} from '~/draft';
import { useHasConsentUI, useModel, useSnapshot } from '~/hooks';
import { useReducedMotion } from '~/hooks/use-reduced-motion';
import { useResolvedPresentation } from '~/hooks/use-resolved-presentation';
import { useKernel } from '~/kernel-selector';
import { useUIConfig } from '~/ui-config-context';
import { getSlotProps, mergeSlotProps } from '~/utils/merge-slot-props';

import { SurfaceStyles, useSurfaceSheetsReady } from '../shared/surface-styles';
import { DIALOG_SHEETS } from './sheets';

/** The "Saved" cue stays this long, on a timer, not an animation (MOT-03). */
const CUE_MS = 1700;
/** A closing sheet animates out this long, inert (NEST-03). */
const SHEET_EXIT_MS = 160;
/** The opener key of the Preferences row. */
const PREFERENCES_OPENER = 'preferences';
const PREFERENCES_SHEET = 'preferences';
const VENDOR_SHEET_PREFIX = 'vendors:';

/** Props for the Privacy Choices dialog. */
export interface PrivacyChoicesDialogProps {
	noStyle?: boolean;
	disableAnimation?: boolean;
	/** Override the open state. Defaults to `activeUI === 'dialog'`. */
	open?: boolean;
	models?: string[];
	uiSource?: string;
}

const cx = (noStyle: boolean | undefined, ...names: (string | undefined)[]) =>
	noStyle ? undefined : names.filter(Boolean).join(' ') || undefined;

const CloseIcon = () => (
	<svg
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<path d="M18 6 6 18M6 6l12 12" />
	</svg>
);

const Check = () => (
	<svg
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2.5"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<path d="M20 6 9 17l-5-5" />
	</svg>
);

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

/**
 * A layer's own `role="status"` region (SR-01). It shows only messages
 * the layer made, and none while it closes (SR-02).
 */
const useLayerStatus = function useLayerStatus(
	ref: RefObject<HTMLElement | null>,
	text: string
): void {
	const region = useRef<LiveRegion | null>(null);
	useLayoutEffect(() => {
		if (!ref.current) {
			return;
		}
		const controller = attachLiveRegion(ref.current);
		region.current = controller;
		return () => {
			controller();
			region.current = null;
		};
	}, [ref]);
	useLayoutEffect(() => {
		region.current?.render(text);
	}, [text]);
};

/** The "Saved" cue beside Done, replayed on every change (SR-07, MOT-03). */
const useSavedCue = function useSavedCue(): [number, () => void] {
	const [shown, setShown] = useState(0);
	const count = useRef(0);
	useEffect(() => {
		if (shown === 0) {
			return;
		}
		const timer = setTimeout(() => setShown(0), CUE_MS);
		return () => clearTimeout(timer);
	}, [shown]);
	return [
		shown,
		useCallback(() => {
			count.current += 1;
			setShown(count.current);
		}, []),
	];
};

interface DoneProps {
	cue: number;
	label: string;
	cueLabel: string;
	noStyle?: boolean;
	testId: 'consent-dialog-done' | 'consent-dialog-sheet-done';
	onClick: () => void;
}

/**
 * Done, which closes and commits nothing (LAW-04). Its label never changes
 * (SR-07): on desktop the cue sits beside it, absolutely placed so Done
 * never moves (MOT-04); on phone a check slides in before the label. The
 * cue's slot is always there, so Done keeps its node and focus (FOC-06).
 */
const DoneButton = ({
	cue,
	label,
	cueLabel,
	noStyle,
	testId,
	onClick,
}: DoneProps) => (
	<>
		<span
			className={cx(noStyle, styles.cueSlot)}
			aria-hidden="true"
		>
			{cue > 0 ? (
				<span
					key={cue}
					className={cx(noStyle, styles.savedCue)}
					data-testid="consent-dialog-saved-cue"
				>
					<Check />
					{cueLabel}
				</span>
			) : null}
		</span>
		<ConsentButton
			action="custom-consent"
			performDefaultAction={false}
			isPrimary
			slotKey="dialog.doneButton"
			baseClassName={noStyle ? undefined : styles.done}
			data-cue={cue > 0 ? 'true' : undefined}
			data-testid={testId}
			onClick={onClick}
		>
			<span
				className={cx(noStyle, styles.doneCheck)}
				aria-hidden="true"
			>
				<Check />
			</span>
			{label}
		</ConsentButton>
	</>
);

interface LayerProps {
	layerRef: RefObject<HTMLElement | null>;
	titleRef: RefObject<HTMLHeadingElement | null>;
	bodyRef?: RefObject<HTMLDivElement | null>;
	idPrefix: string;
	title: string;
	intro: ReactNode;
	closeLabel: string;
	onClose: () => void;
	footer: ReactNode;
	status: string;
	nested: boolean;
	top: boolean;
	closing?: boolean;
	depth: number;
	eu: boolean;
	sheetId?: string;
	noStyle?: boolean;
	children: ReactNode;
}

/**
 * One card: the main dialog or a phone sheet. Only the top layer is modal;
 * a covered parent is inert, dims and steps back (NEST-03).
 */
// oxlint-disable-next-line complexity -- One card's attributes, main or sheet, read together.
const Layer = ({
	layerRef,
	titleRef,
	bodyRef,
	idPrefix,
	title,
	intro,
	closeLabel,
	onClose,
	footer,
	status,
	nested,
	top,
	closing = false,
	depth,
	eu,
	sheetId,
	noStyle,
	children,
}: LayerProps) => {
	const { components } = useUIConfig();
	const statusRef = useRef<HTMLDivElement>(null);
	useLayerStatus(statusRef, top && !closing ? status : '');
	const titleId = `${idPrefix}-title`;
	const cardProps = mergeSlotProps(
		nested
			? getSlotProps(components, 'dialog.sheet')
			: getSlotProps(components, 'dialog.card'),
		{ baseClassName: styles.card, noStyle }
	);
	return (
		<section
			ref={layerRef}
			{...cardProps}
			// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Layers stack inside one backdrop and the top-layer trap; a native <dialog> brings its own top layer and Escape handling.
			role="dialog"
			aria-modal={top && !closing ? true : undefined}
			aria-labelledby={titleId}
			data-regime={eu ? 'eu' : 'us'}
			data-nested={nested ? 'true' : undefined}
			data-nested-open={depth > 0 ? '' : undefined}
			data-state={closing ? 'closed' : 'open'}
			data-sheet={sheetId}
			style={
				{
					...cardProps.style,
					'--consent-dialog-depth': depth,
				} as CSSProperties
			}
			inert={!top || closing}
			data-testid={nested ? 'consent-dialog-sheet' : 'consent-dialog-card'}
		>
			<header
				{...mergeSlotProps(getSlotProps(components, 'dialog.header'), {
					baseClassName: styles.header,
					noStyle,
				})}
				data-testid={nested ? undefined : 'consent-dialog-header'}
			>
				<div>
					<h2
						ref={titleRef}
						{...mergeSlotProps(getSlotProps(components, 'dialog.title'), {
							baseClassName: styles.title,
							noStyle,
						})}
						id={titleId}
						tabIndex={-1}
						data-testid={nested ? undefined : 'consent-dialog-title'}
					>
						{title}
					</h2>
					{intro ? (
						<p
							className={cx(noStyle, styles.intro)}
							data-testid={nested ? undefined : 'consent-dialog-intro'}
						>
							{intro}
						</p>
					) : null}
				</div>
				<button
					type="button"
					className={cx(noStyle, styles.close)}
					aria-label={closeLabel}
					data-testid={
						nested ? 'consent-dialog-sheet-close' : 'consent-dialog-close'
					}
					onClick={onClose}
				>
					<CloseIcon />
				</button>
			</header>
			<div
				ref={bodyRef}
				{...mergeSlotProps(getSlotProps(components, 'dialog.content'), {
					baseClassName: [expandStyles.scroll, styles.body],
					noStyle,
				})}
				data-testid={nested ? undefined : 'consent-dialog-content'}
			>
				{children}
			</div>
			<footer
				{...mergeSlotProps(getSlotProps(components, 'dialog.footer'), {
					baseClassName: styles.footer,
					noStyle,
				})}
				data-testid={nested ? undefined : 'consent-dialog-footer'}
			>
				{footer}
			</footer>
			<div
				ref={statusRef}
				className={cx(noStyle, styles.visuallyHidden)}
				data-testid={nested ? undefined : 'consent-dialog-status'}
			/>
		</section>
	);
};

/** How many frames to wait for a returning banner, which may still be loading. */
const BANNER_RETURN_FRAMES = 60;

/** Focus the banner card once it renders again. */
const focusReturningBanner = function focusReturningBanner(): void {
	let frames = 0;
	const attempt = () => {
		const card = document.querySelector<HTMLElement>(
			'[data-testid="consent-banner-card"]'
		);
		if (card) {
			card.focus({ preventScroll: true });
			return;
		}
		frames += 1;
		if (frames < BANNER_RETURN_FRAMES) {
			requestAnimationFrame(attempt);
		}
	};
	requestAnimationFrame(attempt);
};

/** The sheet showing, kept while it animates out. */
interface ShownSheet {
	id: string;
	closing: boolean;
}

// oxlint-disable-next-line max-lines-per-function, complexity -- One component owns the dialog's layers, focus and keys so they stay in step.
const DialogContent = ({
	noStyle,
	disableAnimation,
	open: openProp,
	models,
	uiSource,
}: PrivacyChoicesDialogProps) => {
	const kernel = useKernel();
	const snapshot = useSnapshot();
	const hasConsentUI = useHasConsentUI();
	const model = useModel();
	const translations = useTranslations();
	const { components } = useUIConfig();
	const presentation = useResolvedPresentation();
	const { session, state } = useSurfaceSession();
	const draft = useConsentDraftStore();
	const hasChanges = useConsentDraftSlice(
		draft,
		(draftState) => draftState.hasEffectiveChanges
	);
	const phone = usePhoneLayout();
	const reducedMotion = useReducedMotion() || disableAnimation === true;
	const sheetsReady = useSurfaceSheetsReady(DIALOG_SHEETS, noStyle);
	const legalLinks = useLegalLinksConfig();
	const legalTranslations = useLegalLinkTranslations();
	const [cue, showCue] = useSavedCue();
	const [preferencesOpen, setPreferencesOpen] = useState(false);
	const id = useId().replace(/:/gu, '');
	const prefix = `inth-pcd-${id}`;

	const backdropRef = useRef<HTMLDivElement>(null);
	const mainRef = useRef<HTMLElement>(null);
	const mainTitleRef = useRef<HTMLHeadingElement>(null);
	const bodyRef = useRef<HTMLDivElement>(null);
	const sheetRef = useRef<HTMLElement>(null);
	const sheetTitleRef = useRef<HTMLHeadingElement>(null);
	const sheetBodyRef = useRef<HTMLDivElement>(null);
	const preferencesTriggerRef = useRef<HTMLButtonElement>(null);
	const preferencesPanelRef = useRef<HTMLDivElement>(null);
	const opener = useRef<Element | null>(null);

	const variant = resolvePrivacyChoicesVariant(snapshot.policyRule);
	const eu = variant === 'choice';
	const activeUI = snapshot.activeUI ?? 'none';
	const modelAllowed = !models || model === null || models.includes(model);
	const open =
		(openProp ?? activeUI === 'dialog') &&
		hasConsentUI &&
		modelAllowed &&
		sheetsReady;
	// Edge style applies to phone sheets too, whatever the prompt's
	// presentation (a Card itself ignores it).
	const edgeStyle = presentation?.prompt?.edgeStyle ?? 'inset';
	const saveSource = toSaveUISource(uiSource ?? 'dialog');
	const copy = resolvePrivacyChoicesDialogCopy(translations, { eu });
	const sale = resolveSaleRight(snapshot);
	const gpcLocked = sale.available && sale.lock === 'gpc-active';

	// The sheet on top, kept for its exit while it animates out (NEST-03).
	const topSheet = state.sheets[state.sheets.length - 1] ?? null;
	const [shownSheet, setShownSheet] = useState<ShownSheet | null>(null);
	if (topSheet && shownSheet?.id !== topSheet.id) {
		setShownSheet({ closing: false, id: topSheet.id });
	} else if (!topSheet && shownSheet && !shownSheet.closing) {
		setShownSheet(reducedMotion ? null : { ...shownSheet, closing: true });
	}
	useEffect(() => {
		if (!shownSheet?.closing) {
			return;
		}
		const timer = setTimeout(() => setShownSheet(null), SHEET_EXIT_MS);
		return () => clearTimeout(timer);
	}, [shownSheet]);

	// Keep the draft in step with the dialog: unsaved EU edits are dropped
	// whenever it closes (EU-02).
	useEffect(() => session.attachDraft(draft), [session, draft]);

	// Desktop never nests, and a viewport change drops open sheets
	// (NEST-01, NEST-06).
	useEffect(() => {
		if (!phone && state.sheets.length > 0) {
			session.popSheet();
		}
	}, [phone, state.sheets.length, session]);

	// Open: the page is inert, focus moves to the title and is trapped in
	// the top layer, and returns to the opener on close (FOC-01..03).
	useLayoutEffect(() => {
		const backdrop = backdropRef.current;
		const main = mainRef.current;
		if (!(open && backdrop && main)) {
			return;
		}
		opener.current = document.activeElement;
		const release = attachPageBlock(backdrop);
		const untrap = attachTopLayerTrap(main, {
			initialFocus: mainTitleRef.current,
			returnFocus: () => {
				const target = opener.current;
				opener.current = null;
				// Closing without a decision brings the banner back; focus
				// moves to it once it renders (BNR-05, FOC-03).
				if (kernel.getSnapshot().activeUI === 'banner') {
					focusReturningBanner();
				}
				return target instanceof HTMLElement && target.isConnected
					? target
					: document.querySelector<HTMLElement>(
							'[data-testid="privacy-choices-link"]'
						);
			},
		});
		return () => {
			// Release the page first: focus can't return to an inert opener.
			release();
			untrap();
		};
	}, [open, kernel]);

	// A sheet is the top layer while it shows: it holds focus, and closing
	// it returns focus to the row that opened it (NEST-04).
	const sheetOpen = Boolean(shownSheet && !shownSheet.closing);
	useLayoutEffect(() => {
		const sheet = sheetRef.current;
		if (!(open && sheetOpen && sheet)) {
			return;
		}
		const { sheets } = session.getState();
		const openerKey = sheets[sheets.length - 1]?.opener ?? '';
		return attachTopLayerTrap(sheet, {
			initialFocus: sheetTitleRef.current,
			returnFocus: () =>
				mainRef.current?.querySelector<HTMLElement>(
					`[data-opener="${openerKey}"]`
				) ?? mainTitleRef.current,
		});
	}, [open, sheetOpen, session]);

	// Escape: the top sheet, then an open confirmation, then the dialog
	// (FOC-04).
	useEffect(() => {
		if (!open) {
			return;
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape' || event.defaultPrevented) {
				return;
			}
			const outcome = session.escape({ blocking: true, focusInside: true });
			if (outcome !== 'ignore') {
				event.preventDefault();
			}
		};
		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	}, [open, session]);

	// A tap on the dimmed parent closes only the sheet, and the tap's click
	// never lands on what is under it (NEST-04, NEST-05).
	useEffect(() => {
		const backdrop = backdropRef.current;
		if (!(open && backdrop)) {
			return;
		}
		return attachBackdropGuard(backdrop, {
			isBackdrop: (target) =>
				session.getState().sheets.length > 0 &&
				!(sheetRef.current?.contains(target) ?? false),
			onBackdrop: () => {
				session.popSheet();
			},
		});
	}, [open, session]);

	// Scroll-edge fades on each body (LAY-08).
	useEffect(() => {
		const body = bodyRef.current;
		if (!(open && body)) {
			return;
		}
		return attachScrollFades(body);
	}, [open]);
	useEffect(() => {
		const body = sheetBodyRef.current;
		if (!(open && shownSheet && body)) {
			return;
		}
		return attachScrollFades(body);
	}, [open, shownSheet]);

	// Opening Preferences reveals as much of it as fits without scrolling
	// its row out (LAY-05).
	useEffect(() => {
		if (!(open && preferencesOpen)) {
			return;
		}
		const { token } = session.getState();
		return scheduleReveal(
			() => {
				const trigger = preferencesTriggerRef.current;
				const panel = preferencesPanelRef.current;
				if (trigger && panel) {
					revealDisclosure(trigger, panel, { body: bodyRef.current });
				}
			},
			{ isCurrent: () => session.isCurrent(token) }
		);
	}, [open, preferencesOpen, session]);

	// A closed dialog starts over: Preferences folded.
	if (!open && preferencesOpen) {
		setPreferencesOpen(false);
	}

	const close = () => showConsentSurface(kernel, 'none');
	const popSheet = () => {
		session.popSheet();
	};
	const pushSheet = (sheet: string, openerKey: string) => {
		session.pushSheet(sheet, openerKey);
	};
	const commit = (action: BannerCommitAction) => {
		commitDialogChoice(kernel, action, { draft, uiSource: saveSource });
	};

	if (!open) {
		return null;
	}

	const legalKey = eu ? 'cookiePolicy' : 'privacyPolicy';
	const [legal] = resolveLegalLinkEntries(
		legalLinks,
		[legalKey],
		legalTranslations
	);
	const legalLink = legal ? (
		<a
			className={cx(noStyle, styles.quietLink)}
			href={legal.href}
			target={legal.target}
			rel={legal.rel}
			data-testid={
				eu
					? 'consent-dialog-legal-link-cookiePolicy'
					: 'consent-dialog-legal-link-privacyPolicy'
			}
		>
			{legal.label}
		</a>
	) : (
		<span />
	);

	const saleCategory = sale.category;
	const usExclude: AllConsentNames[] = saleCategory ? [saleCategory] : [];
	const advertising = sale.available ? (
		<AdvertisingRow
			on={sale.selected === 'allow'}
			idPrefix={prefix}
			noStyle={noStyle}
			testId="consent-dialog-advertising-row"
		/>
	) : null;
	const usCategories = (idPrefix: string) => (
		<CategoryGroup
			idPrefix={idPrefix}
			testIdPrefix="consent-dialog"
			exclude={usExclude}
			apply="immediate"
			uiSource={saveSource}
			vendors="accordion"
			footer={advertising}
			noStyle={noStyle}
			onApplied={showCue}
			slotKey="dialog.categoryGroup"
			vendorTableSlotKey="dialog.vendorTable"
		/>
	);

	const preferencesCount = draft
		.getState()
		.displayedCategories.filter(
			(name) =>
				name !== 'necessary' &&
				name !== saleCategory &&
				draft.getState().values[name]
		).length;
	const preferencesCopy = resolvePreferencesRowCopy(
		translations,
		preferencesCount
	);
	const preferencesPanelId = `${prefix}-preferences`;
	const preferencesRow = (
		<>
			<button
				ref={preferencesTriggerRef}
				type="button"
				{...mergeSlotProps(getSlotProps(components, 'dialog.preferencesRow'), {
					baseClassName: styles.navRow,
					noStyle,
				})}
				aria-expanded={phone ? undefined : preferencesOpen}
				aria-controls={phone ? undefined : preferencesPanelId}
				aria-haspopup={phone ? 'dialog' : undefined}
				data-opener={PREFERENCES_OPENER}
				data-testid="consent-dialog-preferences-row"
				onClick={() => {
					if (phone) {
						pushSheet(PREFERENCES_SHEET, PREFERENCES_OPENER);
					} else {
						setPreferencesOpen((value) => !value);
					}
				}}
			>
				<span className={cx(noStyle, styles.navRowLabel)}>
					{preferencesCopy.title}
					<span className={cx(noStyle, styles.navRowMeta)}>
						{preferencesCopy.summary} · {preferencesCopy.onCount}
					</span>
				</span>
				<span className={cx(noStyle, styles.chevron)}>
					<Chevron direction={phone ? 'end' : 'down'} />
				</span>
			</button>
			{phone ? null : (
				<div
					ref={preferencesPanelRef}
					className={cx(noStyle, styles.disclosure)}
					id={preferencesPanelId}
					data-open={preferencesOpen}
					inert={!preferencesOpen}
					data-testid="consent-dialog-preferences-panel"
				>
					<div className={cx(noStyle, styles.disclosureInner)}>
						<div className={cx(noStyle, styles.preferencesPanel)}>
							{usCategories(`${prefix}-main`)}
						</div>
					</div>
				</div>
			)}
		</>
	);

	const usBody = (
		<>
			<SaleRightsRow
				idPrefix={`${prefix}-main`}
				testIdPrefix="consent-dialog"
				uiSource={saveSource}
				slotKey="dialog.rightsRow"
				noStyle={noStyle}
				onRecorded={showCue}
			/>
			<RightsReceipt
				idPrefix={`${prefix}-main`}
				slotKey="dialog.receipt"
				noStyle={noStyle}
			/>
			{preferencesRow}
		</>
	);
	const euBody = (
		<CategoryGroup
			idPrefix={`${prefix}-main`}
			testIdPrefix="consent-dialog"
			vendors={phone ? 'sheet' : 'accordion'}
			onOpenVendors={(category, openerKey) =>
				pushSheet(`${VENDOR_SHEET_PREFIX}${category}`, openerKey)
			}
			noStyle={noStyle}
			slotKey="dialog.categoryGroup"
			vendorTableSlotKey="dialog.vendorTable"
		/>
	);

	const euActions = (
		<div className={cx(noStyle, styles.footerActions)}>
			<ConsentButton
				action="custom-consent"
				performDefaultAction={false}
				consentAction="reject"
				variant="neutral"
				mode="stroke"
				data-action="reject"
				data-testid="consent-dialog-reject-all"
				onClick={() => commit('refuse')}
			>
				{copy.rejectAll}
			</ConsentButton>
			<ConsentButton
				action="custom-consent"
				performDefaultAction={false}
				consentAction="accept"
				variant="neutral"
				mode="stroke"
				data-action="accept"
				data-testid="consent-dialog-accept-all"
				onClick={() => commit('allow')}
			>
				{copy.acceptAll}
			</ConsentButton>
			<ConsentButton
				action="custom-consent"
				performDefaultAction={false}
				consentAction="save"
				isPrimary
				slotKey="dialog.saveButton"
				// Enabled only once what would run differs from the record (EU-03).
				{...{ disabled: !hasChanges }}
				data-action="save"
				data-testid="consent-dialog-save-button"
				onClick={() => commit('save')}
			>
				{copy.save}
			</ConsentButton>
		</div>
	);
	const usActions = (
		<div className={cx(noStyle, styles.footerActions)}>
			<DoneButton
				cue={shownSheet ? 0 : cue}
				label={copy.done}
				cueLabel={copy.savedCue}
				noStyle={noStyle}
				testId="consent-dialog-done"
				onClick={close}
			/>
		</div>
	);

	// The phone sheet on top: Preferences in the US, a category's vendors
	// in the EU. Its ids carry their own prefix (SR-05).
	let sheet: ReactNode = null;
	if (shownSheet) {
		const sheetPrefix = `${prefix}-sheet`;
		const { closing } = shownSheet;
		const vendorCategory = shownSheet.id.startsWith(VENDOR_SHEET_PREFIX)
			? (shownSheet.id.slice(VENDOR_SHEET_PREFIX.length) as AllConsentNames)
			: null;
		const sheetFooter = (
			<>
				<span className={cx(noStyle, styles.footerNote)}>{copy.sheetNote}</span>
				<div className={cx(noStyle, styles.footerActions)}>
					<DoneButton
						cue={eu ? 0 : cue}
						label={copy.done}
						cueLabel={copy.savedCue}
						noStyle={noStyle}
						testId="consent-dialog-sheet-done"
						onClick={popSheet}
					/>
				</div>
			</>
		);
		const status =
			state.announcement && state.announcement.layer === shownSheet.id
				? announcementText(state.announcement)
				: '';
		if (vendorCategory) {
			const categoryTitle = resolveCategoryTitle(translations, vendorCategory);
			const vendorCopy = resolveVendorTableCopy(translations, {
				category: categoryTitle,
				count: 0,
				onCount: 0,
				open: true,
			});
			sheet = (
				<Layer
					layerRef={sheetRef}
					titleRef={sheetTitleRef}
					bodyRef={sheetBodyRef}
					idPrefix={sheetPrefix}
					title={vendorCopy.table}
					intro={copy.vendorSheetIntro}
					closeLabel={vendorCopy.close}
					onClose={popSheet}
					footer={sheetFooter}
					status={status}
					nested
					top
					closing={closing}
					depth={0}
					eu={eu}
					sheetId={shownSheet.id}
					noStyle={noStyle}
				>
					<CategoryGroup
						idPrefix={sheetPrefix}
						testIdPrefix="consent-dialog"
						only={vendorCategory}
						vendors="inline"
						noStyle={noStyle}
						slotKey="dialog.categoryGroup"
						vendorTableSlotKey="dialog.vendorTable"
					/>
				</Layer>
			);
		} else {
			sheet = (
				<Layer
					layerRef={sheetRef}
					titleRef={sheetTitleRef}
					bodyRef={sheetBodyRef}
					idPrefix={sheetPrefix}
					title={copy.preferencesTitle}
					intro={copy.preferencesIntro}
					closeLabel={copy.preferencesClose}
					onClose={popSheet}
					footer={sheetFooter}
					status={status}
					nested
					top
					closing={closing}
					depth={0}
					eu={eu}
					sheetId={shownSheet.id}
					noStyle={noStyle}
				>
					{usCategories(sheetPrefix)}
				</Layer>
			);
		}
	}

	const mainStatus =
		state.announcement?.layer === MAIN_LAYER && state.sheets.length === 0
			? announcementText(state.announcement)
			: '';
	// The GPC note replaces the intro, never both (LAY-04).
	const intro = !eu && gpcLocked ? null : copy.intro;

	return (
		<>
			<SurfaceStyles
				sheets={DIALOG_SHEETS}
				noStyle={noStyle}
			/>
			<div
				ref={backdropRef}
				{...mergeSlotProps(getSlotProps(components, 'dialog.root'), {
					baseClassName: styles.backdrop,
					noStyle,
				})}
				data-edge-style={edgeStyle}
				data-design="privacy-choices"
				data-regime={eu ? 'eu' : 'us'}
				data-layout={phone ? 'phone' : 'desktop'}
				data-testid="consent-dialog-root"
			>
				<Layer
					layerRef={mainRef}
					titleRef={mainTitleRef}
					bodyRef={bodyRef}
					idPrefix={`${prefix}-main`}
					title={copy.title}
					intro={intro}
					closeLabel={copy.close}
					onClose={close}
					footer={
						<>
							{legalLink}
							{eu ? euActions : usActions}
						</>
					}
					status={mainStatus}
					nested={false}
					top={!sheetOpen}
					depth={sheetOpen ? 1 : 0}
					eu={eu}
					noStyle={noStyle}
				>
					{eu ? euBody : usBody}
				</Layer>
				{sheet}
			</div>
		</>
	);
};

/**
 * The Privacy Choices dialog with its own preference draft, so the EU's
 * switches stay staged until Save (EU-02) and the US's apply one by one.
 *
 * @internal
 */
export const PrivacyChoicesDialog = (props: PrivacyChoicesDialogProps) => (
	<ConsentDraftProvider>
		<DialogContent {...props} />
	</ConsentDraftProvider>
);
