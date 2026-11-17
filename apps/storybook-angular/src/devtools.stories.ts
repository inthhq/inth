import type { Meta, StoryObj } from '@analogjs/storybook-angular';
import { provideC15t } from '@c15t/angular';
import type { C15tOptions } from '@c15t/angular';
import { ConsentDevTools } from '@c15t/angular/devtools';
import {
	devToolsProviderOptions,
	getDevToolsCategories,
} from '@c15t/conformance/fixtures/devtools';
import { devToolsFlow, devToolsReady } from '@c15t/conformance/play/devtools';

/** The DevTools panel the React and Svelte Storybooks show, for parity. */
const meta = {
	parameters: { layout: 'fullscreen' },
	render: () => ({
		applicationConfig: {
			providers: [provideC15t(devToolsProviderOptions as C15tOptions)],
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
