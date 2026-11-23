<script lang="ts">
	import {
		ConsentBanner,
		ConsentDialog,
		ConsentDialogLink,
		InthProvider,
	} from '@inth/svelte';

	import '../app.css';

	let { children } = $props();

	const projectUrl = 'https://your-project.inth.app';
</script>

<!-- Tailwind 3 builds Inth's stylesheet from app.css. -->
<InthProvider
	{projectUrl}
	persistence={false}
	styles={false}
>
	{@render children()}
	<ConsentDialogLink />
	<!-- #region docs:slot -->
	<ConsentBanner class="!p-[7px] dark:!p-[11px]" />
	<!-- #endregion docs:slot -->
	<ConsentDialog />
</InthProvider>
