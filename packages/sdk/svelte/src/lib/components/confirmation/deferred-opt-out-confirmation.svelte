<script
	lang="ts"
	module
>
	import { importChunk } from '@inth/sdk/runtime/import-chunk';

	import type OptOutConfirmationComponent from './opt-out-confirmation.svelte';

	let pending: Promise<typeof OptOutConfirmationComponent> | null = null;

	const loadConfirmation = function loadConfirmation(): Promise<
		typeof OptOutConfirmationComponent
	> {
		pending ??= (async () => {
			try {
				return await importChunk(
					() => import('./opt-out-confirmation.svelte'),
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
	import { claimOptOutConfirmationHost } from '@inth/sdk/surface-actions';

	import { getConsentContext } from '../../get-consent-context.svelte';
	import { useOptOutConfirmationState } from './use-opt-out-confirmation-state.svelte';

	const props: {
		open?: boolean;
		noStyle?: boolean;
		disableAnimation?: boolean;
		/** @internal */
		embedded?: boolean;
		class?: string;
		onclose?: () => void;
	} = $props();

	const consent = getConsentContext();
	const confirmation = useOptOutConfirmationState(() => consent.kernel);
	let Confirmation = $state<typeof OptOutConfirmationComponent | null>(null);

	$effect(() => {
		if (props.embedded) {
			return;
		}
		return claimOptOutConfirmationHost(
			consent.kernel,
			Symbol('OptOutConfirmation')
		);
	});

	const needed = $derived(
		props.open === true ||
			(confirmation.open &&
				(!props.embedded || !confirmation.hasStandaloneHost))
	);

	$effect(() => {
		if (!needed || Confirmation) {
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
	<Confirmation {...props} />
{/if}
