/**
 * A page for the prompt and dialog suites: the stock UI in its shadow
 * root, with the page controls the React suites render beside it, and
 * the regions those suites test.
 */
import { clearBrowserConsentStorage } from '@inth/conformance/suite';
import type {
	ConsentContainer,
	ConsentEdgeStyle,
	ConsentPresentation,
	PresentationAction,
} from '@inth/sdk-core';
import type { PolicyRule } from '@inth/sdk-schema/types';
import type { ComponentSlots } from '@inth/sdk-ui/theme';

import type {
	ConsentBannerOptions,
	ConsentClient,
	ConsentDialogOptions,
} from '../../consent-client.model';
import { createTestingConsentClient } from '../../testing-global';
import { mountConsentUI } from '../../ui/mount-consent-ui';

export type Region = 'eu' | 'us-opt-in' | 'us-notice' | 'us-opt-out';

const GPC = {
	privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
} as const;

/** Each region's rule over the EU choice the React fixture starts from. */
export const RULES: Record<Region, Partial<PolicyRule>> = {
	eu: {},
	'us-notice': {
		...GPC,
		model: 'opt-out',
		prompt: 'notice',
		rights: ['disclosure', 'preferences', 'opt-out'],
	},
	'us-opt-in': { ...GPC },
	'us-opt-out': {
		...GPC,
		model: 'opt-out',
		prompt: 'none',
		rights: ['disclosure', 'preferences', 'opt-out'],
	},
};

/** The vendors the dialog suites list. */
export const VENDORS = [
	{
		category: 'functionality' as const,
		description: 'Maps on the store finder.',
		id: 'mapbox',
		name: 'Mapbox',
		privacyPolicyUrl: 'https://example.com/mapbox',
	},
	{
		category: 'measurement' as const,
		description: 'Page views and conversion funnels across the site.',
		id: 'analytics-one',
		name: 'Analytics One',
		privacyPolicyUrl: 'https://example.com/a1',
	},
	{
		category: 'measurement' as const,
		description: 'Session timing.',
		id: 'analytics-two',
		name: 'Analytics Two',
		privacyPolicyUrl: 'https://example.com/a2',
	},
];

export interface ConsentPageOptions {
	/** `null` sets no container. */
	container?: ConsentContainer | null;
	edgeStyle?: ConsentEdgeStyle;
	blockUntilChoice?: boolean;
	region?: Region;
	/** The page's "Your Privacy Choices" link, as a US page shows it. */
	privacyChoicesLink?: boolean;
	gpc?: boolean;
	vendors?: boolean;
	/** Overrides the region's rule, as the dialog suite's GPC rule does. */
	rule?: Partial<PolicyRule>;
	/**
	 * `false` mounts no dialog, so nothing warms its chunks; an object
	 * passes the dialog's options.
	 */
	dialog?: false | ConsentDialogOptions;
	/** `false` mounts no banner; an object passes the banner's options. */
	banner?: false | ConsentBannerOptions;
	/** Mount the stock floating trigger. */
	stockTrigger?: boolean;
	/** The prompt's host layout: action order and groups. */
	layout?: readonly (PresentationAction | readonly PresentationAction[])[];
	/** `theme.slots`, keyed like `consentBannerTitle`. */
	slots?: ComponentSlots;
	/** The visitor's language; the page carries copy for it. */
	language?: string;
	/** Play the enter and exit motion, which the suites otherwise skip. */
	animate?: boolean;
}

let fixture = 0;
const clients: ConsentClient[] = [];

