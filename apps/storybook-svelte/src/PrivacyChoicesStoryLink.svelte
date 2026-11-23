<script lang="ts">
	import {
		resolveOptOutLink,
		resolveOptOutState,
	} from '@inth/sdk/surface-state';
	import bannerStyles from '@inth/sdk/ui/styles/components/consent-banner';
	import { getConsentManager, getSnapshot } from '@inth/svelte';

	import OptOutIcon from '../../../packages/sdk/svelte/src/lib/components/icons/opt-out-icon.svelte';

	/**
	 * The page's "Your Privacy Choices" link, as React's stock
	 * `PrivacyChoicesLink` renders it with its defaults: shown only where
	 * the visitor has an opt-out right, unstyled, with the opt-out icon.
	 * Svelte has no stock link yet, so the stories render the same markup.
	 */
	const consent = getConsentManager();
	const snapshot = $derived(getSnapshot());

	const shown = $derived(
		snapshot.resolution.status === 'matched' &&
			!snapshot.externalPermissions &&
			resolveOptOutState(snapshot).available &&
			snapshot.policyRule.rights.includes('opt-out')
	);
	const optOutLink = $derived(
		resolveOptOutLink(consent.copy, consent.presentation?.optOutLink)
	);
</script>

{#if shown}
	<button
		type="button"
		data-testid="privacy-choices-link"
		data-inth-rights={snapshot.policyRule.rights.join(' ')}
		data-opt-out-variant={optOutLink.variant}
		onclick={() => consent.setActiveUI('dialog')}
	>
		{#if optOutLink.variant === 'privacy-choices'}
			<OptOutIcon class={bannerStyles.optOutIcon} />
		{/if}
		{optOutLink.label}
	</button>
{/if}
