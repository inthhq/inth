<script lang="ts">
	import { BRAND_MARKS } from '@inth/sdk/ui/utils';
	import type { BrandMark } from '@inth/sdk/ui/utils';

	let { mark }: { mark: BrandMark } = $props();

	const glyph = $derived(BRAND_MARKS[mark]);
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox={glyph.viewBox}
	fill="none"
	aria-hidden="true"
>
	{#each glyph.paths as path (path.d)}
		<path
			fill="currentColor"
			fill-rule={path.evenOdd ? 'evenodd' : undefined}
			clip-rule={path.evenOdd ? 'evenodd' : undefined}
			d={path.d}
		/>
	{/each}
</svg>
