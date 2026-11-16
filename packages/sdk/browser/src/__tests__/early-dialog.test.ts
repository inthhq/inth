/**
 * `c15t.dialog.js` from source: the dialog the init script opens before
 * the engine (`init/early-dialog.ts`) and its handoff, the loader both
 * bundles use (`init/dialog-file.ts`, `ui/dialog-import-script.ts`), and
 * the scroll lock it borrows (`ui/locks-shared.ts`). The built files run in
 * Chromium in `init-script.browser.test.ts`.
 */
import { policyRulePresets } from '@c15t/core';
import type { ConsentSnapshot } from '@c15t/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { InitUI } from '../init/boot';
import { DIALOG_KEY, loadDialogFile } from '../init/dialog-file';
import { openEarlyDialog } from '../init/early-dialog';
import type { EarlyDialogHost } from '../init/early-dialog';
import { createScriptTagConsentClient } from '../script-tag-client';
import type { ConsentClient } from '../types';
import { createDialog } from '../ui/dialog';
import { importDialog } from '../ui/dialog-import-script';
import { LOCKS_KEY, setupFocusTrap, setupScrollLock } from '../ui/locks-shared';
import { version } from '../version';

const target = window as unknown as Record<string, unknown>;
const clients: ConsentClient[] = [];

afterEach(() => {
	for (const client of clients.splice(0)) {
		client.dispose();
	}
	target[DIALOG_KEY] = undefined;
	target[LOCKS_KEY] = undefined;
	target.__c15tDialogSrc = undefined;
	localStorage.clear();
	document.head.querySelectorAll('script').forEach((script) => script.remove());
	document.body.replaceChildren();
});

/** A resolved snapshot with measurement and marketing to decide. */
const resolvedSnapshot =
	async function resolvedSnapshot(): Promise<ConsentSnapshot> {
		const client = createScriptTagConsentClient(
			{
				acknowledgeNoRecords: true,
				consentCategories: ['measurement', 'marketing'],
				policyRules: [
					{
						...policyRulePresets.europeOptIn(),
						categories: ['measurement', 'marketing'],
						match: { isDefault: true },
					},
				],
				ui: false,
			},
			{ pkg: '@c15t/browser/test' }
		);
		clients.push(client);
		client.start();
		await client.ready();
		return client.getSnapshot();
	};

const setup = async function setup() {
	let current = await resolvedSnapshot();
	const root = document.createElement('div');
	const themeRoot = document.createElement('div');
	root.append(themeRoot);
	document.body.append(root);
	const host: EarlyDialogHost = {
		closeDialog: vi.fn(),
		options: { ui: { disableAnimation: true } },
		presentation: () => undefined,
		save: vi.fn(),
		standIn: {
			acceptAll: vi.fn(),
			getSnapshot: () => current,
			rejectAll: vi.fn(),
			subscribe: () => () => undefined,
		},
		ui: { root, themeRoot } as unknown as InitUI,
	};
	const early = openEarlyDialog(host);
	const show = (next: ConsentSnapshot) => {
		current = next;
		early.surface.sync(next);
	};
	return { early, host, root, show, snapshot: () => current, themeRoot };
};

const dialogRoot = (root: HTMLElement) =>
	root.querySelector<HTMLElement>('[data-testid="consent-dialog-root"]');

const testId = (root: HTMLElement, id: string) =>
	root.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe('the dialog before the engine', () => {
	it('opens over the stand-in and sends its save and Escape to the init script', async () => {
		const { host, root, show, snapshot } = await setup();
		// The dialog's rules go in after the banner's sheet.
		expect(root.querySelector('style')?.textContent?.length).toBeGreaterThan(
			1000
		);

		show({ ...snapshot(), activeUI: 'dialog' });
		expect(dialogRoot(root)).not.toBeNull();

		testId(root, 'consent-widget-switch-measurement')?.click();
		testId(root, 'consent-widget-footer-save-button')?.click();
		expect(host.save).toHaveBeenCalledWith({
			marketing: false,
			measurement: true,
		});

		testId(root, 'consent-widget-footer-accept-all-button')?.click();
		expect(host.standIn.acceptAll).toHaveBeenCalledOnce();

		document.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
		);
		expect(host.closeDialog).toHaveBeenCalledOnce();
	});

	it('stays open for the engine until it shows the dialog, keeping staged switches', async () => {
		const { early, root, show, snapshot } = await setup();
		const rendered = { ...snapshot(), activeUI: 'dialog' as const };
		show(rendered);
		testId(root, 'consent-widget-switch-measurement')?.click();
		const element = dialogRoot(root);

		let engineSnapshot: ConsentSnapshot = {
			...structuredClone(rendered),
			activeUI: 'banner',
		};
		const engine = {
			getSnapshot: () => engineSnapshot,
			// Never ready in this test: the dialog follows the engine's
			// snapshots only.
			ready: () =>
				// oxlint-disable-next-line promise/avoid-new -- A promise that never settles.
				new Promise<ConsentSnapshot>(() => {
					// Never resolves.
				}),
		} as unknown as ConsentClient;
		const surface = early.handOver(rendered, engine);
		// The engine's root holds the full sheet.
		expect(root.querySelector('style')).toBeNull();

		// The engine's first render, before its queued openDialog.
		surface.sync(engineSnapshot);
		expect(dialogRoot(root)).toBe(element);

		// The same values in new objects: no new dialog, the switch kept.
		engineSnapshot = { ...structuredClone(rendered), activeUI: 'dialog' };
		surface.sync(engineSnapshot);
		expect(dialogRoot(root)).toBe(element);
		expect(
			testId(root, 'consent-widget-switch-measurement')?.getAttribute(
				'aria-checked'
			)
		).toBe('true');

		// From then on it follows the engine.
		surface.sync({ ...engineSnapshot, activeUI: 'none' });
		expect(dialogRoot(root)).toBeNull();
	});

	it('follows the engine once it is ready, should it not show the dialog', async () => {
		const { early, root, show, snapshot } = await setup();
		const rendered = { ...snapshot(), activeUI: 'dialog' as const };
		show(rendered);
		const engineSnapshot = { ...rendered, activeUI: 'banner' as const };
		const engine = {
			getSnapshot: () => engineSnapshot,
			ready: () => Promise.resolve(engineSnapshot),
		} as unknown as ConsentClient;

		const surface = early.handOver(rendered, engine);
		surface.sync(engineSnapshot);
		expect(dialogRoot(root)).not.toBeNull();

		await vi.waitFor(() => {
			expect(dialogRoot(root)).toBeNull();
		});
	});
});

