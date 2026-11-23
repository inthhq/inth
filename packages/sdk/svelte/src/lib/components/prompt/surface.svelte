<script
	lang="ts"
	module
>
	import type PanelComponent from './panel.svelte';

	let pendingPanel: Promise<typeof PanelComponent> | null = null;

	/**
	 * The options, loaded when Customize first opens them, or at once in a
	 * side Drawer, which shows them from the start. One import shared by
	 * every prompt; a failed import is forgotten, so the next try repeats it.
	 */
	const loadPanel = function loadPanel(): Promise<typeof PanelComponent> {
		pendingPanel ??= (async () => {
			try {
				return (await import('./panel.svelte')).default;
			} catch (error) {
				pendingPanel = null;
				throw error;
			}
		})();
		return pendingPanel;
	};

	/** Start loading the options; a failure waits for the next try. */
	const preloadPanel = async function preloadPanel(): Promise<void> {
		try {
			await loadPanel();
		} catch {
			// The next warm or Customize retries the import.
		}
	};

	/** Where focus goes after a choice (BNR-06, ARCH-03). */
	const RETURN_TARGETS = [
		'[data-testid="privacy-choices-link"]',
		'[data-testid="consent-dialog-trigger"]',
	];

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

	/** Exits are 160ms; the controllers add their own slack. */
	const EXIT_MS = 160;
</script>

