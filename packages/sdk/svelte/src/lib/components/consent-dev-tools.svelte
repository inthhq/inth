<script lang="ts">
	import { createDevTools } from '@inth/sdk/devtools';
	import { attachDevToolsLauncher } from '@inth/sdk/ui/utils/devtools-launcher';
	import { untrack } from 'svelte';

	import { getConsentContext } from '../get-consent-context.svelte';
	import type { ConsentDevToolsProps } from '../devtools-options.model';

	let {
		clearRecords,
		getPresentation,
		defaultOpen,
		defaultTab,
		getConsentCategories,
		maxEvents,
		position,
		shadow,
	}: ConsentDevToolsProps = $props();
	const context = getConsentContext();
	// Snapshot updates can return a new array with the same categories. Only
	// recreate the inspector when the displayed scope actually changes.
	const categoryKey = $derived(
		JSON.stringify(
			[
				...new Set(getConsentCategories?.() ?? context.state.consentCategories),
			].sort()
		)
	);

	const viewKey = $derived(
		JSON.stringify({
			categoryKey,
			defaultOpen,
			defaultTab,
			maxEvents,
			position,
			shadow,
		})
	);

	$effect(() => {
		const { categoryKey: scopeKey, ...settings } = JSON.parse(viewKey) as Pick<
			ConsentDevToolsProps,
			'defaultOpen' | 'defaultTab' | 'maxEvents' | 'position' | 'shadow'
		> & { categoryKey: string };
		const categories = JSON.parse(scopeKey) as ReturnType<
			NonNullable<ConsentDevToolsProps['getConsentCategories']>
		>;
		const options = {
			...settings,
			clearRecords: () => (clearRecords ?? context.clearRecords)(),
			getConsentCategories: () => categories,
			getPresentation: () =>
				getPresentation ? getPresentation() : context.state.presentation,
			kernel: context.kernel,
		};
		// A visible ConsentDialogTrigger for the same kernel can render the
		// launcher instead.
		const devTools = attachDevToolsLauncher(
			options.kernel,
			untrack(() => createDevTools(options))
		);

		return () => devTools.destroy();
	});
</script>
