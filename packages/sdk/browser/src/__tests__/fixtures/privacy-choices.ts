/**
 * A page for the Privacy Choices (v6) suites: the stock UI in its shadow
 * root, with the page controls the React suites render beside it, and
 * the regions those suites test.
 */
import { clearBrowserConsentStorage } from '@inth/conformance/suite';
import type {
	ConsentContainer,
	ConsentEdgeStyle,
	ConsentPresentation,
} from '@inth/sdk-core';
import type { PolicyRule } from '@inth/sdk-schema/types';

import { createTestingConsentClient } from '../../testing-global';
import type { ConsentClient } from '../../types';
import { mountConsentUI } from '../../ui/mount';

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

export interface PrivacyChoicesPageOptions {
	/** `null` sets no container. */
	container?: ConsentContainer | null;
	edgeStyle?: ConsentEdgeStyle;
	blockUntilChoice?: boolean;
	region?: Region;
	/** `null` leaves the design to the resolver. */
	design?: ConsentPresentation['design'] | null;
	/** The page's "Your Privacy Choices" link, as a US page shows it. */
	privacyChoicesLink?: boolean;
	gpc?: boolean;
	vendors?: boolean;
	/** Overrides the region's rule, as the dialog suite's GPC rule does. */
	rule?: Partial<PolicyRule>;
	/** `false` mounts no dialog, so nothing warms its chunks. */
	dialog?: false;
}

let fixture = 0;
const clients: ConsentClient[] = [];

/** Start the stock UI with the Privacy Choices design on a fresh page. */
export const startPrivacyChoicesPage = async function startPrivacyChoicesPage({
	container = { type: 'card' },
	edgeStyle,
	blockUntilChoice,
	region = 'eu',
	design = 'privacy-choices',
	privacyChoicesLink = false,
	gpc = false,
	vendors = false,
	rule,
	dialog,
}: PrivacyChoicesPageOptions = {}): Promise<ConsentClient> {
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

	const presentation: ConsentPresentation | undefined =
		design === null && container === null
			? undefined
			: {
					design: design ?? undefined,
					prompt: {
						blockUntilChoice,
						container: container ?? undefined,
						edgeStyle,
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
			legalLinks: { privacyPolicy: { href: '/privacy' } },
			overrides: { country: region === 'eu' ? 'DE' : 'US', gpc },
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
			ui: { colorScheme: 'light', dialog, disableAnimation: true },
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
export const stopPrivacyChoicesPages =
	function stopPrivacyChoicesPages(): void {
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
