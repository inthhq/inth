import type { Meta, StoryObj } from '@analogjs/storybook-angular';
import { ConsentButton, ConsentDialogLink } from '@inth/angular';
import { ConsentDialog } from '@inth/angular/consent-dialog';
import { linkOpensDialog } from '@inth/conformance/play/consent-dialog-link';

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
					inth-consent-button
					inthConsentDialogLink
					[action]="'customize'"
					[noStyle]="false"
				>Privacy preferences</button>
				<inth-consent-dialog />
			</div>
		`,
	}),
};
