import type { Meta, StoryObj } from '@analogjs/storybook-angular';
import {
	devToolsProviderOptions,
	getDevToolsCategories,
} from '@c15t/conformance/fixtures/devtools';
import { devToolsFlow, devToolsReady } from '@c15t/conformance/play/devtools';
import { provideC15t } from '@inth/angular';
import type { C15tProviderOptions } from '@inth/angular';
import { ConsentDevTools } from '@inth/angular/devtools';

/** The DevTools panel the React and Svelte Storybooks show, for parity. */
const meta = {
	parameters: { layout: 'fullscreen' },
	render: () => ({
		applicationConfig: {
			providers: [provideC15t(devToolsProviderOptions as C15tProviderOptions)],
		},
		moduleMetadata: { imports: [ConsentDevTools] },
		props: { getConsentCategories: getDevToolsCategories },
		template: `<c15t-consent-dev-tools
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
