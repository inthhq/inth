<script lang="ts">
	import { SURFACE_ROOT_ATTRIBUTE } from '@inth/sdk/runtime/page-globals';
	import {
		claimOptOutConfirmationHost,
		closeOptOutConfirmation,
		isOptOutConfirmationOpen,
		takeOptOutConfirmationOpener,
	} from '@inth/sdk/surface-actions';
	import {
		resolveOptOutCopy,
		resolveOptOutLink,
		resolveOptOutReceiptSentence,
		resolvePreferenceControlLabels,
	} from '@inth/sdk/surface-state';
	import { isDialogDismissKey, onDialogDismiss } from '@inth/sdk/ui/primitives';
	import buttonStyles from '@inth/sdk/ui/styles/components/button';
	import styles from '@inth/sdk/ui/styles/components/opt-out-confirmation';
	import {
		getTextDirection,
		resolveStyles,
		toStyleAttributeValue,
	} from '@inth/sdk/ui/utils';
	import { findFocusRestoreEquivalent } from '@inth/sdk/ui/utils/dom';

	import { getConsentContext, getThemeContext } from '../context.svelte';
	import { DIALOG_SHEETS } from '../dialog-sheets';
	import { useOptOutConfirmationState } from '../opt-out-confirmation-state.svelte';
	import { Dialog, Portal } from '../primitives';
	import OptOutReceiptDetails from './opt-out-receipt-details.svelte';
	import SurfaceStyles from './surface-styles.svelte';

	const {
		open: openProp,
		noStyle: localNoStyle,
		disableAnimation: localDisableAnimation,
		embedded = false,
		class: className,
		onclose,
	}: {
		open?: boolean;
		noStyle?: boolean;
		disableAnimation?: boolean;
		/** @internal */
		embedded?: boolean;
		class?: string;
		onclose?: () => void;
	} = $props();

	const consent = getConsentContext();
	const theme = getThemeContext();
	const confirmation = useOptOutConfirmationState(() => consent.kernel);

	$effect(() => {
		if (embedded) {
			return;
		}
		return claimOptOutConfirmationHost(
			consent.kernel,
			Symbol('OptOutConfirmation')
		);
	});

	const noStyle = $derived(localNoStyle ?? theme.noStyle ?? false);
	const disableAnimation = $derived(
		localDisableAnimation ?? theme.disableAnimation ?? false
	);
	const translations = $derived(consent.state.copy);
	const textDirection = $derived(
		getTextDirection(consent.state.translations?.language)
	);
	const language = $derived(consent.state.translations?.language ?? 'en');
	const optOutCopy = $derived(resolveOptOutCopy(translations));
	const optOutLink = $derived(
		resolveOptOutLink(translations, consent.state.presentation?.optOutLink)
	);
	const receiptSentence = $derived(
		resolveOptOutReceiptSentence(translations, consent.state.optOutReceipt)
	);
	const controls = $derived(resolvePreferenceControlLabels(translations));
	const statusText = $derived(
		consent.state.optOutState.via === 'signal'
			? optOutCopy.statusSignal
			: optOutCopy.statusRequest
	);

	const controlled = $derived(openProp !== undefined);
	const isOpen = $derived(
		openProp === undefined
			? confirmation.open &&
					(!embedded || !confirmation.hasStandaloneHost) &&
					consent.state.activeUI !== 'dialog' &&
					consent.state.model !== 'iab' &&
					consent.state.optOutState.honored
			: openProp
	);

	let dialogOpen = $state(false);
	let lastResolvedOpen = $state(false);
	let opener: HTMLElement | null = null;

	$effect(() => {
		if (isOpen !== lastResolvedOpen) {
			dialogOpen = isOpen;
			lastResolvedOpen = isOpen;
		}
	});

	$effect(() => {
		if (isOpen) {
			const captured = takeOptOutConfirmationOpener(consent.kernel);
			if (captured) {
				opener = captured;
			}
			return;
		}
		if (!opener) {
			return;
		}
		const previous = opener;
		opener = null;
		const timer = setTimeout(() => {
			const active = document.activeElement;
			const focusLost =
				!active ||
				active === document.body ||
				active === document.documentElement;
			if (
				focusLost &&
				!isOptOutConfirmationOpen(consent.kernel) &&
				consent.kernel.getSnapshot().activeUI !== 'dialog'
			) {
				findFocusRestoreEquivalent(previous)?.focus({ preventScroll: true });
			}
		}, 0);
		return () => clearTimeout(timer);
	});

	const close = function close() {
		closeOptOutConfirmation(consent.kernel);
		onclose?.();
	};

	$effect(() => {
		if (!isOpen) {
			return;
		}
		return onDialogDismiss(document.documentElement, close);
	});

	$effect(() => {
		if (lastResolvedOpen && !dialogOpen) {
			close();
			lastResolvedOpen = false;
		}
	});

	const openPreferences = function openPreferences(event: MouseEvent) {
		event.preventDefault();
		consent.state.setActiveUI('dialog');
	};

	const handleControlledDismiss = function handleControlledDismiss(
		event: KeyboardEvent
	) {
		if (controlled && isDialogDismissKey(event.key)) {
			close();
		}
	};

	const rootStyle = $derived(
		resolveStyles(
			'optOutConfirmation',
			theme.theme,
			{ className, noStyle },
			noStyle
		)
	);
	const cardStyle = $derived(
		resolveStyles(
			'optOutConfirmationCard',
			theme.theme,
			{ baseClassName: styles.card, noStyle },
			noStyle
		)
	);
	const headerStyle = $derived(
		resolveStyles(
			'optOutConfirmationHeader',
			theme.theme,
			{ baseClassName: styles.header, noStyle },
			noStyle
		)
	);
	const titleStyle = $derived(
		resolveStyles(
			'optOutConfirmationTitle',
			theme.theme,
			{ baseClassName: styles.title, noStyle },
			noStyle
		)
	);
	const statusStyle = $derived(
		resolveStyles(
			'optOutConfirmationStatus',
			theme.theme,
			{ baseClassName: styles.status, noStyle },
			noStyle
		)
	);
	const descriptionStyle = $derived(
		resolveStyles(
			'optOutConfirmationDescription',
			theme.theme,
			{ baseClassName: styles.description, noStyle },
			noStyle
		)
	);
	const footerStyle = $derived(
		resolveStyles(
			'optOutConfirmationFooter',
			theme.theme,
			{ baseClassName: styles.footer, noStyle },
			noStyle
		)
	);
	const primaryButtonStyle = $derived(
		resolveStyles(
			'buttonPrimary',
			theme.theme,
			{ baseClassName: buttonStyles.button, noStyle },
			noStyle
		)
	);
	const doneButtonStyle = $derived(
		resolveStyles(
			'optOutConfirmationDoneButton',
			theme.theme,
			{
				baseClassName: primaryButtonStyle.className,
				noStyle,
				style: primaryButtonStyle.style,
			},
			noStyle
		)
	);
	const preferencesLinkStyle = $derived(
		resolveStyles(
			'optOutConfirmationPreferencesLink',
			theme.theme,
			{ baseClassName: styles.preferencesLink, noStyle },
			noStyle
		)
	);
	const overlayStyle = $derived(
		resolveStyles(
			'optOutConfirmationOverlay',
			theme.theme,
			{ baseClassName: styles.overlay, noStyle },
			noStyle
		)
	);
