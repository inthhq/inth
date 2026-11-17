import type { Meta, StoryObj } from '@analogjs/storybook-angular';
import { ConsentButton, ConsentDialogLink } from '@c15t/angular';
import { ConsentDialog } from '@c15t/angular/consent-dialog';
import { linkOpensDialog } from '@c15t/conformance/play/consent-dialog-link';

import {
	consentApplication,
	editableConsentOptions,
	editableStoredConsent,
} from './storybook-consent-fixtures';

const meta = {
	parameters: {
		layout: 'centered',
	},
	title: 'COMPONENTS - ANGULAR/Core/Consent Dialog Link',
} satisfies Meta;

export default meta;

type Story = StoryObj;

export const Default: Story = {
	play: linkOpensDialog,
	render: () => ({
		applicationConfig: consentApplication({
			options: editableConsentOptions,
			storedConsent: editableStoredConsent,
		}),
		moduleMetadata: {
			imports: [ConsentButton, ConsentDialog, ConsentDialogLink],
		},
		template: `
			<div style="padding: 2rem;">
				<button
					type="button"
					c15t-consent-button
					c15tConsentDialogLink
					[action]="'customize'"
					[noStyle]="false"
				>Privacy preferences</button>
				<c15t-consent-dialog />
			</div>
		`,
	}),
};
