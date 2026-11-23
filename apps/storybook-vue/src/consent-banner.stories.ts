import {
	bannerAcceptViaKeyboard,
	bannerContract,
	bannerFocusManagement,
	bannerToDialogFlow,
} from '@inth/conformance/play/consent-banner';
import type { Meta, StoryObj } from '@storybook/vue3-vite';

import type {
	ConsentContainer,
	ConsentEdgeStyle,
} from '../../../packages/sdk/core/src/libs/consent-layout.model';
import ConsentManager from '../../../packages/sdk/vue/src/runtime/components/dialog/manager.vue';
import ConsentBanner from '../../../packages/sdk/vue/src/runtime/components/prompt/prompt.vue';
import {
	BannerDemoPage,
	containerConfig,
	regionInit,
} from './consent-ui-stories';
import type { Region } from './consent-ui-stories';
import {
	storybookNoticeInit,
	useStorybookConsent as setupStorybookConsent,
} from './storybook-consent-fixtures';

const meta = {
	component: ConsentBanner,
	parameters: {
		layout: 'fullscreen',
	},
	title: 'COMPONENTS - VUE/Core/Consent Banner',
} satisfies Meta<typeof ConsentBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => ({
		components: { ConsentBanner },
		setup() {
			setupStorybookConsent('banner');
		},
		template: '<ConsentBanner />',
	}),
};

/** Opt-out notice: an underlined opt-out link beside the primary Accept All. */
export const Notice: Story = {
	render: () => ({
		components: { ConsentBanner, ConsentManager },
		setup() {
			setupStorybookConsent('banner', undefined, storybookNoticeInit);
		},
		template: '<ConsentBanner /><ConsentManager />',
	}),
};

export const BannerContract: Story = {
	play: bannerContract,
	render: () => ({
		components: { ConsentBanner },
		setup() {
			setupStorybookConsent('banner');
		},
		template: '<ConsentBanner />',
	}),
};

export const BannerToDialogFlow: Story = {
	play: bannerToDialogFlow,
	render: () => ({
		components: { ConsentBanner, ConsentManager },
		setup() {
			setupStorybookConsent('banner');
		},
		template: '<ConsentBanner /><ConsentManager />',
	}),
};

export const BannerAcceptViaKeyboard: Story = {
	play: bannerAcceptViaKeyboard,
	render: () => ({
		components: { ConsentBanner },
		setup() {
			setupStorybookConsent('banner');
		},
		template: '<ConsentBanner />',
	}),
};

export const BannerFocusManagement: Story = {
	play: bannerFocusManagement,
	render: () => ({
		components: { ConsentBanner },
		setup() {
			setupStorybookConsent('banner');
		},
		template: '<ConsentBanner block-until-choice />',
	}),
};

/** Notice banner with the statutory opt-out link. */
export const OptOutLink: Story = {
	render: () => ({
		components: { ConsentBanner, ConsentManager },
		setup() {
			setupStorybookConsent(
				'banner',
				{ presentation: { optOutLink: 'do-not-sell' } },
				storybookNoticeInit
			);
		},
		template:
			'<ConsentBanner disable-animation /><ConsentManager disable-animation />',
	}),
};

/** Notice banner with the Privacy Choices link and CPPA opt-out icon. */
export const PrivacyChoicesLink: Story = {
	render: () => ({
		components: { ConsentBanner, ConsentManager },
		setup() {
			setupStorybookConsent(
				'banner',
				{ presentation: { optOutLink: 'privacy-choices' } },
				storybookNoticeInit
			);
		},
		template:
			'<ConsentBanner disable-animation /><ConsentManager disable-animation />',
	}),
};

/*
 * Every Card, Banner and Drawer placement for the EU choice, the US opt-in
 * request and the US notice, plus the blocking and flush variants, by the
 * same names as React's. Each story resolves its policy offline, so the
 * static build works without a backend.
 */
const containerStory = function containerStory(
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
					containerConfig(container, options),
					regionInit(region, 'banner')
				);
			},
			template: '<BannerDemoPage /><ConsentBanner /><ConsentManager />',
		}),
	};
};

