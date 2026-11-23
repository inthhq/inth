<script lang="ts">
	import type { ConsentKernel, ConsentSnapshot } from '@inth/sdk/engine';

	import PrivacyChoicesLink from '../../lib/components/privacy-choices-link.svelte';
	import { getConsentContext } from '../../lib/get-consent-context.svelte';

	/**
	 * The page under the consent prompt and dialog: a plain page action, the
	 * stock "Your Privacy Choices" link, the site's own link to the dialog,
	 * and a probe that hands the snapshot and the kernel to the test.
	 */
	let {
		probe,
		triggerLabel = 'Your Privacy Choices',
		oneClickOptOut = false,
		link = true,
	}: {
		probe: {
			snapshot: ConsentSnapshot | null;
			kernel?: ConsentKernel | null;
		};
		/** The site's own link to the dialog. */
		triggerLabel?: string;
		/** A page control that opts out in one click. */
		oneClickOptOut?: boolean;
		/** Render the stock link, which holds the dialog's idle warming. */
		link?: boolean;
	} = $props();

	const consent = getConsentContext();

	$effect(() => {
		probe.snapshot = consent.snapshot;
		probe.kernel = consent.kernel;
	});
</script>

<button type="button">Page action</button>
{#if link}
	<PrivacyChoicesLink />
{/if}
<button
	type="button"
	data-testid="consent-dialog-trigger"
	onclick={() => consent.state.setActiveUI('dialog')}
>
	{triggerLabel}
</button>
{#if oneClickOptOut}
	<button
		type="button"
		data-testid="one-click-opt-out"
		onclick={() => {
			void consent.state.requestOptOut();
		}}
	>
		Do Not Sell
	</button>
{/if}
