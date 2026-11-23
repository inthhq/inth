/**
 * The "Your Privacy Choices" dialog in the Privacy Choices design, under
 * the names React's stories carry. Astro mounts the dialog as an island
 * of the site's `ui` framework; these stories use the React island, which
 * renders React's Privacy Choices dialog. The "full flow" stories start on
 * the Astro prompt; the page link opens the dialog.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';

import { renderAstroStory } from './render-astro-story';

const meta = {
	parameters: {
		layout: 'fullscreen',
	},
	title: 'COMPONENTS - ASTRO/Privacy Choices/Dialog',
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const story = (id: string, phone = false): Story => {
	const result: Story = {
		render: () => renderAstroStory(`privacy-choices-dialog--${id}`),
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
