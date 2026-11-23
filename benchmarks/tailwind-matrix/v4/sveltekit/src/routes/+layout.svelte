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

<InthProvider
	{projectUrl}
	persistence={false}
>
	{@render children()}
	<ConsentDialogLink />
	<!-- #region docs:slot -->
	<ConsentBanner class="p-[7px] dark:p-[11px]" />
	<!-- #endregion docs:slot -->
	<ConsentDialog />
</InthProvider>
