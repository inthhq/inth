import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { testOptions } from '../../src/__tests__/test-local';
import { ConsentManager } from '../../src/lib/core/consent-manager';
import { warmDialog } from '../../src/lib/core/dialog-warming';
import { provideInth } from '../../src/lib/core/provide-inth';
import { ConsentDialogBody } from '../../src/lib/dialog/dialog';
import { ConsentBanner } from '../../src/lib/prompt/prompt';
import { CONSENT_DIALOG_BODY, ConsentDialog } from './consent-dialog';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner, ConsentDialog],
	selector: 'test-banner-and-dialog',
	template: `<inth-consent-banner /><inth-consent-dialog />`,
})
class Host {}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentDialog],
	selector: 'test-controlled-load',
	template: `<inth-consent-dialog [(open)]="open" />`,
})
class ControlledHost {
	readonly open = signal(false);
}

afterEach(() => {
	TestBed.resetTestingModule();
	document.body.replaceChildren();
});

/**
 * Boots the host with a body loader that fails until `loader.works` turns
 * `true`. Idle warming may load it before a test opens the dialog, so the
 * tests count loads, not attempt order.
 */
const boot = async (): Promise<{
	consent: ConsentManager;
	loader: { works: boolean; loads: number };
	settle: () => Promise<void>;
}> => {
	const loader = { loads: 0, works: false };
	const load = (): Promise<Type<ConsentDialogBody>> => {
		loader.loads += 1;
		return loader.works
			? Promise.resolve(ConsentDialogBody)
			: Promise.reject(new Error('chunk failed'));
	};
	TestBed.configureTestingModule({
		providers: [
			provideInth({ ...testOptions(), disableAnimation: true }),
			{ provide: CONSENT_DIALOG_BODY, useValue: load },
		],
	});
	const fixture = TestBed.createComponent(Host);
	const consent = TestBed.inject(ConsentManager);
	await vi.waitFor(async () => {
		await fixture.whenStable();
		expect(consent.activeUI()).toBe('banner');
	});
	const settle = async (): Promise<void> => {
		await fixture.whenStable();
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		await fixture.whenStable();
	};
	return { consent, loader, settle };
};

/** Loads and change detection are slow on a busy machine. */
const WAIT = { timeout: 5000 };

const dialog = () =>
	document.querySelector('[data-testid="consent-dialog-root"]');

describe('the dialog body loading', () => {
	test('a warm-up after a failed preload loads it again', async () => {
		const { consent, loader, settle } = await boot();
		warmDialog();
		await vi.waitFor(() => {
			expect(loader.loads).toBeGreaterThan(0);
		}, WAIT);
		await settle();
		const before = loader.loads;

		const customize = document.querySelector(
			'[data-testid="consent-banner-customize-button"]'
		) as HTMLElement;
		customize.dispatchEvent(new MouseEvent('pointerenter'));
		await vi.waitFor(() => {
			expect(loader.loads).toBe(before + 1);
		}, WAIT);
		expect(consent.activeUI()).toBe('banner');
	}, 20_000);

	test('a failed preload is retried when the dialog opens', async () => {
		const { consent, loader, settle } = await boot();
		warmDialog();
		await vi.waitFor(() => {
			expect(loader.loads).toBeGreaterThan(0);
		}, WAIT);
		await settle();
		expect(dialog()).toBeNull();
		expect(consent.activeUI()).toBe('banner');

		const before = loader.loads;
		loader.works = true;
		consent.setActiveUI('dialog');
		await vi.waitFor(async () => {
			await settle();
			expect(dialog()).not.toBeNull();
		}, WAIT);
		expect(loader.loads).toBe(before + 1);
	});

	test('a load that fails as the dialog opens gives the banner back', async () => {
		const { consent, loader, settle } = await boot();
		for (const attempt of [1, 2]) {
			const before = loader.loads;
			consent.setActiveUI('dialog');
			// oxlint-disable-next-line no-await-in-loop -- One open after another.
			await vi.waitFor(async () => {
				await settle();
				expect(loader.loads).toBeGreaterThan(before);
				expect(consent.activeUI()).toBe('banner');
			}, WAIT);
			expect(dialog(), `attempt ${attempt}`).toBeNull();
		}

		loader.works = true;
		consent.setActiveUI('dialog');
		await vi.waitFor(async () => {
			await settle();
			expect(dialog()).not.toBeNull();
		}, WAIT);
	});

	test('a controlled dialog whose load fails hands open back to the parent', async () => {
		const loader = { loads: 0, works: false };
		TestBed.configureTestingModule({
			providers: [
				provideInth({ ...testOptions(), disableAnimation: true }),
				{
					provide: CONSENT_DIALOG_BODY,
					useValue: (): Promise<Type<ConsentDialogBody>> => {
						loader.loads += 1;
						return loader.works
							? Promise.resolve(ConsentDialogBody)
							: Promise.reject(new Error('chunk failed'));
					},
				},
			],
		});
		const fixture = TestBed.createComponent(ControlledHost);
		await fixture.whenStable();
		const before = loader.loads;

		fixture.componentInstance.open.set(true);
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(loader.loads).toBeGreaterThan(before);
			expect(fixture.componentInstance.open()).toBe(false);
		}, WAIT);

		loader.works = true;
		fixture.componentInstance.open.set(true);
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(dialog()).not.toBeNull();
		}, WAIT);
	});
});
