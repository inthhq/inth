<script lang="ts">
	import { posthog } from '@inth/integrations/posthog';
	import {
		ConsentBanner,
		ConsentDialog,
		ConsentDialogLink,
	} from '@inth/svelte';
	import { InthProvider } from '@inth/svelte/kit';

	let { children, data } = $props();

	// A script in a consent category, so Accept saves a category choice
	// rather than only dismissing a notice.
	const scripts = [
		posthog({
			id: 'phc_your_project_key',
			initOptions: { cookieless_mode: 'never' },
			loadMode: 'after-consent',
		}),
	];
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
