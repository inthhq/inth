import {
	bannerContract,
	bannerFocusManagement,
	bannerToDialogFlow,
} from '@inth/conformance/play/consent-banner';
import type { Meta, StoryObj } from '@storybook/html-vite';

import { renderAstroStory, whenPromptReady } from './render-astro-story';

const meta = {
	parameters: {
		layout: 'fullscreen',
	},
	title: 'COMPONENTS - ASTRO/Core/Consent Banner',
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => renderAstroStory('consent-banner--default'),
};

/** Wait for the browser prompt, then run the shared play. */
const afterPrompt =
	(play: NonNullable<Story['play']>): NonNullable<Story['play']> =>
	async (context) => {
		await whenPromptReady();
		await play(context);
	};

export const BannerContract: Story = {
	...Default,
	play: afterPrompt(bannerContract),
};

/** The banner blocking the page, which the play expects to take focus. */
export const BannerFocusManagement: Story = {
	play: afterPrompt(bannerFocusManagement),
	render: () => renderAstroStory('consent-banner--blocking'),
};

/** Customize opens `<ConsentDialog />`'s island. */
export const BannerToDialogFlow: Story = {
	play: afterPrompt(bannerToDialogFlow),
	render: () => renderAstroStory('consent-banner--with-dialog'),
};

export const Dark: Story = {
	render: () => renderAstroStory('consent-banner--dark'),
};

export const OptOutLink: Story = {
	render: () => renderAstroStory('consent-banner--opt-out-link'),
};

export const PrivacyChoicesLink: Story = {
	render: () => renderAstroStory('consent-banner--privacy-choices-link'),
};

/**
 * Every Card, Banner and Drawer placement for the EU choice, the US opt-in
 * request and the US notice, plus the blocking and flush variants, under the
 * names React's stories carry so the parity runner pairs them. The server
 * renders the collapsed prompt; the browser controller takes it over.
 */
const story = (id: string): Story => ({
	render: () => renderAstroStory(`consent-banner--${id}`),
});

export const CardStartEU: Story = story('card-start-eu');
export const CardStartUsOptIn: Story = story('card-start-us-opt-in');
export const CardStartUsNotice: Story = story('card-start-us-notice');
export const CardEndEU: Story = story('card-end-eu');
export const CardEndUsOptIn: Story = story('card-end-us-opt-in');
export const CardEndUsNotice: Story = story('card-end-us-notice');
export const CardCenterEU: Story = story('card-center-eu');
export const CardCenterUsOptIn: Story = story('card-center-us-opt-in');
export const CardCenterUsNotice: Story = story('card-center-us-notice');
export const BannerBottomEU: Story = story('banner-bottom-eu');
export const BannerBottomUsOptIn: Story = story('banner-bottom-us-opt-in');
export const BannerBottomUsNotice: Story = story('banner-bottom-us-notice');
export const BannerTopEU: Story = story('banner-top-eu');
export const BannerTopUsOptIn: Story = story('banner-top-us-opt-in');
export const BannerTopUsNotice: Story = story('banner-top-us-notice');
export const DrawerBottomEU: Story = story('drawer-bottom-eu');
export const DrawerBottomUsOptIn: Story = story('drawer-bottom-us-opt-in');
export const DrawerBottomUsNotice: Story = story('drawer-bottom-us-notice');
export const DrawerTopEU: Story = story('drawer-top-eu');
export const DrawerTopUsOptIn: Story = story('drawer-top-us-opt-in');
export const DrawerTopUsNotice: Story = story('drawer-top-us-notice');
export const DrawerStartEU: Story = story('drawer-start-eu');
export const DrawerStartUsOptIn: Story = story('drawer-start-us-opt-in');
export const DrawerStartUsNotice: Story = story('drawer-start-us-notice');
export const DrawerEndEU: Story = story('drawer-end-eu');
export const DrawerEndUsOptIn: Story = story('drawer-end-us-opt-in');
export const DrawerEndUsNotice: Story = story('drawer-end-us-notice');
export const BlockingCard: Story = story('blocking-card');
export const BlockingBanner: Story = story('blocking-banner');
export const BlockingDrawerBottom: Story = story('blocking-drawer-bottom');
export const BlockingDrawerStart: Story = story('blocking-drawer-start');
export const FlushBannerBottom: Story = story('flush-banner-bottom');
export const FlushDrawerBottom: Story = story('flush-drawer-bottom');
