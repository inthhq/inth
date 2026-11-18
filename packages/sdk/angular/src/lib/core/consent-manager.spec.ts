import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	PLATFORM_ID,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	createConsentProviderRuntime,
	createConsentRuntime,
	defaultRuntimeModules,
} from '@inth/sdk/runtime';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { testLocal, testOptions } from '../../__tests__/test-local';
import { ConsentManager } from './consent-manager';
import { ConsentTheme } from './consent-theme';
import { HeadlessConsent } from './headless-consent';
import { provideC15t } from './provide-c15t';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'test-consent-reader',
	template: `<span>{{ ui() }}</span
		><b>{{ measurement() ? 'on' : 'off' }}</b>`,
})
class ConsentReader {
	readonly #consent = inject(ConsentManager);
	protected readonly ui = this.#consent.activeUI;
	protected readonly measurement = computed(() =>
		this.#consent.has('measurement')
	);
}

const boot = async () => {
	TestBed.configureTestingModule({
		providers: [provideC15t(testOptions())],
	});
	const fixture = TestBed.createComponent(ConsentReader);
	const consent = TestBed.inject(ConsentManager);
	await fixture.whenStable();
	// The local transport loads on demand before init resolves the policy.
	await vi.waitFor(() => {
		expect(consent.activeUI()).toBe('banner');
	});
	await fixture.whenStable();
	return { consent, fixture };
};

afterEach(() => {
	TestBed.resetTestingModule();
});

