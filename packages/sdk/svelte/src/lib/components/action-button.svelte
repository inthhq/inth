<script lang="ts">
	import type { AllConsentNames } from '@inth/sdk/engine';
	import buttonStyles from '@inth/sdk/ui/styles/components/button';
	import type { AllThemeKeys } from '@inth/sdk/ui/theme';
	import { resolveStyles, toStyleAttributeValue } from '@inth/sdk/ui/utils';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	import { getConsentContext, getThemeContext } from '../context.svelte';
	import { holdIdleDialogWarming, warmDialog } from '../dialog-warming';

	let {
		action,
		variant = 'neutral',
		mode = 'stroke',
		size = 'small',
		children,
		onclick,
		onfocus,
		onpointerenter,
		closeConsentBanner = false,
		closeConsentDialog = false,
		category,
		noStyle: localNoStyle,
		class: className,
		themeKey,
		baseClassName,
		performDefaultAction = true,
		ref = $bindable(null),
		...restProps
	}: Omit<HTMLButtonAttributes, 'class'> & {
		action:
			| 'accept-consent'
			| 'reject-consent'
			| 'custom-consent'
			| 'dismiss-notice'
			| 'open-consent-dialog'
			| 'set-consent';
		variant?: 'primary' | 'neutral';
		mode?: 'filled' | 'stroke' | 'lighter' | 'ghost';
		size?: 'medium' | 'small' | 'xsmall' | 'xxsmall';
		children?: Snippet;
		closeConsentBanner?: boolean;
		closeConsentDialog?: boolean;
		category?: AllConsentNames;
		noStyle?: boolean;
		class?: string;
		/**
		 * The `theme.slots` key that styles this button in place of
		 * `buttonPrimary` or `buttonSecondary`, such as a Privacy Choices
		 * Save button's own slot.
		 */
		themeKey?: AllThemeKeys;
		/** Stock classes after the button's own, dropped under `noStyle`. */
		baseClassName?: string;
		/**
		 * `false` leaves the click to `onclick`: the button records nothing
		 * and changes no surface itself.
		 */
		performDefaultAction?: boolean;
		/** The rendered button. */
		ref?: HTMLButtonElement | null;
	} = $props();

	const consent = getConsentContext();
	const theme = getThemeContext();

	const noStyle = $derived(localNoStyle ?? theme.noStyle ?? false);

	// A button that opens the dialog loads the deferred dialog before the
	// click: in idle time while it is mounted, and on hover or focus.
	onMount(() =>
		action === 'open-consent-dialog'
			? holdIdleDialogWarming(theme.preloadDialog)
			: undefined
	);

	const handleFocus = function handleFocus(
		e: FocusEvent & { currentTarget: EventTarget & HTMLButtonElement }
	) {
		if (action === 'open-consent-dialog') {
			warmDialog();
		}
		onfocus?.(e);
	};

	const handlePointerEnter = function handlePointerEnter(
		e: PointerEvent & { currentTarget: EventTarget & HTMLButtonElement }
	) {
		if (action === 'open-consent-dialog') {
			warmDialog();
		}
		onpointerenter?.(e);
	};

	const defaultThemeKey = $derived(
		variant === 'primary'
			? ('buttonPrimary' as const)
			: ('buttonSecondary' as const)
	);

	const variantClasses = $derived(
		noStyle
			? ''
			: [buttonStyles.button, baseClassName].filter(Boolean).join(' ')
	);

	const buttonStyle = $derived(
		resolveStyles(
			themeKey ?? defaultThemeKey,
			theme.theme,
			{ className, noStyle },
			noStyle
		)
	);

	const handleClick = async function handleClick(
		e: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }
	) {
		onclick?.(e);
		if (e.defaultPrevented || !performDefaultAction) {
			return;
		}
		const { state } = consent;
		// The surface closes as soon as the choice is recorded locally. A
		// failed request is reported through `onError` and stays queued for
		// replay; a stale draft keeps the dialog open for review. Either way
		// the click handler has nobody to rethrow the rejection to.
		const save = async (type: 'all' | 'necessary' | 'custom') => {
			try {
				await state.saveConsents(type);
			} catch {
				// See above.
			}
		};
		switch (action) {
			case 'accept-consent':
				await save('all');
				return;
			case 'reject-consent':
				await save('necessary');
				return;
			case 'custom-consent':
				await save('custom');
				return;
			case 'dismiss-notice':
				await state.dismissNotice();
				break;
			case 'open-consent-dialog':
				state.setActiveUI('dialog');
				return;
			case 'set-consent':
				if (category) {
					state.setSelectedConsent(category, true);
				}
				return;
			default:
				return;
		}
		if (closeConsentBanner || closeConsentDialog) {
			state.setActiveUI('none');
		}
	};
</script>

<button
	bind:this={ref}
	type="button"
	class={[variantClasses, buttonStyle.className].filter(Boolean).join(' ')}
	data-variant={noStyle ? undefined : variant}
	data-mode={noStyle ? undefined : mode}
	data-size={noStyle ? undefined : size}
	style={toStyleAttributeValue(buttonStyle.style)}
	{...restProps}
	onclick={handleClick}
	onfocus={handleFocus}
	onpointerenter={handlePointerEnter}
>
	{#if children}
		{@render children()}
	{/if}
</button>
