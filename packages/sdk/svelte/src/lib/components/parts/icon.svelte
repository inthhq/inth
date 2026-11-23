<script lang="ts">
	/** The prompt's and dialog's icons, as React draws them. */
	let {
		name,
		size = 14,
	}: {
		name:
			| 'check'
			| 'chevron-down'
			| 'chevron-end'
			| 'close'
			| 'copy'
			| 'external';
		size?: number;
	} = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={name === 'check' ? '2.5' : '2'}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#if name === 'check'}
		<path d="M20 6 9 17l-5-5" />
	{:else if name === 'chevron-down'}
		<path d="m6 9 6 6 6-6" />
	{:else if name === 'chevron-end'}
		<path d="m9 6 6 6-6 6" />
	{:else if name === 'close'}
		<path d="M18 6 6 18M6 6l12 12" />
	{:else if name === 'copy'}
		<rect
			x="9"
			y="9"
			width="13"
			height="13"
			rx="2"
		/>
		<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
	{:else}
		<path
			d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"
		/>
	{/if}
</svg>
