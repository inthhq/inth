<script lang="ts">
	import type { ConsentContainer } from '@inth/sdk/engine';
	import { ConsentBanner, ConsentDialog } from '@inth/svelte';

	import {
		storybookMode,
		storybookVendors,
	} from '../../storybook-consent-policy';
	import { DIALOG_POLICIES } from './privacy-choices-story-policies';
	import type { PrivacyChoicesRegion } from './privacy-choices-story-policies';
	import PrivacyChoicesDialogPage from './PrivacyChoicesDialogPage.svelte';
	import PrivacyChoicesOpenOnMount from './PrivacyChoicesOpenOnMount.svelte';
	import { editableConsentOptions } from './storybook-consent-fixtures';
	import StorybookConsentProvider from './StorybookConsentProvider.svelte';

	/**
	 * The stock `ConsentDialog` in the Privacy Choices design, open on a
	 * page, or, for a full flow, starting on the v6 banner.
	 */
	let {
		region = 'us-opt-out',
		flow = false,
		container = { position: 'start', type: 'card' },
		edgeStyle = undefined,
	}: {
		region?: PrivacyChoicesRegion;
		/** Start on the v6 banner instead of the open dialog. */
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
			design: 'privacy-choices',
			prompt: { container, edgeStyle },
		},
		vendors: storybookVendors,
	}}
>
	<PrivacyChoicesDialogPage {region} />
	<ConsentBanner />
	<ConsentDialog />
	{#if !flow}
		<PrivacyChoicesOpenOnMount />
	{/if}
</StorybookConsentProvider>
