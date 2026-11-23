import { keyboardNavigation, tabSwitching } from '@inth/conformance/play/tabs';
import type { Meta, StoryObj } from '@storybook/svelte-vite';

import TabsControlledDemo from './tabs-controlled-demo.svelte';
import TabsDemo from './tabs-demo.svelte';

const meta = {
	component: TabsDemo,
	parameters: {
		layout: 'centered',
	},
	title: 'PRIMITIVES - SVELTE/Tabs',
} satisfies Meta<TabsDemo>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	play: tabSwitching,
};

export const KeyboardNavigation: Story = {
	play: keyboardNavigation,
};

export const Controlled: Story = {
	// @ts-expect-error -- different component for this story
	component: TabsControlledDemo,
};
