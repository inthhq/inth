<script lang="ts">
	import {
		ConsentBanner,
		ConsentDialog,
		ConsentDialogLink,
		ConsentProvider,
		hosted,
	} from '@c15t/svelte';

	import ExamplePage from './ExamplePage.svelte';
	import { scripts } from './scripts';
	import { testBackend } from './test-backend';

	const backend = {
		projectUrl: 'https://your-project.inth.app',
		...testBackend('projectUrl'),
	};
</script>

<ConsentProvider
	{...backend}
	{scripts}
>
	<ExamplePage />
	<footer>
		<ConsentDialogLink>Privacy settings</ConsentDialogLink>
	</footer>
	<ConsentBanner />
	<ConsentDialog />
</ConsentProvider>
