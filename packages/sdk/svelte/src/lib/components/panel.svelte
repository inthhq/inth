<script lang="ts">
	import type { Model } from '@inth/sdk/engine';
	import {
		defaultTranslationConfig,
		resolveConsentPresentation,
	} from '@inth/sdk/engine';
	import { isDialogDismissKey } from '@inth/sdk/ui/primitives';
	import styles from '@inth/sdk/ui/styles/components/consent-dialog';
	import {
		getTextDirection,
		resolveStyles,
		resolveTranslations,
		toStyleAttributeValue,
	} from '@inth/sdk/ui/utils';

	import { getConsentContext, getThemeContext } from '../context.svelte';
	import { DIALOG_SHEETS } from '../dialog-sheets';
	import { Dialog, Portal } from '../primitives';
	import Branding from './branding.svelte';
	import InlineLegalLinks from './inline-legal-links.svelte';
	import type { ConsentDialogProps } from './panel-props';
	import ConsentDialogTrigger from './panel-trigger.svelte';
	import ConsentWidget from './preferences.svelte';
	import SurfaceStyles from './surface-styles.svelte';

	const {
		open: openProp,
		noStyle: localNoStyle,
		disableAnimation: localDisableAnimation,
		hideBranding,
		legalLinks,
		showTrigger = false,
		// A `none` rule that grants the preferences right still opens here.
		models = ['opt-in', 'opt-out', 'iab', 'none'] as Model[],
		class: className,
	}: ConsentDialogProps = $props();

	const consent = getConsentContext();
	const theme = getThemeContext();
	const preferences = $derived(
		resolveConsentPresentation({
			policy: consent.snapshot.policyRule,
			presentation: {
				...consent.state.presentation,
				preferences: {
					scrollLock: theme.scrollLock,
					trapFocus: theme.trapFocus,
					...consent.state.presentation?.preferences,
				},
			},
			surface: 'preferences',
		})
	);

	const noStyle = $derived(localNoStyle ?? theme.noStyle ?? false);
	const disableAnimation = $derived(
		localDisableAnimation ?? theme.disableAnimation ?? false
	);

	const translations = $derived(
		resolveTranslations(
			consent.state.translationConfig,
			defaultTranslationConfig
		)
	);
	const textDirection = $derived(
		getTextDirection(consent.state.translationConfig?.defaultLanguage)
	);

	// With `open` set the parent owns visibility, as in React:
	// Escape still asks the consent manager to close (`activeUI` becomes
	// `'none'`), but the dialog stays until `open` turns false.
	const controlled = $derived(openProp !== undefined);
	const isOpen = $derived(
		consent.state.hasConsentUi &&
			models.includes(consent.state.model) &&
			(openProp ?? consent.state.activeUI === 'dialog')
	);
	let dialogOpen = $state(false);
	let lastResolvedOpen = $state(false);

	const rootStyle = $derived(
		resolveStyles('consentDialog', theme.theme, { className, noStyle }, noStyle)
	);

	const cardStyle = $derived(
		resolveStyles(
			'consentDialogCard',
			theme.theme,
			{ baseClassName: styles.card, noStyle },
			noStyle
		)
	);

	const headerStyle = $derived(
		resolveStyles(
			'consentDialogHeader',
			theme.theme,
			{ baseClassName: styles.header, noStyle },
			noStyle
		)
	);

	const titleStyle = $derived(
		resolveStyles(
			'consentDialogTitle',
			theme.theme,
			{ baseClassName: styles.title, noStyle },
			noStyle
		)
	);

	const descriptionStyle = $derived(
		resolveStyles(
			'consentDialogDescription',
			theme.theme,
			{ baseClassName: styles.description, noStyle },
			noStyle
		)
	);

	const contentStyle = $derived(
		resolveStyles(
			'consentDialogContent',
			theme.theme,
			{ baseClassName: styles.content, noStyle },
			noStyle
		)
	);

	const overlayStyle = $derived(
		resolveStyles(
			'consentDialogOverlay',
			theme.theme,
			{ baseClassName: styles.overlay, noStyle },
			noStyle
		)
	);

	const triggerProps = $derived.by(() => {
		if (showTrigger === true) {
			return {};
		}
		if (showTrigger === false) {
			return null;
		}
		return showTrigger;
	});

	$effect(() => {
		if (isOpen !== lastResolvedOpen) {
			dialogOpen = isOpen;
			lastResolvedOpen = isOpen;
		}
	});

	$effect(() => {
		if (lastResolvedOpen && !dialogOpen) {
			consent.state.setActiveUI('none');
			lastResolvedOpen = false;
		}
	});

	const handleControlledDismiss = function handleControlledDismiss(
		event: KeyboardEvent
	) {
		if (controlled && isDialogDismissKey(event.key)) {
			consent.state.setActiveUI('none');
		}
	};
