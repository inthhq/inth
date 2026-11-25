<script
	lang="ts"
	module
>
	import { importChunk } from '@inth/sdk/runtime/import-chunk';

	import type OptInConfirmationComponent from './opt-in-confirmation.svelte';

	let pending: Promise<typeof OptInConfirmationComponent> | null = null;

	const loadConfirmation = function loadConfirmation(): Promise<
		typeof OptInConfirmationComponent
	> {
		pending ??= (async () => {
			try {
				return await importChunk(
					() => import('./opt-in-confirmation.svelte'),
					(module) =>
						typeof module.default === 'function' ? module.default : undefined
				);
			} catch (error) {
				pending = null;
				throw error;
			}
		})();
		return pending;
	};
</script>

<script lang="ts">
	import { getConsentContext } from '../../get-consent-context.svelte';
	import { useOptInConfirmationHost } from './use-opt-in-confirmation-host.svelte';

	const props: {
		noStyle?: boolean;
		disableAnimation?: boolean;
		scrollLock?: boolean;
		trapFocus?: boolean;
	} = $props();

	const consent = getConsentContext();
	const host = useOptInConfirmationHost(() => consent.kernel);
	let Confirmation = $state<typeof OptInConfirmationComponent | null>(null);

	$effect(() => {
		if (!host.active || Confirmation) {
			return;
		}
		void (async () => {
			try {
				Confirmation = await loadConfirmation();
			} catch {
				// Next open retries.
			}
		})();
	});
</script>

{#if Confirmation}
	<Confirmation
		open={host.active}
		noStyle={props.noStyle}
		disableAnimation={props.disableAnimation}
		scrollLock={props.scrollLock}
		trapFocus={props.trapFocus}
	/>
{/if}
