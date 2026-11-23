<script lang="ts">
	import { SURFACE_ROOT_ATTRIBUTE } from '@inth/sdk/runtime/page-globals';
	import {
		closeOptInConfirmation,
		confirmOptInConfirmation,
		isOptInConfirmationOpen,
		takeOptInConfirmationOpener,
	} from '@inth/sdk/surface-actions';
	import {
		resolveOptInConfirmationSentence,
		resolveOptOutCopy,
	} from '@inth/sdk/surface-state';
	import { onDialogDismiss } from '@inth/sdk/ui/primitives';
	import buttonStyles from '@inth/sdk/ui/styles/components/button';
	import styles from '@inth/sdk/ui/styles/components/opt-out-confirmation';
	import {
		getTextDirection,
		resolveStyles,
		toStyleAttributeValue,
	} from '@inth/sdk/ui/utils';
	import { findFocusRestoreEquivalent } from '@inth/sdk/ui/utils/dom';

	import { getConsentContext, getThemeContext } from '../get-consent-context.svelte';
	import { Dialog, Portal } from '../primitives';
	import { WIDGET_SHEETS } from '../widget-sheets';
	import SurfaceStyles from './surface-styles.svelte';

	const DEFAULT_LANGUAGE = 'en';

	const {
		open = false,
		noStyle: localNoStyle,
		disableAnimation: localDisableAnimation,
		scrollLock: localScrollLock,
		trapFocus: localTrapFocus,
	}: {
		open?: boolean;
		noStyle?: boolean;
		disableAnimation?: boolean;
		scrollLock?: boolean;
		trapFocus?: boolean;
	} = $props();

	const consent = getConsentContext();
	const theme = getThemeContext();

	const noStyle = $derived(localNoStyle ?? theme.noStyle ?? false);
	const disableAnimation = $derived(
		localDisableAnimation ?? theme.disableAnimation ?? false
	);
	const scrollLock = $derived(localScrollLock ?? theme.scrollLock ?? true);
	const trapFocus = $derived(localTrapFocus ?? theme.trapFocus ?? true);

	const translations = $derived(consent.state.copy);
	const language = $derived(
		consent.state.translations?.language ?? DEFAULT_LANGUAGE
	);
	const textDirection = $derived(getTextDirection(language));
	const copy = $derived(resolveOptOutCopy(translations));
	const sentence = $derived(
		resolveOptInConfirmationSentence(translations, consent.state.optOutState)
	);

	let dialogOpen = $state(false);
	let lastResolvedOpen = $state(false);
	let opener: HTMLElement | null = null;

	$effect(() => {
		if (open !== lastResolvedOpen) {
			dialogOpen = open;
			lastResolvedOpen = open;
		}
	});

	$effect(() => {
		if (open) {
			const captured = takeOptInConfirmationOpener(consent.kernel);
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
			if (focusLost && !isOptInConfirmationOpen(consent.kernel)) {
				findFocusRestoreEquivalent(previous)?.focus({ preventScroll: true });
			}
		}, 0);
		return () => clearTimeout(timer);
	});

	const handleCancel = function handleCancel() {
		closeOptInConfirmation(consent.kernel);
	};

	const handleConfirm = function handleConfirm() {
		void confirmOptInConfirmation(consent.kernel);
	};

	$effect(() => {
		if (!open) {
			return;
		}
		return onDialogDismiss(document.documentElement, handleCancel);
	});

	$effect(() => {
		if (lastResolvedOpen && !dialogOpen) {
			handleCancel();
			lastResolvedOpen = false;
		}
	});

	const secondaryButtonStyle = $derived(
		resolveStyles(
			'buttonSecondary',
			theme.theme,
			{ baseClassName: buttonStyles.button, noStyle },
			noStyle
		)
	);

	const overlayClass = $derived.by(() => {
		if (noStyle) {
			return undefined;
		}
		if (disableAnimation) {
			return styles.overlay;
		}
		return [styles.overlay, open ? styles.overlayVisible : styles.overlayHidden]
			.filter(Boolean)
			.join(' ');
	});

	const positionerClass = $derived.by(() => {
		if (noStyle) {
			return undefined;
		}
		if (disableAnimation) {
			return styles.root;
		}
		return [styles.root, open ? styles.dialogVisible : styles.dialogHidden]
			.filter(Boolean)
			.join(' ');
	});

	const contentClass = $derived.by(() => {
		if (noStyle) {
			return undefined;
		}
		if (disableAnimation) {
			return styles.container;
		}
		return [
			styles.container,
			open ? styles.contentVisible : styles.contentHidden,
		]
			.filter(Boolean)
			.join(' ');
	});
</script>

<SurfaceStyles sheets={WIDGET_SHEETS} />

<Dialog.Root
	bind:open={dialogOpen}
	closeOnInteractOutside={false}
	closeOnEscape={true}
	{trapFocus}
	preventScroll={scrollLock}
	lazyMount
	unmountOnExit
>
	<Portal>
		<Dialog.Backdrop
			class={overlayClass}
			data-disable-animation={disableAnimation ? '' : undefined}
			data-stacked=""
			data-slot={undefined}
			data-testid="opt-in-confirmation-overlay"
		/>
		<Dialog.Positioner
			class={positionerClass}
			data-disable-animation={disableAnimation ? '' : undefined}
			data-stacked=""
			data-slot={undefined}
			dir={textDirection}
		>
			<Dialog.Content
				class={contentClass}
				dir={textDirection}
				lang={language}
				aria-labelledby="opt-in-confirmation-title"
				aria-describedby="opt-in-confirmation-description"
				aria-modal="true"
				data-slot={undefined}
				data-testid="opt-in-confirmation-root"
				id={undefined}
				{...{ [SURFACE_ROOT_ATTRIBUTE]: 'dialog' }}
			>
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div
					class={noStyle ? undefined : styles.card}
					data-testid="opt-in-confirmation-card"
					tabindex={-1}
				>
					<div
						class={noStyle ? undefined : styles.header}
						data-testid="opt-in-confirmation-header"
					>
						<h2
							class={noStyle ? undefined : styles.title}
							data-testid="opt-in-confirmation-title"
							id="opt-in-confirmation-title"
						>
							{copy.optInTitle}
						</h2>
					</div>
					<p
						class={noStyle ? undefined : styles.description}
						data-testid="opt-in-confirmation-description"
						id="opt-in-confirmation-description"
					>
						{sentence}
					</p>
					<div
						class={noStyle ? undefined : styles.footer}
						data-testid="opt-in-confirmation-footer"
					>
						<button
							type="button"
							data-mode={noStyle ? undefined : 'stroke'}
							data-size={noStyle ? undefined : 'small'}
							data-variant={noStyle ? undefined : 'neutral'}
							class={secondaryButtonStyle.className || undefined}
							style={toStyleAttributeValue(secondaryButtonStyle.style)}
							data-testid="opt-in-confirmation-cancel-button"
							onclick={handleCancel}
						>
							{copy.optInCancel}
						</button>
						<button
							type="button"
							data-mode={noStyle ? undefined : 'stroke'}
							data-size={noStyle ? undefined : 'small'}
							data-variant={noStyle ? undefined : 'neutral'}
							class={secondaryButtonStyle.className || undefined}
							style={toStyleAttributeValue(secondaryButtonStyle.style)}
							data-testid="opt-in-confirmation-confirm-button"
							onclick={handleConfirm}
						>
							{copy.optInConfirm}
						</button>
					</div>
				</div>
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog.Root>
