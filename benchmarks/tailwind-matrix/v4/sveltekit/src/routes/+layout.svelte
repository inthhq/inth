<script lang="ts">
	import { ConsentBanner, ConsentDialog, ConsentProvider } from '@c15t/svelte';

	import '../app.css';

	let { children } = $props();

	const projectUrl = 'https://your-project.inth.app';
</script>

<ConsentProvider
	{projectUrl}
	persistence={false}
>
	{@render children()}
	<!-- #region docs:slot -->
	<ConsentBanner class="p-[7px] dark:p-[11px]" />
	<!-- #endregion docs:slot -->
	<ConsentDialog />
</ConsentProvider>
