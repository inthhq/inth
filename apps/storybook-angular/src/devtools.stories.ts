import type { Meta, StoryObj } from '@analogjs/storybook-angular';
import { provideInth } from '@inth/angular';
import type { InthProviderOptions } from '@inth/angular';
import { ConsentDevTools } from '@inth/angular/devtools';
import {
	devToolsProviderOptions,
	getDevToolsCategories,
} from '@inth/conformance/fixtures/devtools';
import { devToolsFlow, devToolsReady } from '@inth/conformance/play/devtools';

/** The DevTools panel the React and Svelte Storybooks show, for parity. */
const meta = {
	parameters: { layout: 'fullscreen' },
	render: () => ({
		applicationConfig: {
			providers: [provideInth(devToolsProviderOptions as InthProviderOptions)],
		},
		moduleMetadata: { imports: [ConsentDevTools] },
		props: { getConsentCategories: getDevToolsCategories },
		template: `<inth-consent-dev-tools
			defaultOpen
			[getConsentCategories]="getConsentCategories"
		/>`,
	}),
	tags: ['devtools'],
	title: 'COMPONENTS - ANGULAR/Core/DevTools',
} satisfies Meta;
export default meta;
type Story = StoryObj;

export const Default: Story = { play: devToolsReady };
export const ConsentAndScriptsFlow: Story = { play: devToolsFlow };
