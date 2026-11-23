<script lang="ts">
	import {
		ConsentBanner,
		ConsentDialog,
		ConsentDialogLink,
		InthProvider,
		hosted,
	} from '@inth/svelte';

	import ExamplePage from './example-page.svelte';
	import { scripts } from './scripts';
	import { testBackend } from './test-backend';

	const backend = {
		projectUrl: 'https://your-project.inth.app',
		...testBackend('projectUrl'),
	};
</script>

<InthProvider
	{...backend}
	{scripts}
>
	<ExamplePage />
	<footer>
		<ConsentDialogLink>Privacy settings</ConsentDialogLink>
	</footer>
	<ConsentBanner />
	<ConsentDialog />
</InthProvider>
