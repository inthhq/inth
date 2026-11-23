import {
	dialogContract,
	dialogEscapeCloses,
	saveFlow,
} from '@inth/conformance/play/consent-dialog';
import type { Meta, StoryObj } from '@storybook/svelte-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import type { ConsentContainer } from '../../../packages/sdk/core/src/libs/consent-layout.model';
import ConsentDialogOptOutStory from './consent-dialog-opt-out-story.svelte';
import type { StoryRegion as Region } from './consent-story-policies';
import ConsentDialogRegionStory from './ConsentDialogRegionStory.svelte';
import ConsentDialogStory from './ConsentDialogStory.svelte';

const meta = {
	component: ConsentDialogStory,
	parameters: {
		layout: 'fullscreen',
	},
	title: 'COMPONENTS - SVELTE/Core/Consent Dialog',
} satisfies Meta<typeof ConsentDialogStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		open: true,
		useStoredConsent: true,
	},
};

export const DialogContract: Story = {
	args: {
		withBanner: true,
	},
	play: dialogContract,
};

export const SaveFlow: Story = {
	args: {
		withBanner: true,
	},
	play: saveFlow,
};

export const DialogEscapeCloses: Story = {
	args: {
		withBanner: true,
	},
	play: dialogEscapeCloses,
};

/** Opt-out policy before the visitor opts out. */
export const OptOutNotOptedOut: Story = {
	render: () => ({
		Component: ConsentDialogOptOutStory,
		props: { kind: 'not-opted-out' },
	}),
};

/** Opted out by a click before backend rights confirmation. */
export const OptOutHonoredByRequest: Story = {
	render: () => ({
		Component: ConsentDialogOptOutStory,
		props: { kind: 'request' },
	}),
};

/** Opted out with sale and sharing confirmed by the backend. */
export const OptOutConfirmedSaleAndShare: Story = {
	render: () => ({
		Component: ConsentDialogOptOutStory,
		props: { kind: 'confirmed' },
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
		Component: ConsentDialogOptOutStory,
		props: { kind: 'gpc' },
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
		Component: ConsentDialogOptOutStory,
		props: { kind: 'request' },
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
		Component: ConsentDialogOptOutStory,
		props: { kind: 'confirmed' },
	}),
};

/**
 * The "Your Privacy Choices" dialog for the US opt-out and opt-in regimes,
 * the US with a Global Privacy Control signal, the EU, and the phone
 * sheets. The "full flow" stories start on the banner; its page link opens
 * the dialog. The same stories, by the same names, as React's.
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
			Component: ConsentDialogRegionStory,
			props: {
				container: options.container,
				edgeStyle: options.edgeStyle,
				flow: options.flow,
				region,
			},
		}),
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
