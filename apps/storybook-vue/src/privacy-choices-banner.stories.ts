/**
 * The stock `ConsentBanner` in the Privacy Choices design
 * (`design: 'privacy-choices'`): every Card, Banner and Drawer placement
 * for the EU choice, the US opt-in request and the US notice, plus the
 * blocking and flush variants. The same stories, by the same names, as
 * React's. Each story resolves its policy offline, so the static build
 * works without a backend.
 */
import type { Meta, StoryObj } from '@storybook/vue3-vite';

import type {
	ConsentContainer,
	ConsentEdgeStyle,
} from '../../../packages/sdk/core/src/libs/consent-layout';
import ConsentManager from '../../../packages/sdk/vue/src/runtime/components/manager.vue';
import ConsentBanner from '../../../packages/sdk/vue/src/runtime/components/prompt.vue';
import {
	BannerDemoPage,
	privacyChoicesConfig,
	privacyChoicesInit,
} from './privacy-choices-stories';
import type { Region } from './privacy-choices-stories';
import { useStorybookConsent as setupStorybookConsent } from './storybook-consent-fixtures';

const meta = {
	component: ConsentBanner,
	parameters: {
		layout: 'fullscreen',
	},
	title: 'COMPONENTS - VUE/Privacy Choices/Banner',
} satisfies Meta<typeof ConsentBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

const privacyChoicesStory = function privacyChoicesStory(
	region: Region,
	container: ConsentContainer,
	options: { blockUntilChoice?: boolean; edgeStyle?: ConsentEdgeStyle } = {}
): Story {
	return {
		render: () => ({
			components: { BannerDemoPage, ConsentBanner, ConsentManager },
			setup() {
				setupStorybookConsent(
					'banner',
					privacyChoicesConfig(container, options),
					privacyChoicesInit(region)
				);
			},
			template: '<BannerDemoPage /><ConsentBanner /><ConsentManager />',
		}),
	};
};

export const CardStartEU: Story = privacyChoicesStory('eu', {
	position: 'start',
	type: 'card',
});
export const CardStartUsOptIn: Story = privacyChoicesStory('us-opt-in', {
	position: 'start',
	type: 'card',
});
export const CardStartUsNotice: Story = privacyChoicesStory('us-notice', {
	position: 'start',
	type: 'card',
});
export const CardEndEU: Story = privacyChoicesStory('eu', {
	position: 'end',
	type: 'card',
});
export const CardEndUsOptIn: Story = privacyChoicesStory('us-opt-in', {
	position: 'end',
	type: 'card',
});
export const CardEndUsNotice: Story = privacyChoicesStory('us-notice', {
	position: 'end',
	type: 'card',
});
export const CardCenterEU: Story = privacyChoicesStory('eu', {
	position: 'center',
	type: 'card',
});
export const CardCenterUsOptIn: Story = privacyChoicesStory('us-opt-in', {
	position: 'center',
	type: 'card',
});
export const CardCenterUsNotice: Story = privacyChoicesStory('us-notice', {
	position: 'center',
	type: 'card',
});
export const BannerBottomEU: Story = privacyChoicesStory('eu', {
	edge: 'bottom',
	type: 'banner',
});
export const BannerBottomUsOptIn: Story = privacyChoicesStory('us-opt-in', {
	edge: 'bottom',
	type: 'banner',
});
export const BannerBottomUsNotice: Story = privacyChoicesStory('us-notice', {
	edge: 'bottom',
	type: 'banner',
});
export const BannerTopEU: Story = privacyChoicesStory('eu', {
	edge: 'top',
	type: 'banner',
});
export const BannerTopUsOptIn: Story = privacyChoicesStory('us-opt-in', {
	edge: 'top',
	type: 'banner',
});
export const BannerTopUsNotice: Story = privacyChoicesStory('us-notice', {
	edge: 'top',
	type: 'banner',
});
export const DrawerBottomEU: Story = privacyChoicesStory('eu', {
	side: 'bottom',
	type: 'drawer',
});
export const DrawerBottomUsOptIn: Story = privacyChoicesStory('us-opt-in', {
	side: 'bottom',
	type: 'drawer',
});
export const DrawerBottomUsNotice: Story = privacyChoicesStory('us-notice', {
	side: 'bottom',
	type: 'drawer',
});
export const DrawerTopEU: Story = privacyChoicesStory('eu', {
	side: 'top',
	type: 'drawer',
});
export const DrawerTopUsOptIn: Story = privacyChoicesStory('us-opt-in', {
	side: 'top',
	type: 'drawer',
});
export const DrawerTopUsNotice: Story = privacyChoicesStory('us-notice', {
	side: 'top',
	type: 'drawer',
});
export const DrawerStartEU: Story = privacyChoicesStory('eu', {
	side: 'start',
	type: 'drawer',
});
export const DrawerStartUsOptIn: Story = privacyChoicesStory('us-opt-in', {
	side: 'start',
	type: 'drawer',
});
export const DrawerStartUsNotice: Story = privacyChoicesStory('us-notice', {
	side: 'start',
	type: 'drawer',
});
export const DrawerEndEU: Story = privacyChoicesStory('eu', {
	side: 'end',
	type: 'drawer',
});
export const DrawerEndUsOptIn: Story = privacyChoicesStory('us-opt-in', {
	side: 'end',
	type: 'drawer',
});
export const DrawerEndUsNotice: Story = privacyChoicesStory('us-notice', {
	side: 'end',
	type: 'drawer',
});
export const BlockingCard: Story = privacyChoicesStory(
	'eu',
	{ position: 'start', type: 'card' },
	{ blockUntilChoice: true }
);
export const BlockingBanner: Story = privacyChoicesStory(
	'eu',
	{ edge: 'bottom', type: 'banner' },
	{ blockUntilChoice: true }
);
export const BlockingDrawerBottom: Story = privacyChoicesStory(
	'eu',
	{ side: 'bottom', type: 'drawer' },
	{ blockUntilChoice: true }
);
export const BlockingDrawerStart: Story = privacyChoicesStory(
	'eu',
	{ side: 'start', type: 'drawer' },
	{ blockUntilChoice: true }
);
export const FlushBannerBottom: Story = privacyChoicesStory(
	'eu',
	{ edge: 'bottom', type: 'banner' },
	{ edgeStyle: 'flush' }
);
export const FlushDrawerBottom: Story = privacyChoicesStory(
	'eu',
	{ side: 'bottom', type: 'drawer' },
	{ edgeStyle: 'flush' }
);
