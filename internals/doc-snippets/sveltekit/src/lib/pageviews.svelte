<!-- #region docs:pageviews title="src/lib/pageviews.svelte" -->
<script lang="ts">
	import { page } from '$app/state';
	import { getEventDispatcher } from '@inth/svelte';

	// Render inside InthProvider in the root +layout.svelte.
	const events = getEventDispatcher({ pageviews: ['posthog'] });

	$effect(() => {
		events.pageview(page.url.pathname + page.url.search);
	});
</script>
<!-- #endregion docs:pageviews -->
