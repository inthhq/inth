'use client';

/**
 * The Privacy Choices consent prompt (v6): a Card, Banner or Drawer that
 * shows the same content, copy and decisions in every presentation. The
 * entry modules beside this file (`card.tsx`, `bar.tsx`, `drawer.tsx`)
 * pass the stylesheets of one presentation each, so a page downloads only
 * the presentation it renders.
 */

import {
	commitBannerChoice,
	PHONE_LAYOUT_QUERY,
	resolveOptOutState,
} from '@inth/sdk/engine';
import type {
	BannerCommitAction,
	PresentationAction,
	ResolvedConsentLayout,
	ResolvedConsentPresentation,
} from '@inth/sdk/engine';
import type * as CoreTypes from '@inth/sdk/engine';
import { SURFACE_ROOT_ATTRIBUTE } from '@inth/sdk/runtime/page-globals';
import {
	announcementText,
	defaultTranslationConfig,
	resolveBannerAllowedAnnouncement,
	resolvePrivacyChoicesBannerCopy,
	resolvePrivacyChoicesVariant,
} from '@inth/sdk/surface-state';
import type { PrivacyChoicesPromptVariant } from '@inth/sdk/surface-state';
import {
	afterMotion,
	attachLiveRegion,
	attachPageBlock,
	attachScrollFades,
	attachTopLayerTrap,
} from '@inth/sdk/ui/primitives/surface';
import type { LiveRegion } from '@inth/sdk/ui/primitives/surface';
import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';
import surfaceStyles from '@inth/sdk/ui/styles/components/consent-surface';
import { resolveBrandingTag, tabbableElements } from '@inth/sdk/ui/utils';
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from 'react';
import type { ReactNode, RefObject } from 'react';

import { registerDialogChunkWarmer, warmDialogChunk } from '~/chunk-warming';
import { useTranslations } from '~/component-hooks/use-translations';
import {
	rightsBundleOf,
	useOptOutReceiptData,
	useSurfaceSession,
} from '~/components/privacy-choices/use-surface-session';
import { ConsentButton } from '~/components/shared/primitives/button';
import { InlineLegalLinks } from '~/components/shared/primitives/legal-links';
import type { InlineLegalLinksProps } from '~/components/shared/primitives/legal-links';
import { BrandMarkIcon } from '~/components/shared/ui/logo';
import { toSaveUISource } from '~/context/consent-tracking-context';
import { LocalThemeContext } from '~/context/theme-context';
import { ConsentDraftProvider, useConsentDraftStore } from '~/draft';
import {
	useBranding,
	useDismissNotice,
	useHasConsentUI,
	useModel,
	useSnapshot,
	useTranslations as useKernelTranslations,
} from '~/hooks';
import { useBrowserLayoutEffect } from '~/hooks/use-browser-layout-effect';
import { useIsHydrated } from '~/hooks/use-is-hydrated';
import { useReducedMotion } from '~/hooks/use-reduced-motion';
import { useTextDirection } from '~/hooks/use-text-direction';
import { useKernel } from '~/kernel-selector';
import { useUIConfig } from '~/ui-config-context';
import { createDeferredModule } from '~/utils/deferred-module';
import { inertProps } from '~/utils/inert';
import { getSlotProps, mergeSlotProps } from '~/utils/merge-slot-props';

import {
	SurfaceStyles,
	useSurfaceSheetsReady,
} from '../../shared/surface-styles';
import type { SurfaceStyleSheet } from '../../shared/surface-styles';
import { removeStaticBanner } from '../static-banner-shell';

/**
 * The options, loaded when Customize first opens them, or at once in a
 * side Drawer, which shows them from the start.
 */
const panelModule = createDeferredModule(() => import('./panel'));
const LazyPanel = panelModule.component((module) => module.PrivacyChoicesPanel);

/** Exits are 160ms; the controllers add their own slack. */
const EXIT_MS = 160;

/** Class names of one presentation's sheet (`consent-card`, `consent-bar` or `consent-drawer`). */
export type PresentationStyles = Readonly<Record<string, string>>;

