<script lang="ts">
	import { getConsentManager } from '@inth/svelte';

	import type { PrivacyChoicesRegion } from './privacy-choices-story-policies';
	import PrivacyChoicesStoryLink from './PrivacyChoicesStoryLink.svelte';

	/**
	 * A plain page under the dialog, with the persistent page links, as
	 * React's dialog stories render it: the site's own link to the dialog
	 * where the stock "Your Privacy Choices" link does not render (the EU,
	 * and US opt-in, where it needs an opt-out right the visitor can use).
	 */
	let { region }: { region: PrivacyChoicesRegion } = $props();

	const consent = getConsentManager();
</script>

{#snippet settingsLink(label: string)}
	<button
		type="button"
		data-testid="consent-dialog-trigger"
		style="background: none; border: 0px; color: inherit; cursor: pointer; font: inherit; padding: 0px; text-decoration: underline;"
		onclick={() => consent.setActiveUI('dialog')}
	>
		{label}
	</button>
{/snippet}

<main
	style="font-family: system-ui, sans-serif; line-height: 1.6; margin: 0 auto; max-width: 720px; min-height: 160vh; padding: 48px 24px;"
>
	<h1>Acme Outdoor</h1>
	<p>
		Tents, packs and stoves for every season. Browse the catalogue, read the
		field guides, or find a store near you.
	</p>
	<footer style="display: flex; gap: 24px; margin-top: 48px;">
		{#if region === 'eu'}
			{@render settingsLink('Privacy settings')}
		{/if}
		{#if region === 'us-opt-in'}
			{@render settingsLink('Your Privacy Choices')}
		{/if}
		{#if region !== 'eu' && region !== 'us-opt-in'}
			<PrivacyChoicesStoryLink />
		{/if}
	</footer>
</main>