/** Start the stock UI on a fresh page. */
export const startConsentPage = async function startConsentPage({
	container = { type: 'card' },
	edgeStyle,
	blockUntilChoice,
	region = 'eu',
	privacyChoicesLink = false,
	gpc = false,
	vendors = false,
	rule,
	dialog,
	banner,
	stockTrigger,
	layout,
	slots,
	language,
	animate = false,
}: ConsentPageOptions = {}): Promise<ConsentClient> {
	fixture += 1;
	const pageAction = document.createElement('button');
	pageAction.type = 'button';
	pageAction.textContent = 'Page action';
	document.body.append(pageAction);
	if (privacyChoicesLink) {
		const link = document.createElement('button');
		link.type = 'button';
		link.dataset.testid = 'privacy-choices-link';
		link.textContent = 'Your Privacy Choices';
		document.body.append(link);
	}
	const trigger = document.createElement('button');
	trigger.type = 'button';
	trigger.dataset.testid = 'consent-dialog-trigger';
	trigger.textContent = 'Privacy settings';
	document.body.append(trigger);

	const presentation: ConsentPresentation = {
		prompt: {
			blockUntilChoice,
			container: container ?? undefined,
			edgeStyle,
			layout,
		},
	};
	const client = createTestingConsentClient(
		{
			consentCategories: [
				'necessary',
				'functionality',
				'measurement',
				'experience',
				'marketing',
			],
			// Offline mode renders a language only when it has copy for it.
			i18n: language
				? { messages: { [language]: { cookieBanner: { title: 'פרטיות' } } } }
				: undefined,
			legalLinks: { privacyPolicy: { href: '/privacy' } },
			overrides: { country: region === 'eu' ? 'DE' : 'US', gpc, language },
			policy: [
				{
					id: `pc-${region}-${fixture}`,
					match: { fallback: true, isDefault: true },
					model: 'opt-in',
					prompt: 'choice',
					scopeMode: 'permissive',
					...RULES[region],
					...rule,
				} as PolicyRule,
			],
			presentation,
			// A revoked grant would reload the test page.
			reloadOnConsentRevoked: false,
			ui: {
				banner,
				colorScheme: 'light',
				dialog,
				disableAnimation: !animate,
				theme: slots ? { slots } : undefined,
				trigger: stockTrigger,
			},
			vendors: vendors ? VENDORS : undefined,
		},
		{ mountUI: mountConsentUI, pkg: '@inth/sdk/test' }
	);
	// The page's link and control open the dialog, as React's do.
	for (const control of document.querySelectorAll<HTMLElement>(
		'[data-testid="privacy-choices-link"], [data-testid="consent-dialog-trigger"]'
	)) {
		control.addEventListener('click', () => {
			client.openDialog();
		});
	}
	clients.push(client);
	client.start();
	await client.ready();
	return client;
};

/** Tear down every page the suite started. */
export const stopConsentPages = function stopConsentPages(): void {
	for (const client of clients.splice(0)) {
		client.dispose();
	}
	clearBrowserConsentStorage();
	sessionStorage.clear();
	document.body.replaceChildren();
	document.documentElement.removeAttribute('dir');
};

/** The latest client the suite started. */
const current = (): ConsentClient | undefined => clients[clients.length - 1];

/** An element by test id, in the page or in the UI's shadow root. */
export const $ = <T extends Element = HTMLElement>(testId: string): T | null =>
	document.querySelector<T>(`[data-testid="${testId}"]`) ??
	current()?.ui?.root.querySelector<T>(`[data-testid="${testId}"]`) ??
	null;

export const must = <T extends Element = HTMLElement>(testId: string): T => {
	const element = $<T>(testId);
	if (!element) {
		throw new Error(`Missing ${testId}`);
	}
	return element;
};

/** An element by id, in the page or in the UI's shadow root. */
export const byId = (id: string | null): HTMLElement | null =>
	id
		? (document.getElementById(id) ??
			(current()?.ui?.root as ShadowRoot | undefined)?.getElementById(id) ??
			null)
		: null;

/** Every element matching `selector` in the UI's shadow root. */
export const all = (selector: string): Element[] => [
	...(current()?.ui?.root.querySelectorAll(selector) ?? []),
];

/** The focused element, inside the UI's shadow root when focus is there. */
export const active = (): Element | null => {
	let element = document.activeElement;
	while (element?.shadowRoot?.activeElement) {
		element = element.shadowRoot.activeElement;
	}
	return element;
};

/** The page's own button. */
export const pageAction = (): HTMLButtonElement =>
	[...document.querySelectorAll('button')].find(
		(button) => button.textContent === 'Page action'
	) as HTMLButtonElement;

/** The kernel's snapshot, for what was recorded. */
export const snapshotOf = () => current()?.getSnapshot();

/** Finish every running animation in the UI. */
export const finishAnimations = function finishAnimations(): void {
	for (const animation of document.getAnimations()) {
		animation.finish();
	}
	for (const animation of (
		current()?.ui?.root as ShadowRoot | undefined
	)?.getAnimations?.() ?? []) {
		animation.finish();
	}
};
