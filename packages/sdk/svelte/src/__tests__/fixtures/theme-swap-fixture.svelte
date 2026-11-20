<script lang="ts">
	import type { KernelOverrides, KernelUser } from '@inth/sdk/engine';
	import type { Theme } from '@inth/sdk/ui/theme';

	import InthProvider from '../../lib/components/inth-provider.svelte';
	import type { ConsentManagerOptions } from '../../lib/types';

	let {
		mode,
		theme,
		user,
		overrides,
	}: {
		mode: ConsentManagerOptions['mode'];
		theme?: Theme;
		user?: KernelUser;
		overrides?: KernelOverrides;
	} = $props();

	// A fresh object literal every time any prop changes — the shape that
	// used to re-run the provider's identify and overrides effects.
	const options = $derived({
		mode,
		overrides,
		theme,
		user,
	} as ConsentManagerOptions);
</script>

<InthProvider {options}>
	<div data-testid="theme-swap-child">child</div>
</InthProvider>
