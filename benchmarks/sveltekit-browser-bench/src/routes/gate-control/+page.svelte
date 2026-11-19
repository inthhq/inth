<script lang="ts">
	/**
	 * The consent gate's no-CMP control: the same article and stylesheet
	 * with no Inth anywhere in the route's module graph, like `baseline`.
	 */
	import {
		gatePageCSS,
		gatePageHTML,
	} from '@inth/benchmarking/consent-gate-page';
</script>

<svelte:head>
	<title>Field notes</title>
	{@html `<style>${gatePageCSS}</style>`}
</svelte:head>
{@html gatePageHTML}
