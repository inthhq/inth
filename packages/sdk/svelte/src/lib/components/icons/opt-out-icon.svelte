<script lang="ts">
	import { CPPA_OPT_OUT_ICON } from '@inth/sdk/ui/utils/opt-out-icon';

	let { class: className = '' }: { class?: string } = $props();
</script>

<svg
	aria-hidden="true"
	class={className || undefined}
	focusable="false"
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