/** What the stock `ConsentBanner` passes on to the Privacy Choices prompt. */
export interface PrivacyChoicesBannerOptions {
	container: NonNullable<ResolvedConsentPresentation['container']>;
	noStyle?: boolean;
	disableAnimation?: boolean;
	legalLinks?: InlineLegalLinksProps['links'];
	hideBranding?: boolean;
	models?: CoreTypes.Model[];
	uiSource?: string;
	title?: ReactNode;
	description?: ReactNode;
	rejectButtonText?: ReactNode;
	acceptButtonText?: ReactNode;
	customizeButtonText?: ReactNode;
	dismissButtonText?: ReactNode;
	/**
	 * The first-layer actions the policy allows, in the host's order and
	 * groups. Absent, every action shows in the default order.
	 */
	actionGroups?: readonly (readonly PresentationAction[])[];
}

interface SurfaceProps extends PrivacyChoicesBannerOptions {
	/** Tokens, buttons, the shell, and this presentation's sheet, in cascade order. */
	sheets: readonly SurfaceStyleSheet[];
	presentation: PresentationStyles;
}

const DEFAULT_MODELS: CoreTypes.Model[] = ['opt-in', 'opt-out'];
const DEFAULT_ACTION_GROUPS: readonly (readonly PresentationAction[])[] = [
	['reject', 'accept'],
	['customize'],
];
const CARD_LINKS: NonNullable<InlineLegalLinksProps['links']> = [
	'privacyPolicy',
	'cookiePolicy',
];

/** Where focus goes after a choice (BNR-06, ARCH-03). */
const RETURN_TARGETS = [
	'[data-testid="privacy-choices-link"]',
	'[data-testid="consent-dialog-trigger"]',
];

const subscribePhone = (listener: () => void) => {
	if (typeof window === 'undefined' || !window.matchMedia) {
		return () => undefined;
	}
	const query = window.matchMedia(PHONE_LAYOUT_QUERY);
	query.addEventListener('change', listener);
	return () => query.removeEventListener('change', listener);
};
const readPhone = () =>
	typeof window !== 'undefined' &&
	typeof window.matchMedia === 'function' &&
	window.matchMedia(PHONE_LAYOUT_QUERY).matches;

/**
 * Whether the phone layout applies. The server renders desktop; the
 * browser switches after hydration, keeping every node (ARCH-01).
 */
const usePhoneLayout = (): boolean =>
	useSyncExternalStore(subscribePhone, readPhone, () => false);

const cx = (noStyle: boolean | undefined, ...names: (string | undefined)[]) =>
	noStyle ? undefined : names.filter(Boolean).join(' ') || undefined;

/** The "Consent by [INTH]" tag (BNR-11, §5). */
const ConsentTag = ({
	noStyle,
	className,
}: {
	noStyle?: boolean;
	/** The presentation sheet's own `.tag` class, which places it. */
	className?: string;
}) => {
	const branding = useBranding();
	const { common } = useTranslations();
	const { components } = useUIConfig();
	const isHydrated = useIsHydrated();
	const tag = resolveBrandingTag({
		branding,
		hostname: isHydrated ? window.location.hostname : undefined,
		noStyle: true,
		styles: {},
		surface: 'banner',
	});
	if (!tag) {
		return null;
	}
	const props = mergeSlotProps(components?.tag?.banner, {
		baseClassName: [surfaceStyles.tag, className],
		noStyle,
	});
	return (
		<a
			{...props}
			href={tag.href}
			target="_blank"
			rel="noreferrer"
			data-branding={tag.brand}
			data-testid="consent-banner-branding"
		>
			<span>{common.securedBy}</span>
			<BrandMarkIcon
				mark={tag.brand === 'inth' ? 'inth' : 'c15t'}
				className={cx(noStyle, surfaceStyles.tagMark)}
			/>
			<span className={cx(noStyle, surfaceStyles.visuallyHidden)}>
				{tag.brand === 'inth' ? 'Inth' : 'c15t'}
			</span>
		</a>
	);
};

/** Move focus to "Your Privacy Choices", or leave it where it is. */
const focusReturnTarget = function focusReturnTarget(): void {
	for (const selector of RETURN_TARGETS) {
		const target = document.querySelector<HTMLElement>(selector);
		if (target) {
			target.focus({ preventScroll: true });
			return;
		}
	}
};

