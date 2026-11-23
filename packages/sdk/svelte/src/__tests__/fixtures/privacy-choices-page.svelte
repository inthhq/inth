<script lang="ts">
	import type { ConsentSnapshot } from '@inth/sdk/engine';
	import { resolveOptOutState } from '@inth/sdk/surface-state';

	import { getConsentContext } from '../../lib/context.svelte';

	/**
	 * The page under a Privacy Choices surface: a plain page action, the
	 * "Your Privacy Choices" link where the policy offers an opt-out right
	 * (as React's `PrivacyChoicesLink` renders it), the site's own link to
	 * the dialog, and a probe that hands the snapshot to the test.
	 */
	let {
		probe,
		triggerLabel = 'Your Privacy Choices',
	}: {
		probe: { snapshot: ConsentSnapshot | null };
		/** The site's own link to the dialog. */
		triggerLabel?: string;
	} = $props();

	const consent = getConsentContext();

	const hasOptOutRight = $derived(
		consent.snapshot.resolution.status === 'matched' &&
			!consent.snapshot.externalPermissions &&
			resolveOptOutState(consent.snapshot).available &&
			consent.snapshot.policyRule.rights.includes('opt-out')
	);

	$effect(() => {
		probe.snapshot = consent.snapshot;
	});
</script>

<button type="button">Page action</button>
{#if hasOptOutRight}
	<button
		type="button"
		data-testid="privacy-choices-link"
		onclick={() => consent.state.setActiveUI('dialog')}
	>
		Your Privacy Choices
	</button>
{/if}
<button
	type="button"
	data-testid="consent-dialog-trigger"
	onclick={() => consent.state.setActiveUI('dialog')}
>
	{triggerLabel}
</button>
