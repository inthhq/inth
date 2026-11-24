import { afterEach, describe, expect, test } from 'vite-plus/test';

import { ConsentDialogTrigger } from '../../consent-dialog-trigger/src/consent-dialog-trigger';
import { ConsentWidget } from '../../consent-widget/src/consent-widget';
import { bootClient } from '../../src/__tests__/conformance-app';
import type { ClientApp } from '../../src/__tests__/conformance-app';
import type { ConformanceEntry } from '../../src/__tests__/conformance-registry';
import { settle, testOptions } from '../../src/__tests__/test-local';
import {
	resetDialogWarmingForTests,
	warmDialog,
} from '../../src/lib/core/dialog-warming';
import type { InthProviderOptions } from '../../src/lib/core/options';
import { ConsentDialog } from './consent-dialog';

let app: ClientApp | undefined;
let container: HTMLElement | undefined;

const stable = async function stable(): Promise<void> {
	await settle();
	await app?.appRef.whenStable();
	await settle();
};

const mount = async function mount(
	entries: readonly ConformanceEntry[],
	options: Partial<InthProviderOptions> = {}
): Promise<ClientApp> {
	container = document.createElement('div');
	document.body.append(container);
	app = await bootClient(
		container,
		{
			...testOptions(),
			disableAnimation: true,
			...options,
		} as InthProviderOptions,
		{ entries }
	);
	await stable();
	return app;
};

const byTestId = function byTestId(testId: string): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
};

const waitFor = async function waitFor(
	testId: string,
	present = true
): Promise<HTMLElement | null> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		const element = byTestId(testId);
		if (Boolean(element) === present) {
			return element;
		}
		// oxlint-disable-next-line no-await-in-loop -- Polls until the deferred block renders.
		await stable();
	}
	throw new Error(`Timed out waiting for ${testId} (${present})`);
};

const escape = function escape(target: HTMLElement): void {
	const { KeyboardEvent: View } = target.ownerDocument.defaultView as Window &
		typeof globalThis;
	target.dispatchEvent(
		new View('keydown', { bubbles: true, cancelable: true, key: 'Escape' })
	);
};

afterEach(() => {
	app?.destroy();
	container?.remove();
	app = undefined;
	container = undefined;
	localStorage.clear();
	resetDialogWarmingForTests();
	for (const sheet of document.head.querySelectorAll(
		'style[data-inth-styles]'
	)) {
		sheet.remove();
	}
});

describe('ConsentWidget vendor list', () => {
	const vendors = [
		{
			category: 'marketing',
			description: 'Ads measurement.',
			id: 'google-ads',
			name: 'Google Ads',
			privacyPolicyUrl: 'https://policies.google.com/privacy',
		},
	];

	test('lists declared vendors under their category, locked until the category is on', async () => {
		await mount([{ component: ConsentWidget }], {
			vendors,
		} as Partial<InthProviderOptions>);

		byTestId('consent-widget-accordion-trigger-marketing')?.click();
		await stable();

		const list = await waitFor('consent-widget-vendor-list-marketing');
		expect(list?.getAttribute('aria-label')).toBe('Vendors (1)');
		expect(byTestId('consent-widget-vendor-hint-marketing')).not.toBeNull();
		const vendorSwitch = byTestId(
			'consent-widget-vendor-switch-marketing-google-ads'
		);
		expect(vendorSwitch?.getAttribute('aria-label')).toBe('Allow Google Ads');
		expect(vendorSwitch?.hasAttribute('disabled')).toBe(true);

		byTestId('consent-widget-switch-marketing')?.click();
		await stable();

		expect(byTestId('consent-widget-vendor-hint-marketing')).toBeNull();
		expect(vendorSwitch?.hasAttribute('disabled')).toBe(false);
		vendorSwitch?.click();
		await stable();
		expect(app?.consent.selectedVendors()['google-ads']).toBe(false);
	});
});

describe('ConsentDialog', () => {
	test('a warm signal loads its body before it opens', async () => {
		await mount([{ component: ConsentDialog }]);
		const dialogSheet = () =>
			document.head.querySelector('style[data-inth-styles="inth-dialog"]');
		expect(dialogSheet()).toBeNull();

		warmDialog();
		for (let attempt = 0; attempt < 50 && !dialogSheet(); attempt += 1) {
			// oxlint-disable-next-line no-await-in-loop -- Polls until the deferred block renders.
			await stable();
		}

		expect(dialogSheet()).not.toBeNull();
		expect(byTestId('consent-dialog-root')).toBeNull();
	});

	test('loads its body when it opens and closes on Escape', async () => {
		const mounted = await mount([{ component: ConsentDialog }]);
		expect(byTestId('consent-dialog-root')).toBeNull();

		mounted.consent.setActiveUI('dialog');
		const root = await waitFor('consent-dialog-root');
		expect(root?.getAttribute('role')).toBe('dialog');
		expect(byTestId('consent-widget-root')).not.toBeNull();

		escape(root as HTMLElement);
		await waitFor('consent-dialog-root', false);
		expect(mounted.consent.activeUI()).not.toBe('dialog');
	});

	test('with `open` set, Escape asks to close but the parent keeps it open', async () => {
		const mounted = await mount([
			{ component: ConsentDialog, inputs: { open: true } },
		]);
		const root = await waitFor('consent-dialog-root');

		escape(root as HTMLElement);
		await stable();

		expect(mounted.consent.activeUI()).toBe('none');
		expect(byTestId('consent-dialog-root')).not.toBeNull();
	});
});

describe('ConsentDialogTrigger', () => {
	test('opens the dialog and hides while it is open', async () => {
		const mounted = await mount([
			{ component: ConsentDialog },
			{ component: ConsentDialogTrigger },
		]);
		const trigger = await waitFor('consent-dialog-trigger');
		expect(trigger?.getAttribute('aria-label')).toBe('Open privacy settings');

		trigger?.click();
		await waitFor('consent-dialog-root');
		expect(mounted.consent.activeUI()).toBe('dialog');
		expect(byTestId('consent-dialog-trigger')).toBeNull();
	});

	test('renders nothing with showWhen="never"', async () => {
		await mount([
			{
				component: ConsentDialogTrigger,
				inputs: { showWhen: 'never' },
			},
		]);
		expect(byTestId('consent-dialog-trigger')).toBeNull();
	});
});
