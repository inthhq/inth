<script lang="ts">
	/**
	 * The `/consent-example` layout with the banner-shape experiment.
	 * `?experiment=1` runs it and lets Inth pick the arm; `&arm=wall` sets
	 * the arm the way a flag provider would. Without the param the provider
	 * gets no `experiment` option.
	 */
	import { page } from '$app/state';
	import {
		ConsentBanner,
		ConsentDialog,
		ConsentDialogLink,
	} from '@inth/svelte';
	import { InthProvider } from '@inth/svelte/kit';

	import { scripts } from '#lib/example-scripts.js';
	import {
		experimentCallbacks,
		experimentFromSearch,
	} from '#lib/experiment.svelte.js';

	let { children, data } = $props();

	// Read once: the provider takes its experiment at mount.
	const experiment = experimentFromSearch(page.url.searchParams);
</script>

<InthProvider
	callbacks={experiment ? experimentCallbacks : undefined}
	{experiment}
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
