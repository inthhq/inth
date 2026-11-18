import { defaultTranslationConfig } from '@inth/sdk/engine';
import type { ComponentProps, ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { ComponentFixtureProvider as ConsentProvider } from '~/__tests__/component-fixture-provider';
import type { ConsentStateFixture } from '~/__tests__/consent-state-fixture';
import { policyFixture } from '~/__tests__/policy-fixture';
import { ConsentDialogFooter } from '~/components/panel/atoms/card';

import { testing } from '../../../../testing';
import { BrandingTag } from '../branding';

type ConsentManagerState = ConsentStateFixture;

const createMockState = function createMockState(
	overrides: Partial<ConsentManagerState> = {}
): ConsentManagerState {
	return {
		activeUI: 'dialog',
		branding: 'inth',
		consentCategories: [
			'necessary',
			'functionality',
			'experience',
			'marketing',
			'measurement',
		],
		consentInfo: null,
		consentTypes: [],
		consents: {
			experience: false,
			functionality: false,
			marketing: false,
			measurement: false,
			necessary: true,
		},
		getDisplayedConsents: vi.fn(() => []),
		has: vi.fn(),
		hasConsented: vi.fn(),
		model: 'opt-in',
		policyBanner: {},
		policyCategories: null,
		policyDialog: {},
		policyScopeMode: null,
		saveConsents: vi.fn().mockResolvedValue(undefined),
		selectedConsents: {
			experience: false,
			functionality: false,
			marketing: false,
			measurement: false,
			necessary: true,
		},
		setActiveUI: vi.fn(),
		setConsent: vi.fn(),
		setSelectedConsent: vi.fn(),
		translationConfig: defaultTranslationConfig,
		...overrides,
	} as unknown as ConsentManagerState;
};

const createConsentTree = function createConsentTree(
	ui: ReactElement,
	stateOverrides: Partial<ConsentManagerState> = {},
	providerOverrides: Partial<
		ComponentProps<typeof ConsentProvider>['options']
	> = {}
) {
	const state = createMockState(stateOverrides);

	return (
		<ConsentProvider
			options={{
				components: providerOverrides.components,
				initialUI: state.activeUI === 'dialog' ? 'dialog' : 'banner',
				mode: testing(),
				persistence: false,
				prefetch: {
					...policyFixture(undefined, {
						categories: state.consentCategories,
						id: 'branding-test-policy',
						model: state.model ?? 'opt-in',
						prompt: 'choice',
						scopeMode: state.policyScopeMode ?? 'permissive',
					}),
					initialBranding: state.branding,
					initialDraft: state.consents,
					initialTranslations: {
						language: state.translationConfig.defaultLanguage,
						translations:
							state.translationConfig.translations[
								state.translationConfig.defaultLanguage
							] ?? state.translationConfig.translations.en,
					},
				},
				presentation: {
					preferences: state.policyDialog,
					prompt: state.policyBanner,
				},
				theme: providerOverrides.theme,
			}}
		>
			{ui}
		</ConsentProvider>
	);
};

const renderWithConsentState = async function renderWithConsentState(
	...args: Parameters<typeof createConsentTree>
) {
	await render(createConsentTree(...args));
};

const tagLink = (testId = 'consent-banner-branding') =>
	document.querySelector(
		`[data-testid="${testId}"]`
	) as HTMLAnchorElement | null;

describe('BrandingTag', () => {
	test('maps deprecated consent branding to the INTH tag treatment', async () => {
		await renderWithConsentState(<BrandingTag surface="banner" />, {
			branding: 'consent',
		});

		await vi.waitFor(() => {
			const link = tagLink();
			expect(link).toBeInTheDocument();
			expect(link).toHaveAttribute('data-branding', 'inth');
			expect(link).toHaveAttribute('data-variant', 'banner-tag');
			expect(link?.href).toContain('inth.com');
		});
	});

	test('shows the c15t mark and links c15t.com for c15t branding', async () => {
		await renderWithConsentState(<BrandingTag surface="banner" />, {
			branding: 'c15t',
		});

		await vi.waitFor(() => {
			const link = tagLink();
			expect(link).toHaveAttribute('data-branding', 'c15t');
			expect(link?.href).toContain('c15t.com');
			expect(link).not.toHaveAttribute('target');
			expect(link?.querySelector('[dir="ltr"]')).toHaveTextContent('c15t');
		});
	});

	test('renders nothing when the backend sends branding none', async () => {
		await renderWithConsentState(
			<>
				<BrandingTag surface="banner" />
				<span data-testid="rendered" />
			</>,
			{ branding: 'none' }
		);

		await vi.waitFor(() => {
			expect(
				document.querySelector('[data-testid="rendered"]')
			).toBeInTheDocument();
		});
		expect(tagLink()).not.toBeInTheDocument();
	});

	test('renders the branding copy from translations and preserves LTR wordmark', async () => {
		await renderWithConsentState(<BrandingTag surface="banner" />, {
			translationConfig: {
				defaultLanguage: 'he',
				translations: {
					...defaultTranslationConfig.translations,
					he: {
						...defaultTranslationConfig.translations.en,
						common: {
							...defaultTranslationConfig.translations.en.common,
							securedBy: 'מאובטח על ידי',
						},
					},
				},
			},
		});

		await vi.waitFor(() => {
			const link = tagLink();
			expect(link).toBeInTheDocument();
			expect(link).not.toHaveAttribute('dir');
			expect(link).toHaveTextContent('מאובטח על ידי');
			expect(link?.querySelector('[dir="ltr"]')).toBeInTheDocument();
		});
	});

	test('uses the dialog tag variant in the default dialog footer', async () => {
		await renderWithConsentState(<ConsentDialogFooter hideBranding={false} />, {
			branding: 'inth',
		});

		await vi.waitFor(() => {
			const link = tagLink('consent-dialog-branding');
			expect(link).toBeInTheDocument();
			expect(link).toHaveAttribute('data-branding', 'inth');
			expect(link).toHaveAttribute('data-variant', 'dialog-tag');
		});
	});

	test('applies theme slot styles to branding tags', async () => {
		await renderWithConsentState(
			<BrandingTag surface="banner" />,
			{},
			{
				components: {
					tag: {
						banner: {
							className: 'branding-theme-marker',
						},
					},
				},
			}
		);

		await vi.waitFor(() => {
			expect(tagLink()?.className).toContain('branding-theme-marker');
		});
	});

	test('shows the INTH mark when the snapshot names no branding', async () => {
		await renderWithConsentState(<BrandingTag surface="banner" />, {
			branding: undefined,
		});

		await vi.waitFor(() => {
			const link = tagLink();
			const wordmark = link?.querySelector('[dir="ltr"]');
			expect(link).toHaveAttribute('data-branding', 'inth');
			expect(wordmark?.querySelector('svg')).toBeInTheDocument();
			expect(wordmark?.querySelector('[id]')).toBeNull();
		});
	});

	test('adds the referral hostname only after hydration', async () => {
		// The server has no `window`. If the hydration render produced a
		// different href than the server markup, React would log an attribute
		// mismatch and leave the server value in place, so the referral
		// parameter has to wait for hydration.
		const markup = renderToString(
			createConsentTree(<BrandingTag surface="banner" />)
		);
		expect(markup).toContain('href="https://inth.com"');
		expect(markup).not.toContain('?ref=');

		await renderWithConsentState(<BrandingTag surface="banner" />);

		await vi.waitFor(() => {
			expect(tagLink()).toHaveAttribute(
				'href',
				`https://inth.com?ref=${window.location.hostname}`
			);
		});
	});

	test('hides branding when disabled', async () => {
		await renderWithConsentState(
			<BrandingTag
				surface="banner"
				hideBranding
			/>,
			{ branding: 'inth' }
		);

		await vi.waitFor(() => {
			expect(tagLink()).not.toBeInTheDocument();
		});
	});
});
