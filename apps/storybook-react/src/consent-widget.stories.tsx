import {
	expandedCategories,
	expandedVendors,
} from '@inth/conformance/play/consent-widget';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { ConsentWidget } from '../../../packages/sdk/react/src/index';
import {
	storybookMode,
	storybookOptOutPolicy,
	storybookOptOutPolicyResolution,
	storybookOptOutRecords,
	storybookVendors,
	storybookVendorStoredConsent,
} from '../../storybook-consent-policy';
import {
	editableConsentOptions,
	StorybookConsentProvider,
} from './storybook-consent-fixtures';

const meta = {
	component: ConsentWidget,
	parameters: {
		layout: 'centered',
	},
	title: 'COMPONENTS - REACT/Core/Consent Widget',
} satisfies Meta<typeof ConsentWidget>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => (
		<StorybookConsentProvider
			options={editableConsentOptions}
			storedConsent={{
				experience: false,
				functionality: false,
				marketing: false,
				measurement: false,
				necessary: true,
			}}
		>
			<div style={{ width: '32rem' }}>
				<ConsentWidget />
			</div>
		</StorybookConsentProvider>
	),
};

export const ExpandedCategories: Story = {
	...Default,
	play: expandedCategories,
};

/** Vendors nested under their categories. Expand Marketing to see two cards. */
export const WithVendors: Story = {
	render: () => (
		<StorybookConsentProvider
			options={{ ...editableConsentOptions, vendors: storybookVendors }}
			storedConsent={storybookVendorStoredConsent}
		>
			<div style={{ width: '32rem' }}>
				<ConsentWidget />
			</div>
		</StorybookConsentProvider>
	),
};

/** Marketing and one vendor card open, the vendor turned off in the draft. */
export const WithVendorsExpanded: Story = {
	...WithVendors,
	play: expandedVendors,
};

/** Under an opt-out policy before the visitor opts out. */
export const OptOutNotOptedOut: Story = {
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
				},
				presentation: { optOutLink: 'do-not-sell' },
			}}
		>
			<div style={{ width: '32rem' }}>
				<ConsentWidget />
			</div>
		</StorybookConsentProvider>
	),
};

/** Durable opt-out honored by a visitor request before backend rights confirmation. */
export const OptOutHonoredByRequest: Story = {
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: {
						...storybookOptOutRecords('request'),
						optOutReference: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
					},
				},
				presentation: { optOutLink: 'do-not-sell' },
			}}
		>
			<div style={{ width: '32rem' }}>
				<ConsentWidget />
			</div>
		</StorybookConsentProvider>
	),
};

/** Durable opt-out with sale and sharing confirmed by the backend. */
export const OptOutConfirmedSaleAndShare: Story = {
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: {
						...storybookOptOutRecords('request'),
						optOutReference: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
						optOutRightsConfirmed: true,
					},
				},
				presentation: { optOutLink: 'do-not-sell' },
			}}
		>
			<div style={{ width: '32rem' }}>
				<ConsentWidget />
			</div>
		</StorybookConsentProvider>
	),
};

/** Durable opt-out honored by a visitor request with the "Opt back in…" link. */
export const OptOutWithOptInLink: Story = {
	play: async ({ canvasElement }) => {
		const link = await within(canvasElement).findByTestId(
			'consent-widget-opt-in-link'
		);
		await expect(link).toBeVisible();
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
						...storybookOptOutRecords('request'),
						optOutReference: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
					},
				},
				presentation: { optOutLink: 'do-not-sell' },
			}}
		>
			<div style={{ width: '32rem' }}>
				<ConsentWidget />
			</div>
		</StorybookConsentProvider>
	),
};

/** Durable opt-out honored by an active GPC signal; restricted switches are locked off and no opt-in link is shown. */
export const OptOutGpcLocked: Story = {
	play: async ({ canvasElement }) => {
		await within(canvasElement).findByTestId('consent-widget-opt-out-status');
		await expect(
			within(canvasElement).queryByTestId('consent-widget-opt-in-link')
		).toBeNull();
	},
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { gpc: true },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialPrivacySignals: { gpc: true },
					initialRecords: storybookOptOutRecords('gpc'),
				},
			}}
		>
			<div style={{ width: '32rem' }}>
				<ConsentWidget />
			</div>
		</StorybookConsentProvider>
	),
};

/** Account-held opt-out; switches stay usable with the account notice below each row. */
export const OptOutHeldByAccount: Story = {
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: storybookOptOutRecords('account'),
				},
			}}
		>
			<div style={{ width: '32rem' }}>
				<ConsentWidget />
			</div>
		</StorybookConsentProvider>
	),
};
