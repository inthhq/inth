/**
 * The stock `<inth-consent-dialog>` in the Privacy Choices design
 * (`design: 'privacy-choices'`): the "Your Privacy Choices" dialog for the
 * US opt-out and opt-in regimes, the US with a Global Privacy Control
 * signal, the EU, and the phone sheets. The "full flow" stories start on
 * the v6 banner; its page link opens the dialog. The story names match
 * React's, so the parity runner pairs them. Each story resolves its policy
 * offline, so the static build works without a backend.
 */
import type { Meta, StoryObj } from '@analogjs/storybook-angular';
import { ConsentBanner, PrivacyChoicesLink } from '@inth/angular';
import { ConsentDialog } from '@inth/angular/consent-dialog';
import type { ConsentContainer, PolicyRule } from '@inth/sdk/engine';

import {
	storybookMode,
	storybookPolicy,
	storybookVendors,
} from '../../storybook-consent-policy';
import {
	demoPage,
	StorybookOpenDialog,
	StorybookSettingsLink,
	US_GPC,
} from './privacy-choices-shared';
import {
	consentApplication,
	editableConsentOptions,
} from './storybook-consent-fixtures';

type Region = 'eu' | 'us-opt-in' | 'us-notice' | 'us-opt-out';

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

/** The page links each region shows. */
const pageLinks = (region: Region): string => {
	if (region === 'eu') {
		return '<storybook-settings-link label="Privacy settings" />';
	}
	if (region === 'us-opt-in') {
		return '<storybook-settings-link label="Your Privacy Choices" />';
	}
	return '<inth-privacy-choices-link />';
};

interface DialogStoryOptions {
	/** Start on the v6 banner instead of the open dialog. */
	flow?: boolean;
	container?: ConsentContainer;
	gpc?: boolean;
	phone?: boolean;
	edgeStyle?: 'inset' | 'flush';
}

const meta = {
	component: ConsentDialog,
	parameters: {
		layout: 'fullscreen',
	},
	title: 'COMPONENTS - ANGULAR/Privacy Choices/Dialog',
} satisfies Meta<ConsentDialog>;

export default meta;

type Story = StoryObj<ConsentDialog>;

const dialogStory = function dialogStory(
	region: Region,
	options: DialogStoryOptions = {}
): Story {
	const story: Story = {
		render: () => ({
			applicationConfig: consentApplication({
				options: {
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
				},
			}),
			moduleMetadata: {
				imports: [
					ConsentBanner,
					ConsentDialog,
					StorybookOpenDialog,
					PrivacyChoicesLink,
					StorybookSettingsLink,
				],
			},
			template: `${demoPage(pageLinks(region), 'dialog')}<inth-consent-banner /><inth-consent-dialog />${
				options.flow ? '' : '<storybook-open-dialog />'
			}`,
		}),
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
