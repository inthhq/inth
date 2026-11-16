import type { Meta, StoryObj } from '@analogjs/storybook-angular';
import {
	ConsentGate,
	ConsentGatePlaceholder,
} from '@c15t/angular/consent-gate';

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
				<c15t-consent-gate category="marketing">
					<ng-template c15tConsentGatePlaceholder><div data-testid="consent-gate-placeholder">
						Marketing content requires consent.
					</div></ng-template>
					<div
						data-testid="parity-consent-gate-content"
						style="border-radius: 1rem; padding: 1.25rem; background: var(--c15t-surface); border: 1px solid var(--c15t-border);"
					>
						Embedded marketing content is now visible.
					</div>
				</c15t-consent-gate>
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
