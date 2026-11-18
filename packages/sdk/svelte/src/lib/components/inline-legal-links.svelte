<script lang="ts">
	import type { LegalLinks as LegalLinksType } from '@inth/sdk/engine';
	import { defaultTranslationConfig } from '@inth/sdk/surface-state';
	import legalLinkStyles from '@inth/sdk/ui/styles/components/legal-links';
	import {
		resolveLegalLinkEntries,
		resolveTranslations,
	} from '@inth/sdk/ui/utils';

	import { getConsentContext, getThemeContext } from '../context.svelte';

	// No theme slot: the React and Vue legal links take only the stock link
	// class, and the description's slot belongs to the description.
	let {
		links,
		testIdPrefix,
	}: {
		links?: (keyof LegalLinksType)[] | null;
		testIdPrefix?: string;
	} = $props();

	const consent = getConsentContext();
	const theme = getThemeContext();

	const linkClassName = $derived(
		theme.noStyle ? undefined : legalLinkStyles.legalLink || undefined
	);

	const entries = $derived(
		resolveLegalLinkEntries(
			consent.state.legalLinks,
			links,
			resolveTranslations(
				consent.state.translationConfig,
				defaultTranslationConfig
			).legalLinks
		)
	);
</script>

<!--
	A space before the links and after each comma, as in React's
	`InlineLegalLinks`. Plain spaces collapse into one; a non-breaking space
	would not, and widened the gaps.
-->
{#if entries.length > 0}
	<span>
		{' '}
		{#each entries as link (link.key)}
			<span>
				<a
					href={link.href}
					target={link.target}
					rel={link.rel}
					class={linkClassName}
					data-testid={testIdPrefix ? `${testIdPrefix}-${link.key}` : undefined}
				>
					{link.label}{link.separated ? ',' : ''}
				</a>
				{#if link.separated}
					{' '}
				{/if}
			</span>
		{/each}
	</span>
{/if}