</script>

<SurfaceStyles sheets={DIALOG_SHEETS} />

<Dialog.Root
	bind:open={dialogOpen}
	closeOnInteractOutside={false}
	closeOnEscape={!controlled}
	trapFocus={true}
	preventScroll={true}
	lazyMount
	unmountOnExit
>
	<Portal>
		<Dialog.Backdrop
			class={overlayStyle.className || ''}
			style={toStyleAttributeValue(overlayStyle.style)}
			data-disable-animation={disableAnimation ? '' : undefined}
			data-slot={undefined}
			data-testid="opt-out-confirmation-overlay"
		/>
		<Dialog.Positioner
			class={noStyle
				? ''
				: `${styles.root || ''} ${!disableAnimation ? (isOpen ? styles.dialogVisible || '' : styles.dialogHidden || '') : ''}`}
			data-disable-animation={disableAnimation ? '' : undefined}
			dir={textDirection}
		>
			<Dialog.Content
				class={noStyle
					? rootStyle.className || ''
					: `${styles.container || ''} ${rootStyle.className || ''} ${!disableAnimation ? (isOpen ? styles.contentVisible || '' : styles.contentHidden || '') : ''}`}
				style={toStyleAttributeValue(rootStyle.style)}
				dir={textDirection}
				lang={language}
				aria-labelledby="opt-out-confirmation-title"
				aria-describedby="opt-out-confirmation-description"
				data-slot={undefined}
				data-testid="opt-out-confirmation-root"
				id={undefined}
				{...{ [SURFACE_ROOT_ATTRIBUTE]: 'dialog' }}
				onkeydown={handleControlledDismiss}
			>
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div
					class={cardStyle.className || ''}
					style={toStyleAttributeValue(cardStyle.style)}
					data-testid="opt-out-confirmation-card"
					tabindex={-1}
				>
					<div
						class={headerStyle.className || ''}
						style={toStyleAttributeValue(headerStyle.style)}
						data-testid="opt-out-confirmation-header"
					>
						<h2
							class={titleStyle.className || ''}
							style={toStyleAttributeValue(titleStyle.style)}
							data-testid="opt-out-confirmation-title"
							id="opt-out-confirmation-title"
						>
							{optOutLink.label}
						</h2>
					</div>
					<p
						class={statusStyle.className || ''}
						style={toStyleAttributeValue(statusStyle.style)}
						data-testid="opt-out-confirmation-status"
						role="status"
					>
						{statusText}
					</p>
					<p
						class={descriptionStyle.className || ''}
						style={toStyleAttributeValue(descriptionStyle.style)}
						data-testid="opt-out-confirmation-description"
						id="opt-out-confirmation-description"
					>
						{receiptSentence}
					</p>
					<OptOutReceiptDetails {noStyle} />
					<div
						class={footerStyle.className || ''}
						style={toStyleAttributeValue(footerStyle.style)}
						data-testid="opt-out-confirmation-footer"
					>
						<button
							type="button"
							class={doneButtonStyle.className || ''}
							style={toStyleAttributeValue(doneButtonStyle.style)}
							data-mode={noStyle ? undefined : 'filled'}
							data-size={noStyle ? undefined : 'small'}
							data-variant={noStyle ? undefined : 'primary'}
							data-testid="opt-out-confirmation-done-button"
							onclick={close}
						>
							{optOutCopy.done}
						</button>
						<a
							href="#inth-preferences"
							class={preferencesLinkStyle.className || ''}
							style={toStyleAttributeValue(preferencesLinkStyle.style)}
							data-testid="opt-out-confirmation-preferences-link"
							onclick={openPreferences}
						>
							{controls.preferences}
						</a>
					</div>
				</div>
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog.Root>
