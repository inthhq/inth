<script lang="ts">
	import type { ConsentContainer, ConsentEdgeStyle } from '@inth/sdk/engine';
	import { ConsentBanner } from '@inth/svelte';

	import { storybookMode } from '../../storybook-consent-policy';
	import { BANNER_POLICIES } from './consent-story-policies';
	import ConsentBannerDemoPage from './ConsentBannerDemoPage.svelte';
	import { editableConsentOptions } from './storybook-consent-fixtures';
	import StorybookConsentProvider from './StorybookConsentProvider.svelte';

	/**
	 * The stock `ConsentBanner` for one first layer and container.
	 */
	let {
		region = 'eu',
		container = { position: 'start', type: 'card' },
		blockUntilChoice = undefined,
		edgeStyle = undefined,
	}: {
		region?: keyof typeof BANNER_POLICIES;
		container?: ConsentContainer;
		blockUntilChoice?: boolean;
		edgeStyle?: ConsentEdgeStyle;
	} = $props();
</script>

<StorybookConsentProvider
	options={{
		...editableConsentOptions,
		legalLinks: {
			cookiePolicy: { href: '#cookies' },
			privacyPolicy: { href: '#privacy' },
		},
		mode: storybookMode([BANNER_POLICIES[region]]),
		presentation: {
			prompt: { blockUntilChoice, container, edgeStyle },
		},
	}}
>
	<ConsentBannerDemoPage />
	<ConsentBanner />
</StorybookConsentProvider>