export const CardStartEU: Story = containerStory('eu', {
	position: 'start',
	type: 'card',
});
export const CardStartUsOptIn: Story = containerStory('us-opt-in', {
	position: 'start',
	type: 'card',
});
export const CardStartUsNotice: Story = containerStory('us-notice', {
	position: 'start',
	type: 'card',
});
export const CardEndEU: Story = containerStory('eu', {
	position: 'end',
	type: 'card',
});
export const CardEndUsOptIn: Story = containerStory('us-opt-in', {
	position: 'end',
	type: 'card',
});
export const CardEndUsNotice: Story = containerStory('us-notice', {
	position: 'end',
	type: 'card',
});
export const CardCenterEU: Story = containerStory('eu', {
	position: 'center',
	type: 'card',
});
export const CardCenterUsOptIn: Story = containerStory('us-opt-in', {
	position: 'center',
	type: 'card',
});
export const CardCenterUsNotice: Story = containerStory('us-notice', {
	position: 'center',
	type: 'card',
});
export const BannerBottomEU: Story = containerStory('eu', {
	edge: 'bottom',
	type: 'banner',
});
export const BannerBottomUsOptIn: Story = containerStory('us-opt-in', {
	edge: 'bottom',
	type: 'banner',
});
export const BannerBottomUsNotice: Story = containerStory('us-notice', {
	edge: 'bottom',
	type: 'banner',
});
export const BannerTopEU: Story = containerStory('eu', {
	edge: 'top',
	type: 'banner',
});
export const BannerTopUsOptIn: Story = containerStory('us-opt-in', {
	edge: 'top',
	type: 'banner',
});
export const BannerTopUsNotice: Story = containerStory('us-notice', {
	edge: 'top',
	type: 'banner',
});
export const DrawerBottomEU: Story = containerStory('eu', {
	side: 'bottom',
	type: 'drawer',
});
export const DrawerBottomUsOptIn: Story = containerStory('us-opt-in', {
	side: 'bottom',
	type: 'drawer',
});
export const DrawerBottomUsNotice: Story = containerStory('us-notice', {
	side: 'bottom',
	type: 'drawer',
});
export const DrawerTopEU: Story = containerStory('eu', {
	side: 'top',
	type: 'drawer',
});
export const DrawerTopUsOptIn: Story = containerStory('us-opt-in', {
	side: 'top',
	type: 'drawer',
});
export const DrawerTopUsNotice: Story = containerStory('us-notice', {
	side: 'top',
	type: 'drawer',
});
export const DrawerStartEU: Story = containerStory('eu', {
	side: 'start',
	type: 'drawer',
});
export const DrawerStartUsOptIn: Story = containerStory('us-opt-in', {
	side: 'start',
	type: 'drawer',
});
export const DrawerStartUsNotice: Story = containerStory('us-notice', {
	side: 'start',
	type: 'drawer',
});
export const DrawerEndEU: Story = containerStory('eu', {
	side: 'end',
	type: 'drawer',
});
export const DrawerEndUsOptIn: Story = containerStory('us-opt-in', {
	side: 'end',
	type: 'drawer',
});
export const DrawerEndUsNotice: Story = containerStory('us-notice', {
	side: 'end',
	type: 'drawer',
});
export const BlockingCard: Story = containerStory(
	'eu',
	{ position: 'start', type: 'card' },
	{ blockUntilChoice: true }
);
export const BlockingBanner: Story = containerStory(
	'eu',
	{ edge: 'bottom', type: 'banner' },
	{ blockUntilChoice: true }
);
export const BlockingDrawerBottom: Story = containerStory(
	'eu',
	{ side: 'bottom', type: 'drawer' },
	{ blockUntilChoice: true }
);
export const BlockingDrawerStart: Story = containerStory(
	'eu',
	{ side: 'start', type: 'drawer' },
	{ blockUntilChoice: true }
);
export const FlushBannerBottom: Story = containerStory(
	'eu',
	{ edge: 'bottom', type: 'banner' },
	{ edgeStyle: 'flush' }
);
export const FlushDrawerBottom: Story = containerStory(
	'eu',
	{ side: 'bottom', type: 'drawer' },
	{ edgeStyle: 'flush' }
);
