import type { Meta, StoryObj } from '@analogjs/storybook-angular';
import { dialogFocusManagement } from '@c15t/conformance/play/consent-dialog';
import { triggerOpensDialog } from '@c15t/conformance/play/consent-dialog-trigger';
import { ConsentDialog } from '@inth/angular/consent-dialog';
import { ConsentDialogTrigger } from '@inth/angular/consent-dialog-trigger';
import type {
	ConsentDialogTriggerPosition,
	ConsentDialogTriggerSize,
	ConsentDialogTriggerVisibility,
} from '@inth/angular/consent-dialog-trigger';

import {
	consentApplication,
	editableConsentOptions,
	editableStoredConsent,
} from './storybook-consent-fixtures';

interface TriggerStoryArgs {
	defaultPosition?: ConsentDialogTriggerPosition;
	size?: ConsentDialogTriggerSize;
	showWhen?: ConsentDialogTriggerVisibility;
}

const meta = {
	args: {
		defaultPosition: 'bottom-right',
		showWhen: 'always',
		size: 'md',
	},
	parameters: {
		layout: 'fullscreen',
	},
	render: (args) => ({
		applicationConfig: consentApplication({
			options: editableConsentOptions,
			storedConsent: editableStoredConsent,
		}),
		moduleMetadata: {
			imports: [ConsentDialog, ConsentDialogTrigger],
		},
		props: args,
		template: `
			<c15t-consent-dialog />
			<c15t-consent-dialog-trigger
				[defaultPosition]="defaultPosition"
				[showWhen]="showWhen"
				[size]="size"
			/>
		`,
	}),
	title: 'COMPONENTS - ANGULAR/Core/Consent Dialog Trigger',
} satisfies Meta<TriggerStoryArgs>;

export default meta;

type Story = StoryObj<TriggerStoryArgs>;

export const Default: Story = {
	play: triggerOpensDialog,
};

export const DialogFocusManagement: Story = {
	play: dialogFocusManagement,
};

export const Mobile: Story = {
	args: {
		defaultPosition: 'bottom-left',
		size: 'sm',
	},
	parameters: {
		viewport: {
			defaultViewport: 'mobile1',
		},
	},
};
