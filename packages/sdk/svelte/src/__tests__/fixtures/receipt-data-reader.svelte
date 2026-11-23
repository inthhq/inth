<script lang="ts">
	import { useOptOutReceiptData } from '../../lib/components/parts/use-opt-out-receipt-data.svelte';

	const data = useOptOutReceiptData();
</script>

<span data-testid="receipt-reference">{data.current.reference ?? 'none'}</span>
