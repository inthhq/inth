<script lang="ts">
	import { useOptOutReceiptData } from '../../lib/components/parts/session.svelte';

	const data = useOptOutReceiptData();
</script>

<span data-testid="receipt-reference">{data.current.reference ?? 'none'}</span>
