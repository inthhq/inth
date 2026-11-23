import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { ComponentFixtureProvider as InthProvider } from '~/__tests__/component-fixture-provider';
import type { ComponentFixtureOptions as InthProviderOptions } from '~/__tests__/component-fixture-provider';
import { policyFixture } from '~/__tests__/policy-fixture';
import { IABConsentDialog } from '~/components/iab-panel';
import { IABConsentBanner } from '~/components/iab-prompt';
import {
	clearConsentState,
	defaultProviderIABOptions,
} from '~/components/iab/__tests__/e2e-setup';
import { ConsentDialog } from '~/aggregate-components';
import { ConsentBanner } from '~/components/prompt';

import { testing } from '../../testing';

const localStorageMock = (() => {
	let store: Record<string, string> = {};
	return {
		clear: () => {
			store = {};
		},
		getItem: (key: string) => store[key] || null,
		removeItem: (key: string) => {
			Reflect.deleteProperty(store, key);
		},
		setItem: (key: string, value: string) => {
			store[key] = value.toString();
		},
	};
})();

Object.defineProperty(window, 'localStorage', {
	value: localStorageMock,
});

const optInOptions: InthProviderOptions = {
	consentCategories: [
		'necessary',
		'functionality',
		'experience',
		'marketing',
		'measurement',
	],
	mode: testing(),
	prefetch: policyFixture(undefined, {
		categories: [
			'necessary',
			'functionality',
			'experience',
			'marketing',
			'measurement',
		],
		id: 'models-prop-opt-in-test',
		model: 'opt-in',
		prompt: 'choice',
		scopeMode: 'permissive',
	}),
};

describe('models Prop E2E Tests', () => {
	beforeEach(() => {
		window.localStorage.clear();
		const cookies = document.cookie.split(';');
		for (const cookie of cookies) {
			const name = cookie.split('=')[0]?.trim();
			if (name) {
				document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
			}
		}
		vi.clearAllMocks();
		clearConsentState();
	});

	describe('Opt-in mode (default)', () => {
		test('ConsentBanner renders in opt-in mode (default models includes opt-in)', async () => {
			render(
				<InthProvider options={optInOptions}>
					<ConsentBanner />
				</InthProvider>
			);

			await vi.waitFor(
				() => {
					const banner = document.querySelector(
						'[data-testid="consent-banner-root"]'
					);
					expect(banner).toBeInTheDocument();
				},
				{ timeout: 3000 }
			);
		});

		test('IABConsentBanner does NOT render in opt-in mode (default models is iab)', async () => {
			render(
				<InthProvider options={optInOptions}>
					<IABConsentBanner />
				</InthProvider>
			);

			// Wait long enough to confirm it doesn't appear
			await new Promise((resolve) => {
				setTimeout(resolve, 1000);
			});

			const banner = document.querySelector(
				'[data-testid="iab-consent-banner-card"]'
			);
			expect(banner).not.toBeInTheDocument();
		});

		test('ConsentDialog renders in opt-in mode when open', async () => {
			render(
				<InthProvider options={optInOptions}>
					<ConsentDialog open={true} />
				</InthProvider>
			);

			await vi.waitFor(
				() => {
					const dialog = document.querySelector(
						'[data-testid="consent-dialog-root"]'
					);
					expect(dialog).toBeInTheDocument();
				},
				{ timeout: 3000 }
			);
		});

		test('IABConsentDialog does NOT render in opt-in mode', async () => {
			render(
				<InthProvider options={optInOptions}>
					<IABConsentDialog open={true} />
				</InthProvider>
			);

			await new Promise((resolve) => {
				setTimeout(resolve, 1000);
			});

			const dialog = document.querySelector(
				'[data-testid="iab-consent-dialog-root"]'
			);
			expect(dialog).not.toBeInTheDocument();
		});
	});

	describe('IAB mode', () => {
		test('IABConsentBanner renders when model is iab', async () => {
			render(
				<InthProvider options={defaultProviderIABOptions}>
					<IABConsentBanner />
					<IABConsentDialog />
				</InthProvider>
			);

			await vi.waitFor(
				() => {
					const banner = document.querySelector(
						'[data-testid="iab-consent-banner-card"]'
					);
					expect(banner).toBeInTheDocument();
				},
				{ timeout: 3000 }
			);
		});

		test('ConsentBanner does NOT render when model is iab', async () => {
			render(
				<InthProvider options={defaultProviderIABOptions}>
					<ConsentBanner />
				</InthProvider>
			);

			await new Promise((resolve) => {
				setTimeout(resolve, 1000);
			});

			const banner = document.querySelector(
				'[data-testid="consent-banner-root"]'
			);
			expect(banner).not.toBeInTheDocument();
		});
	});

	describe('Custom models prop', () => {
		test('ConsentBanner with models=[opt-in] renders in opt-in mode', async () => {
			render(
				<InthProvider options={optInOptions}>
					<ConsentBanner models={['opt-in']} />
				</InthProvider>
			);

			await vi.waitFor(
				() => {
					const banner = document.querySelector(
						'[data-testid="consent-banner-root"]'
					);
					expect(banner).toBeInTheDocument();
				},
				{ timeout: 3000 }
			);
		});

		test('ConsentBanner with models=[iab] does NOT render in opt-in mode', async () => {
			render(
				<InthProvider options={optInOptions}>
					<ConsentBanner models={['iab']} />
				</InthProvider>
			);

			await new Promise((resolve) => {
				setTimeout(resolve, 1000);
			});

			const banner = document.querySelector(
				'[data-testid="consent-banner-root"]'
			);
			expect(banner).not.toBeInTheDocument();
		});

		test('only matching component renders when both are present', async () => {
			render(
				<InthProvider options={optInOptions}>
					<ConsentBanner />
					<IABConsentBanner />
				</InthProvider>
			);

			await vi.waitFor(
				() => {
					const banner = document.querySelector(
						'[data-testid="consent-banner-root"]'
					);
					expect(banner).toBeInTheDocument();
				},
				{ timeout: 3000 }
			);

			const iabBanner = document.querySelector(
				'[data-testid="iab-consent-banner-card"]'
			);
			expect(iabBanner).not.toBeInTheDocument();
		});
	});
});
