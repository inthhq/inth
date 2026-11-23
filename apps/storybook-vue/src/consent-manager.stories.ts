import {
	dialogContract,
	dialogEscapeCloses,
	saveFlow,
} from '@inth/conformance/play/consent-dialog';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { onMounted } from 'vue';

import type { ConsentContainer } from '../../../packages/sdk/core/src/libs/consent-layout';
import ConsentManager from '../../../packages/sdk/vue/src/runtime/components/dialog/manager.vue';
import ConsentBanner from '../../../packages/sdk/vue/src/runtime/components/prompt/prompt.vue';
import { STORYBOOK_OPT_OUT_REFERENCE } from '../../storybook-consent-policy';
import {
	containerConfig,
	DialogDemoPage,
	regionInit,
} from './consent-ui-stories';
import type { Region } from './consent-ui-stories';
import {
	useStorybookConsent as setupStorybookConsent,
	useStorybookOptOutConsent as setupStorybookOptOutConsent,
} from './storybook-consent-fixtures';

const meta = {
	component: ConsentManager,
	parameters: {
		layout: 'fullscreen',
	},
	title: 'COMPONENTS - VUE/Core/Consent Dialog',
} satisfies Meta<typeof ConsentManager>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => ({
		components: { ConsentManager },
		setup() {
			setupStorybookConsent('manager');
		},
		template: '<ConsentManager />',
	}),
};

export const DialogContract: Story = {
	play: dialogContract,
	render: () => ({
		components: { ConsentBanner, ConsentManager },
		setup() {
			setupStorybookConsent('banner');
		},
		template: '<ConsentBanner /><ConsentManager />',
	}),
};

export const SaveFlow: Story = {
	play: saveFlow,
	render: () => ({
		components: { ConsentBanner, ConsentManager },
		setup() {
			setupStorybookConsent('banner');
		},
		template: '<ConsentBanner /><ConsentManager />',
	}),
};

export const DialogEscapeCloses: Story = {
	play: dialogEscapeCloses,
	render: () => ({
		components: { ConsentBanner, ConsentManager },
		setup() {
			setupStorybookConsent('banner');
		},
		template: '<ConsentBanner /><ConsentManager />',
	}),
};

/** Opt-out policy before the visitor opts out. */
export const OptOutNotOptedOut: Story = {
	render: () => ({
		components: { ConsentManager },
		setup() {
			setupStorybookOptOutConsent('none', {
				activeUI: 'manager',
				configOverrides: {
					presentation: { optOutLink: 'do-not-sell' },
				},
			});
		},
		template: '<ConsentManager disable-animation />',
	}),
};

/** Opted out by a click before backend rights confirmation. */
export const OptOutHonoredByRequest: Story = {
	render: () => ({
		components: { ConsentManager },
		setup() {
			setupStorybookOptOutConsent('request', {
				activeUI: 'manager',
				configOverrides: {
					presentation: { optOutLink: 'do-not-sell' },
				},
				initialRecords: {
					optOutReference: STORYBOOK_OPT_OUT_REFERENCE,
				},
			});
		},
		template: '<ConsentManager disable-animation />',
	}),
};

/** Opted out with sale and sharing confirmed by the backend. */
export const OptOutConfirmedSaleAndShare: Story = {
	render: () => ({
		components: { ConsentManager },
		setup() {
			setupStorybookOptOutConsent('request', {
				activeUI: 'manager',
				configOverrides: {
					presentation: { optOutLink: 'do-not-sell' },
				},
				initialRecords: {
					optOutReference: STORYBOOK_OPT_OUT_REFERENCE,
					optOutRightsConfirmed: true,
				},
			});
		},
		template: '<ConsentManager disable-animation />',
	}),
};

/** Opted out by an active GPC signal; no opt-in link is shown. */
export const OptOutGpcLocked: Story = {
	play: async () => {
		await within(document.body).findByTestId('consent-widget-opt-out-status');
		await expect(
			within(document.body).queryByTestId('consent-widget-opt-in-link')
		).toBeNull();
	},
	render: () => ({
		components: { ConsentManager },
		setup() {
			setupStorybookOptOutConsent('gpc', {
				activeUI: 'manager',
				configOverrides: {
					presentation: { optOutLink: 'privacy-choices' },
				},
			});
		},
		template: '<ConsentManager disable-animation />',
	}),
};

/** Two-step opt-in confirmation dialog opened from the opt-out block. */
export const OptInConfirmation: Story = {
	play: async () => {
		const link = await within(document.body).findByTestId(
			'consent-widget-opt-in-link'
		);
		await userEvent.click(link);
		const dialog = await within(document.body).findByTestId(
			'opt-in-confirmation-root'
		);
		await expect(dialog).toBeVisible();
		const cancel = within(dialog).getByTestId(
			'opt-in-confirmation-cancel-button'
		);
		await waitFor(() => expect(document.activeElement).toBe(cancel));
	},
	render: () => ({
		components: { ConsentManager },
		setup() {
			setupStorybookOptOutConsent('request', {
				activeUI: 'manager',
				configOverrides: {
					presentation: { optOutLink: 'do-not-sell' },
				},
				initialRecords: {
					optOutReference: STORYBOOK_OPT_OUT_REFERENCE,
				},
			});
		},
		template: '<ConsentManager disable-animation />',
	}),
};

/** Two-step opt-in confirmation dialog when the backend confirmed the refused rights. */
export const OptInConfirmationConfirmedRights: Story = {
	play: async () => {
		const link = await within(document.body).findByTestId(
			'consent-widget-opt-in-link'
		);
		await userEvent.click(link);
		const dialog = await within(document.body).findByTestId(
			'opt-in-confirmation-root'
		);
		await expect(dialog).toBeVisible();
	},
	render: () => ({
		components: { ConsentManager },
		setup() {
			setupStorybookOptOutConsent('request', {
				activeUI: 'manager',
				configOverrides: {
					presentation: { optOutLink: 'do-not-sell' },
				},
				initialRecords: {
					optOutReference: STORYBOOK_OPT_OUT_REFERENCE,
					optOutRightsConfirmed: true,
				},
			});
		},
		template: '<ConsentManager disable-animation />',
	}),
};

/*
 * The dialog for the US opt-out and opt-in regimes, the US with a Global
 * Privacy Control signal, the EU, and the phone sheets. The "full flow"
 * stories start on the banner; the page link opens the dialog. The same
 * stories, by the same names, as React's.
 */
interface DialogStoryOptions {
	/** Start on the banner instead of the open dialog. */
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
					containerConfig(
						options.container ?? { position: 'start', type: 'card' },
						{ edgeStyle: options.edgeStyle, vendors: true }
					),
					regionInit(region)
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
