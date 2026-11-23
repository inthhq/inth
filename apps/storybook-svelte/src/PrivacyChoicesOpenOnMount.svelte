<script lang="ts">
	import { getConsentManager } from '@inth/svelte';

	/** Opens the dialog once the page renders, as the page link would. */
	const consent = getConsentManager();
	$effect(() => {
		if (consent.hasConsentUi) {
			consent.setActiveUI('dialog');
		}
	});
</script>