describe('ConsentManager', () => {
	test('starts the runtime after the first render and shows the banner', async () => {
		const { consent, fixture } = await boot();
		expect(consent.runtime.started).toBe(true);
		expect(consent.hasPolicy()).toBe(true);
		expect(consent.activeUI()).toBe('banner');
		expect(fixture.nativeElement.textContent).toBe('banneroff');
	});

	test('a save updates signals, computeds and the rendered view', async () => {
		const { consent, fixture } = await boot();
		await consent.saveConsents('all');
		await fixture.whenStable();
		expect(consent.has('measurement')).toBe(true);
		expect(consent.activeUI()).toBe('none');
		expect(fixture.nativeElement.textContent).toBe('noneon');
	});

	test('the draft stages choices that a custom save records', async () => {
		const { consent } = await boot();
		consent.setSelectedConsent('measurement', true);
		await vi.waitFor(() => {
			expect(consent.draft.values().measurement).toBe(true);
		});
		expect(consent.has('measurement')).toBe(false);
		await consent.saveConsents('custom');
		expect(consent.has('measurement')).toBe(true);
		expect(consent.has('marketing')).toBe(false);
	});

	test('setActiveUI opens the dialog', async () => {
		const { consent } = await boot();
		consent.setActiveUI('dialog');
		expect(consent.activeUI()).toBe('dialog');
	});

	test('does not start the runtime on the server', async () => {
		TestBed.configureTestingModule({
			providers: [
				{ provide: PLATFORM_ID, useValue: 'server' },
				provideC15t(testOptions()),
			],
		});
		const fixture = TestBed.createComponent(ConsentReader);
		await fixture.whenStable();
		const consent = TestBed.inject(ConsentManager);
		expect(consent.runtime.started).toBe(false);
		expect(consent.activeUI()).toBe('none');
	});

	test('renders an external runtime without starting or disposing it', async () => {
		const runtime = createConsentRuntime({
			mode: testLocal(),
			persistence: false,
		});
		const dispose = vi.spyOn(runtime, 'dispose');
		TestBed.configureTestingModule({
			providers: [provideC15t({ runtime })],
		});
		const fixture = TestBed.createComponent(ConsentReader);
		await fixture.whenStable();
		const consent = TestBed.inject(ConsentManager);
		expect(consent.runtime).toBe(runtime);
		expect(runtime.started).toBe(false);

		runtime.start();
		await vi.waitFor(() => {
			expect(consent.activeUI()).toBe('banner');
		});

		TestBed.resetTestingModule();
		expect(dispose).not.toHaveBeenCalled();
		runtime.dispose();
	});

	test('follows the kernel an external provider runtime swaps to', async () => {
		const runtime = createConsentProviderRuntime(
			{ mode: testLocal(), persistence: false },
			defaultRuntimeModules
		);
		TestBed.configureTestingModule({
			providers: [provideC15t({ runtime })],
		});
		const fixture = TestBed.createComponent(ConsentReader);
		await fixture.whenStable();
		const consent = TestBed.inject(ConsentManager);
		runtime.start();
		await vi.waitFor(() => {
			expect(consent.activeUI()).toBe('banner');
		});

		runtime.setEnabled(false);
		expect(consent.kernel()).toBe(runtime.kernel);
		expect(consent.activeUI()).toBe('none');
		expect(consent.has('measurement')).toBe(true);

		TestBed.resetTestingModule();
		runtime.dispose();
	});

	test('consent-change listeners follow the kernel enabled swaps to', async () => {
		const { consent } = await boot();
		const listener = vi.fn();
		const stop = consent.subscribeToConsentChanges(listener);

		await consent.updateOptions({ enabled: false });
		expect(listener).toHaveBeenLastCalledWith(
			expect.objectContaining({ measurement: true })
		);

		await consent.updateOptions({ enabled: true });
		listener.mockClear();
		await consent.saveConsents('all');
		expect(listener).toHaveBeenCalled();

		stop();
		listener.mockClear();
		await consent.updateOptions({ enabled: false });
		expect(listener).not.toHaveBeenCalled();
	});

	test('forwards a removed consentCategories to an external runtime', async () => {
		const runtime = createConsentRuntime({
			consentCategories: ['necessary', 'measurement'],
			mode: testLocal(),
			persistence: false,
		});
		const setConsentCategories = vi.spyOn(runtime, 'setConsentCategories');
		TestBed.configureTestingModule({
			providers: [provideC15t({ runtime })],
		});
		const fixture = TestBed.createComponent(ConsentReader);
		await fixture.whenStable();
		const consent = TestBed.inject(ConsentManager);

		await consent.updateOptions({ noStyle: true });
		expect(setConsentCategories).not.toHaveBeenCalled();

		await consent.updateOptions({ consentCategories: undefined });
		expect(setConsentCategories).toHaveBeenCalledExactlyOnceWith(undefined);

		TestBed.resetTestingModule();
		runtime.dispose();
	});

	test('becomes stable when the mode factory throws while the engine is built', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {
			/* The failed build logs. */
		});
		TestBed.configureTestingModule({
			providers: [
				provideC15t({
					...testOptions(),
					mode: (() => {
						throw new Error('mode failed');
					}) as never,
				}),
			],
		});
		const fixture = TestBed.createComponent(ConsentReader);
		// The engine's load holds the app's pending task until it settles.
		await fixture.whenStable();
		expect(error).toHaveBeenCalled();
		error.mockRestore();
	});

	test('disposes an owned runtime with the application', async () => {
		const { consent } = await boot();
		const dispose = vi.spyOn(consent.runtime, 'dispose');
		TestBed.resetTestingModule();
		expect(dispose).toHaveBeenCalledOnce();
	});

	test('updateOptions changes the theme the surfaces read', async () => {
		const { consent } = await boot();
		const theme = TestBed.inject(ConsentTheme);
		expect(theme.noStyle()).toBe(false);
		await consent.updateOptions({
			noStyle: true,
			theme: { slots: { consentBanner: 'brand' } },
		});
		expect(theme.noStyle()).toBe(true);
		expect(theme.theme()?.slots?.consentBanner).toBe('brand');
	});
});

describe('HeadlessConsent', () => {
	test('resolves the banner presentation and performs actions', async () => {
		await boot();
		const headless = TestBed.inject(HeadlessConsent);
		expect(headless.banner().isVisible).toBe(true);
		expect(headless.banner().orderedActions).toContain('accept');

		headless.performAction('customize');
		expect(headless.dialog().isVisible).toBe(true);

		await headless.performAction('reject');
		const consent = TestBed.inject(ConsentManager);
		expect(consent.activeUI()).toBe('none');
		expect(consent.explicitChoice()).not.toBeNull();
	});
});
