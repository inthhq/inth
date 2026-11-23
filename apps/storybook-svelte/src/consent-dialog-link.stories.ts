import { linkOpensDialog } from '@inth/conformance/play/consent-dialog-link';
import type { Meta, StoryObj } from '@storybook/svelte-vite';

import ConsentDialogLinkStory from './consent-dialog-link-story.svelte';

const meta = {
	component: ConsentDialogLinkStory,
	parameters: {
		layout: 'centered',
	},
	title: 'COMPONENTS - SVELTE/Core/Consent Dialog Link',
} satisfies Meta<ConsentDialogLinkStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	play: linkOpensDialog,
};
