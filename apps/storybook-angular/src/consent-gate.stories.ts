import type { Meta, StoryObj } from '@analogjs/storybook-angular';
import {
	ConsentGate,
	ConsentGatePlaceholder,
} from '@inth/angular/consent-gate';

import {
	consentApplication,
	editableConsentOptions,
} from './storybook-consent-fixtures';

interface GateStoryArgs {
	granted?: boolean;
}

const meta = {
	parameters: {
		layout: 'centered',
	},
	render: (args) => ({
		applicationConfig: consentApplication({
			options: editableConsentOptions,
			storedConsent: args.granted
				? { marketing: true, necessary: true }
				: undefined,
		}),
		moduleMetadata: {
			imports: [ConsentGate, ConsentGatePlaceholder],
		},
		template: `
			<div style="width: 32rem;">
				<inth-consent-gate category="marketing">
					<ng-template inthConsentGatePlaceholder><div data-testid="consent-gate-placeholder">
						Marketing content requires consent.
					</div></ng-template>
					<div
						data-testid="parity-consent-gate-content"
						style="border-radius: 1rem; padding: 1.25rem; background: var(--inth-surface); border: 1px solid var(--inth-border);"
					>
						Embedded marketing content is now visible.
					</div>
				</inth-consent-gate>
			</div>
		`,
	}),
	title: 'COMPONENTS - ANGULAR/Core/Consent Gate',
} satisfies Meta<GateStoryArgs>;

export default meta;

type Story = StoryObj<GateStoryArgs>;

export const Placeholder: Story = {};

export const GrantedContent: Story = {
	args: {
		granted: true,
	},
};
