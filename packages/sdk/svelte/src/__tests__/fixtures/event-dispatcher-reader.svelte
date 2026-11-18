<script lang="ts">
	import type {
		EventDispatcher,
		RuntimeEventDispatcherOptions,
	} from '@inth/sdk/events';
	import { untrack } from 'svelte';

	import { getEventDispatcher } from '../../lib/event-dispatcher';

	let {
		options,
		capture,
	}: {
		options: () => RuntimeEventDispatcherOptions;
		capture: (events: EventDispatcher) => void;
	} = $props();
	const events = untrack(() => getEventDispatcher(options));
	untrack(() => capture(events));
</script>
