import {
	bannerAcceptViaKeyboard,
	bannerContract,
	bannerFocusManagement,
	bannerToDialogFlow,
} from '@inth/conformance/play/consent-banner';
import type { Meta, StoryObj } from '@storybook/vue3-vite';

import ConsentManager from '../../../packages/sdk/vue/src/runtime/components/dialog/manager.vue';
import ConsentBanner from '../../../packages/sdk/vue/src/runtime/components/prompt/prompt.vue';
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

/** Full-width edge bar pinned to the bottom of the viewport. */
export const Bar: Story = {
	render: () => ({
		components: { ConsentBanner, ConsentManager },
		setup() {
			setupStorybookConsent('banner');
		},
		template: '<ConsentBanner variant="bar" /><ConsentManager />',
	}),
};

/** Compact corner chip for a choice prompt. */
export const Widget: Story = {
	render: () => ({
		components: { ConsentBanner, ConsentManager },
		setup() {
			setupStorybookConsent('banner');
		},
		template: '<ConsentBanner variant="widget" /><ConsentManager />',
	}),
};

/** Centered blocking prompt: backdrop, scroll lock and focus trap. */
export const Wall: Story = {
	render: () => ({
		components: { ConsentBanner, ConsentManager },
		setup() {
			setupStorybookConsent('banner');
		},
		template: '<ConsentBanner variant="wall" /><ConsentManager />',
	}),
};

/** The default card moved to the bottom center. */
export const FloatingBottomCenter: Story = {
	render: () => ({
		components: { ConsentBanner, ConsentManager },
		setup() {
			setupStorybookConsent('banner');
		},
		template:
			'<ConsentBanner variant="floating" position="bottom-center" /><ConsentManager />',
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
		template: '<ConsentBanner blocking />',
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
