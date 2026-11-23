/**
 * Shared setup for the Vue Privacy Choices stories: one offline rule per
 * regime (§2), a plain page under the surfaces, and the provider config.
 */
import type { InitOutput, PolicyRule } from '@inth/sdk/schema/types';
import { defineComponent, h } from 'vue';

import type {
	ConsentContainer,
	ConsentEdgeStyle,
} from '../../../packages/sdk/core/src/libs/consent-layout';
import {
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '../../../packages/sdk/schema/src/types';
import { useConsentActiveUI } from '../../../packages/sdk/vue/src/runtime/composables/activeUI';
import type { ConsentConfig } from '../../../packages/sdk/vue/src/runtime/config';
import {
	storybookPolicy,
	storybookVendors,
} from '../../storybook-consent-policy';
import { storybookInit } from './storybook-consent-fixtures';

export type Region = 'eu' | 'us-opt-in' | 'us-notice' | 'us-opt-out';

const US_GPC = { gpc: { denyCategories: ['marketing', 'measurement'] } };
const US_RIGHTS: PolicyRule['rights'] = [
	'disclosure',
	'preferences',
	'opt-out',
];

/** One offline rule per regime (§2). */
const POLICIES: Record<Region, PolicyRule> = {
	eu: { ...storybookPolicy, id: 'storybook-privacy-choices-eu' },
	'us-notice': {
		...storybookPolicy,
		id: 'storybook-privacy-choices-us-notice',
		model: 'opt-out',
		privacySignals: US_GPC,
		prompt: 'notice',
		rights: US_RIGHTS,
	},
	'us-opt-in': {
		...storybookPolicy,
		id: 'storybook-privacy-choices-us-opt-in',
		privacySignals: US_GPC,
		rights: US_RIGHTS,
	},
	'us-opt-out': {
		...storybookPolicy,
		id: 'storybook-privacy-choices-us-opt-out',
		model: 'opt-out',
		privacySignals: US_GPC,
		prompt: 'none',
		rights: US_RIGHTS,
	},
};

/** The init a region's story resolves offline. */
export const privacyChoicesInit = function privacyChoicesInit(
	region: Region
): InitOutput {
	const location =
		region === 'eu'
			? { countryCode: 'DE', regionCode: null }
			: { countryCode: 'US', regionCode: 'CA' };
	return {
		...storybookInit,
		location,
		policyResolution: writePolicyResolutionWire(
			resolvePolicyRules({ ...location, rules: [POLICIES[region]] })
		),
	};
};

/** The provider config for a Privacy Choices story. */
export const privacyChoicesConfig = function privacyChoicesConfig(
	container: ConsentContainer,
	options: {
		blockUntilChoice?: boolean;
		edgeStyle?: ConsentEdgeStyle;
		vendors?: boolean;
	} = {}
): Partial<ConsentConfig> {
	return {
		legalLinks: {
			cookiePolicy: { href: '#cookies' },
			privacyPolicy: { href: '#privacy' },
		},
		presentation: {
			design: 'privacy-choices',
			prompt: {
				blockUntilChoice: options.blockUntilChoice,
				container,
				edgeStyle: options.edgeStyle,
			},
		},
		vendors: options.vendors ? storybookVendors : undefined,
	} as Partial<ConsentConfig>;
};

/**
 * A plain page under the surfaces, with the site's persistent link to the
 * dialog ("Your Privacy Choices" in the US, "Privacy settings" in the EU).
 */
export const DemoPage = defineComponent({
	name: 'PrivacyChoicesDemoPage',
	props: { region: { default: 'eu', type: String } },
	setup(props) {
		const activeUI = useConsentActiveUI();
		return () =>
			h(
				'main',
				{
					style: {
						fontFamily: 'system-ui, sans-serif',
						lineHeight: 1.6,
						margin: '0 auto',
						maxWidth: '720px',
						minHeight: '160vh',
						padding: '48px 24px',
					},
				},
				[
					h('h1', 'Acme Outdoor'),
					h(
						'p',
						'Tents, packs and stoves for every season. Browse the catalogue, read the field guides, or find a store near you.'
					),
					h('footer', { style: { marginTop: '48px' } }, [
						h(
							'button',
							{
								'data-testid':
									props.region === 'eu'
										? 'consent-dialog-trigger'
										: 'privacy-choices-link',
								onClick: () => {
									activeUI.value = 'manager';
								},
								style: {
									background: 'none',
									border: 0,
									color: 'inherit',
									cursor: 'pointer',
									font: 'inherit',
									padding: 0,
									textDecoration: 'underline',
								},
								type: 'button',
							},
							props.region === 'eu'
								? 'Privacy settings'
								: 'Your Privacy Choices'
						),
					]),
				]
			);
	},
});
