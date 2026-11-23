/**
 * The stock Svelte `ConsentDialog` in the Privacy Choices design
 * (`design: 'privacy-choices'`): the "Your Privacy Choices" dialog for the
 * US opt-out and opt-in regimes, the US with a Global Privacy Control
 * signal, the EU, and the phone sheets. The "full flow" stories start on
 * the v6 banner; its page link opens the dialog. The same stories, by the
 * same names, as React's. Each story resolves its policy offline, like
 * the other stories, so the static build works without a backend.
 */
import type { Meta, StoryObj } from '@storybook/svelte-vite';

import type { ConsentContainer } from '../../../packages/sdk/core/src/libs/consent-layout';
import type { PrivacyChoicesRegion as Region } from './privacy-choices-story-policies';
import PrivacyChoicesDialogStory from './PrivacyChoicesDialogStory.svelte';

interface DialogStoryOptions {
	/** Start on the v6 banner instead of the open dialog. */
	flow?: boolean;
	container?: ConsentContainer;
	gpc?: boolean;
	phone?: boolean;
	edgeStyle?: 'inset' | 'flush';
}

const meta = {
	component: PrivacyChoicesDialogStory,
	parameters: {
		layout: 'fullscreen',
	},
	title: 'COMPONENTS - SVELTE/Privacy Choices/Dialog',
} satisfies Meta<typeof PrivacyChoicesDialogStory>;

export default meta;

type Story = StoryObj<typeof meta>;

const dialogStory = function dialogStory(
	region: Region,
	options: DialogStoryOptions = {}
): Story {
	const story: Story = {
		args: {
			container: options.container,
			edgeStyle: options.edgeStyle,
			flow: options.flow,
			region,
		},
	};
	if (options.gpc) {
		// The signal must be on before the provider reads it.
		story.beforeEach = () => {
			const previous = Object.getOwnPropertyDescriptor(
				navigator,
				'globalPrivacyControl'
			);
			Object.defineProperty(navigator, 'globalPrivacyControl', {
				configurable: true,
				value: true,
			});
			return () => {
				if (previous) {
					Object.defineProperty(navigator, 'globalPrivacyControl', previous);
				} else {
					Reflect.deleteProperty(navigator, 'globalPrivacyControl');
				}
			};
		};
	}
	if (options.phone) {
		story.globals = { viewport: { isRotated: false, value: 'mobile2' } };
	}
	return story;
};

export const UsOptOut: Story = dialogStory('us-opt-out');
export const UsOptIn: Story = dialogStory('us-opt-in');
export const UsWithGpc: Story = dialogStory('us-opt-out', { gpc: true });
export const EU: Story = dialogStory('eu');

export const PhoneUsPreferencesSheet: Story = dialogStory('us-opt-out', {
	phone: true,
});
export const PhoneEuVendorSheets: Story = dialogStory('eu', { phone: true });
export const PhoneFlushSheets: Story = dialogStory('us-opt-in', {
	edgeStyle: 'flush',
	phone: true,
});

export const FullFlowEU: Story = dialogStory('eu', { flow: true });
export const FullFlowUsOptIn: Story = dialogStory('us-opt-in', { flow: true });
export const FullFlowUsNotice: Story = dialogStory('us-notice', {
	container: { edge: 'bottom', type: 'banner' },
	flow: true,
});
