<script lang="ts">
	import { ConsentBanner, ConsentDialog, ConsentProvider } from '@inth/svelte';

	const projectUrl = 'https://your-project.inth.app';
</script>

<!-- Tailwind 3 builds c15t's stylesheet from app.css. -->
<ConsentProvider
	{projectUrl}
	persistence={false}
	styles={false}
>
	<p
		class="bg-emerald-600 text-white"
		data-testid="tailwind-probe"
	>
		Tailwind utilities are active on this page.
	</p>
	<!-- #region docs:slot -->
	<ConsentBanner class="!p-[7px] dark:!p-[11px]" />
	<!-- #endregion docs:slot -->
	<ConsentDialog />
</ConsentProvider>
