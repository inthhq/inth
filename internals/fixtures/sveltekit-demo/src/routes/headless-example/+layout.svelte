<script lang="ts">
	import {
		ConsentDialog,
		ConsentDialogLink,
		ConsentProvider,
		hosted,
	} from '@inth/svelte';

	import CustomConsentBanner from '#lib/custom-consent-banner.svelte';
	import { scripts } from '#lib/example-scripts.js';
	import { testBackend } from '#lib/test-backend.js';

	let { children } = $props();

	const backend = {
		projectUrl: 'https://your-project.inth.app',
		...testBackend('projectUrl'),
	};
</script>

<ConsentProvider
	{...backend}
	{scripts}
>
	{@render children()}
	<footer>
		<ConsentDialogLink>Privacy settings</ConsentDialogLink>
	</footer>
	<CustomConsentBanner />
	<ConsentDialog />
</ConsentProvider>
