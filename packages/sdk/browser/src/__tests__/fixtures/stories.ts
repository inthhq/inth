/**
 * The consent banner and dialog stories of the script tag, with the same
 * names and configurations as React's `Core/Consent Banner` and
 * `Core/Consent Dialog` stories (`apps/storybook-react`). The script tag
 * has no Storybook: `stories.html` renders one story per
 * `?story=` on the browser suite's dev server
 * (`/__inth-test__/stories?story=DrawerStartEU`), and
 * `stories.browser.test.ts` renders each of them.
 */
import type { ConsentContainer, ConsentEdgeStyle } from '@inth/sdk-core';
import type { PolicyRule } from '@inth/sdk-schema/types';

import { createTestingConsentClient } from '../../testing-global';
import type { ConsentClient } from '../../consent-client.model';
import { mountConsentUI } from '../../ui/mount-consent-ui';

type Region = 'eu' | 'us-opt-in' | 'us-notice' | 'us-opt-out';

const US_GPC = {
	gpc: { denyCategories: ['marketing', 'measurement'] },
} as const;
const US_RIGHTS: PolicyRule['rights'] = [
	'disclosure',
	'preferences',
	'opt-out',
];

/** The storybook apps' offline policy (`apps/storybook-consent-policy.ts`). */
const BASE: PolicyRule = {
	categories: ['functionality', 'measurement', 'experience', 'marketing'],
	id: 'storybook',
	match: { fallback: true, isDefault: true },
	model: 'opt-in',
	prompt: 'choice',
	scopeMode: 'permissive',
};

const POLICIES: Record<Region, PolicyRule> = {
	eu: { ...BASE, id: 'storybook-privacy-choices-eu' },
	'us-notice': {
		...BASE,
		id: 'storybook-privacy-choices-us-notice',
		model: 'opt-out',
		privacySignals: US_GPC,
		prompt: 'notice',
		rights: US_RIGHTS,
	},
	'us-opt-in': {
		...BASE,
		id: 'storybook-privacy-choices-us-opt-in',
		privacySignals: US_GPC,
		rights: US_RIGHTS,
	},
	'us-opt-out': {
		...BASE,
		id: 'storybook-privacy-choices-us-opt-out',
		model: 'opt-out',
		privacySignals: US_GPC,
		prompt: 'none',
		rights: US_RIGHTS,
	},
};

/** A few vendors, so the dialog's vendor rows and sheets show. */
const VENDORS = [
	{
		category: 'marketing' as const,
		description: 'Ad conversion measurement and audiences.',
		id: 'meta-pixel',
		name: 'Meta Pixel',
		privacyPolicyUrl: 'https://www.facebook.com/privacy/policy/',
	},
	{
		category: 'measurement' as const,
		description: 'Page views and conversion funnels across the site.',
		id: 'analytics-one',
		name: 'Analytics One',
		privacyPolicyUrl: 'https://example.com/a1',
	},
];

/** One story: a banner on the page, or the dialog open over it. */
export interface ConsentStory {
	group: 'Banner' | 'Dialog';
	region: Region;
	container: ConsentContainer;
	blockUntilChoice?: boolean;
	edgeStyle?: ConsentEdgeStyle;
	/** Start on the banner instead of the open dialog. */
	flow?: boolean;
	gpc?: boolean;
	/** Render at a phone width. */
	phone?: boolean;
}

const banner = (
	region: Region,
	container: ConsentContainer,
	options: Pick<ConsentStory, 'blockUntilChoice' | 'edgeStyle'> = {}
): ConsentStory => ({ container, group: 'Banner', region, ...options });

const dialog = (
	region: Region,
	options: Omit<ConsentStory, 'group' | 'region' | 'container'> & {
		container?: ConsentContainer;
	} = {}
): ConsentStory => ({
	container: { position: 'start', type: 'card' },
	group: 'Dialog',
	region,
	...options,
});

const CARD = (position: 'start' | 'end' | 'center'): ConsentContainer => ({
	position,
	type: 'card',
});
const BAR = (edge: 'top' | 'bottom'): ConsentContainer => ({
	edge,
	type: 'banner',
});
const DRAWER = (
	side: 'top' | 'bottom' | 'start' | 'end'
): ConsentContainer => ({ side, type: 'drawer' });

