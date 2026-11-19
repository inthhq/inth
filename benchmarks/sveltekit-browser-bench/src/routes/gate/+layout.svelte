<script lang="ts">
	/**
	 * Consent gate page, after CookieBench's SvelteKit fixture
	 * (`with-inth-sveltekit/src/routes/+layout.svelte`): `InthProvider` with
	 * the server-resolved state, the stock banner and dialog, and the gated
	 * scripts passed as `scripts`.
	 */
	import {
		gateConsentCategories,
		gatePageCSS,
		gateScripts,
	} from '@inth/benchmarking/consent-gate-page';
	import {
		ConsentBanner,
		ConsentDialog,
		ConsentDialogLink,
	} from '@inth/svelte';
	import { InthProvider } from '@inth/svelte/kit';

	import GateBridge from './gate-bridge.svelte';

	let { children, data } = $props();
	const scripts = gateScripts();
</script>

<svelte:head>
	<title>Field notes</title>
	{@html `<style>${gatePageCSS}</style>`}
</svelte:head>
<InthProvider
	state={data.consent}
	consentCategories={[...gateConsentCategories]}
	{scripts}
>
	{@render children()}
	<GateBridge />
	<ConsentBanner />
	<ConsentDialog />
	<!-- The gate reopens the choice here to replay a change of mind. -->
	<ConsentDialogLink>Privacy settings</ConsentDialogLink>
</InthProvider>
