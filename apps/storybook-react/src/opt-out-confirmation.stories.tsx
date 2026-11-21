import type { OptOutPayload, OptOutRecord } from '@inth/sdk/engine';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	OptOutConfirmation,
} from '../../../packages/sdk/react/src/index';
import type { ProviderTransportFactory } from '../../../packages/sdk/react/src/index';
import {
	storybookMode,
	storybookOptOutPolicy,
	storybookOptOutPolicyResolution,
} from '../../storybook-consent-policy';
import {
	editableConsentOptions,
	StorybookConsentProvider,
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

const meta = {
	component: OptOutConfirmation,
	parameters: {
		layout: 'fullscreen',
	},
	title: 'COMPONENTS - REACT/Core/Opt Out Confirmation',
} satisfies Meta<typeof OptOutConfirmation>;

export default meta;

type Story = StoryObj<typeof meta>;

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
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				presentation: { optOutLink: 'do-not-sell' },
				reloadOnConsentRevoked: false,
			}}
		>
			<ConsentBanner disableAnimation />
			<ConsentDialog disableAnimation />
		</StorybookConsentProvider>
	),
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
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: optOutAnsweringMode({
					heldBy: 'device',
					rights: ['sale', 'share'],
				}),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				presentation: { optOutLink: 'do-not-sell' },
			}}
		>
			<ConsentBanner disableAnimation />
			<ConsentDialog disableAnimation />
		</StorybookConsentProvider>
	),
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
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: optOutAnsweringMode({
					heldBy: 'both',
					rights: ['sale', 'share'],
				}),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				presentation: { optOutLink: 'do-not-sell' },
			}}
		>
			<ConsentBanner disableAnimation />
			<ConsentDialog disableAnimation />
		</StorybookConsentProvider>
	),
};

export const SignalHonored: Story = {
	play: async () => {
		const link = await within(document.body).findByRole('button', {
			name: 'Your Privacy Choices',
		});
		await userEvent.click(link);
		const status = await within(document.body).findByTestId(
			'opt-out-confirmation-status'
		);
		await waitFor(() =>
			expect(status).toHaveTextContent('Opt-out preference signal honored')
		);
	},
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: true, region: 'CA' },
				presentation: { optOutLink: 'privacy-choices' },
				reloadOnConsentRevoked: false,
			}}
		>
			<ConsentDialogLink right="opt-out" />
			<ConsentDialog disableAnimation />
		</StorybookConsentProvider>
	),
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
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
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
			}}
		>
			<ConsentDialogLink right="opt-out" />
			<ConsentDialog disableAnimation />
		</StorybookConsentProvider>
	),
};
