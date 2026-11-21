import type {
	OptOutPayload,
	OptOutRecord,
	ProviderTransportFactory,
} from '@inth/sdk/engine';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import ConsentDialogLink from '../../../packages/sdk/vue/src/runtime/components/consent-dialog-link.vue';
import ConsentManager from '../../../packages/sdk/vue/src/runtime/components/manager.vue';
import OptOutConfirmation from '../../../packages/sdk/vue/src/runtime/components/opt-out-confirmation.vue';
import ConsentBanner from '../../../packages/sdk/vue/src/runtime/components/prompt.vue';
import {
	storybookMode as createOfflineStorybookMode,
	storybookOptOutPolicy,
} from '../../storybook-consent-policy';
import {
	storybookOptOutInit,
	useStorybookConsent as setupStorybookConsent,
	useStorybookOptOutConsent as setupStorybookOptOutConsent,
} from './storybook-consent-fixtures';

const optOutAnsweringMode = function optOutAnsweringMode(
	answer: Pick<OptOutRecord, 'heldBy' | 'rights'>
): ProviderTransportFactory {
	const base = createOfflineStorybookMode([storybookOptOutPolicy]);
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
	title: 'COMPONENTS - VUE/Core/Opt Out Confirmation',
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
	render: () => ({
		components: { ConsentBanner, ConsentManager },
		setup() {
			setupStorybookConsent(
				'banner',
				{
					disableAnimation: true,
					presentation: { optOutLink: 'do-not-sell' },
					reloadOnConsentRevoked: false,
				},
				storybookOptOutInit,
				undefined,
				createOfflineStorybookMode([storybookOptOutPolicy])
			);
		},
		template:
			'<ConsentBanner disable-animation /><ConsentManager disable-animation />',
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
		components: { ConsentBanner, ConsentManager },
		setup() {
			setupStorybookConsent(
				'banner',
				{
					disableAnimation: true,
					presentation: { optOutLink: 'do-not-sell' },
					reloadOnConsentRevoked: false,
				},
				storybookOptOutInit,
				undefined,
				optOutAnsweringMode({
					heldBy: 'device',
					rights: ['sale', 'share'],
				})
			);
		},
		template:
			'<ConsentBanner disable-animation /><ConsentManager disable-animation />',
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
		components: { ConsentBanner, ConsentManager },
		setup() {
			setupStorybookConsent(
				'banner',
				{
					disableAnimation: true,
					presentation: { optOutLink: 'do-not-sell' },
					reloadOnConsentRevoked: false,
				},
				storybookOptOutInit,
				undefined,
				optOutAnsweringMode({
					heldBy: 'both',
					rights: ['sale', 'share'],
				})
			);
		},
		template:
			'<ConsentBanner disable-animation /><ConsentManager disable-animation />',
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
		components: { ConsentDialogLink, ConsentManager },
		setup() {
			const context = setupStorybookConsent(
				null,
				{
					disableAnimation: true,
					overrides: { gpc: true },
					presentation: { optOutLink: 'do-not-sell' },
					reloadOnConsentRevoked: false,
				},
				storybookOptOutInit,
				undefined,
				createOfflineStorybookMode([storybookOptOutPolicy])
			);
			context.kernel.set.privacySignals({ gpc: true });
		},
		template:
			'<ConsentDialogLink right="opt-out" /><ConsentManager disable-animation />',
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
		components: { ConsentDialogLink, ConsentManager },
		setup() {
			setupStorybookOptOutConsent('none', {
				configOverrides: {
					disableAnimation: true,
					presentation: { optOutLink: 'do-not-sell' },
					reloadOnConsentRevoked: false,
				},
				initialRecords: {
					optOut: {
						heldBy: 'person',
						method: 'propagated',
						recordedAt: Date.now() - 60_000,
						rights: ['sale', 'share', 'targeted_ads'],
					},
					optOutRightsConfirmed: true,
				},
				mode: createOfflineStorybookMode([storybookOptOutPolicy]),
			});
		},
		template:
			'<ConsentDialogLink right="opt-out" /><ConsentManager disable-animation />',
	}),
};
