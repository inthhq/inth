/**
 * The stock `ConsentDialog` in the Privacy Choices design
 * (`design: 'privacy-choices'`): the "Your Privacy Choices" dialog for the
 * US opt-out and opt-in regimes, the US with a Global Privacy Control
 * signal, the EU, and the phone sheets. The "full flow" stories start on
 * the v6 banner; its page link opens the dialog. Each story resolves its
 * policy offline, like the other stories, so the static build works
 * without a backend.
 *
 * React only for now: the parity runner lists `Privacy Choices/` in
 * `NOT_YET_PORTED` until the other adapters render this design.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';

import type { ConsentContainer } from '../../../packages/sdk/core/src/libs/consent-layout';
import {
	useHasConsentUI,
	useSetActiveUI,
} from '../../../packages/sdk/react/src/hooks';
import {
	ConsentBanner,
	ConsentDialog,
	PrivacyChoicesLink,
} from '../../../packages/sdk/react/src/index';
import type { PolicyRule } from '../../../packages/sdk/schema/src/types';
import {
	storybookMode,
	storybookPolicy,
	storybookVendors,
} from '../../storybook-consent-policy';
import {
	editableConsentOptions,
	StorybookConsentProvider,
} from './storybook-consent-fixtures';

type Region = 'eu' | 'us-opt-in' | 'us-notice' | 'us-opt-out';

const US_GPC = { gpc: { denyCategories: ['marketing', 'measurement'] } };
const US_RIGHTS: PolicyRule['rights'] = [
	'disclosure',
	'preferences',
	'opt-out',
];

/** One offline rule per regime (§2). */
const POLICIES: Record<Region, PolicyRule> = {
	eu: { ...storybookPolicy, id: 'storybook-privacy-choices-dialog-eu' },
	'us-notice': {
		...storybookPolicy,
		id: 'storybook-privacy-choices-dialog-us-notice',
		model: 'opt-out',
		privacySignals: US_GPC,
		prompt: 'notice',
		rights: US_RIGHTS,
	},
	'us-opt-in': {
		...storybookPolicy,
		id: 'storybook-privacy-choices-dialog-us-opt-in',
		privacySignals: US_GPC,
		rights: US_RIGHTS,
	},
	'us-opt-out': {
		...storybookPolicy,
		id: 'storybook-privacy-choices-dialog-us-opt-out',
		model: 'opt-out',
		privacySignals: US_GPC,
		prompt: 'none',
		rights: US_RIGHTS,
	},
};

/** Opens the dialog once the page renders, as the page link would. */
const OpenOnMount = () => {
	const setActiveUI = useSetActiveUI();
	const ready = useHasConsentUI();
	useEffect(() => {
		if (ready) {
			setActiveUI('dialog');
		}
	}, [ready, setActiveUI]);
	return null;
};

/**
 * The site's own link to the dialog, where the stock "Your Privacy
 * Choices" link does not render: the EU, and US opt-in, where it needs an
 * opt-out right the visitor can use.
 */
const SettingsLink = ({ label }: { label: string }) => {
	const setActiveUI = useSetActiveUI();
	return (
		<button
			type="button"
			data-testid="consent-dialog-trigger"
			style={{
				background: 'none',
				border: 0,
				color: 'inherit',
				cursor: 'pointer',
				font: 'inherit',
				padding: 0,
				textDecoration: 'underline',
			}}
			onClick={() => setActiveUI('dialog')}
		>
			{label}
		</button>
	);
};

/** A plain page under the dialog, with the persistent page links. */
const DemoPage = ({ region }: { region: Region }) => (
	<main
		style={{
			fontFamily: 'system-ui, sans-serif',
			lineHeight: 1.6,
			margin: '0 auto',
			maxWidth: 720,
			minHeight: '160vh',
			padding: '48px 24px',
		}}
	>
		<h1>Acme Outdoor</h1>
		<p>
			Tents, packs and stoves for every season. Browse the catalogue, read the
			field guides, or find a store near you.
		</p>
		<footer style={{ display: 'flex', gap: 24, marginTop: 48 }}>
			{region === 'eu' ? <SettingsLink label="Privacy settings" /> : null}
			{region === 'us-opt-in' ? (
				<SettingsLink label="Your Privacy Choices" />
			) : null}
			{region === 'eu' || region === 'us-opt-in' ? null : (
				<PrivacyChoicesLink />
			)}
		</footer>
	</main>
);

interface DialogStoryOptions {
	/** Start on the v6 banner instead of the open dialog. */
	flow?: boolean;
	container?: ConsentContainer;
	gpc?: boolean;
	phone?: boolean;
	edgeStyle?: 'inset' | 'flush';
}

const dialogStory = function dialogStory(
	region: Region,
	options: DialogStoryOptions = {}
): Story {
	const story: Story = {
		render: () => (
			<StorybookConsentProvider
				options={{
					...editableConsentOptions,
					legalLinks: {
						cookiePolicy: { href: '#cookies' },
						privacyPolicy: { href: '#privacy' },
					},
					mode: storybookMode([POLICIES[region]]),
					presentation: {
						design: 'privacy-choices',
						prompt: {
							container: options.container ?? {
								position: 'start',
								type: 'card',
							},
							edgeStyle: options.edgeStyle,
						},
					},
					vendors: storybookVendors,
				}}
			>
				<DemoPage region={region} />
				<ConsentBanner />
				<ConsentDialog />
				{options.flow ? null : <OpenOnMount />}
			</StorybookConsentProvider>
		),
	};
	if (options.gpc) {
		// The signal must be on before the provider reads it.
		story.beforeEach = () => {
			const previous = Object.getOwnPropertyDescriptor(
				navigator,
				'globalPrivacyControl'
			);
			Object.defineProperty(navigator, 'globalPrivacyControl', {
				configurable: true,
				value: true,
			});
			return () => {
				if (previous) {
					Object.defineProperty(navigator, 'globalPrivacyControl', previous);
				} else {
					Reflect.deleteProperty(navigator, 'globalPrivacyControl');
				}
			};
		};
	}
	if (options.phone) {
		story.globals = { viewport: { isRotated: false, value: 'mobile2' } };
	}
	return story;
};

const meta = {
	component: ConsentDialog,
	parameters: {
		layout: 'fullscreen',
	},
	title: 'COMPONENTS - REACT/Privacy Choices/Dialog',
} satisfies Meta<typeof ConsentDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const UsOptOut: Story = dialogStory('us-opt-out');
export const UsOptIn: Story = dialogStory('us-opt-in');
export const UsWithGpc: Story = dialogStory('us-opt-out', { gpc: true });
export const EU: Story = dialogStory('eu');

export const PhoneUsPreferencesSheet: Story = dialogStory('us-opt-out', {
	phone: true,
});
export const PhoneEuVendorSheets: Story = dialogStory('eu', { phone: true });
export const PhoneFlushSheets: Story = dialogStory('us-opt-in', {
	edgeStyle: 'flush',
	phone: true,
});

export const FullFlowEU: Story = dialogStory('eu', { flow: true });
export const FullFlowUsOptIn: Story = dialogStory('us-opt-in', { flow: true });
export const FullFlowUsNotice: Story = dialogStory('us-notice', {
	container: { edge: 'bottom', type: 'banner' },
	flow: true,
});
