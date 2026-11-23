<script lang="ts">
	import type { ConsentContainer } from '@inth/sdk/engine';
	import { ConsentBanner, ConsentDialog } from '@inth/svelte';

	import {
		storybookMode,
		storybookVendors,
	} from '../../storybook-consent-policy';
	import ConsentDialogDemoPage from './consent-dialog-demo-page.svelte';
	import { DIALOG_POLICIES } from './consent-story-policies';
	import type { StoryRegion } from './consent-story-policies';
	import OpenDialogOnMount from './open-dialog-on-mount.svelte';
	import { editableConsentOptions } from './storybook-consent-fixtures';
	import StorybookConsentProvider from './storybook-consent-provider.svelte';

	/**
	 * The stock `ConsentDialog`, open on a page, or, for a full flow,
	 * starting on the banner.
	 */
	let {
		region = 'us-opt-out',
		flow = false,
		container = { position: 'start', type: 'card' },
		edgeStyle = undefined,
	}: {
		region?: StoryRegion;
		/** Start on the banner instead of the open dialog. */
		flow?: boolean;
		container?: ConsentContainer;
		edgeStyle?: 'inset' | 'flush';
	} = $props();
</script>

<StorybookConsentProvider
	options={{
		...editableConsentOptions,
		legalLinks: {
			cookiePolicy: { href: '#cookies' },
			privacyPolicy: { href: '#privacy' },
		},
		mode: storybookMode([DIALOG_POLICIES[region]]),
		presentation: {
			prompt: { container, edgeStyle },
		},
		vendors: storybookVendors,
	}}
>
	<ConsentDialogDemoPage {region} />
	<ConsentBanner />
	<ConsentDialog />
	{#if !flow}
		<OpenDialogOnMount />
	{/if}
</StorybookConsentProvider>
