<script lang="ts">
	import styles from '@inth/sdk/ui/styles/components/branding';
	import {
		resolveBrandingTag,
		resolveStyles,
		toStyleAttributeValue,
	} from '@inth/sdk/ui/utils';
	import type { BrandingSurface } from '@inth/sdk/ui/utils';
	import { onMount } from 'svelte';

	import {
		getConsentContext,
		getThemeContext,
	} from '../get-consent-context.svelte';
	import BrandMark from './icons/brand-mark.svelte';

	let {
		surface,
		hideBranding = false,
		noStyle: localNoStyle,
	}: {
		surface: BrandingSurface;
		hideBranding?: boolean;
		noStyle?: boolean;
	} = $props();

	const consent = getConsentContext();
	const theme = getThemeContext();

	const noStyle = $derived(localNoStyle ?? theme.noStyle ?? false);
	const translations = $derived(consent.state.copy);

	let hostname = $state('');
	onMount(() => {
		({ hostname } = window.location);
	});
	const tag = $derived(
		hideBranding
			? null
			: resolveBrandingTag({
					branding: consent.state.branding,
					hostname,
					noStyle,
					styles,
					surface,
				})
	);
	const rootStyle = $derived(
		tag
			? resolveStyles(
					tag.slot,
					theme.theme,
					{ baseClassName: tag.classes.root },
					noStyle
				)
			: undefined
	);
</script>

{#if tag}
	<!-- No `dir` here: the copy follows the page direction and only the
	     wordmark below is pinned to LTR. -->
	<a
		class={rootStyle?.className || undefined}
		style={toStyleAttributeValue(rootStyle?.style)}
		href={tag.href}
		data-branding={tag.brand}
		data-variant={tag.variant}
		data-testid={tag.testId}
	>
		<span
			class={tag.classes.content || undefined}
			data-slot="tag-content"
		>
			<span class={tag.classes.copy || undefined}>
				<span class={tag.classes.text || undefined}
					>{translations.common.securedBy}</span
				>
			</span>
			<span
				dir="ltr"
				class={tag.classes.wordmark || undefined}
			>
				{#if tag.brand === 'inth'}
					<BrandMark mark="inth" />
				{:else}
					<span class={tag.classes.mark || undefined}>
						<BrandMark mark="c15t" />
					</span>
					<span class={tag.classes.label || undefined}>c15t</span>
				{/if}
			</span>
		</span>
	</a>
{/if}
