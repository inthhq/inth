<script lang="ts">
	/**
	 * Consent gate page, after CookieBench's SvelteKit fixture
	 * (`with-c15t-sveltekit/src/routes/+layout.svelte`): `ConsentRoot` with
	 * the server-resolved state, the stock banner and dialog, and the gated
	 * scripts passed as `scripts`.
	 */
	import {
		gateConsentCategories,
		gatePageCSS,
		gateScripts,
	} from '@c15t/benchmarking/consent-gate-page';
	import {
		ConsentBanner,
		ConsentDialog,
		ConsentDialogLink,
		ConsentRoot,
	} from '@c15t/svelte';

	import GateBridge from './gate-bridge.svelte';

	let { children, data } = $props();
	const scripts = gateScripts();
</script>

<svelte:head>
	<title>Field notes</title>
	{@html `<style>${gatePageCSS}</style>`}
</svelte:head>
<ConsentRoot
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
</ConsentRoot>
