<script lang="ts">
	import { CPPA_OPT_OUT_ICON } from '@inth/sdk/ui/utils/opt-out-icon';

	/** The glyph is 14px tall at its own ratio when it carries its size. */
	const HEIGHT = 14;

	let {
		class: className = '',
		sized = false,
	}: {
		class?: string;
		/**
		 * Give the SVG its own `width` and `height`, for pages that never load
		 * the classic banner sheet that sizes it. A stylesheet still wins.
		 */
		sized?: boolean;
	} = $props();

	const [, , viewWidth = HEIGHT, viewHeight = HEIGHT] =
		CPPA_OPT_OUT_ICON.viewBox.split(' ').map(Number);
	const width = Math.round((HEIGHT * viewWidth) / viewHeight);
</script>

<svg
	aria-hidden="true"
	class={className || undefined}
	focusable="false"
	width={sized ? width : undefined}
	height={sized ? HEIGHT : undefined}
	viewBox={CPPA_OPT_OUT_ICON.viewBox}
	xmlns="http://www.w3.org/2000/svg"
>
	{#each CPPA_OPT_OUT_ICON.paths as path (path.d)}
		<path
			clip-rule={path.evenOdd ? 'evenodd' : undefined}
			d={path.d}
			fill={path.fill}
			fill-rule={path.evenOdd ? 'evenodd' : undefined}
		/>
	{/each}
</svg>
