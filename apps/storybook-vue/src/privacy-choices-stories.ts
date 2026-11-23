/**
 * Shared setup for the Vue Privacy Choices stories: one offline rule per
 * regime (§2), a plain page under the surfaces, and the provider config.
 */
import type { InitOutput, PolicyRule } from '@inth/sdk/schema/types';
import { resolveOptOutLink, resolveOptOutState } from '@inth/sdk/surface-state';
import bannerStyles from '@inth/sdk/ui/styles/components/consent-banner';

import '@inth/sdk/ui/styles/components/consent-banner.css';
import { defineComponent, h } from 'vue';

import type {
	ConsentContainer,
	ConsentEdgeStyle,
} from '../../../packages/sdk/core/src/libs/consent-layout';
import {
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '../../../packages/sdk/schema/src/types';
import OptOutIcon from '../../../packages/sdk/vue/src/runtime/components/opt-out-icon.vue';
import { useConsentActiveUI } from '../../../packages/sdk/vue/src/runtime/composables/activeUI';
import { useResolvedPresentation } from '../../../packages/sdk/vue/src/runtime/composables/experiment';
import { useConsentSnapshot } from '../../../packages/sdk/vue/src/runtime/composables/kernel';
import { useSurfaceTranslations } from '../../../packages/sdk/vue/src/runtime/composables/use-surface-translations';
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

/**
 * The persistent "Your Privacy Choices" link, as React's
 * `PrivacyChoicesLink` renders it: an unstyled button with the opt-out
 * icon, shown only under a policy with an opt-out right. Vue has no such
 * component yet, so the stories carry their own.
 */
export const PrivacyChoicesLink = defineComponent({
	name: 'StoryPrivacyChoicesLink',
	setup() {
		const activeUI = useConsentActiveUI();
		const snapshot = useConsentSnapshot();
		const translations = useSurfaceTranslations();
		const presentation = useResolvedPresentation();
		return function render() {
			const current = snapshot.value;
			if (
				current.resolution.status !== 'matched' ||
				current.externalPermissions ||
				!resolveOptOutState(current).available ||
				!current.policyRule.rights.includes('opt-out')
			) {
				return null;
			}
			const link = resolveOptOutLink(
				translations.value,
				presentation.value?.optOutLink
			);
			return h(
				'button',
				{
					'data-inth-rights': current.policyRule.rights.join(' '),
					'data-opt-out-variant': link.variant,
					'data-testid': 'privacy-choices-link',
					onClick: () => {
						activeUI.value = 'manager';
					},
					type: 'button',
				},
				[
					link.variant === 'privacy-choices'
						? h(OptOutIcon, { class: bannerStyles.optOutIcon })
						: null,
					link.label,
				]
			);
		};
	},
});

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

/** A plain page under the banner, with the persistent "Your Privacy Choices" link. */
export const BannerDemoPage = defineComponent({
	name: 'PrivacyChoicesBannerDemoPage',
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
	name: 'PrivacyChoicesDialogDemoPage',
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
