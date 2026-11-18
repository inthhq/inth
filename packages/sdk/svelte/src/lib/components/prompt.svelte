<script lang="ts">
	import type {
		LegalLinks as LegalLinksType,
		Model,
		PromptPosition,
		PromptVariant,
	} from '@inth/sdk/engine';
	import {
		actionAppearanceFromTheme,
		resolveConsentPresentation,
	} from '@inth/sdk/engine';
	import type { PolicyRight } from '@inth/sdk/schema/types';
	import {
		EARLY_CONSENT_TAP_SCRIPT,
		replayEarlyConsentTaps,
	} from '@inth/sdk/surface-actions';
	import styles from '@inth/sdk/ui/styles/components/consent-banner';
	import { resolveActionAppearance } from '@inth/sdk/ui/theme';
	import {
		resolveStyles,
		resolveTranslations,
		toStyleAttributeValue,
	} from '@inth/sdk/ui/utils';
	import { getTextDirection } from '@inth/sdk/ui/utils/text-direction';
	import { onMount } from 'svelte';

	import {
		bannerFocusTrap as focusTrap,
		bannerScrollLock as scrollLock,
	} from '../actions/banner-actions';
	// Banner uses custom portal/focus-trap/scroll-lock actions (not Ark UI's built-in)
	// because the banner is not an Ark Dialog - it's a simpler container that
	// conditionally acts as a dialog. The ConsentDialog uses Ark's Dialog which
	// includes its own focus trap and scroll prevention. When transitioning from
	// banner to dialog, the banner unmounts (removing its focus trap) before
	// the dialog mounts (establishing Ark's focus trap), so they don't compete.
	import { portal } from '../actions/portal';
	import { getConsentContext, getThemeContext } from '../context.svelte';
	import { BANNER_SHEETS } from '../surface-styles';
	import {
		fallbackTranslations,
		registeredDefaultTranslations,
	} from '../translation-defaults';
	import { useBannerVisibility } from '../use-banner-visibility.svelte';
	import ConsentButton from './action-button.svelte';
	import Branding from './branding.svelte';
	import InlineLegalLinks from './inline-legal-links.svelte';
	import Overlay from './overlay.svelte';
	import PolicyActionsRenderer from './policy-actions-renderer.svelte';
	import SurfaceStyles from './surface-styles.svelte';

	/**
	 * Button identifiers for the consent banner layout.
	 */
	type ConsentBannerButton = 'reject' | 'accept' | 'customize' | 'dismiss';
	type ConsentBannerLayout = (ConsentBannerButton | ConsentBannerButton[])[];

	let {
		noStyle: localNoStyle,
		disableAnimation: localDisableAnimation,
		scrollLock: localScrollLock,
		trapFocus: localTrapFocus,
		title,
		description,
		rejectButtonText,
		customizeButtonText,
		acceptButtonText,
		dismissButtonText,
		hideBranding = false,
		legalLinks,
		layout,
		primaryButton,
		variant,
		position,
		blocking,
		models = ['opt-in', 'opt-out', 'iab'] as Model[],
		class: className,
	}: {
		noStyle?: boolean;
		disableAnimation?: boolean;
		scrollLock?: boolean;
		trapFocus?: boolean;
		title?: string;
		description?: string;
		rejectButtonText?: string;
		customizeButtonText?: string;
		acceptButtonText?: string;
		dismissButtonText?: string;
		hideBranding?: boolean;
		legalLinks?: (keyof LegalLinksType)[] | null;
		layout?: ConsentBannerLayout;
		primaryButton?: ConsentBannerButton | ConsentBannerButton[];
		/**
		 * Shape of the prompt. Overrides the host presentation.
		 * A notice defaults to `bar`, a choice prompt to `floating`.
		 */
		variant?: PromptVariant;
		/**
		 * Where the prompt sits. Must be valid for the resolved variant;
		 * an invalid value falls back to the variant default with a
		 * development diagnostic.
		 */
		position?: PromptPosition;
		/**
		 * Backdrop, scroll lock, focus trap, and no dismissal from outside,
		 * as one value. `wall` is always blocking; a notice never is.
		 */
		blocking?: boolean;
		models?: Model[];
		class?: string;
	} = $props();

	const consent = getConsentContext();
	const theme = getThemeContext();

	// The script that holds a tap on the server-rendered banner made before
	// hydration. The browser renders the same markup, so hydration adopts
	// it; a script the browser inserts never runs. `inthHandle` gives it the
	// page's nonce when the provider has none.
	const earlyTapMarkup = `<script data-inth-early-tap${
		theme.nonce ? ` nonce="${theme.nonce.replaceAll('"', '&quot;')}"` : ''
	}>${EARLY_CONSENT_TAP_SCRIPT}</${'script'}>`;

	// From here the banner's own handlers work: stop the script and record
	// its tap once the runtime has started, which the provider does after
	// its children mounted.
	onMount(() => {
		let stop: (() => void) | undefined;
		let active = true;
		queueMicrotask(() => {
			if (active) {
				stop = replayEarlyConsentTaps(consent.kernel, {
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

	const noStyle = $derived(localNoStyle ?? theme.noStyle ?? false);
	const disableAnimation = $derived(
		localDisableAnimation ?? theme.disableAnimation ?? false
	);

	// Translations
	const translations = $derived(
		resolveTranslations(
			consent.state.translationConfig,
			fallbackTranslations(consent.state.translationConfig)
		)
	);
	const textDirection = $derived(
		getTextDirection(consent.state.translationConfig?.defaultLanguage)
	);

	// Visibility logic
	const shouldShowBanner = $derived(
		consent.state.hasConsentUi &&
			consent.state.activeUI === 'banner' &&
			consent.snapshot.promptRequirement.kind !== 'none' &&
			models.includes(consent.state.model)
	);

	const visibility = useBannerVisibility(
		() => shouldShowBanner,
		() => disableAnimation
	);

	// Styling - per-element theme key resolution shared across framework adapters.
	const rootStyle = $derived(
		resolveStyles(
			'consentBanner',
			theme.theme,
			{
				baseClassName: styles.root,
				className,
				noStyle,
			},
			noStyle
		)
	);

	const cardStyle = $derived(
		resolveStyles(
			'consentBannerCard',
			theme.theme,
			{ baseClassName: styles.card, noStyle },
			noStyle
		)
	);

	const headerStyle = $derived(
		resolveStyles(
			'consentBannerHeader',
			theme.theme,
			{ baseClassName: styles.header, noStyle },
			noStyle
		)
	);

	const titleStyle = $derived(
		resolveStyles(
			'consentBannerTitle',
			theme.theme,
			{ baseClassName: styles.title, noStyle },
			noStyle
		)
	);

	const descriptionStyle = $derived(
		resolveStyles(
			'consentBannerDescription',
			theme.theme,
			{ baseClassName: styles.description, noStyle },
			noStyle
		)
	);

	const footerStyle = $derived(
		resolveStyles(
			'consentBannerFooter',
			theme.theme,
			{ baseClassName: styles.footer, noStyle },
			noStyle
		)
	);

	const footerSubGroupStyle = $derived(
		resolveStyles(
			'consentBannerFooterSubGroup',
			theme.theme,
			{ noStyle },
			noStyle
		)
	);

	const rightsStyle = $derived(
		resolveStyles(
			'consentBannerRights',
			theme.theme,
			{ baseClassName: styles.rights, noStyle },
			noStyle
		)
	);

	const rightLinkStyle = $derived(
		resolveStyles(
			'consentBannerRightLink',
			theme.theme,
			{ baseClassName: styles.rightLink, noStyle },
			noStyle
		)
	);

	// A right control opens the preference center without recording a choice.
	const openPreferences = function openPreferences() {
		consent.state.setActiveUI('dialog');
	};

	const finalClassName = $derived(
		noStyle
			? rootStyle.className || ''
			: `${rootStyle.className || ''} ${visibility.isVisible ? `${styles.bannerVisible}${disableAnimation ? '' : ` ${styles.bannerEntering}`}` : styles.bannerHidden}`
	);

	const localPrimaryActions = $derived.by(() => {
		if (primaryButton === undefined) {
			return undefined;
		}
		return Array.isArray(primaryButton) ? primaryButton : [primaryButton];
	});
	const presentation = $derived(
		resolveConsentPresentation({
			actionAppearance: actionAppearanceFromTheme(theme.theme),
			override: {
				blocking,
				layout,
				position,
				primaryActions: localPrimaryActions,
				scrollLock: localScrollLock,
				trapFocus: localTrapFocus,
				variant,
			},
			policy: consent.snapshot.policyRule,
			presentation: {
				...consent.state.presentation,
				prompt: {
					scrollLock: theme.scrollLock,
					trapFocus: theme.trapFocus,
					...consent.state.presentation?.prompt,
				},
			},
			surface: 'prompt',
		})
	);
	const actionGroups = $derived(presentation.actionGroups);
	const primaryActions = $derived(presentation.primaryActions);
	// Additional buttons that open preferences, styled as underlined text.
	const preferenceControls = $derived(presentation.preferenceControls);
	const promptKind = $derived(consent.snapshot.policyRule.prompt);
	const isNotice = $derived(promptKind === 'notice');
	const direction = $derived(presentation.direction);
	const shouldFillActions = $derived(presentation.shouldFillActions);
	const shouldTrapFocus = $derived(presentation.trapFocus);
	const shouldScrollLock = $derived(presentation.scrollLock);
	const resolvedVariant = $derived(presentation.variant);
	const isBlocking = $derived(presentation.blocking);
	const resolvedPosition = $derived(presentation.position);

	$effect(() => {
		if (
			typeof process === 'undefined' ||
			process.env?.NODE_ENV !== 'production'
		) {
			for (const diagnostic of presentation.diagnostics) {
				console.warn(diagnostic.message);
			}
		}
	});

	// Resolved texts. A notice has its own copy: it informs and points at
	// the opt-out instead of asking for permission.
	// Before `ConsentRoot`'s engine there are none: the server completed the
	// snapshot's bundle with them.
	const englishTranslations = $derived.by(() => {
		// Read again when the engine attaches, which changes the snapshot.
		void consent.snapshot;
		return registeredDefaultTranslations()?.translations.en;
	});
	const resolvedTitle = $derived(
		title ??
			(isNotice
				? (translations.cookieBanner.noticeTitle ??
					englishTranslations?.cookieBanner?.noticeTitle)
				: translations.cookieBanner.title)
	);
	const resolvedDescription = $derived(
		description ??
			(isNotice
				? (translations.cookieBanner.noticeDescription ??
					englishTranslations?.cookieBanner?.noticeDescription)
				: translations.cookieBanner.description)
	);
	// Acknowledgement records no category choice.
	const resolvedDismissText = $derived(
		dismissButtonText ??
			translations.common.acknowledge ??
			translations.common.dismiss ??
			englishTranslations?.common?.acknowledge
	);
	const rightLabels = $derived<
		Partial<Record<PolicyRight, string | undefined>>
	>({
		'opt-out':
			translations.rights?.optOut ?? englishTranslations?.rights?.optOut,
		preferences:
			translations.rights?.preferences ??
			englishTranslations?.rights?.preferences,
	});
	const resolvedRejectText = $derived(
		rejectButtonText ?? translations.common.rejectAll
	);
	const resolvedAcceptText = $derived(
		acceptButtonText ?? translations.common.acceptAll
	);
	const resolvedCustomizeText = $derived(
		customizeButtonText ?? translations.common.customize
	);
</script>

{#if visibility.isMounted && visibility.shouldRender}
	<div use:portal>
		<!-- Inside the portal: the block must stay one node, or removing it
		     would walk from where it was to where the portal moved it. -->
		<SurfaceStyles sheets={BANNER_SHEETS} />
		{@html earlyTapMarkup}
		{#if shouldScrollLock}
			<Overlay
				{styles}
				entering={!disableAnimation}
				lateEntry={visibility.lateEntry && !disableAnimation}
				visible={visibility.isVisible}
			/>
		{/if}
		<div
			bind:this={visibility.bannerEl}
			class={finalClassName}
			style={toStyleAttributeValue(rootStyle.style)}
			dir={textDirection}
			data-variant={resolvedVariant}
			data-position={resolvedPosition}
			data-blocking={isBlocking ? 'true' : undefined}
			data-prompt={promptKind}
			data-model={consent.state.model}
			data-entry={visibility.lateEntry && !disableAnimation
				? 'late'
				: undefined}
			data-testid="consent-banner-root"
			use:scrollLock={shouldScrollLock}
		>
			<div class={noStyle ? '' : styles.cardShell || ''}>
				<Branding
					{hideBranding}
					{noStyle}
					surface="banner"
				/>
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div
					class={cardStyle.className || ''}
					style={toStyleAttributeValue(cardStyle.style)}
					data-testid="consent-banner-card"
					tabindex="-1"
					role={isBlocking ? 'dialog' : 'region'}
					aria-modal={isBlocking ? 'true' : undefined}
					aria-label={resolvedTitle}
					use:focusTrap={shouldTrapFocus}
				>
					<div
						class={headerStyle.className || ''}
						style={toStyleAttributeValue(headerStyle.style)}
						data-testid="consent-banner-header"
					>
						<h2
							class={titleStyle.className || ''}
							style={toStyleAttributeValue(titleStyle.style)}
							data-testid="consent-banner-title"
						>
							{resolvedTitle}
						</h2>
						<div
							class={descriptionStyle.className || ''}
							style={toStyleAttributeValue(descriptionStyle.style)}
							data-context="banner"
							data-testid="consent-banner-description"
						>
							{resolvedDescription}
							<InlineLegalLinks
								links={legalLinks}
								testIdPrefix="consent-banner-legal-link"
							/>
						</div>
					</div>
					<PolicyActionsRenderer
						{actionGroups}
						{primaryActions}
						{shouldFillActions}
						{direction}
						{noStyle}
						footerClassName={footerStyle.className || ''}
						footerStyle={toStyleAttributeValue(footerStyle.style)}
						footerSubGroupClassName={footerSubGroupStyle.className || ''}
						footerSubGroupStyle={toStyleAttributeValue(
							footerSubGroupStyle.style
						)}
						footerTestId="consent-banner-footer"
						footerSubGroupTestId="consent-banner-footer-sub-group"
					>
						{#snippet leading()}
							{#if preferenceControls.length > 0}
								<div
									class={rightsStyle.className || ''}
									style={toStyleAttributeValue(rightsStyle.style)}
									data-testid="consent-banner-rights"
								>
									{#each preferenceControls as right (right)}
										<button
											type="button"
											class={rightLinkStyle.className || ''}
											style={toStyleAttributeValue(rightLinkStyle.style)}
											data-action="right"
											data-right={right}
											data-inth-rights={consent.snapshot.policyRule.rights.join(
												' '
											)}
											data-testid={`consent-banner-right-link-${right}`}
											onclick={openPreferences}
										>
											{rightLabels[right] ?? right}
										</button>
									{/each}
								</div>
							{/if}
						{/snippet}
						{#snippet renderAction(action: string, isPrimary: boolean)}
							{#if action === 'reject'}
								<ConsentButton
									action="reject-consent"
									{...resolveActionAppearance(theme.theme, 'reject', isPrimary)}
									closeConsentBanner
									data-action="reject"
									data-testid="consent-banner-reject-button"
								>
									{resolvedRejectText}
								</ConsentButton>
							{:else if action === 'accept'}
								<ConsentButton
									action="accept-consent"
									{...resolveActionAppearance(theme.theme, 'accept', isPrimary)}
									closeConsentBanner
									data-action="accept"
									data-testid="consent-banner-accept-button"
								>
									{resolvedAcceptText}
								</ConsentButton>
							{:else if action === 'dismiss'}
								<ConsentButton
									action="dismiss-notice"
									{...resolveActionAppearance(
										theme.theme,
										'dismiss',
										isPrimary
									)}
									data-action="dismiss"
									data-testid="consent-banner-dismiss-button"
								>
									{resolvedDismissText}
								</ConsentButton>
							{:else if action === 'customize'}
								<ConsentButton
									action="open-consent-dialog"
									{...resolveActionAppearance(
										theme.theme,
										'customize',
										isPrimary
									)}
									data-action="customize"
									data-testid="consent-banner-customize-button"
								>
									{resolvedCustomizeText}
								</ConsentButton>
							{/if}
						{/snippet}
					</PolicyActionsRenderer>
				</div>
			</div>
		</div>
	</div>
{/if}
