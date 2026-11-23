import {
	dialogContract,
	dialogEscapeCloses,
	saveFlow,
} from '@inth/conformance/play/consent-dialog';
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { renderAstroStory, whenPromptReady } from './render-astro-story';

const meta = {
	parameters: {
		layout: 'fullscreen',
	},
	title: 'COMPONENTS - ASTRO/Core/Consent Dialog',
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The dialog a visitor sees: the island mounted into the server-rendered
 * host. Named `Default` so it pairs with the other frameworks' `Default`,
 * which are also the open dialog.
 */
export const Default: Story = {
	render: () => renderAstroStory('consent-dialog--opened'),
};

/** The banner and `<ConsentDialog />`; the plays open the dialog from Customize. */
/** Wait for the browser prompt, then run the shared play. */
const afterPrompt =
	(play: NonNullable<Story['play']>): NonNullable<Story['play']> =>
	async (context) => {
		await whenPromptReady();
		await play(context);
	};

export const DialogContract: Story = {
	play: afterPrompt(dialogContract),
	render: () => renderAstroStory('consent-banner--with-dialog'),
};

export const DialogEscapeCloses: Story = {
	...DialogContract,
	play: afterPrompt(dialogEscapeCloses),
};

export const SaveFlow: Story = {
	...DialogContract,
	play: afterPrompt(saveFlow),
};

/**
 * The resting state unique to Astro: `<ConsentDialog />` server-renders
 * only its host element and mounts nothing until something opens it. No
 * other framework has an equivalent, so this story pairs with nothing.
 */
export const ServerShell: Story = {
	render: () => renderAstroStory('consent-dialog--default'),
};

/** Opt-out policy before the visitor opts out. */
export const OptOutNotOptedOut: Story = {
	render: () => renderAstroStory('consent-dialog--opt-out-not-opted-out'),
};

/** Opted out by a click before backend rights confirmation. */
export const OptOutHonoredByRequest: Story = {
	render: () => renderAstroStory('consent-dialog--opt-out-honored-by-request'),
};

/** Opted out with sale and sharing confirmed by the backend. */
export const OptOutConfirmedSaleAndShare: Story = {
	render: () =>
		renderAstroStory('consent-dialog--opt-out-confirmed-sale-and-share'),
};

/** Opted out by an active GPC signal; no opt-in link is shown. */
export const OptOutGpcLocked: Story = {
	play: async () => {
		await within(document.body).findByTestId('consent-widget-opt-out-status');
		await expect(
			within(document.body).queryByTestId('consent-widget-opt-in-link')
		).toBeNull();
	},
	render: () => renderAstroStory('consent-dialog--opt-out-gpc-locked'),
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
	render: () => renderAstroStory('consent-dialog--opt-in-confirmation'),
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
	render: () =>
		renderAstroStory('consent-dialog--opt-in-confirmation-confirmed-rights'),
};

/**
 * The dialog for each regime, under the names React's stories carry. The
 * "full flow" stories start on the prompt; the page link opens the dialog.
 */
const story = (id: string, phone = false): Story => {
	const result: Story = {
		render: () => renderAstroStory(`consent-dialog--${id}`),
	};
	if (phone) {
		result.globals = { viewport: { isRotated: false, value: 'mobile2' } };
	}
	return result;
};

export const UsOptOut: Story = story('us-opt-out');
export const UsOptIn: Story = story('us-opt-in');
export const UsWithGpc: Story = story('us-with-gpc');
export const EU: Story = story('eu');
export const PhoneUsPreferencesSheet: Story = story(
	'phone-us-preferences-sheet',
	true
);
export const PhoneEuVendorSheets: Story = story('phone-eu-vendor-sheets', true);
export const PhoneFlushSheets: Story = story('phone-flush-sheets', true);
export const FullFlowEU: Story = story('full-flow-eu');
export const FullFlowUsOptIn: Story = story('full-flow-us-opt-in');
export const FullFlowUsNotice: Story = story('full-flow-us-notice');
