import {
	devToolsProviderOptions,
	getDevToolsCategories,
} from '@inth/conformance/fixtures/devtools';
import { devToolsFlow, devToolsReady } from '@inth/conformance/play/devtools';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { DevTools } from '../../../packages/sdk/react/src/devtools';
import { InthProvider } from '../../../packages/sdk/react/src/index';

const meta = {
	component: DevTools,
	parameters: { layout: 'fullscreen' },
	tags: ['devtools'],
	title: 'COMPONENTS - REACT/Core/DevTools',
} satisfies Meta<typeof DevTools>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	play: devToolsReady,
	render: () => (
		<InthProvider options={devToolsProviderOptions}>
			<DevTools
				defaultOpen
				getConsentCategories={getDevToolsCategories}
			/>
		</InthProvider>
	),
};

export const ConsentAndScriptsFlow: Story = { ...Default, play: devToolsFlow };
