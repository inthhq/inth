<script lang="ts">
	import { getConsentManager } from '@inth/svelte';
	import { onMount } from 'svelte';

	const consent = getConsentManager();

	onMount(() => {
		consent.setActiveUI('banner', { force: true });
	});
</script>
