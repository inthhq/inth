<script lang="ts">
	import { ConsentBanner, ConsentDialog, ConsentProvider } from '@inth/svelte';

	import '../app.css';

	let { children } = $props();

	const projectUrl = 'https://your-project.inth.app';
</script>

<!-- Tailwind 3 builds inth's stylesheet from app.css. -->
<ConsentProvider
	{projectUrl}
	persistence={false}
	styles={false}
>
	{@render children()}
	<!-- #region docs:slot -->
	<ConsentBanner class="!p-[7px] dark:!p-[11px]" />
	<!-- #endregion docs:slot -->
	<ConsentDialog />
</ConsentProvider>
