<script lang="ts">
	import {
		ConsentBanner,
		ConsentDialog,
		ConsentDialogLink,
	} from '@inth/svelte';
	import { InthProvider } from '@inth/svelte/kit';

	import { scripts } from '#lib/example-scripts.js';

	let { children, data } = $props();
</script>

<InthProvider
	state={data.consent}
	{scripts}
>
	{@render children()}
	<footer>
		<ConsentDialogLink>Privacy settings</ConsentDialogLink>
	</footer>
	<ConsentBanner />
	<ConsentDialog />
</InthProvider>
