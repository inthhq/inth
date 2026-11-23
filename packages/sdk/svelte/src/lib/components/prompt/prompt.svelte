<script lang="ts">
	/**
	 * `ConsentBanner`: the stock consent prompt, a Card, Banner or Drawer.
	 *
	 * It reads the policy to choose its buttons, and renders the prompt for
	 * the resolved container once a choice is owed, keeping it mounted after,
	 * so its exit, the page announcement and the focus return outlive the
	 * prompt. Only the resolved container's stylesheet reaches the page; a
	 * page that never owes a choice inserts none of them.
	 */
	import {
		actionAppearanceFromTheme,
		resolveConsentPresentation,
	} from '@inth/sdk/engine';
	import type {
		ConsentContainer,
		ConsentEdgeStyle,
		LegalLinks as LegalLinksType,
		Model,
	} from '@inth/sdk/engine';
	import { untrack } from 'svelte';

	import { getConsentContext, getThemeContext } from '../../get-consent-context.svelte';
	import DeferredOptInConfirmation from '../confirmation/deferred-opt-in-confirmation.svelte';
	import Surface from './surface.svelte';

	type ConsentBannerButton = 'reject' | 'accept' | 'customize' | 'dismiss';
	type ConsentBannerLayout = (ConsentBannerButton | ConsentBannerButton[])[];

	let {
		noStyle: localNoStyle,
		disableAnimation: localDisableAnimation,
		title,
		description,
		rejectButtonText,
		customizeButtonText,
		acceptButtonText,
		dismissButtonText,
		hideBranding = false,
		legalLinks,
		layout,
		models,
		container,
		edgeStyle,
		blockUntilChoice,
		class: className,
	}: {
		/** Remove the stock styles. Defaults to the provider's `noStyle`. */
		noStyle?: boolean;
		/** Skip the enter and exit animations. Defaults to the provider's. */
		disableAnimation?: boolean;
		title?: string;
		description?: string;
		rejectButtonText?: string;
		/** The label of the button that opens the options in place. */
		customizeButtonText?: string;
		acceptButtonText?: string;
		/** Only rendered when the active policy requires a notice prompt. */
		dismissButtonText?: string;
		/** Hide the "Consent by" tag. */
		hideBranding?: boolean;
		/**
		 * Which legal links to show: all by default, `null` for none, or the
		 * keys to show. Set the links in the provider options.
		 */
		legalLinks?: (keyof LegalLinksType)[] | null;
		/**
		 * The order and grouping of the buttons. Actions the policy does not
		 * allow are dropped, and required ones restored.
		 */
		layout?: ConsentBannerLayout;
		/**
		 * Which consent models this banner responds to.
		 * @default ['opt-in', 'opt-out']
		 */
		models?: Model[];
		/**
		 * A Card, Banner or Drawer, and where it sits. Overrides
		 * `presentation.prompt.container` and the policy's
		 * `surface.container`. Positions are logical: `start` and `end`
		 * follow the writing direction.
		 * @default { type: 'card', position: 'start' }
		 */
		container?: ConsentContainer;
		/**
		 * `inset` floats a Banner or Drawer off the viewport edges; `flush`
		 * pins it to them. A Card is always inset. Overrides
		 * `presentation.prompt.edgeStyle`.
		 * @default 'inset'
		 */
		edgeStyle?: ConsentEdgeStyle;
		/**
		 * Block the page until the visitor makes a choice: backdrop, scroll
		 * lock, focus trap and no outside dismissal. Overrides
		 * `presentation.prompt.blockUntilChoice`. A centred Card always
		 * blocks. A notice never does, nor a prompt under an opt-out model
		 * or a policy that forbids blocking.
		 */
		blockUntilChoice?: boolean;
		/** Merged into the root's `consentBanner` slot. */
		class?: string;
	} = $props();

	const consent = getConsentContext();
	const theme = getThemeContext();

	const noStyle = $derived(localNoStyle ?? theme.noStyle ?? false);
	const disableAnimation = $derived(
		localDisableAnimation ?? theme.disableAnimation ?? false
	);

	const presentation = $derived(
		resolveConsentPresentation({
			actionAppearance: actionAppearanceFromTheme(theme.theme),
			override: { blockUntilChoice, container, edgeStyle, layout },
			policy: consent.snapshot.policyRule,
			presentation: consent.state.presentation,
			surface: 'prompt',
		})
	);

	$effect(() => {
		if (
			typeof process === 'undefined' ||
			process.env?.NODE_ENV !== 'production'
		) {
			for (const diagnostic of presentation.diagnostics) {
				console.warn(`inth presentation: ${diagnostic.message}`);
			}
			// The container's findings are the same on both viewports but a
			// side Drawer's phone fallback, which is not a misconfiguration.
			for (const diagnostic of presentation.container?.desktop.diagnostics ??
				[]) {
				console.warn(`inth presentation: ${diagnostic.message}`);
			}
		}
	});

	// Mounted once a choice is owed, then kept.
	let owed = $state(untrack(() => consent.state.activeUI === 'banner'));
	$effect.pre(() => {
		if (consent.state.activeUI === 'banner') {
			owed = true;
		}
	});
</script>

<!-- The banner hosts the opt-in confirmation: it claims the host, so no
     other surface renders it. -->
<DeferredOptInConfirmation
	{noStyle}
	{disableAnimation}
/>

{#if owed && presentation.container}
	<Surface
		container={presentation.container}
		actionGroups={presentation.actionGroups}
		class={className}
		{noStyle}
		{disableAnimation}
		{legalLinks}
		{hideBranding}
		{models}
		{title}
		{description}
		{rejectButtonText}
		{acceptButtonText}
		{customizeButtonText}
		{dismissButtonText}
	/>
{/if}