describe('loading c15t.dialog.js', () => {
	/** The script tag the loader added for `src`. */
	const added = (src: string) =>
		document.head.querySelector<HTMLScriptElement>(`script[src="${src}"]`);

	const publish = (fileVersion: string) => {
		target[DIALOG_KEY] = {
			createDialog,
			openEarlyDialog,
			version: fileVersion,
		};
	};

	it('loads the file once and hands over what it published', async () => {
		const pending = loadDialogFile('/one/c15t.dialog.js', 'nonce-1');
		expect(loadDialogFile('/one/c15t.dialog.js')).toBe(pending);
		const element = added('/one/c15t.dialog.js');
		expect(element?.nonce).toBe('nonce-1');

		publish(version);
		element?.dispatchEvent(new Event('load'));

		expect((await pending)?.createDialog).toBe(createDialog);
		// Published: a later call adds no tag.
		await loadDialogFile('/other/c15t.dialog.js');
		expect(added('/other/c15t.dialog.js')).toBeNull();
	});

	it('refuses a file from another release, and tries again on the next call', async () => {
		const pending = loadDialogFile('/stale/c15t.dialog.js');
		publish('0.0.0-stale');
		added('/stale/c15t.dialog.js')?.dispatchEvent(new Event('load'));
		expect(await pending).toBeUndefined();

		added('/stale/c15t.dialog.js')?.remove();
		void loadDialogFile('/stale/c15t.dialog.js');
		expect(added('/stale/c15t.dialog.js')).not.toBeNull();
	});

	it('loads the engine’s dialog from __c15tDialogSrc and lends it the engine’s locks', async () => {
		target.__c15tDialogSrc = '/engine/c15t.dialog.js';
		const pending = importDialog();
		expect(target[LOCKS_KEY]).toBeDefined();
		// The file's factory, not the engine's own copy.
		const fromFile = vi.fn() as unknown as typeof createDialog;
		target[DIALOG_KEY] = { createDialog: fromFile, openEarlyDialog, version };
		added('/engine/c15t.dialog.js')?.dispatchEvent(new Event('load'));
		expect(await pending).toBe(fromFile);
	});

	it('falls back to the engine’s own dialog when c15t.dialog.js is unavailable', async () => {
		// No URL to load it from.
		await expect(importDialog()).resolves.toBe(createDialog);

		// A missing file.
		target.__c15tDialogSrc = '/missing/c15t.dialog.js';
		const missing = importDialog();
		added('/missing/c15t.dialog.js')?.dispatchEvent(new Event('error'));
		await expect(missing).resolves.toBe(createDialog);

		// A file from another release.
		target.__c15tDialogSrc = '/stale-engine/c15t.dialog.js';
		const stale = importDialog();
		publish('0.0.0-stale');
		added('/stale-engine/c15t.dialog.js')?.dispatchEvent(new Event('load'));
		await expect(stale).resolves.toBe(createDialog);
	});
});

describe('the borrowed scroll lock', () => {
	it('uses the loading bundle’s lock and trap, or does nothing without one', () => {
		expect(setupScrollLock()).toBeTypeOf('function');
		const release = vi.fn();
		const lock = vi.fn(() => release);
		const trap = vi.fn(() => release);
		target[LOCKS_KEY] = { setupFocusTrap: trap, setupScrollLock: lock };
		const card = document.createElement('div');

		setupScrollLock()();
		setupFocusTrap(card, { initialFocus: 'first-tabbable' })();

		expect(lock).toHaveBeenCalledOnce();
		expect(trap).toHaveBeenCalledWith(card, { initialFocus: 'first-tabbable' });
		expect(release).toHaveBeenCalledTimes(2);
	});
});
