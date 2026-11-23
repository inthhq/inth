<script lang="ts">
	import {
		ConsentBanner,
		ConsentDialog,
		ConsentDialogLink,
		InthProvider,
	} from '@inth/svelte';

	const projectUrl = 'https://your-project.inth.app';
</script>

<InthProvider
	{projectUrl}
	persistence={false}
>
	<p
		class="bg-emerald-600 text-white"
		data-testid="tailwind-probe"
	>
		Tailwind utilities are active on this page.
	</p>
	<ConsentDialogLink />
	<!-- #region docs:slot -->
	<ConsentBanner class="p-[7px] dark:p-[11px]" />
	<!-- #endregion docs:slot -->
	<ConsentDialog />
</InthProvider>
