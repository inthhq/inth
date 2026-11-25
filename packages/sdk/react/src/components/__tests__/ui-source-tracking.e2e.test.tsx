import { readStoredRecords } from '@inth/sdk/modules/persistence';
import { beforeEach, describe, expect, test, vi } from 'vite-plus/test';
import { userEvent } from 'vite-plus/test/browser';
import { render } from 'vitest-browser-react';

import {
	ComponentFixtureProvider as InthProvider,
	DEFAULT_KEY_STORAGE,
} from '~/__tests__/component-fixture-provider';
import type { ComponentFixtureOptions as InthProviderOptions } from '~/__tests__/component-fixture-provider';
import { policyFixture } from '~/__tests__/policy-fixture';
import { ConsentDialog } from '~/aggregate-components';
import { ConsentWidget } from '~/components/preferences';
import { ConsentBanner } from '~/components/prompt';

import { testing } from '../../testing';

const getDefined = <Value,>(
	value: Value,
	message = 'Expected value to be defined'
): NonNullable<Value> => {
	if (value === null || value === undefined) {
		throw new Error(message);
	}
	return value;
};

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

const defaultOptions: InthProviderOptions = {
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
		id: 'ui-source-tracking-test',
		model: 'opt-in',
		prompt: 'choice',
		scopeMode: 'permissive',
	}),
	// These tests seed or read records under the default key.
	storageConfig: DEFAULT_KEY_STORAGE,
};

describe('UI Source Tracking E2E Tests', () => {
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
	});

	describe('Banner uiSource', () => {
		test('should render banner and save consent via accept button', async () => {
			render(
				<InthProvider options={defaultOptions}>
					<ConsentBanner />
				</InthProvider>
			);

			await vi.waitFor(
				() => {
					const acceptButton = document.querySelector(
						'[data-testid="consent-banner-accept-button"]'
					);
					expect(acceptButton).toBeInTheDocument();
				},
				{ timeout: 3000 }
			);

			const acceptButton = document.querySelector(
				'[data-testid="consent-banner-accept-button"]'
			);
			await userEvent.click(getDefined(acceptButton));

			await vi.waitFor(
				() => {
					const stored = readStoredRecords(undefined, Date.now()).records
						.choice;
					expect(stored).toBeTruthy();
					const consent = getDefined(stored);
					expect(consent.categories.necessary).toBeUndefined();
				},
				{ timeout: 3000 }
			);
		});

		test('should render banner with custom uiSource prop', async () => {
			render(
				<InthProvider options={defaultOptions}>
					<ConsentBanner uiSource="custom_banner" />
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
	});

	describe('Dialog uiSource', () => {
		test('should render dialog and save consent via accept button', async () => {
			render(
				<InthProvider options={defaultOptions}>
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

			// The dialog contains a widget with accept all button
			const acceptButton = document.querySelector(
				'[data-testid="consent-dialog-accept-all"]'
			);
			await userEvent.click(getDefined(acceptButton));

			await vi.waitFor(
				() => {
					const stored = readStoredRecords(undefined, Date.now()).records
						.choice;
					expect(stored?.categories.marketing?.value).toBe(true);
				},
				{ timeout: 3000 }
			);
		});

		test('should render dialog with custom uiSource prop', async () => {
			render(
				<InthProvider options={defaultOptions}>
					<ConsentDialog
						open={true}
						uiSource="custom_dialog"
					/>
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
	});

	describe('Widget uiSource', () => {
		test('should render widget with default uiSource', async () => {
			render(
				<InthProvider options={defaultOptions}>
					<ConsentWidget />
				</InthProvider>
			);

			await vi.waitFor(
				() => {
					const widget = document.querySelector(
						'[data-testid="consent-widget-root"]'
					);
					expect(widget).toBeInTheDocument();
				},
				{ timeout: 3000 }
			);
		});
	});

	describe('Banner to Dialog flow preserves correct uiSource', () => {
		test('should save from the options the banner opens in place', async () => {
			render(
				<InthProvider options={defaultOptions}>
					<ConsentBanner />
					<ConsentDialog />
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

			const customizeButton = document.querySelector(
				'[data-testid="consent-banner-customize-button"]'
			);
			await userEvent.click(getDefined(customizeButton));

			await vi.waitFor(
				() => {
					expect(
						document.querySelector('[data-testid="consent-banner-save-button"]')
					).toBeInTheDocument();
				},
				{ timeout: 3000 }
			);

			const saveButton = document.querySelector(
				'[data-testid="consent-banner-save-button"]'
			);
			await userEvent.click(getDefined(saveButton));

			await vi.waitFor(
				() => {
					const stored = readStoredRecords(undefined, Date.now()).records
						.choice;
					expect(stored).toBeTruthy();
					const consent = getDefined(stored);
					expect(consent.categories).toBeTruthy();
				},
				{ timeout: 3000 }
			);
		});
	});
});