<script lang="ts">
	/**
	 * The consent prompt: a Card, Banner or Drawer that
	 * shows the same content, copy and decisions in every presentation. The
	 * stylesheets of one presentation reach the page, so it downloads only
	 * the presentation it renders. Its own draft backs the category
	 * switches, so Save records exactly what the options show.
	 */
	import { commitBannerChoice, resolveOptOutState } from '@inth/sdk/engine';
	import type {
		BannerCommitAction,
		LegalLinks as LegalLinksType,
		Model,
		PresentationAction,
		ResolvedConsentPresentation,
	} from '@inth/sdk/engine';
	import { SURFACE_ROOT_ATTRIBUTE } from '@inth/sdk/runtime/page-globals';
	import type { EarlyConsentTap } from '@inth/sdk/runtime/page-globals';
	import {
		EARLY_CONSENT_TAP_SCRIPT,
		replayEarlyConsentTaps,
	} from '@inth/sdk/surface-actions';
	import {
		announcementText,
		resolveBannerAllowedAnnouncement,
		resolvePrivacyChoicesBannerCopy,
		resolvePrivacyChoicesVariant,
	} from '@inth/sdk/surface-state';
	import {
		afterMotion,
		attachLiveRegion,
		attachPageBlock,
		attachScrollFades,
		attachTopLayerTrap,
	} from '@inth/sdk/ui/primitives/surface';
	import type { LiveRegion } from '@inth/sdk/ui/primitives/surface';
	import barStyles from '@inth/sdk/ui/styles/components/consent-banner';
	import cardStyles from '@inth/sdk/ui/styles/components/consent-card';
	import drawerStyles from '@inth/sdk/ui/styles/components/consent-drawer';
	import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';
	import surfaceStyles from '@inth/sdk/ui/styles/components/consent-surface';
	import { resolveActionAppearance } from '@inth/sdk/ui/theme';
	import { resolveBrandingTag, tabbableElements } from '@inth/sdk/ui/utils';
	import { getTextDirection } from '@inth/sdk/ui/utils/text-direction';
	import { onMount, untrack } from 'svelte';

	import { getConsentContext, getThemeContext } from '../../context.svelte';
	import { registerDialogWarmer, warmDialog } from '../../dialog-warming';
	import ConsentButton from '../action-button.svelte';
	import BrandMark from '../icons/brand-mark.svelte';
	import InlineLegalLinks from '../inline-legal-links.svelte';
	import { createSurfaceDraft } from '../parts/draft.svelte';
	import { cx, part } from '../parts/parts';
	import {
		rightsBundleOf,
		useOptOutReceiptData,
		usePhoneLayout,
		useReducedMotion,
		useSurfaceSession,
	} from '../parts/session.svelte';
	import SurfaceStyles from '../surface-styles.svelte';
	import { presentationSheets } from './sheets';

	type Phase = 'hidden' | 'shown' | 'leaving';

	const DEFAULT_MODELS: Model[] = ['opt-in', 'opt-out'];
	const DEFAULT_ACTION_GROUPS: readonly (readonly PresentationAction[])[] = [
		['reject', 'accept'],
		['customize'],
	];
	const CARD_LINKS: (keyof LegalLinksType)[] = [
		'privacyPolicy',
		'cookiePolicy',
	];

	let {
		container,
		noStyle = false,
		disableAnimation: localDisableAnimation,
		legalLinks,
		hideBranding = false,
		models = DEFAULT_MODELS,
		title,
		description,
		rejectButtonText,
		acceptButtonText,
		customizeButtonText,
		dismissButtonText,
		actionGroups = DEFAULT_ACTION_GROUPS,
		class: className,
	}: {
		container: NonNullable<ResolvedConsentPresentation['container']>;
		noStyle?: boolean;
		disableAnimation?: boolean;
		legalLinks?: (keyof LegalLinksType)[] | null;
		hideBranding?: boolean;
		models?: Model[];
		title?: string;
		description?: string;
		rejectButtonText?: string;
		acceptButtonText?: string;
		customizeButtonText?: string;
		dismissButtonText?: string;
		/**
		 * The first-layer actions the policy allows, in the host's order and
		 * groups. Absent, every action shows in the default order.
		 */
		actionGroups?: readonly (readonly PresentationAction[])[];
		/** `ConsentBanner`'s `class`, merged into the root's `consentBanner` slot. */
		class?: string;
	} = $props();

	const consent = getConsentContext();
	const theme = getThemeContext();
	const surface = useSurfaceSession();
	const receiptData = useOptOutReceiptData();
	const phoneLayout = usePhoneLayout();
	const systemMotion = useReducedMotion();
	const surfaceDraft = createSurfaceDraft();
	const uid = $props.id();
	const ids = {
		panel: `inth-pc-${uid}-panel`,
		prefix: `inth-pc-${uid}`,
		title: `inth-pc-${uid}-title`,
	};
	const saveSource = 'banner';

	const snapshot = $derived(consent.snapshot);
	const translations = $derived(consent.state.copy);
	const layout = $derived(
		phoneLayout.phone ? container.phone : container.desktop
	);
	const presentation: Readonly<Record<string, string>> = $derived.by(() => {
		switch (container.desktop.type) {
			case 'banner':
				return barStyles;
			case 'drawer':
				return drawerStyles;
			default:
				return cardStyles;
		}
	});
	const sheets = $derived(presentationSheets(container.desktop.type));
	const activeUI = $derived(snapshot.activeUI ?? 'none');
	// The kernel's effective model, as React reads it: a policy that is
	// not `iab` keeps its own model while an IAB vendor list is loaded.
	const model = $derived(
		(snapshot.resolution.status === 'matched' ? snapshot.model : null) ??
			'opt-in'
	);
	// The effective model: an `iab` rule whose vendor list is unavailable
	// falls back to the standard opt-in prompt.
	const variant = $derived(
		resolvePrivacyChoicesVariant({ ...snapshot.policyRule, model })
	);
	const wantsShow = $derived(
		consent.state.hasConsentUi &&
			activeUI === 'banner' &&
			models.includes(model) &&
			variant !== 'none'
	);
	// The component's own setting wins over the provider's.
	const animationOff = $derived(
		localDisableAnimation ?? theme.disableAnimation ?? false
	);
	// The system setting counts even when the host turned animation on, as
	// in React: a prompt that should not move never plays its exit.
	const noMotion = $derived(animationOff || systemMotion.reduced);
	const textDirection = $derived(
		getTextDirection(consent.state.translations?.language)
	);

	let phase = $state<Phase>(untrack(() => (wantsShow ? 'shown' : 'hidden')));
	let panelReady = $state(false);
	let Panel = $state<typeof PanelComponent | null>(null);

	let rootEl = $state<HTMLDivElement | null>(null);
	let shellEl = $state<HTMLDivElement | null>(null);
	let cardEl = $state<HTMLElement | null>(null);
	let scrollEl = $state<HTMLDivElement | null>(null);
	let expandEl = $state<HTMLButtonElement | null>(null);
	let pageRegionEl = $state<HTMLDivElement | null>(null);
	let pageRegion: LiveRegion | null = null;
	/** A choice was made here: release, announce and return focus as the prompt leaves. */
	let committed: string | null = null;
	let pendingPanelFocus = false;
	/** Folding the options returns focus to Customize once it renders again. */
	let pendingExpandFocus = false;

	const allInOne = $derived(layout.flow === 'all-in-one');
	const bar = $derived(layout.type === 'banner');
	const expanded = $derived(!allInOne && surface.state.expanded);
	const barCollapsed = $derived(bar && !expanded);
	const showing = $derived(phase !== 'hidden');
	const blocking = $derived(layout.blocking && phase === 'shown');
	const optionsOpen = $derived(allInOne || expanded);
	let panelWanted = $state(false);
	const wantPanel = $derived(panelWanted || optionsOpen);

	// Follow the kernel. Opening the dialog removes the prompt at once, even
	// mid-exit (PERM-05); any other end plays the exit, unless there is no
	// motion to play.
	$effect.pre(() => {
		const want = wantsShow;
		const ui = activeUI;
		const still = noMotion;
		untrack(() => {
			let next: Phase = phase;
			if (want) {
				next = 'shown';
			} else if (phase === 'shown') {
				next = ui === 'dialog' || still ? 'hidden' : 'leaving';
			} else if (phase === 'leaving' && ui === 'dialog') {
				next = 'hidden';
			}
			if (next !== phase) {
				phase = next;
			}
		});
	});

	// All-in-one has nothing to fold. An expansion left from the phone
	// Drawer would reopen when the viewport narrows again, and Escape would
	// spend a press folding it with no Customize to focus (PERM-13).
	$effect(() => {
		if (!allInOne) {
			return;
		}
		pendingExpandFocus = false;
		if (surface.state.expanded) {
			untrack(() => surface.session.collapse());
		}
	});

	$effect(() => {
		const root = rootEl;
		if (phase !== 'leaving' || !root) {
			return;
		}
		return afterMotion(
			root.querySelector('*') ?? root,
			() => {
				phase = 'hidden';
			},
			{ duration: EXIT_MS, reducedMotion: untrack(() => noMotion) }
		);
	});

	// The page's status region outlives the prompt, so the outcome of a
	// choice is read after the prompt leaves (BNR-06).
	$effect(() => {
		const element = pageRegionEl;
		if (!element) {
			return;
		}
		const controller = attachLiveRegion(element);
		pageRegion = controller;
		return () => {
			controller();
			pageRegion = null;
		};
	});

	// Blocking (BNR-13): the shell, card and tag together, is the modal
	// boundary (PERM-08). Focus moves to the card and stays in the shell.
	// Declared before the focus return below: Svelte tears an effect down
	// when it re-runs, in order, and focus can't land on an inert page.
	$effect(() => {
		const root = rootEl;
		const shell = shellEl;
		if (!(blocking && root && shell)) {
			return;
		}
		const card = untrack(() => cardEl);
		const release = attachPageBlock(root);
		const untrap = attachTopLayerTrap(shell, {
			initialFocus: card ?? 'first-tabbable',
		});
		return () => {
			untrap();
			release();
		};
	});

	// After a choice: the page is released, the outcome is announced in the
	// page's status region, and focus moves to "Your Privacy Choices"
	// (BNR-06). Not when the dialog took over.
	$effect(() => {
		const current = phase;
		const ui = activeUI;
		untrack(() => {
			if (current === 'shown' || committed === null) {
				return;
			}
			const message = committed;
			committed = null;
			if (ui === 'dialog') {
				return;
			}
			if (message) {
				pageRegion?.announce(message);
			}
			const active = document.activeElement;
			if (!active || active === document.body || rootEl?.contains(active)) {
				focusReturnTarget();
			}
		});
	});

	// Escape folds the options or closes a confirmation, never the prompt
	// (PERM-03, PERM-15).
	$effect(() => {
		if (phase !== 'shown') {
			return;
		}
		const { session } = surface;
		const layoutBlocking = layout.blocking;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape' || event.defaultPrevented) {
				return;
			}
			const outcome = session.escape({
				blocking: layoutBlocking,
				focusInside: Boolean(shellEl?.contains(document.activeElement)),
			});
			if (outcome === 'ignore') {
				return;
			}
			event.preventDefault();
			if (outcome === 'collapse') {
				pendingExpandFocus = true;
			}
		};
		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	});

	// A failed load leaves the options empty, so the next trigger (a warm,
	// Customize, or the prompt showing again) loads them again. Only the
	// latest load fills them.
	let panelAttempt = $state(0);
	let panelFailed = false;
	const retryPanel = function retryPanel() {
		if (panelFailed) {
			panelFailed = false;
			panelAttempt += 1;
		}
	};
	$effect(() => {
		if (phase === 'shown') {
			untrack(retryPanel);
		}
	});

	// The options load with Customize; warm them on intent and with the
	// dialog's idle warming while the prompt shows.
	$effect(() => {
		if (phase !== 'shown' || allInOne) {
			return;
		}
		return registerDialogWarmer(() => {
			void preloadPanel();
			retryPanel();
		});
	});

	$effect(() => {
		// Read so each retry starts a new load.
		void panelAttempt;
		if (!wantPanel || Panel) {
			return;
		}
		let active = true;
		const fill = async () => {
			try {
				const loaded = await loadPanel();
				if (active) {
					Panel = loaded;
				}
			} catch {
				if (active) {
					panelFailed = true;
				}
			}
		};
		void fill();
		return () => {
			active = false;
		};
	});

	// The first control of the options takes focus once they render.
	$effect(() => {
		if (!(expanded && panelReady && pendingPanelFocus)) {
			return;
		}
		pendingPanelFocus = false;
		// The panel's own rules arrive with it, and its content becomes
		// visible as they apply; try again for a few frames until it can
		// take focus.
		let frames = 0;
		let handle = 0;
		const focusFirst = () => {
			const first = scrollEl ? tabbableElements(scrollEl)[0] : undefined;
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
	});

	$effect(() => {
		if (!expanded && pendingExpandFocus) {
			pendingExpandFocus = false;
			untrack(() => expandEl)?.focus({ preventScroll: true });
		}
	});

	// Scroll-edge fades (LAY-08) on whichever scroll area shows.
	$effect(() => {
		const area = scrollEl;
		if (!(area && optionsOpen && panelReady)) {
			return;
		}
		return attachScrollFades(area);
	});

	const onPanelReady = () => {
		panelReady = true;
	};

	const bundle = $derived(rightsBundleOf(snapshot, receiptData.current));
	const gpc = $derived(resolveOptOutState(snapshot).lock === 'gpc-active');
	const copy = $derived(
		resolvePrivacyChoicesBannerCopy(translations, { bundle, gpc, variant })
	);

	const commit = function commit(
		action: BannerCommitAction,
		actionAt?: number
	) {
		const { plan } = commitBannerChoice(consent.kernel, action, {
			actionAt,
			draft: action === 'save' ? (surfaceDraft.draft ?? undefined) : undefined,
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
		committed = message;
	};
	const acknowledge = function acknowledge(actionAt?: number) {
		committed = '';
		surface.session.commit();
		// The kernel's command, which takes the time of a replayed tap.
		void consent.kernel.commands.dismissNotice(
			actionAt === undefined ? undefined : { actionAt }
		);
	};
	const expand = function expand() {
		void preloadPanel();
		retryPanel();
		panelWanted = true;
		pendingPanelFocus = true;
		surface.session.expand();
		surface.session.announce(copy.expanded);
	};
	const warm = function warm() {
		void preloadPanel();
		retryPanel();
		warmDialog();
	};

	// The script that holds a tap on the server-rendered prompt made before
	// hydration. The browser renders the same markup, so hydration adopts
	// it; a script the browser inserts never runs. `inthHandle` gives it the
	// page's nonce when the provider has none.
	const earlyTapMarkup = `<script data-inth-early-tap${
		theme.nonce ? ` nonce="${theme.nonce.replaceAll('"', '&quot;')}"` : ''
	}>${EARLY_CONSENT_TAP_SCRIPT}</${'script'}>`;

	// A tap on the server-rendered prompt before it hydrated, which the
	// inline script held. It replays through this prompt's own handlers once
	// the engine has started and the policy resolved, so a choice commits
	// through this prompt's plan and Customize opens the options in place.
	// A choice records the time of the tap.
	const replayTap = function replayTap(tap: EarlyConsentTap) {
		if (tap.action === 'accept') {
			commit('allow', tap.at);
		} else if (tap.action === 'reject') {
			commit('refuse', tap.at);
		} else if (tap.action === 'dismiss') {
			acknowledge(tap.at);
		} else if (tap.action === 'customize' && !allInOne) {
			expand();
		}
	};

	// From here the prompt's own handlers work: stop the script, and replay
	// its tap once the runtime has started, which the provider does after
	// its children mounted.
	onMount(() => {
		let stop: (() => void) | undefined;
		let active = true;
		queueMicrotask(() => {
			if (active) {
				stop = replayEarlyConsentTaps(consent.kernel, {
					act: replayTap,
					categories: () => consent.state.consentCategories,
					started: () => consent.runtime.started,
				});
			}
		});
		return () => {
			active = false;
			stop?.();
		};
	});

	// The "Consent by [INTH]" tag (BNR-11, §5).
	let hostname = $state<string | undefined>(undefined);
	onMount(() => {
		({ hostname } = window.location);
	});
	const tag = $derived(
		hideBranding
			? null
			: resolveBrandingTag({
					branding: consent.state.branding,
					hostname,
					noStyle: true,
					styles: {},
					surface: 'banner',
				})
	);

	const notice = $derived(variant === 'notice');
	// The policy's first-layer actions, in the host's order. A notice's
	// "Your Privacy Choices" is the opt-out right, not an action, so it stays.
	const summaryGroups = $derived(
		actionGroups
			.map((group) =>
				group.filter(
					(action) =>
						action === 'reject' || action === 'accept' || action === 'customize'
				)
			)
			.filter((group) => group.length > 0)
	);
	const links = $derived(legalLinks === undefined ? CARD_LINKS : legalLinks);
	const barLinks = $derived(
		links?.filter((key) => key === 'privacyPolicy') ?? null
	);
	const appearance = (
		key: 'reject' | 'accept' | 'customize' | 'dismiss' | 'save',
		primary: boolean
	) => resolveActionAppearance(theme.theme, key, primary);

	const rootPart = $derived(
		part(
			'consentBanner',
			theme.theme,
			[surfaceStyles.root, presentation.root],
			noStyle,
			className
		)
	);
	const overlayPart = $derived(
		part('consentBannerOverlay', theme.theme, surfaceStyles.scrim, noStyle)
	);
	const shellPart = $derived(
		part(
			undefined,
			theme.theme,
			[surfaceStyles.shell, presentation.shell],
			noStyle
		)
	);
	const cardPart = $derived(
		part(
			'consentBannerCard',
			theme.theme,
			[surfaceStyles.card, presentation.card],
			noStyle
		)
	);
	const headerPart = $derived(
		part(
			'consentBannerHeader',
			theme.theme,
			[surfaceStyles.head, presentation.head],
			noStyle
		)
	);
	const titlePart = $derived(
		part('consentBannerTitle', theme.theme, surfaceStyles.title, noStyle)
	);
	const barTitlePart = $derived(
		part(
			'consentBannerTitle',
			theme.theme,
			surfaceStyles.visuallyHidden,
			noStyle
		)
	);
	const barDescriptionPart = $derived(
		part('consentBannerDescription', theme.theme, presentation.text, noStyle)
	);
	const barActionsPart = $derived(
		part('consentBannerFooter', theme.theme, presentation.actions, noStyle)
	);
	const descriptionPart = $derived(
		part(
			'consentBannerDescription',
			theme.theme,
			surfaceStyles.description,
			noStyle
		)
	);
	const expandAllInOnePart = $derived(
		part('consentBannerExpand', theme.theme, presentation.body, noStyle)
	);
	const expandPanelPart = $derived(
		part('consentBannerExpand', theme.theme, expandStyles.panel, noStyle)
	);
	const footerPart = $derived(
		part(
			'consentBannerFooter',
			theme.theme,
			[surfaceStyles.footer, presentation.footer],
			noStyle
		)
	);
	const actionGroupPart = $derived(
		part(
			'consentBannerFooterSubGroup',
			theme.theme,
			[surfaceStyles.actionGroup, presentation.actionGroup],
			noStyle
		)
	);
	const rightLinkPart = $derived(
		part(
			'consentBannerRightLink',
			theme.theme,
			surfaceStyles.rightLink,
			noStyle
		)
	);
	const tagPart = $derived(
		part(
			'consentBannerTag',
			theme.theme,
			[surfaceStyles.tag, presentation.tag],
			noStyle
		)
	);
</script>

{#snippet expandButton(label: string, inBar: boolean)}
	{#if notice}
		<!-- The notice's rights action reads as a link, in the
		     text-on-surface blue in both palettes (VIS-02). The collapsed bar
		     has no panel to point at (PERM-09). A tap before hydration replays
		     as Customize: the options expand in place. -->
		<button
			bind:this={expandEl}
			type="button"
			class={rightLinkPart.class}
			style={rightLinkPart.style}
			aria-expanded={expanded}
			aria-controls={inBar ? undefined : ids.panel}
			data-action="customize"
			data-testid="consent-banner-right-link-opt-out"
			onclick={expand}
			onfocus={warm}
			onpointerenter={warm}
		>
			{label}
		</button>
	{:else}
		<ConsentButton
			onref={(element) => {
				expandEl = element;
			}}
			action="custom-consent"
			performDefaultAction={false}
			{...appearance('customize', true)}
			{noStyle}
			aria-expanded={expanded}
			aria-controls={inBar ? undefined : ids.panel}
			data-action="customize"
			data-testid="consent-banner-customize-button"
			onclick={expand}
			onfocus={warm}
			onpointerenter={warm}
		>
			{label}
		</ConsentButton>
	{/if}
{/snippet}

{#snippet refuseButton(label: string)}
	<ConsentButton
		action="custom-consent"
		performDefaultAction={false}
		{...appearance('reject', false)}
		{noStyle}
		data-action="reject"
		data-testid="consent-banner-reject-button"
		onclick={() => commit('refuse')}
	>
		{rejectButtonText ?? label}
	</ConsentButton>
{/snippet}

{#snippet allowButton(label: string)}
	<ConsentButton
		action="custom-consent"
		performDefaultAction={false}
		{...appearance('accept', false)}
		{noStyle}
		data-action="accept"
		data-testid="consent-banner-accept-button"
		onclick={() => commit('allow')}
	>
		{acceptButtonText ?? label}
	</ConsentButton>
{/snippet}

{#snippet okButton()}
	<ConsentButton
		action="custom-consent"
		performDefaultAction={false}
		{...appearance('dismiss', true)}
		{noStyle}
		data-action="dismiss"
		data-testid="consent-banner-dismiss-button"
		onclick={() => acknowledge()}
	>
		{dismissButtonText ?? copy.ok}
	</ConsentButton>
{/snippet}

{#snippet saveButton()}
	<ConsentButton
		action="custom-consent"
		performDefaultAction={false}
		{...appearance('save', true)}
		themeKey="consentBannerSaveButton"
		{noStyle}
		data-action="save"
		data-testid="consent-banner-save-button"
		onclick={() => commit('save')}
	>
		{copy.save}
	</ConsentButton>
{/snippet}

{#snippet actionGroup(first: string, second: string)}
	<div
		class={actionGroupPart.class}
		style={actionGroupPart.style}
		data-testid="consent-banner-footer-sub-group"
	>
		{@render refuseButton(first)}
		{@render allowButton(second)}
	</div>
{/snippet}

{#snippet summaryButton(action: PresentationAction, inBar: boolean)}
	{#if action === 'reject'}
		{@render refuseButton(copy.reject)}
	{:else if action === 'accept'}
		{@render allowButton(copy.accept)}
	{:else}
		{@render expandButton(
			customizeButtonText ?? (inBar ? copy.expandBar : copy.expand),
			inBar
		)}
	{/if}
{/snippet}

<!-- Every presentation, the collapsed Banner included, keeps the host's
     groups and their `consentBannerFooterSubGroup` part. -->
{#snippet summaryRow(inBar: boolean)}
	{#each summaryGroups as group (group.join('-'))}
		{#if group.length > 1}
			<div
				class={actionGroupPart.class}
				style={actionGroupPart.style}
				data-testid="consent-banner-footer-sub-group"
			>
				{#each group as action (action)}
					{@render summaryButton(action, inBar)}
				{/each}
			</div>
		{:else}
			{#each group as action (action)}
				{@render summaryButton(action, inBar)}
			{/each}
		{/if}
	{/each}
{/snippet}

{#snippet consentTag()}
	{#if tag}
		<a
			class={tagPart.class}
			style={tagPart.style}
			href={tag.href}
			target="_blank"
			rel="noreferrer"
			data-branding={tag.brand}
			data-testid="consent-banner-branding"
		>
			<span>{translations.common.securedBy}</span>
			<BrandMark
				mark={tag.brand === 'inth' ? 'inth' : 'c15t'}
				class={cx(noStyle, surfaceStyles.tagMark)}
			/>
			<span class={cx(noStyle, surfaceStyles.visuallyHidden)}>
				{tag.brand === 'inth' ? 'Inth' : 'c15t'}
			</span>
		</a>
	{/if}
{/snippet}

{#snippet scrollArea()}
	<div
		bind:this={scrollEl}
		class={cx(noStyle, expandStyles.scroll)}
		data-testid="consent-banner-body"
	>
		{#if wantPanel && Panel}
			<Panel
				{variant}
				idPrefix={ids.prefix}
				uiSource={saveSource}
				{noStyle}
				onReady={onPanelReady}
			/>
		{/if}
	</div>
{/snippet}

{#snippet status()}
	<output
		class={cx(noStyle, surfaceStyles.visuallyHidden)}
		aria-live="polite"
		aria-atomic="true"
		data-testid="consent-banner-status"
	>
		{announcementText(surface.state.announcement)}
	</output>
{/snippet}

<!-- The page's status region outlives the prompt, so the outcome of a
     choice is read after the prompt leaves (BNR-06). It keeps its node. -->
<div
	bind:this={pageRegionEl}
	class={surfaceStyles.visuallyHidden}
	data-testid="consent-banner-announcement"
></div>

{#if showing}
	<!-- Before the buttons, so a tap on them is never missed. -->
	{@html earlyTapMarkup}
	<!-- Keyed: a new presentation inserts its own sheet. -->
	{#key sheets}
		<SurfaceStyles
			{sheets}
			{noStyle}
		/>
	{/key}
	<!-- A prompt on its way out takes no input (PERM-05). The early-tap
	     script records `data-model` and `data-prompt` with a tap, so a replay
	     against another model or prompt than the one the visitor saw is
	     dropped (`stillApplies` in core's `early-taps`). -->
	<div
		bind:this={rootEl}
		class={rootPart.class}
		style={rootPart.style}
		data-model={model}
		data-prompt={snapshot.policyRule.prompt}
		data-placement={layout.placement}
		data-flow={layout.flow}
		data-edge-style={layout.edgeStyle}
		data-blocking={layout.blocking ? 'true' : undefined}
		data-expanded={expanded ? 'true' : undefined}
		data-state={phase === 'leaving' ? 'closed' : 'open'}
		data-variant={variant}
		data-animation={animationOff ? 'off' : undefined}
		data-testid="consent-banner-root"
		{...{ [SURFACE_ROOT_ATTRIBUTE]: 'banner' }}
		dir={textDirection}
		inert={phase === 'leaving' || undefined}
	>
		{#if layout.blocking}
			<div
				class={overlayPart.class}
				style={overlayPart.style}
				aria-hidden="true"
				data-testid="consent-banner-overlay"
			></div>
		{/if}
		<div
			bind:this={shellEl}
			class={shellPart.class}
			style={shellPart.style}
			role={layout.blocking ? 'dialog' : undefined}
			aria-modal={layout.blocking ? true : undefined}
			aria-labelledby={layout.blocking ? ids.title : undefined}
			data-testid="consent-banner-shell"
		>
			{#if !allInOne}
				{@render consentTag()}
			{/if}
			<!-- Blocking moves the dialog role to the shell (PERM-08). -->
			<section
				bind:this={cardEl}
				class={cardPart.class}
				style={cardPart.style}
				role={layout.blocking ? undefined : 'region'}
				aria-labelledby={layout.blocking ? undefined : ids.title}
				tabindex="-1"
				data-testid="consent-banner-card"
			>
				{#if barCollapsed}
					<h2
						class={barTitlePart.class}
						style={barTitlePart.style}
						id={ids.title}
						data-testid="consent-banner-title"
					>
						{title ?? copy.title}
					</h2>
					<div class={cx(noStyle, presentation.row)}>
						<p
							class={barDescriptionPart.class}
							style={barDescriptionPart.style}
							data-testid="consent-banner-description"
						>
							{description ?? copy.barDescription}<InlineLegalLinks
								links={barLinks}
								testIdPrefix="consent-banner-legal-link"
							/>
						</p>
						<div
							class={barActionsPart.class}
							style={barActionsPart.style}
							data-testid="consent-banner-footer"
						>
							{#if notice}
								{@render expandButton(
									customizeButtonText ?? copy.expandBar,
									true
								)}
								{@render okButton()}
							{:else}
								{@render summaryRow(true)}
							{/if}
						</div>
					</div>
					{@render status()}
				{:else}
					<div
						class={headerPart.class}
						style={headerPart.style}
						data-testid="consent-banner-header"
					>
						<h2
							class={titlePart.class}
							style={titlePart.style}
							id={ids.title}
							data-testid="consent-banner-title"
						>
							{title ?? copy.title}
						</h2>
						<p
							class={descriptionPart.class}
							style={descriptionPart.style}
							data-testid="consent-banner-description"
						>
							{description ?? copy.description}<InlineLegalLinks
								{links}
								testIdPrefix="consent-banner-legal-link"
							/>
						</p>
					</div>
					{#if allInOne}
						<div
							class={expandAllInOnePart.class}
							style={expandAllInOnePart.style}
							data-testid="consent-banner-expand-panel"
						>
							{@render scrollArea()}
							{#if tag}
								<div class={cx(noStyle, presentation.tagSlot)}>
									{@render consentTag()}
								</div>
							{/if}
						</div>
					{:else}
						<div
							class={expandPanelPart.class}
							style={expandPanelPart.style}
							id={ids.panel}
							data-open={expanded}
							inert={!expanded}
							data-testid="consent-banner-expand-panel"
						>
							<div class={cx(noStyle, expandStyles.inner)}>
								{@render scrollArea()}
							</div>
						</div>
					{/if}
					{@render status()}
					<div
						class={footerPart.class}
						style={footerPart.style}
						data-testid="consent-banner-footer"
					>
						{#if optionsOpen}
							{#if notice}
								{@render okButton()}
							{:else}
								{@render actionGroup(copy.rejectExpanded, copy.acceptExpanded)}
								{@render saveButton()}
							{/if}
						{:else if notice}
							{@render expandButton(customizeButtonText ?? copy.expand, false)}
							{@render okButton()}
						{:else}
							{@render summaryRow(false)}
						{/if}
					</div>
				{/if}
			</section>
		</div>
	</div>
{/if}
