import type { Meta, StoryObj } from '@analogjs/storybook-angular';
import { ConsentBanner, ConsentDialogLink } from '@inth/angular';
import type { ProviderTransportFactory } from '@inth/angular';
import { ConsentDialog } from '@inth/angular/consent-dialog';
import type { OptOutPayload, OptOutRecord } from '@inth/sdk/engine';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import {
	storybookMode,
	storybookOptOutPolicy,
	storybookOptOutPolicyResolution,
} from '../../storybook-consent-policy';
import {
	consentApplication,
	editableConsentOptions,
} from './storybook-consent-fixtures';

const optOutAnsweringMode = function optOutAnsweringMode(
	answer: Pick<OptOutRecord, 'heldBy' | 'rights'>
): ProviderTransportFactory {
	const base = storybookMode([storybookOptOutPolicy]);
	return Object.assign(
		(context: Parameters<ProviderTransportFactory>[0]) => ({
			...base(context),
			optOut: (payload: OptOutPayload) =>
				Promise.resolve({
					ok: true,
					optOut: {
						heldBy: answer.heldBy,
						method: payload.method,
						recordedAt: payload.givenAt,
						rights: [...answer.rights],
					},
					subjectId: payload.subjectId,
				}),
		}),
		{ kind: 'offline' as const }
	);
};

const bannerDialogTemplate = `
	<inth-consent-banner [disableAnimation]="true" />
	<inth-consent-dialog [disableAnimation]="true" />
`;

const linkDialogTemplate = `
	<button inthConsentDialogLink [right]="'opt-out'" type="button"></button>
	<inth-consent-dialog [disableAnimation]="true" />
`;

const meta = {
	parameters: {
		layout: 'fullscreen',
	},
	title: 'COMPONENTS - ANGULAR/Core/Opt Out Confirmation',
} satisfies Meta;

export default meta;

type Story = StoryObj;

export const RequestHonored: Story = {
	play: async () => {
		const link = await within(document.body).findByTestId(
			'consent-banner-right-link-opt-out'
		);
		await userEvent.click(link);
		const status = await within(document.body).findByTestId(
			'opt-out-confirmation-status'
		);
		await waitFor(() =>
			expect(status).toHaveTextContent('Opt-out request honored')
		);
	},
	render: () => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				disableAnimation: true,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				presentation: { optOutLink: 'do-not-sell' },
				reloadOnConsentRevoked: false,
			},
		}),
		moduleMetadata: {
			imports: [ConsentBanner, ConsentDialog],
		},
		template: bannerDialogTemplate,
	}),
};

export const RequestConfirmed: Story = {
	play: async () => {
		const link = await within(document.body).findByTestId(
			'consent-banner-right-link-opt-out'
		);
		await userEvent.click(link);
		const status = await within(document.body).findByTestId(
			'opt-out-confirmation-status'
		);
		await waitFor(() =>
			expect(status).toHaveTextContent('Opt-out request honored')
		);
	},
	render: () => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				disableAnimation: true,
				mode: optOutAnsweringMode({
					heldBy: 'device',
					rights: ['sale', 'share'],
				}),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				presentation: { optOutLink: 'do-not-sell' },
				reloadOnConsentRevoked: false,
			},
		}),
		moduleMetadata: {
			imports: [ConsentBanner, ConsentDialog],
		},
		template: bannerDialogTemplate,
	}),
};

export const AccountCovered: Story = {
	play: async () => {
		const link = await within(document.body).findByTestId(
			'consent-banner-right-link-opt-out'
		);
		await userEvent.click(link);
		const status = await within(document.body).findByTestId(
			'opt-out-confirmation-status'
		);
		await waitFor(() =>
			expect(status).toHaveTextContent('Opt-out request honored')
		);
	},
	render: () => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				disableAnimation: true,
				mode: optOutAnsweringMode({
					heldBy: 'both',
					rights: ['sale', 'share'],
				}),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				presentation: { optOutLink: 'do-not-sell' },
				reloadOnConsentRevoked: false,
			},
		}),
		moduleMetadata: {
			imports: [ConsentBanner, ConsentDialog],
		},
		template: bannerDialogTemplate,
	}),
};

export const SignalHonored: Story = {
	play: async () => {
		const link = await within(document.body).findByRole('button', {
			name: 'Do Not Sell or Share My Personal Information',
		});
		await userEvent.click(link);
		const status = await within(document.body).findByTestId(
			'opt-out-confirmation-status'
		);
		await waitFor(() =>
			expect(status).toHaveTextContent('Opt-out preference signal honored')
		);
	},
	render: () => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				disableAnimation: true,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: true, region: 'CA' },
				presentation: { optOutLink: 'do-not-sell' },
				reloadOnConsentRevoked: false,
			},
		}),
		moduleMetadata: {
			imports: [ConsentDialog, ConsentDialogLink],
		},
		template: linkDialogTemplate,
	}),
};

export const AccountAdopted: Story = {
	play: async () => {
		const link = await within(document.body).findByTestId(
			'consent-dialog-link'
		);
		await userEvent.click(link);
		const status = await within(document.body).findByTestId(
			'opt-out-confirmation-status'
		);
		await waitFor(() =>
			expect(status).toHaveTextContent('Opt-out request honored')
		);
	},
	render: () => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				disableAnimation: true,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: {
						optOut: {
							heldBy: 'person',
							method: 'propagated',
							recordedAt: Date.now() - 60_000,
							rights: ['sale', 'share', 'targeted_ads'],
						},
						optOutRightsConfirmed: true,
					},
				},
				presentation: { optOutLink: 'do-not-sell' },
				reloadOnConsentRevoked: false,
			},
		}),
		moduleMetadata: {
			imports: [ConsentDialog, ConsentDialogLink],
		},
		template: linkDialogTemplate,
	}),
};
