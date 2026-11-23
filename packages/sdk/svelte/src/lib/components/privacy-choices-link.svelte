<script lang="ts">
	/**
	 * `PrivacyChoicesLink`: the footer link for US state opt-out regions that
	 * opens the preference dialog.
	 *
	 * It renders the title resolved from `presentation.optOutLink` (or the
	 * `variant` prop), with the California Privacy Protection Agency opt-out
	 * icon beside both Privacy Choices titles and no icon beside the
	 * statutory "Do Not Sell or Share My Personal Information" title.
	 * Activating it always opens the preference dialog and never records an
	 * opt-out on its own.
	 *
	 * It is also the way back into the dialog under an opt-in policy, in the
	 * US or the EU: it reads "Your Privacy Choices" there, with no opt-out
	 * icon, since no opt-out right is offered.
	 *
	 * Renders nothing when no policy has resolved yet, or when an external
	 * consent source owns consent.
	 */
	import type { OptOutLinkVariant } from '@inth/sdk/surface-state';
	import { resolvePrivacyChoicesLink } from '@inth/sdk/surface-state';
	import legalLinkStyles from '@inth/sdk/ui/styles/components/legal-links';
	import type { Snippet } from 'svelte';

	import { getConsentContext, getThemeContext } from '../context.svelte';
	import ConsentButton from './action-button.svelte';
	import OptOutIcon from './icons/opt-out-icon.svelte';

	let {
		children,
		variant,
		noStyle = true,
		...restProps
	}: {
		/**
		 * Custom link content. Defaults to the title resolved for the
		 * configured `presentation.optOutLink` or the `variant` prop.
		 */
		children?: Snippet;
		/**
		 * Override `presentation.optOutLink` for this link:
		 * `'privacy-choices'`, `'california-privacy-choices'`, or
		 * `'do-not-sell'`.
		 */
		variant?: OptOutLinkVariant;
		noStyle?: boolean;
		onclick?: (e: MouseEvent) => void;
		class?: string;
		'data-testid'?: string;
		[key: string]: unknown;
	} = $props();

	const consent = getConsentContext();
	const theme = getThemeContext();

	const optOutLink = $derived(
		resolvePrivacyChoicesLink(consent.snapshot, consent.state.copy, {
			variant: variant ?? consent.state.presentation?.optOutLink,
		})
	);
</script>

{#if optOutLink}
	<ConsentButton
		action="open-consent-dialog"
		{noStyle}
		data-testid="privacy-choices-link"
		data-inth-rights={consent.snapshot.policyRule.rights.join(' ')}
		data-opt-out-variant={optOutLink.variant === 'choices'
			? undefined
			: optOutLink.variant}
		{...restProps}
	>
		{#if optOutLink.icon}<OptOutIcon
				class={theme.noStyle ? '' : legalLinkStyles.optOutIcon || ''}
				sized={!theme.noStyle}
			/>{/if}{#if children}{@render children()}{:else}{optOutLink.label}{/if}
	</ConsentButton>
{/if}
