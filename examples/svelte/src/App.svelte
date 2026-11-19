<!-- #region docs:app -->
<script lang="ts">
	import { posthog } from '@inth/integrations/posthog';
	import {
		ConsentBanner,
		ConsentDialog,
		ConsentDialogLink,
		ConsentProvider,
		hosted,
	} from '@inth/svelte';

	const scripts = [
		posthog({
			id: 'phc_your_project_key',
			initOptions: { cookieless_mode: 'never' },
			loadMode: 'after-consent',
		}),
	];
</script>

<ConsentProvider
	mode={hosted()}
	{scripts}
>
	<main>
		<h1>Inth + Svelte</h1>
		<p>Your app goes here.</p>
	</main>
	<footer>
		<ConsentDialogLink>Privacy settings</ConsentDialogLink>
	</footer>
	<ConsentBanner />
	<ConsentDialog />
</ConsentProvider>
<!-- #endregion docs:app -->