/** React's story names, by group. */
export const CONSENT_STORIES: Record<string, ConsentStory> = {
	BannerBottomEU: banner('eu', BAR('bottom')),
	BannerBottomUsNotice: banner('us-notice', BAR('bottom')),
	BannerBottomUsOptIn: banner('us-opt-in', BAR('bottom')),
	BannerTopEU: banner('eu', BAR('top')),
	BannerTopUsNotice: banner('us-notice', BAR('top')),
	BannerTopUsOptIn: banner('us-opt-in', BAR('top')),
	BlockingBanner: banner('eu', BAR('bottom'), { blockUntilChoice: true }),
	BlockingCard: banner('eu', CARD('start'), { blockUntilChoice: true }),
	BlockingDrawerBottom: banner('eu', DRAWER('bottom'), {
		blockUntilChoice: true,
	}),
	BlockingDrawerStart: banner('eu', DRAWER('start'), {
		blockUntilChoice: true,
	}),
	CardCenterEU: banner('eu', CARD('center')),
	CardCenterUsNotice: banner('us-notice', CARD('center')),
	CardCenterUsOptIn: banner('us-opt-in', CARD('center')),
	CardEndEU: banner('eu', CARD('end')),
	CardEndUsNotice: banner('us-notice', CARD('end')),
	CardEndUsOptIn: banner('us-opt-in', CARD('end')),
	CardStartEU: banner('eu', CARD('start')),
	CardStartUsNotice: banner('us-notice', CARD('start')),
	CardStartUsOptIn: banner('us-opt-in', CARD('start')),
	DrawerBottomEU: banner('eu', DRAWER('bottom')),
	DrawerBottomUsNotice: banner('us-notice', DRAWER('bottom')),
	DrawerBottomUsOptIn: banner('us-opt-in', DRAWER('bottom')),
	DrawerEndEU: banner('eu', DRAWER('end')),
	DrawerEndUsNotice: banner('us-notice', DRAWER('end')),
	DrawerEndUsOptIn: banner('us-opt-in', DRAWER('end')),
	DrawerStartEU: banner('eu', DRAWER('start')),
	DrawerStartUsNotice: banner('us-notice', DRAWER('start')),
	DrawerStartUsOptIn: banner('us-opt-in', DRAWER('start')),
	DrawerTopEU: banner('eu', DRAWER('top')),
	DrawerTopUsNotice: banner('us-notice', DRAWER('top')),
	DrawerTopUsOptIn: banner('us-opt-in', DRAWER('top')),
	EU: dialog('eu'),
	FlushBannerBottom: banner('eu', BAR('bottom'), { edgeStyle: 'flush' }),
	FlushDrawerBottom: banner('eu', DRAWER('bottom'), { edgeStyle: 'flush' }),
	FullFlowEU: dialog('eu', { flow: true }),
	FullFlowUsNotice: dialog('us-notice', {
		container: BAR('bottom'),
		flow: true,
	}),
	FullFlowUsOptIn: dialog('us-opt-in', { flow: true }),
	PhoneEuVendorSheets: dialog('eu', { phone: true }),
	PhoneFlushSheets: dialog('us-opt-in', { edgeStyle: 'flush', phone: true }),
	PhoneUsPreferencesSheet: dialog('us-opt-out', { phone: true }),
	UsOptIn: dialog('us-opt-in'),
	UsOptOut: dialog('us-opt-out'),
	UsWithGpc: dialog('us-opt-out', { gpc: true }),
};

/** A plain page under the prompt, with the site's link to the dialog. */
const demoPage = function demoPage(
	target: HTMLElement,
	open: () => void
): void {
	const main = document.createElement('main');
	main.style.cssText =
		'font-family: system-ui, sans-serif; line-height: 1.6; margin: 0 auto; max-width: 720px; min-height: 160vh; padding: 48px 24px;';
	main.innerHTML =
		'<h1>Acme Outdoor</h1><p>Tents, packs and stoves for every season. Browse the catalogue, read the field guides, or find a store near you.</p>';
	const footer = document.createElement('footer');
	footer.style.marginTop = '48px';
	const link = document.createElement('button');
	link.type = 'button';
	link.dataset.testid = 'privacy-choices-link';
	link.textContent = 'Your Privacy Choices';
	link.addEventListener('click', open);
	footer.append(link);
	main.append(footer);
	target.append(main);
};

/** Render a story on this page. */
export const mountStory = async function mountStory(
	name: string,
	target: HTMLElement = document.body
): Promise<ConsentClient> {
	const story = CONSENT_STORIES[name];
	if (!story) {
		throw new Error(`Unknown story ${name}`);
	}
	const client = createTestingConsentClient(
		{
			consentCategories: [
				'necessary',
				'functionality',
				'measurement',
				'experience',
				'marketing',
			],
			legalLinks: {
				cookiePolicy: { href: '#cookies' },
				privacyPolicy: { href: '#privacy' },
			},
			overrides: {
				country: story.region === 'eu' ? 'DE' : 'US',
				gpc: story.gpc ?? false,
			},
			policy: [POLICIES[story.region]],
			presentation: {
				prompt: {
					blockUntilChoice: story.blockUntilChoice,
					container: story.container,
					edgeStyle: story.edgeStyle,
				},
			},
			reloadOnConsentRevoked: false,
			vendors: VENDORS,
		},
		{ mountUI: mountConsentUI, pkg: '@inth/sdk/test' }
	);
	demoPage(target, () => {
		client.openDialog();
	});
	client.start();
	await client.ready();
	if (story.group === 'Dialog' && !story.flow) {
		client.openDialog();
	}
	return client;
};
