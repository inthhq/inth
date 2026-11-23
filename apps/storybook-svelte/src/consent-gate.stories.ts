import type { Meta, StoryObj } from '@storybook/svelte-vite';

import ConsentGateStory from './consent-gate-story.svelte';

const meta = {
	component: ConsentGateStory,
	parameters: {
		layout: 'centered',
	},
	title: 'COMPONENTS - SVELTE/Core/Consent Gate',
} satisfies Meta<ConsentGateStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Placeholder: Story = {};

export const GrantedContent: Story = {
	args: {
		granted: true,
	},
};
