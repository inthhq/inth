/**
 * Shared setup for the Vue banner and dialog stories: one offline rule per
 * regime (§2), a plain page under the surfaces, and the provider config.
 */
import type { InitOutput, PolicyRule } from '@inth/sdk/schema/types';
import { defineComponent, h } from 'vue';

import type {
	ConsentContainer,
	ConsentEdgeStyle,
} from '../../../packages/sdk/core/src/libs/consent-layout.model';
import {
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '../../../packages/sdk/schema/src/types';
import PrivacyChoicesLink from '../../../packages/sdk/vue/src/runtime/components/privacy-choices-link.vue';
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

/**
 * The banner stories' US opt-in rule keeps the default rights, as React's
 * banner stories do; the dialog stories give it the opt-out right.
 */
const BANNER_US_OPT_IN: PolicyRule = {
	...storybookPolicy,
	id: 'storybook-privacy-choices-us-opt-in',
	privacySignals: US_GPC,
};

/** The init a region's story resolves offline. */
export const regionInit = function regionInit(
	region: Region,
	surface: 'banner' | 'dialog' = 'dialog'
): InitOutput {
	const rule =
		surface === 'banner' && region === 'us-opt-in'
			? BANNER_US_OPT_IN
			: POLICIES[region];
	const location =
		region === 'eu'
			? { countryCode: 'DE', regionCode: null }
			: { countryCode: 'US', regionCode: 'CA' };
	return {
		...storybookInit,
		location,
		policyResolution: writePolicyResolutionWire(
			resolvePolicyRules({ ...location, rules: [rule] })
		),
	};
};

/** The provider config for a container story. */
export const containerConfig = function containerConfig(
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
			prompt: {
				blockUntilChoice: options.blockUntilChoice,
				container,
				edgeStyle: options.edgeStyle,
			},
		},
		vendors: options.vendors ? storybookVendors : undefined,
	} as Partial<ConsentConfig>;
};

const pageStyle = {
	fontFamily: 'system-ui, sans-serif',
	lineHeight: 1.6,
	margin: '0 auto',
	maxWidth: '720px',
	minHeight: '160vh',
	padding: '48px 24px',
};

const intro = () => [
	h('h1', 'Acme Outdoor'),
	h(
		'p',
		'Tents, packs and stoves for every season. Browse the catalogue, read the field guides, or find a store near you.'
	),
];

/** The site's own link to the dialog, where the stock link does not render. */
const SettingsLink = defineComponent({
	name: 'StorySettingsLink',
	props: { label: { required: true, type: String } },
	setup(props) {
		const activeUI = useConsentActiveUI();
		return () =>
			h(
				'button',
				{
					'data-testid': 'consent-dialog-trigger',
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
				props.label
			);
	},
});

/**
 * A plain page under the banner, with the stock "Your Privacy Choices"
 * link, as React's stories render it.
 */
export const BannerDemoPage = defineComponent({
	name: 'BannerDemoPage',
	setup() {
		return () =>
			h('main', { style: pageStyle }, [
				...intro(),
				h('p', [
					h('a', { href: '#catalogue' }, 'Catalogue'),
					' · ',
					h('a', { href: '#guides' }, 'Field guides'),
				]),
				h('footer', { style: { marginTop: '48px' } }, [h(PrivacyChoicesLink)]),
			]);
	},
});

/** A plain page under the dialog, with the persistent page links. */
export const DialogDemoPage = defineComponent({
	name: 'DialogDemoPage',
	props: { region: { required: true, type: String } },
	setup(props) {
		return () =>
			h('main', { style: pageStyle }, [
				...intro(),
				h(
					'footer',
					{ style: { display: 'flex', gap: '24px', marginTop: '48px' } },
					[
						props.region === 'eu'
							? h(SettingsLink, { label: 'Privacy settings' })
							: null,
						props.region === 'us-opt-in'
							? h(SettingsLink, { label: 'Your Privacy Choices' })
							: null,
						props.region === 'eu' || props.region === 'us-opt-in'
							? null
							: h(PrivacyChoicesLink),
					]
				),
			]);
	},
});