</script>

<!-- The dialog's code loads on demand, so its rules arrive with it. -->
<SurfaceStyles sheets={DIALOG_SHEETS} />

{#if triggerProps}
	<ConsentDialogTrigger {...triggerProps} />
{/if}

<Dialog.Root
	bind:open={dialogOpen}
	closeOnInteractOutside={false}
	closeOnEscape={!controlled}
	trapFocus={preferences.blocking}
	preventScroll={preferences.scrollLock}
	lazyMount
	unmountOnExit
>
	<Portal>
		{#if preferences.blocking}
			<Dialog.Backdrop
				class={overlayStyle.className || ''}
				style={toStyleAttributeValue(overlayStyle.style)}
				data-disable-animation={disableAnimation ? '' : undefined}
				data-testid="consent-dialog-overlay"
			/>
		{/if}
		<!-- `data-disable-animation` stops the `data-state` keyframes the
		     stylesheet runs on the overlay and positioner. -->
		<Dialog.Positioner
			class={noStyle
				? ''
				: `${styles.root || ''} ${!disableAnimation ? (isOpen ? styles.dialogVisible || '' : styles.dialogHidden || '') : ''}`}
			data-disable-animation={disableAnimation ? '' : undefined}
		>
			<Dialog.Content
				class={noStyle
					? rootStyle.className || ''
					: `${styles.container || ''} ${rootStyle.className || ''} ${!disableAnimation ? (isOpen ? styles.contentVisible || '' : styles.contentHidden || '') : ''}`}
				style={toStyleAttributeValue(rootStyle.style)}
				dir={textDirection}
				aria-labelledby="consent-dialog-title"
				aria-describedby="consent-dialog-description"
				data-blocking={preferences.blocking ? 'true' : undefined}
				data-testid="consent-dialog-root"
				onkeydown={handleControlledDismiss}
			>
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div
					class={cardStyle.className || ''}
					style={toStyleAttributeValue(cardStyle.style)}
					data-testid="consent-dialog-card"
					tabindex={-1}
				>
					<div
						class={headerStyle.className || ''}
						style={toStyleAttributeValue(headerStyle.style)}
						data-testid="consent-dialog-header"
					>
						<h2
							class={titleStyle.className || ''}
							style={toStyleAttributeValue(titleStyle.style)}
							data-testid="consent-dialog-title"
							id="consent-dialog-title"
						>
							{translations.consentManagerDialog.title}
						</h2>
						<div
							class={descriptionStyle.className || ''}
							style={toStyleAttributeValue(descriptionStyle.style)}
							data-context="dialog"
							data-testid="consent-dialog-description"
							id="consent-dialog-description"
						>
							{translations.consentManagerDialog.description}
							<InlineLegalLinks
								links={legalLinks}
								testIdPrefix="consent-dialog-legal-link"
							/>
						</div>
					</div>

					<div
						class={contentStyle.className || ''}
						style={toStyleAttributeValue(contentStyle.style)}
						data-testid="consent-dialog-content"
					>
						<ConsentWidget
							hideBranding
							{noStyle}
						/>
					</div>
					<Branding
						{hideBranding}
						{noStyle}
						surface="dialog"
					/>
				</div>
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog.Root>
