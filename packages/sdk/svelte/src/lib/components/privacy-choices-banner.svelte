<script lang="ts">
	/**
	 * The stock banner's Privacy Choices design (`design: 'privacy-choices'`).
	 * It renders the prompt for the resolved container once a choice is
	 * owed, and keeps it mounted after, so its exit, the page announcement
	 * and the focus return outlive the prompt. Only the resolved
	 * presentation's stylesheet reaches the page; a page that never owes a
	 * choice, or keeps the classic design, inserts none of them.
	 */
	import type {
		LegalLinks as LegalLinksType,
		Model,
		PresentationAction,
		ResolvedConsentPresentation,
	} from '@inth/sdk/engine';
	import { untrack } from 'svelte';

	import { getConsentContext } from '../context.svelte';
	import Surface from './privacy-choices-prompt/surface.svelte';

	let {
		container,
		...rest
	}: {
		container: NonNullable<ResolvedConsentPresentation['container']>;
		noStyle?: boolean;
		disableAnimation?: boolean;
		legalLinks?: (keyof LegalLinksType)[] | null;
		hideBranding?: boolean;
		models?: Model[];
		title?: string;
		description?: string;
		rejectButtonText?: string;
		acceptButtonText?: string;
		customizeButtonText?: string;
		dismissButtonText?: string;
		actionGroups?: readonly (readonly PresentationAction[])[];
	} = $props();

	const consent = getConsentContext();
	let owed = $state(untrack(() => consent.state.activeUI === 'banner'));
	$effect.pre(() => {
		if (consent.state.activeUI === 'banner') {
			owed = true;
		}
	});
</script>

{#if owed}
	<Surface
		{container}
		{...rest}
	/>
{/if}
