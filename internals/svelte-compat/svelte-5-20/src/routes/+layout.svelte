<script lang="ts">
	import { posthog } from '@inth/integrations/posthog';
	import {
		ConsentBanner,
		ConsentDialog,
		ConsentDialogLink,
		ConsentRoot,
	} from '@inth/svelte';

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

<ConsentRoot
	state={data.consent}
	{scripts}
>
	{@render children()}
	<footer>
		<ConsentDialogLink>Privacy settings</ConsentDialogLink>
	</footer>
	<ConsentBanner />
	<ConsentDialog />
</ConsentRoot>
