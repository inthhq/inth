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
import { ConsentDialog } from '~/components/panel';
import { ConsentDialogTrigger } from '~/components/panel-trigger';
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
		id: 'consent-flow-test',
		model: 'opt-in',
		prompt: 'choice',
		scopeMode: 'permissive',
	}),
	// These tests seed or read records under the default key.
	storageConfig: DEFAULT_KEY_STORAGE,
};

const storedAcceptAllConsent = () => ({
	consentInfo: {
		subjectId: 'sub_123456789ABC',
		time: Date.now(),
		type: 'accept-all',
	},
	consents: {
		experience: true,
		functionality: true,
		marketing: true,
		measurement: true,
		necessary: true,
	},
});

describe('Consent Flow E2E Tests', () => {
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

	describe('First Visit Flow', () => {
		test('should show cookie banner to first-time visitor', async () => {
			render(
				<InthProvider options={defaultOptions}>
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

		test('should hide banner after accepting all', async () => {
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
					const banner = document.querySelector(
						'[data-testid="consent-banner-root"]'
					);
					expect(banner).not.toBeInTheDocument();
				},
				{ timeout: 3000 }
			);
		});

		test('should hide banner after rejecting all', async () => {
			render(
				<InthProvider options={defaultOptions}>
					<ConsentBanner />
				</InthProvider>
			);

			await vi.waitFor(
				() => {
					const rejectButton = document.querySelector(
						'[data-testid="consent-banner-reject-button"]'
					);
					expect(rejectButton).toBeInTheDocument();
				},
				{ timeout: 3000 }
			);

			const rejectButton = document.querySelector(
				'[data-testid="consent-banner-reject-button"]'
			);
			await userEvent.click(getDefined(rejectButton));

			await vi.waitFor(
				() => {
					const banner = document.querySelector(
						'[data-testid="consent-banner-root"]'
					);
					expect(banner).not.toBeInTheDocument();
				},
				{ timeout: 3000 }
			);
		});
	});

	describe('Consent Persistence', () => {
		test('should persist consent to localStorage on accept', async () => {
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
					expect(consent.categories.marketing?.value).toBe(true);
					expect(consent.categories.necessary).toBeUndefined();
				},
				{ timeout: 3000 }
			);
		});

		test('should persist reject decision to localStorage', async () => {
			render(
				<InthProvider options={defaultOptions}>
					<ConsentBanner />
				</InthProvider>
			);

			await vi.waitFor(
				() => {
					const rejectButton = document.querySelector(
						'[data-testid="consent-banner-reject-button"]'
					);
					expect(rejectButton).toBeInTheDocument();
				},
				{ timeout: 3000 }
			);

			const rejectButton = document.querySelector(
				'[data-testid="consent-banner-reject-button"]'
			);
			await userEvent.click(getDefined(rejectButton));

			await vi.waitFor(
				() => {
					const stored = readStoredRecords(undefined, Date.now()).records
						.choice;
					expect(stored).toBeTruthy();
					const consent = getDefined(stored);
					expect(consent.categories.necessary).toBeUndefined();
					expect(consent.categories.marketing?.value).toBe(false);
					expect(consent.categories.measurement?.value).toBe(false);
				},
				{ timeout: 3000 }
			);
		});
	});

	describe('Returning Visitor Flow', () => {
		test('should not show banner if user has already consented', async () => {
			window.localStorage.setItem(
				'inth',
				JSON.stringify(storedAcceptAllConsent())
			);

			render(
				<InthProvider options={defaultOptions}>
					<ConsentBanner />
				</InthProvider>
			);

			// Wait a bit to ensure banner would have shown if it was going to
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 500);
			});

			const banner = document.querySelector(
				'[data-testid="consent-banner-root"]'
			);
			expect(banner).not.toBeInTheDocument();
		});
	});

	describe('Preference Center Trigger', () => {
		test('should show trigger after consent given when showWhen is always', async () => {
			window.localStorage.setItem(
				'inth',
				JSON.stringify(storedAcceptAllConsent())
			);

			render(
				<InthProvider options={defaultOptions}>
					<ConsentDialogTrigger showWhen="always" />
				</InthProvider>
			);

			await vi.waitFor(
				() => {
					const trigger = document.querySelector(
						'button[aria-label="Open privacy settings"]'
					);
					expect(trigger).toBeInTheDocument();
				},
				{ timeout: 3000 }
			);
		});
	});

	describe('Widget Integration', () => {
		test('should render widget with all consent categories', async () => {
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

			await vi.waitFor(
				() => {
					const switches = document.querySelectorAll('[role="switch"]');
					expect(switches.length).toBeGreaterThan(0);
				},
				{ timeout: 3000 }
			);
		});

		test('should have disabled necessary consent toggle', async () => {
			render(
				<InthProvider options={defaultOptions}>
					<ConsentWidget />
				</InthProvider>
			);

			await vi.waitFor(
				() => {
					const necessarySwitch = document.querySelector(
						'[data-testid="consent-widget-switch-necessary"]'
					);
					expect(necessarySwitch).toBeInTheDocument();
					// Necessary consent is always required, so the switch should be disabled
					expect(necessarySwitch?.getAttribute('data-disabled')).toBe('');
				},
				{ timeout: 3000 }
			);
		});
	});

	describe('Dialog Integration', () => {
		test('should show dialog when open prop is true', async () => {
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
		});

		test('should add aria-modal when focus trap is enabled', async () => {
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
					expect(dialog?.getAttribute('aria-modal')).toBe('true');
				},
				{ timeout: 3000 }
			);
		});

		test('should contain widget inside dialog', async () => {
			render(
				<InthProvider options={defaultOptions}>
					<ConsentDialog open={true} />
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

		test('should render stock dialog branding without an empty footer wrapper', async () => {
			render(
				<InthProvider options={defaultOptions}>
					<ConsentDialog open={true} />
				</InthProvider>
			);

			await vi.waitFor(
				() => {
					expect(
						document.querySelector('[data-testid="consent-dialog-branding"]')
					).toBeInTheDocument();
					expect(
						document.querySelector('[data-testid="consent-dialog-footer"]')
					).not.toBeInTheDocument();
				},
				{ timeout: 3000 }
			);
		});

		test('should close managed dialog on Escape', async () => {
			render(
				<InthProvider options={defaultOptions}>
					<ConsentBanner />
					<ConsentDialog />
				</InthProvider>
			);

			await vi.waitFor(
				() => {
					expect(
						document.querySelector(
							'[data-testid="consent-banner-customize-button"]'
						)
					).toBeInTheDocument();
				},
				{ timeout: 3000 }
			);

			await userEvent.click(
				getDefined(
					document.querySelector(
						'[data-testid="consent-banner-customize-button"]'
					)
				)
			);

			await vi.waitFor(
				() => {
					expect(
						document.querySelector('[data-testid="consent-dialog-root"]')
					).toBeInTheDocument();
				},
				{ timeout: 3000 }
			);

			document.dispatchEvent(
				new KeyboardEvent('keydown', {
					bubbles: true,
					cancelable: true,
					key: 'Escape',
				})
			);

			await vi.waitFor(
				() => {
					expect(
						document.querySelector('[data-testid="consent-dialog-root"]')
					).not.toBeInTheDocument();
				},
				{ timeout: 3000 }
			);
		});
	});

	describe('Closing the dialog', () => {
		const pressEscape = () =>
			document.dispatchEvent(
				new KeyboardEvent('keydown', {
					bubbles: true,
					cancelable: true,
					key: 'Escape',
				})
			);
		const query = (testId: string) =>
			document.querySelector(`[data-testid="${testId}"]`);

		test('brings the banner back while the visitor still owes a choice', async () => {
			render(
				<InthProvider options={defaultOptions}>
					<ConsentBanner />
					<ConsentDialog />
				</InthProvider>
			);

			await vi.waitFor(() => {
				expect(query('consent-banner-customize-button')).toBeInTheDocument();
			});
			await userEvent.click(
				getDefined(query('consent-banner-customize-button'))
			);
			await vi.waitFor(() => {
				expect(query('consent-dialog-root')).toBeInTheDocument();
				expect(query('consent-banner-root')).not.toBeInTheDocument();
			});

			pressEscape();

			await vi.waitFor(() => {
				expect(query('consent-dialog-root')).not.toBeInTheDocument();
				expect(query('consent-banner-root')).toBeInTheDocument();
			});
			expect(readStoredRecords(undefined, Date.now()).records.choice).toBe(
				null
			);
		});

		test('leaves nothing open once the visitor has chosen', async () => {
			render(
				<InthProvider options={defaultOptions}>
					<ConsentBanner />
					<ConsentDialog />
					<ConsentDialogTrigger showWhen="always" />
				</InthProvider>
			);

			await vi.waitFor(() => {
				expect(query('consent-banner-accept-button')).toBeInTheDocument();
			});
			await userEvent.click(getDefined(query('consent-banner-accept-button')));
			await vi.waitFor(() => {
				expect(query('consent-banner-root')).not.toBeInTheDocument();
			});

			await userEvent.click(getDefined(query('consent-dialog-trigger')));
			await vi.waitFor(() => {
				expect(query('consent-dialog-root')).toBeInTheDocument();
			});

			pressEscape();

			await vi.waitFor(() => {
				expect(query('consent-dialog-root')).not.toBeInTheDocument();
			});
			expect(query('consent-banner-root')).not.toBeInTheDocument();
		});
	});

	describe('Complete Flow', () => {
		test('should complete full consent flow: banner -> customize -> save', async () => {
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
					const dialog = document.querySelector(
						'[data-testid="consent-dialog-root"]'
					);
					expect(dialog).toBeInTheDocument();
				},
				{ timeout: 3000 }
			);

			const marketingSwitch = document.querySelector(
				'[data-testid="consent-widget-switch-marketing"]'
			);
			await userEvent.click(getDefined(marketingSwitch));

			const saveButton = document.querySelector(
				'[data-testid="consent-widget-footer-save-button"]'
			);
			await userEvent.click(getDefined(saveButton));

			await vi.waitFor(
				() => {
					const stored = readStoredRecords(undefined, Date.now()).records
						.choice;
					expect(stored).toBeTruthy();
					const consent = getDefined(stored);
					expect(consent.categories.marketing?.value).toBe(true);
				},
				{ timeout: 3000 }
			);
		});
	});
});
