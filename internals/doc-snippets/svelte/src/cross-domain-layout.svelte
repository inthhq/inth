<!-- #region docs:cross-domain-layout title="+layout.svelte" -->
<script lang="ts">
	// oxlint-disable-next-line import/newline-after-import -- The cross-domain guide shows this code as written. // docs:hide
	import { InthProvider } from '@inth/svelte';
	let { data, children } = $props();
</script>

<InthProvider
	projectUrl={import.meta.env.VITE_INTH_PROJECT_URL}
	user={data.user}
	userConsent={data.userConsent}
>
	{@render children()}
</InthProvider>
<!-- #endregion docs:cross-domain-layout -->
