import {
	dialogContract,
	dialogEscapeCloses,
	saveFlow,
} from '@inth/conformance/play/consent-dialog';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import ConsentManager from '../../../packages/sdk/vue/src/runtime/components/dialog/manager.vue';
import ConsentBanner from '../../../packages/sdk/vue/src/runtime/components/prompt/prompt.vue';
import { STORYBOOK_OPT_OUT_REFERENCE } from '../../storybook-consent-policy';
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
