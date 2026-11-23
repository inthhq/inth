import {
	bannerContract,
	bannerFocusManagement,
	bannerToDialogFlow,
} from '@inth/conformance/play/consent-banner';
import type { Meta, StoryObj } from '@storybook/html-vite';

import { renderAstroStory } from './render-astro-story';

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

export const BannerContract: Story = { ...Default, play: bannerContract };

/** The banner blocking the page, which the play expects to take focus. */
export const BannerFocusManagement: Story = {
	play: bannerFocusManagement,
	render: () => renderAstroStory('consent-banner--blocking'),
};

/** Customize opens `<ConsentDialog />`'s island. */
export const BannerToDialogFlow: Story = {
	play: bannerToDialogFlow,
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
