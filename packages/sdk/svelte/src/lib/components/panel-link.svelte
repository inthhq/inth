<script lang="ts">
	import type { PolicyRight } from '@inth/sdk/schema/types';
	import { activateOptOutLink } from '@inth/sdk/surface-actions';
	import { resolveOptOutLink } from '@inth/sdk/surface-state';
	import legalLinkStyles from '@inth/sdk/ui/styles/components/legal-links';
	import type { Snippet } from 'svelte';

	import { getConsentContext, getThemeContext } from '../get-consent-context.svelte';
	import ConsentButton from './action-button.svelte';
	import OptOutIcon from './icons/opt-out-icon.svelte';

	const consent = getConsentContext();
	const theme = getThemeContext();

	let {
		children,
		right,
		noStyle = true,
		onclick,
		...restProps
	}: {
		children?: Snippet;
		right?: Exclude<PolicyRight, 'disclosure'>;
		noStyle?: boolean;
		onclick?: (e: MouseEvent) => void;
		'data-testid'?: string;
		[key: string]: unknown;
	} = $props();

	const isOptOut = $derived(right === 'opt-out');
	const optOutLink = $derived(
		isOptOut
			? resolveOptOutLink(
					consent.state.copy,
					consent.state.presentation?.optOutLink
				)
			: null
	);
	const showOptOutIcon = $derived(optOutLink?.variant === 'privacy-choices');
	const defaultLabel = $derived(
		optOutLink
			? optOutLink.label
			: consent.state.copy.consentManagerDialog.title
	);

	const handleClick = function handleClick(e: MouseEvent) {
		onclick?.(e);
		if (optOutLink && !e.defaultPrevented) {
			e.preventDefault();
			void activateOptOutLink(consent.kernel, optOutLink.variant);
		}
	};
</script>

{#if consent.state.hasConsentPreferences}
	<ConsentButton
		action="open-consent-dialog"
		{noStyle}
		data-testid="consent-dialog-link"
		data-inth-rights={consent.snapshot.policyRule.rights.join(' ')}
		data-right={right}
		data-opt-out-variant={optOutLink?.variant}
		onclick={handleClick}
		{...restProps}
	>
		{#if showOptOutIcon}<OptOutIcon
				class={theme.noStyle ? '' : legalLinkStyles.optOutIcon || ''}
				sized={!theme.noStyle}
			/>{/if}{#if children}{@render children()}{:else}{defaultLabel}{/if}
	</ConsentButton>
{/if}
