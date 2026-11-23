import {
	bannerAcceptViaKeyboard,
	bannerContract,
	bannerFocusManagement,
	bannerToDialogFlow,
} from '@inth/conformance/play/consent-banner';
import type { Meta, StoryObj } from '@storybook/svelte-vite';

import type {
	ConsentContainer,
	ConsentEdgeStyle,
} from '../../../packages/sdk/core/src/libs/consent-layout.model';
import type { StoryRegion } from './consent-story-policies';
import ConsentBannerContainerStory from './ConsentBannerContainerStory.svelte';
import ConsentBannerStory from './ConsentBannerStory.svelte';

const meta = {
	component: ConsentBannerStory,
	parameters: {
		layout: 'fullscreen',
	},
	title: 'COMPONENTS - SVELTE/Core/Consent Banner',
} satisfies Meta<ConsentBannerStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Notice: Story = {
	args: {
		notice: true,
	},
};

export const BannerContract: Story = {
	play: bannerContract,
};

export const BannerToDialogFlow: Story = {
	args: {
		includeDialog: true,
	},
	play: bannerToDialogFlow,
};

export const BannerAcceptViaKeyboard: Story = {
	play: bannerAcceptViaKeyboard,
};

export const BannerFocusManagement: Story = {
	args: {
		blockUntilChoice: true,
	},
	play: bannerFocusManagement,
};

/** Notice banner with the statutory opt-out link. */
export const OptOutLink: Story = {
	args: {
		disableAnimation: true,
		notice: true,
		optOutLink: 'do-not-sell',
	},
};

/** Notice banner with the Privacy Choices link and CPPA opt-out icon. */
export const PrivacyChoicesLink: Story = {
	args: {
		disableAnimation: true,
		notice: true,
		optOutLink: 'privacy-choices',
	},
};

/**
 * Every Card, Banner and Drawer placement for the EU choice, the US opt-in
 * request and the US notice, plus the blocking and flush variants: the same
 * stories, by the same names, as React's, so the parity runner compares
 * them. Each story resolves its policy offline, so the static build works
 * without a backend.
 */
const containerStory = function containerStory(
	region: Exclude<StoryRegion, 'us-opt-out'>,
	container: ConsentContainer,
	options: { blockUntilChoice?: boolean; edgeStyle?: ConsentEdgeStyle } = {}
): Story {
	return {
		render: () => ({
			Component: ConsentBannerContainerStory,
			props: {
				blockUntilChoice: options.blockUntilChoice,
				container,
				edgeStyle: options.edgeStyle,
				region,
			},
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
	{
		blockUntilChoice: true,
	}
);
export const BlockingBanner: Story = containerStory(
	'eu',
	{ edge: 'bottom', type: 'banner' },
	{
		blockUntilChoice: true,
	}
);
export const BlockingDrawerBottom: Story = containerStory(
	'eu',
	{ side: 'bottom', type: 'drawer' },
	{
		blockUntilChoice: true,
	}
);
export const BlockingDrawerStart: Story = containerStory(
	'eu',
	{ side: 'start', type: 'drawer' },
	{
		blockUntilChoice: true,
	}
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
