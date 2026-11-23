/**
 * Mounts `InthProvider` for the banner and dialog tests, with the regions
 * React's banner and dialog tests use.
 */
import type {
	ConsentContainer,
	ConsentEdgeStyle,
	PromptPresentation,
} from '@inth/sdk/engine';
import type { InitOutput, PolicyRule } from '@inth/sdk/schema/types';
import {
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@inth/sdk/schema/types';
import { translations as enTranslations } from '@inth/sdk/translations/en';
import { flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { vi } from 'vitest';
import { defineComponent, h } from 'vue';
import type { Component, ComponentPublicInstance, VNodeChild } from 'vue';

import InthProvider from '../runtime/components/inth-provider.vue';
import PrivacyChoicesLink from '../runtime/components/privacy-choices-link.vue';
import { consentConfigKey } from '../runtime/composables/config';
import type { ConsentConfig } from '../runtime/config';
import {
	symbolActiveUI,
	symbolConsent,
	symbolInit,
	symbolKernel,
	symbolKernelContext,
	symbolSnapshot,
} from '../runtime/utils/symbols';
import { createVueConsentKernelContext } from './test-kernel';
import type { VueConsentKernelContext } from './test-kernel';

export type Region = 'eu' | 'us-opt-in' | 'us-notice' | 'us-opt-out';

const GPC = { gpc: { denyCategories: ['marketing' as const] } };

const RULES: Record<Region, Partial<PolicyRule>> = {
	eu: {},
	'us-notice': {
		model: 'opt-out',
		privacySignals: GPC,
		prompt: 'notice',
		rights: ['disclosure', 'preferences', 'opt-out'],
	},
	'us-opt-in': { privacySignals: GPC },
	'us-opt-out': {
		model: 'opt-out',
		privacySignals: GPC,
		prompt: 'none',
		rights: ['disclosure', 'preferences', 'opt-out'],
	},
};

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

const CATEGORIES = [
	'necessary',
	'functionality',
	'measurement',
	'experience',
	'marketing',
] as const;

let fixture = 0;
const buildInit = function buildInit(
	region: Region,
	extraRule: Partial<PolicyRule> = {},
	language = 'en'
): InitOutput {
	fixture += 1;
	const rule = {
		categories: CATEGORIES.filter((name) => name !== 'necessary'),
		id: `pc-${region}-${fixture}`,
		match: { fallback: true },
		model: 'opt-in',
		prompt: 'choice',
		scopeMode: 'permissive',
		...RULES[region],
		...extraRule,
	} as PolicyRule;
	return {
		branding: 'inth',
		location: { countryCode: 'US', regionCode: 'CA' },
		policyResolution: writePolicyResolutionWire(
			resolvePolicyRules({ countryCode: null, regionCode: null, rules: [rule] })
		),
		translations: { language, translations: enTranslations },
	} as InitOutput;
};

/** Let lazy chunks, watchers and animation frames run. */
export const settle = async function settle(rounds = 3): Promise<void> {
	for (let round = 0; round < rounds; round += 1) {
		// oxlint-disable-next-line no-await-in-loop -- Draining in order.
		await flushPromises();
		// oxlint-disable-next-line no-await-in-loop -- Draining in order.
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
	}
};

export interface MountOptions {
	/** `null` sets no container. */
	container?: ConsentContainer | null;
	edgeStyle?: ConsentEdgeStyle;
	blockUntilChoice?: boolean;
	region?: Region;
	config?: Partial<ConsentConfig>;
	/** Declare {@link VENDORS}. */
	vendors?: boolean;
	/** Extra values to provide to the surfaces. */
	provide?: Record<symbol, unknown>;
	/** Merged over the region's policy rule. */
	rule?: Partial<PolicyRule>;
	/** The resolved language, which sets the surfaces' `dir`. */
	language?: string;
	/** Merged into `presentation.prompt`. */
	prompt?: Partial<PromptPresentation>;
	/**
	 * `'stub'` puts a plain button with the "Your Privacy Choices" test id
	 * on the page, `'stock'` the stock `PrivacyChoicesLink`.
	 */
	link?: 'stub' | 'stock';
	/** More page content, after the page controls. */
	page?: () => VNodeChild;
	/** Mounted in place of `InthProvider`, with the same provides. */
	root?: Component;
}

let mounted: {
	context: VueConsentKernelContext;
	wrapper: VueWrapper<ComponentPublicInstance>;
} | null = null;

/** Page controls around the stock surfaces. */
const Page = defineComponent({
	props: {
		link: { default: 'stub', type: String },
		page: { default: undefined, type: Function },
	},
	setup(props) {
		return () => [
			h('button', { type: 'button' }, 'Page action'),
			props.link === 'stock'
				? h(PrivacyChoicesLink)
				: h(
						'button',
						{
							'data-testid': 'privacy-choices-link',
							onClick: () => {
								if (mounted) {
									mounted.context.activeUI.value = 'manager';
								}
							},
							type: 'button',
						},
						'Your Privacy Choices'
					),
			(props.page as (() => VNodeChild) | undefined)?.(),
		];
	},
});

/**
 * Mount the provider with the page controls, and wait for the banner when
 * one is owed.
 */
export const mountConsentUI = async function mountConsentUI({
	container = { type: 'card' },
	edgeStyle,
	blockUntilChoice,
	region = 'eu',
	config: extra,
	vendors = false,
	provide: extraProvide,
	rule,
	language,
	prompt,
	link = 'stub',
	page,
	root = InthProvider,
}: MountOptions = {}): Promise<VueConsentKernelContext> {
	const config = {
		consentCategories: [...CATEGORIES],
		customFetch: vi.fn(
			() =>
				new Response(JSON.stringify({ ok: true }), {
					headers: { 'content-type': 'application/json' },
					status: 200,
				})
		) as unknown as typeof fetch,
		disableAnimation: true,
		domain: 'consent.example',
		legalLinks: { privacyPolicy: { href: '/privacy' } },
		presentation: {
			prompt: {
				blockUntilChoice,
				container: container ?? undefined,
				edgeStyle,
				...prompt,
			},
		},
		projectUrl: 'https://consent.example',
		vendors: vendors ? VENDORS : undefined,
		...extra,
	} as ConsentConfig;
	const context = createVueConsentKernelContext({
		config,
		prefetch: buildInit(region, rule, language),
	});
	if (context.snapshot.value.policyRule.prompt !== 'none') {
		context.activeUI.value = 'banner';
	}
	const wrapper = mount(root, {
		attachTo: document.body,
		global: {
			provide: {
				[consentConfigKey as symbol]: config,
				[symbolKernelContext as symbol]: context,
				[symbolKernel as symbol]: context.kernel,
				[symbolSnapshot as symbol]: context.snapshot,
				[symbolInit as symbol]: context.init,
				[symbolActiveUI as symbol]: context.activeUI,
				[symbolConsent as symbol]: context.storedConsent,
				...extraProvide,
			},
		},
		slots: { default: () => h(Page, { link, page }) },
	});
	mounted = { context, wrapper };
	await settle();
	return context;
};

/** Unmount what {@link mountConsentUI} mounted. */
export const unmountConsentUI = async function unmountConsentUI() {
	if (mounted) {
		const { element } = mounted.wrapper;
		mounted.wrapper.unmount();
		element?.remove?.();
		mounted.context.dispose();
		mounted = null;
		await flushPromises();
	}
	document.body.innerHTML = '';
};

/** Poll until `check` passes; lazy surfaces compile on first import. */
export const waitFor = async function waitFor(
	check: () => void,
	timeout = 4000
): Promise<void> {
	await vi.waitFor(check, { interval: 10, timeout });
};

export const $ = <T extends Element = HTMLElement>(testId: string) =>
	document.querySelector<T>(`[data-testid="${testId}"]`);

export const must = <T extends Element = HTMLElement>(testId: string): T => {
	const element = $<T>(testId);
	if (!element) {
		throw new Error(`Missing ${testId}`);
	}
	return element;
};

export const pageAction = () =>
	[...document.querySelectorAll('button')].find(
		(button) => button.textContent === 'Page action'
	) as HTMLButtonElement;

/** Make `matchMedia` report the phone layout (or not). */
export const setPhone = function setPhone(phone: boolean): void {
	vi.stubGlobal(
		'matchMedia',
		vi.fn((query: string) => ({
			addEventListener: () => undefined,
			addListener: () => undefined,
			dispatchEvent: () => false,
			matches: phone && query.includes('max-width'),
			media: query,
			onchange: null,
			removeEventListener: () => undefined,
			removeListener: () => undefined,
		}))
	);
};

/**
 * Make `matchMedia` report the phone layout, and return a switch that
 * moves between phone and desktop as a viewport resize does.
 */
export const setPhoneLive = function setPhoneLive(
	phone: boolean
): (next: boolean) => void {
	let current = phone;
	const listeners = new Set<() => void>();
	vi.stubGlobal(
		'matchMedia',
		vi.fn((query: string) => {
			const phoneQuery = query.includes('max-width');
			return {
				addEventListener: (_type: string, listener: () => void) => {
					if (phoneQuery) {
						listeners.add(listener);
					}
				},
				addListener: () => undefined,
				dispatchEvent: () => false,
				get matches() {
					return current && phoneQuery;
				},
				media: query,
				onchange: null,
				removeEventListener: (_type: string, listener: () => void) => {
					listeners.delete(listener);
				},
				removeListener: () => undefined,
			};
		})
	);
	return (next: boolean) => {
		current = next;
		for (const listener of listeners) {
			listener();
		}
	};
};
