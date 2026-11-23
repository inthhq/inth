/**
 * The stock dialog in the Privacy Choices design
 * (`design: 'privacy-choices'`): the "Your Privacy Choices" dialog for the
 * US opt-out and opt-in regimes, the US with a Global Privacy Control
 * signal, the EU, and the phone sheets. The "full flow" stories start on
 * the v6 banner; the page link opens the dialog. The same stories, by the
 * same names, as React's. Each story resolves its policy offline, so the
 * static build works without a backend.
 */
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { onMounted } from 'vue';

import type { ConsentContainer } from '../../../packages/sdk/core/src/libs/consent-layout';
import ConsentManager from '../../../packages/sdk/vue/src/runtime/components/manager.vue';
import ConsentBanner from '../../../packages/sdk/vue/src/runtime/components/prompt.vue';
import {
	DialogDemoPage,
	privacyChoicesConfig,
	privacyChoicesInit,
} from './privacy-choices-stories';
import type { Region } from './privacy-choices-stories';
import { useStorybookConsent as setupStorybookConsent } from './storybook-consent-fixtures';

const meta = {
	component: ConsentManager,
	parameters: {
		layout: 'fullscreen',
	},
	title: 'COMPONENTS - VUE/Privacy Choices/Dialog',
} satisfies Meta<typeof ConsentManager>;

export default meta;

type Story = StoryObj<typeof meta>;

interface DialogStoryOptions {
	/** Start on the v6 banner instead of the open dialog. */
	flow?: boolean;
	container?: ConsentContainer;
	gpc?: boolean;
	phone?: boolean;
	edgeStyle?: 'inset' | 'flush';
}

const dialogStory = function dialogStory(
	region: Region,
	options: DialogStoryOptions = {}
): Story {
	const story: Story = {
		render: () => ({
			components: { ConsentBanner, ConsentManager, DialogDemoPage },
			setup() {
				const context = setupStorybookConsent(
					'banner',
					privacyChoicesConfig(
						options.container ?? { position: 'start', type: 'card' },
						{ edgeStyle: options.edgeStyle, vendors: true }
					),
					privacyChoicesInit(region)
				);
				if (options.gpc) {
					context.kernel.set.privacySignals({ gpc: true });
				}
				if (context.snapshot.value.policyRule.prompt === 'none') {
					context.activeUI.value = null;
				}
				// Open the dialog once the page renders, as the page link would.
				if (!options.flow) {
					onMounted(() => {
						context.activeUI.value = 'manager';
					});
				}
				return { region };
			},
			template:
				'<DialogDemoPage :region="region" /><ConsentBanner /><ConsentManager />',
		}),
	};
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
