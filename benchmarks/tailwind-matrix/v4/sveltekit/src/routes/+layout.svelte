<script lang="ts">
	import { ConsentBanner, ConsentDialog, ConsentProvider } from '@c15t/svelte';

	import '../app.css';

	let { children } = $props();

	const backendURL = 'https://your-project.inth.app';
</script>

<ConsentProvider
	{backendURL}
	persistence={false}
>
	{@render children()}
	<!-- #region docs:slot -->
	<ConsentBanner class="p-[7px] dark:p-[11px]" />
	<!-- #endregion docs:slot -->
	<ConsentDialog />
</ConsentProvider>
