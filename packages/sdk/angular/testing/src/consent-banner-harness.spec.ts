import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConsentBanner, ConsentManager } from '@inth/angular';
import { ConsentDialog } from '@inth/angular/consent-dialog';
import { afterEach, describe, expect, test } from 'vite-plus/test';

import {
	bootHarnessTest,
	resetHarnessTest,
} from './__tests__/harness-test-bed';
import { ConsentBannerHarness } from './consent-banner-harness';
import { ConsentDialogHarness } from './consent-dialog-harness';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner, ConsentDialog],
	selector: 'test-banner-host',
	template: `<inth-consent-banner
			[hideBranding]="true"
		/><inth-consent-dialog />`,
})
class BannerHost {}

afterEach(resetHarnessTest);

describe('ConsentBannerHarness', () => {
	test('reads the banner and accepts every category', async () => {
		const { loader } = await bootHarnessTest(BannerHost);
		const consent = TestBed.inject(ConsentManager);
		const banner = await loader.getHarness(ConsentBannerHarness);

		expect(await banner.getTitle()).toBe('We value your privacy');
		expect(await banner.getDescription()).not.toBe('');
		expect(await banner.getPrompt()).toBe('choice');
		expect(await banner.getActions()).toEqual(
			expect.arrayContaining(['accept', 'reject', 'customize'])
		);
		expect(consent.has('marketing')).toBe(false);

		await banner.acceptAll();

		expect(consent.has('marketing')).toBe(true);
		expect(consent.has('measurement')).toBe(true);
		expect(await loader.getHarnessOrNull(ConsentBannerHarness)).toBeNull();
	});

	test('rejects every optional category', async () => {
		const { loader } = await bootHarnessTest(BannerHost);
		const consent = TestBed.inject(ConsentManager);
		const banner = await loader.getHarness(ConsentBannerHarness);

		await banner.rejectAll();

		expect(consent.explicitChoice()).not.toBeNull();
		expect(consent.has('marketing')).toBe(false);
		expect(consent.has('necessary')).toBe(true);
		expect(await loader.getHarnessOrNull(ConsentBannerHarness)).toBeNull();
	});

	test('opens the dialog without recording a choice', async () => {
		const { loader } = await bootHarnessTest(BannerHost);
		const consent = TestBed.inject(ConsentManager);
		const banner = await loader.getHarness(ConsentBannerHarness);

		await banner.openPreferences();

		expect(consent.activeUI()).toBe('dialog');
		expect(consent.explicitChoice()).toBeNull();
		expect(await loader.getHarness(ConsentDialogHarness)).toBeTruthy();
	});

	test('filters by title and throws for an action the policy leaves out', async () => {
		const { loader } = await bootHarnessTest(BannerHost);

		expect(
			await loader.getHarnessOrNull(
				ConsentBannerHarness.with({ title: /privacy/u })
			)
		).not.toBeNull();
		expect(
			await loader.getHarnessOrNull(
				ConsentBannerHarness.with({ prompt: 'notice' })
			)
		).toBeNull();
		const banner = await loader.getHarness(ConsentBannerHarness);
		await expect(banner.dismiss()).rejects.toThrow(
			'The banner offers no "dismiss" action.'
		);
	});

	test('is outside the fixture, so only the document root loader finds it', async () => {
		const { fixture } = await bootHarnessTest(BannerHost);
		const fixtureLoader = TestbedHarnessEnvironment.loader(fixture);

		expect(
			await fixtureLoader.getHarnessOrNull(ConsentBannerHarness)
		).toBeNull();
	});
});