/** One `role="status"` region, kept by a controller for its lifetime. */
const useLiveRegion = function useLiveRegion(
	ref: RefObject<HTMLElement | null>
): RefObject<LiveRegion | null> {
	const region = useRef<LiveRegion | null>(null);
	useEffect(() => {
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
	return region;
};

type Phase = 'hidden' | 'shown' | 'leaving';

// oxlint-disable-next-line max-lines-per-function, complexity -- One component owns the prompt's lifecycle, focus and keys so they stay in step.
const SurfaceContent = ({
	container,
	sheets,
	presentation,
	noStyle,
	disableAnimation,
	legalLinks,
	hideBranding,
	models = DEFAULT_MODELS,
	uiSource,
	title,
	description,
	rejectButtonText,
	acceptButtonText,
	customizeButtonText,
	dismissButtonText,
	actionGroups = DEFAULT_ACTION_GROUPS,
}: SurfaceProps) => {
	const kernel = useKernel();
	const snapshot = useSnapshot();
	const hasConsentUI = useHasConsentUI();
	const model = useModel() ?? 'opt-in';
	const translations = useTranslations();
	const kernelTranslations = useKernelTranslations();
	const textDirection = useTextDirection(
		kernelTranslations?.language ?? defaultTranslationConfig.defaultLanguage
	);
	const { components } = useUIConfig();
	const { session, state } = useSurfaceSession();
	const receiptData = useOptOutReceiptData();
	const dismissNotice = useDismissNotice();
	const draft = useConsentDraftStore();
	const phone = usePhoneLayout();
	const reducedMotion = useReducedMotion();
	const sheetsReady = useSurfaceSheetsReady(sheets, noStyle);
	const layout: ResolvedConsentLayout = phone
		? container.phone
		: container.desktop;
	const variant: PrivacyChoicesPromptVariant = resolvePrivacyChoicesVariant(
		snapshot.policyRule
	);
	const activeUI = snapshot.activeUI ?? 'none';
	const wantsShow =
		sheetsReady &&
		hasConsentUI &&
		activeUI === 'banner' &&
		models.includes(model) &&
		variant !== 'none';

	const [phase, setPhase] = useState<Phase>(wantsShow ? 'shown' : 'hidden');
	const [panelReady, setPanelReady] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const shellRef = useRef<HTMLDivElement>(null);
	const cardRef = useRef<HTMLElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const expandRef = useRef<HTMLButtonElement>(null);
	const pageRegionRef = useRef<HTMLDivElement>(null);
	const pageRegion = useLiveRegion(pageRegionRef);
	/** A choice was made here: release, announce and return focus as the prompt leaves. */
	const committed = useRef<string | null>(null);
	const pendingPanelFocus = useRef(false);
	/** Folding the options returns focus to Customize once it renders again. */
	const pendingExpandFocus = useRef(false);
	const id = useId().replace(/:/gu, '');
	const ids = {
		panel: `inth-pc-${id}-panel`,
		title: `inth-pc-${id}-title`,
	};

	const allInOne = layout.flow === 'all-in-one';
	const bar = layout.type === 'banner';
	const expanded = !allInOne && state.expanded;
	const barCollapsed = bar && !expanded;
	const showing = phase !== 'hidden';
	const blocking = layout.blocking && phase === 'shown';
	const optionsOpen = allInOne || expanded;
	const [panelWanted, setPanelWanted] = useState(allInOne);
	const wantPanel = panelWanted || optionsOpen;

	// Follow the kernel, while rendering. Opening the dialog removes the
	// prompt at once, even mid-exit (PERM-05); any other end plays the exit,
	// unless there is no motion to play.
	let nextPhase: Phase = phase;
	if (wantsShow) {
		nextPhase = 'shown';
	} else if (phase === 'shown') {
		nextPhase =
			activeUI === 'dialog' || disableAnimation === true || reducedMotion
				? 'hidden'
				: 'leaving';
	} else if (phase === 'leaving' && activeUI === 'dialog') {
		nextPhase = 'hidden';
	}
	if (nextPhase !== phase) {
		setPhase(nextPhase);
	}

	// Before the browser paints this prompt, so it and the static banner
	// from `index.html` never show together.
	useBrowserLayoutEffect(() => {
		if (wantsShow) {
			removeStaticBanner();
		}
	}, [wantsShow]);

	// All-in-one has nothing to fold. An expansion left from the phone
	// Drawer would reopen when the viewport narrows again, and Escape would
	// spend a press folding it with no Customize to focus (PERM-13).
	useEffect(() => {
		if (!allInOne) {
			return;
		}
		pendingExpandFocus.current = false;
		if (state.expanded) {
			session.collapse();
		}
	}, [allInOne, state.expanded, session]);

	useEffect(() => {
		if (phase !== 'leaving' || !rootRef.current) {
			return;
		}
		return afterMotion(
			rootRef.current.querySelector('*') ?? rootRef.current,
			() => setPhase('hidden'),
			{
				duration: EXIT_MS,
				reducedMotion,
			}
		);
	}, [phase, reducedMotion]);

	// After a choice: the page is released, the outcome is announced in the
	// page's status region, and focus moves to "Your Privacy Choices"
	// (BNR-06). Not when the dialog took over.
	useEffect(() => {
		if (phase === 'shown' || committed.current === null) {
			return;
		}
		const message = committed.current;
		committed.current = null;
		if (activeUI === 'dialog') {
			return;
		}
		if (message) {
			pageRegion.current?.announce(message);
		}
		const active = document.activeElement;
		if (
			!active ||
			active === document.body ||
			rootRef.current?.contains(active)
		) {
			focusReturnTarget();
		}
	}, [phase, activeUI, pageRegion]);

	// Blocking (BNR-13): the shell, card and tag together, is the modal
	// boundary (PERM-08). Focus moves to the card and stays in the shell.
	useEffect(() => {
		const root = rootRef.current;
		const shell = shellRef.current;
		if (!(blocking && root && shell)) {
			return;
		}
		const release = attachPageBlock(root);
		const untrap = attachTopLayerTrap(shell, {
			initialFocus: cardRef.current ?? 'first-tabbable',
		});
		return () => {
			untrap();
			release();
		};
	}, [blocking]);

	// Escape folds the options or closes a confirmation, never the prompt
	// (PERM-03, PERM-15).
	useEffect(() => {
		if (phase !== 'shown') {
			return;
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape' || event.defaultPrevented) {
				return;
			}
			const shell = shellRef.current;
			const outcome = session.escape({
				blocking: layout.blocking,
				focusInside: Boolean(shell?.contains(document.activeElement)),
			});
			if (outcome === 'ignore') {
				return;
			}
			event.preventDefault();
			if (outcome === 'collapse') {
				pendingExpandFocus.current = true;
			}
		};
		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	}, [phase, session, layout.blocking]);

	// The options load with Customize; warm them on intent and with the
	// dialog's idle warming while the prompt shows.
	useEffect(() => {
		if (phase !== 'shown' || allInOne) {
			return;
		}
		return registerDialogChunkWarmer(() => {
			void panelModule.preload();
		});
	}, [phase, allInOne]);

	// The first control of the options takes focus once they render.
	useEffect(() => {
		if (!(expanded && panelReady && pendingPanelFocus.current)) {
			return;
		}
		pendingPanelFocus.current = false;
		// The panel's own rules arrive with it, and its content becomes
		// visible as they apply; try again for a few frames until it can
		// take focus.
		let frames = 0;
		let handle = 0;
		const focusFirst = () => {
			const first = scrollRef.current
				? tabbableElements(scrollRef.current)[0]
				: undefined;
			first?.focus({ preventScroll: true });
			if (!first || document.activeElement !== first) {
				frames += 1;
				if (frames < 20) {
					handle = requestAnimationFrame(focusFirst);
				}
			}
		};
		focusFirst();
		return () => cancelAnimationFrame(handle);
	}, [expanded, panelReady]);

	useEffect(() => {
		if (!expanded && pendingExpandFocus.current) {
			pendingExpandFocus.current = false;
			expandRef.current?.focus({ preventScroll: true });
		}
	}, [expanded]);

	// Scroll-edge fades (LAY-08) on whichever scroll area shows.
	useEffect(() => {
		const area = scrollRef.current;
		if (!(area && optionsOpen && panelReady)) {
			return;
		}
		return attachScrollFades(area);
	}, [optionsOpen, panelReady]);

	const onPanelReady = useCallback(() => setPanelReady(true), []);

	const bundle = rightsBundleOf(snapshot, receiptData);
	const gpc = resolveOptOutState(snapshot).lock === 'gpc-active';
	const copy = resolvePrivacyChoicesBannerCopy(translations, {
		bundle,
		gpc,
		variant,
	});
	const saveSource = toSaveUISource(uiSource ?? 'banner');

	const commit = (action: BannerCommitAction) => {
		const { plan } = commitBannerChoice(kernel, action, {
			draft: action === 'save' ? draft : undefined,
			uiSource: saveSource,
		});
		let message = copy.saved;
		if (action === 'refuse') {
			message = copy.rejected;
		} else if (plan.keptOff !== null) {
			message = resolveBannerAllowedAnnouncement(translations, {
				bundle,
				gpc: plan.keptOff === 'gpc',
			});
		}
		committed.current = message;
	};
	const acknowledge = () => {
		committed.current = '';
		session.commit();
		void dismissNotice();
	};
	const expand = () => {
		void panelModule.preload();
		setPanelWanted(true);
		pendingPanelFocus.current = true;
		session.expand();
		session.announce(copy.expanded);
	};
	const warm = () => {
		void panelModule.preload();
		warmDialogChunk();
	};

	// The page's status region outlives the prompt, so the outcome of a
	// choice is read after the prompt leaves (BNR-06). It keeps its node.
	const pageStatus = (
		<div
			ref={pageRegionRef}
			className={surfaceStyles.visuallyHidden}
			data-testid="consent-banner-announcement"
		/>
	);
	if (!showing) {
		return (
			<>
				{pageStatus}
				{null}
			</>
		);
	}

	const rootProps = mergeSlotProps(getSlotProps(components, 'banner.root'), {
		baseClassName: [surfaceStyles.root, presentation.root],
		noStyle,
	});
	const notice = variant === 'notice';
	// The policy's first-layer actions, in the host's order. A notice's
	// "Your Privacy Choices" is the opt-out right, not an action, so it stays.
	const summaryGroups = actionGroups
		.map((group) =>
			group.filter(
				(action) =>
					action === 'reject' || action === 'accept' || action === 'customize'
			)
		)
		.filter((group) => group.length > 0);
	const summaryActions = summaryGroups.flat();
	const links = legalLinks === undefined ? CARD_LINKS : legalLinks;
	const barLinks = links?.filter((key) => key === 'privacyPolicy') ?? null;

	const expandButton = (label: ReactNode, inBar: boolean) => (
		<ConsentButton
			key="customize"
			ref={expandRef}
			action="custom-consent"
			performDefaultAction={false}
			consentAction="customize"
			isPrimary={!notice}
			variant={notice ? 'neutral' : undefined}
			mode={notice ? 'ghost' : undefined}
			aria-expanded={expanded}
			// The collapsed bar has no panel to point at (PERM-09).
			aria-controls={inBar ? undefined : ids.panel}
			data-testid={
				notice
					? 'consent-banner-right-link-opt-out'
					: 'consent-banner-customize-button'
			}
			onClick={expand}
			onFocus={warm}
			onPointerEnter={warm}
		>
			{label}
		</ConsentButton>
	);
	const refuseButton = (label: ReactNode) => (
		<ConsentButton
			key="reject"
			action="custom-consent"
			performDefaultAction={false}
			consentAction="reject"
			isPrimary={false}
			data-testid="consent-banner-reject-button"
			onClick={() => commit('refuse')}
		>
			{rejectButtonText ?? label}
		</ConsentButton>
	);
	const allowButton = (label: ReactNode) => (
		<ConsentButton
			key="accept"
			action="custom-consent"
			performDefaultAction={false}
			consentAction="accept"
			isPrimary={false}
			data-testid="consent-banner-accept-button"
			onClick={() => commit('allow')}
		>
			{acceptButtonText ?? label}
		</ConsentButton>
	);
	const okButton = (
		<ConsentButton
			action="custom-consent"
			performDefaultAction={false}
			consentAction="dismiss"
			isPrimary
			data-testid="consent-banner-dismiss-button"
			onClick={acknowledge}
		>
			{dismissButtonText ?? copy.ok}
		</ConsentButton>
	);
	const saveButton = (
		<ConsentButton
			action="custom-consent"
			performDefaultAction={false}
			consentAction="save"
			isPrimary
			slotKey="banner.saveButton"
			data-testid="consent-banner-save-button"
			onClick={() => commit('save')}
		>
			{copy.save}
		</ConsentButton>
	);
	const actionGroup = (children: ReactNode, key?: string) => (
		<div
			key={key}
			{...mergeSlotProps(getSlotProps(components, 'banner.actionGroup'), {
				baseClassName: surfaceStyles.actionGroup,
				noStyle,
			})}
			data-testid="consent-banner-footer-sub-group"
		>
			{children}
		</div>
	);

	const summaryButton = (action: PresentationAction, inBar: boolean) => {
		if (action === 'reject') {
			return refuseButton(copy.reject);
		}
		if (action === 'accept') {
			return allowButton(copy.accept);
		}
		return expandButton(
			customizeButtonText ?? (inBar ? copy.expandBar : copy.expand),
			inBar
		);
	};

	let footerContent: ReactNode;
	if (optionsOpen) {
		footerContent = notice ? (
			okButton
		) : (
			<>
				{actionGroup(
					<>
						{refuseButton(copy.rejectExpanded)}
						{allowButton(copy.acceptExpanded)}
					</>
				)}
				{saveButton}
			</>
		);
	} else if (notice) {
		footerContent = (
			<>
				{expandButton(customizeButtonText ?? copy.expand, false)}
				{okButton}
			</>
		);
	} else {
		footerContent = summaryGroups.map((group) => {
			const buttons = group.map((action) => summaryButton(action, false));
			return group.length > 1
				? actionGroup(buttons, group.join('-'))
				: buttons[0];
		});
	}

	const tag = hideBranding ? null : (
		<ConsentTag
			noStyle={noStyle}
			className={presentation.tag}
		/>
	);
	const panel = wantPanel ? (
		<LazyPanel
			variant={variant}
			idPrefix={`inth-pc-${id}`}
			uiSource={saveSource}
			noStyle={noStyle}
			onReady={onPanelReady}
		/>
	) : null;
	const scroll = (
		<div
			ref={scrollRef}
			className={cx(noStyle, expandStyles.scroll)}
			data-testid="consent-banner-body"
		>
			{panel}
		</div>
	);
	const status = (
		<output
			className={cx(noStyle, surfaceStyles.visuallyHidden)}
			aria-live="polite"
			aria-atomic="true"
			data-testid="consent-banner-status"
		>
			{announcementText(state.announcement)}
		</output>
	);

	let body: ReactNode;
	if (barCollapsed) {
		body = (
			<>
				<h2
					{...mergeSlotProps(getSlotProps(components, 'banner.title'), {
						baseClassName: surfaceStyles.visuallyHidden,
						noStyle,
					})}
					id={ids.title}
					data-testid="consent-banner-title"
				>
					{title ?? copy.title}
				</h2>
				<div className={cx(noStyle, presentation.row)}>
					<p
						{...mergeSlotProps(getSlotProps(components, 'description.banner'), {
							baseClassName: presentation.text,
							noStyle,
						})}
						data-testid="consent-banner-description"
					>
						{description ?? copy.barDescription}
						<InlineLegalLinks
							links={barLinks}
							context="banner"
							testIdPrefix="consent-banner-legal-link"
						/>
					</p>
					<div
						{...mergeSlotProps(getSlotProps(components, 'banner.footer'), {
							baseClassName: presentation.actions,
							noStyle,
						})}
						data-testid="consent-banner-footer"
					>
						{notice ? (
							<>
								{expandButton(customizeButtonText ?? copy.expandBar, true)}
								{okButton}
							</>
						) : (
							summaryActions.map((action) => summaryButton(action, true))
						)}
					</div>
				</div>
				{status}
			</>
		);
	} else {
		body = (
			<>
				<div
					{...mergeSlotProps(getSlotProps(components, 'banner.header'), {
						baseClassName: [surfaceStyles.head, presentation.head],
						noStyle,
					})}
					data-testid="consent-banner-header"
				>
					<h2
						{...mergeSlotProps(getSlotProps(components, 'banner.title'), {
							baseClassName: surfaceStyles.title,
							noStyle,
						})}
						id={ids.title}
						data-testid="consent-banner-title"
					>
						{title ?? copy.title}
					</h2>
					<p
						{...mergeSlotProps(getSlotProps(components, 'description.banner'), {
							baseClassName: surfaceStyles.description,
							noStyle,
						})}
						data-testid="consent-banner-description"
					>
						{description ?? copy.description}
						<InlineLegalLinks
							links={links}
							context="banner"
							testIdPrefix="consent-banner-legal-link"
						/>
					</p>
				</div>
				{allInOne ? (
					<div
						{...mergeSlotProps(getSlotProps(components, 'banner.expand'), {
							baseClassName: presentation.body,
							noStyle,
						})}
						data-testid="consent-banner-expand-panel"
					>
						{scroll}
						{tag ? (
							<div className={cx(noStyle, presentation.tagSlot)}>{tag}</div>
						) : null}
					</div>
				) : (
					<div
						{...mergeSlotProps(getSlotProps(components, 'banner.expand'), {
							baseClassName: expandStyles.panel,
							noStyle,
						})}
						id={ids.panel}
						data-open={expanded}
						{...inertProps(!expanded)}
						data-testid="consent-banner-expand-panel"
					>
						<div className={cx(noStyle, expandStyles.inner)}>{scroll}</div>
					</div>
				)}
				{status}
				<div
					{...mergeSlotProps(getSlotProps(components, 'banner.footer'), {
						baseClassName: [surfaceStyles.footer, presentation.footer],
						noStyle,
					})}
					data-testid="consent-banner-footer"
				>
					{footerContent}
				</div>
			</>
		);
	}

	return (
		<>
			{pageStatus}
			<>
				<SurfaceStyles
					sheets={sheets}
					noStyle={noStyle}
				/>
				<div
					ref={rootRef}
					{...rootProps}
					data-placement={layout.placement}
					data-flow={layout.flow}
					data-edge-style={layout.edgeStyle}
					data-blocking={layout.blocking ? 'true' : undefined}
					data-expanded={expanded ? 'true' : undefined}
					data-state={phase === 'leaving' ? 'closed' : 'open'}
					data-variant={variant}
					data-design="privacy-choices"
					data-animation={disableAnimation ? 'off' : undefined}
					data-testid="consent-banner-root"
					{...{ [SURFACE_ROOT_ATTRIBUTE]: 'banner' }}
					dir={textDirection}
					// A prompt on its way out takes no input (PERM-05).
					{...inertProps(phase === 'leaving')}
				>
					{layout.blocking ? (
						<div
							{...mergeSlotProps(getSlotProps(components, 'banner.overlay'), {
								baseClassName: surfaceStyles.scrim,
								noStyle,
							})}
							aria-hidden="true"
							data-testid="consent-banner-overlay"
						/>
					) : null}
					<div
						ref={shellRef}
						{...mergeSlotProps(getSlotProps(components, 'banner.cardShell'), {
							baseClassName: [surfaceStyles.shell, presentation.shell],
							noStyle,
						})}
						role={layout.blocking ? 'dialog' : undefined}
						aria-modal={layout.blocking ? true : undefined}
						aria-labelledby={layout.blocking ? ids.title : undefined}
						data-testid="consent-banner-shell"
					>
						{allInOne ? null : tag}
						<section
							ref={cardRef}
							{...mergeSlotProps(getSlotProps(components, 'banner.card'), {
								baseClassName: [surfaceStyles.card, presentation.card],
								noStyle,
							})}
							// Blocking moves the dialog role to the shell (PERM-08).
							role={layout.blocking ? undefined : 'region'}
							aria-labelledby={layout.blocking ? undefined : ids.title}
							tabIndex={-1}
							data-testid="consent-banner-card"
						>
							{body}
						</section>
					</div>
				</div>
			</>
		</>
	);
};

/**
 * The Privacy Choices prompt for one presentation. Its own draft backs the
 * category switches, so Save records exactly what the options show.
 *
 * @internal
 */
export const PrivacyChoicesSurface = (props: SurfaceProps) => {
	const { noStyle, disableAnimation } = props;
	// The stock buttons read `noStyle` from here, as under the classic root.
	const theme = useMemo(
		() => ({ disableAnimation, noStyle }),
		[disableAnimation, noStyle]
	);
	return (
		<LocalThemeContext.Provider value={theme}>
			<ConsentDraftProvider>
				<SurfaceContent {...props} />
			</ConsentDraftProvider>
		</LocalThemeContext.Provider>
	);
};
