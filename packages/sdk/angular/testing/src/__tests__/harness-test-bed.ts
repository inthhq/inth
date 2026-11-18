import type { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { provideC15t } from '@c15t/angular';
import type { C15tProviderOptions } from '@c15t/angular';
import { expect, vi } from 'vitest';

import { completeGVL } from '../../../../iab/src/__tests__/fixtures/gvl-sample';
import { offlineMode } from '../../../src/__tests__/fixtures/transport-mode';
import { testOptions } from '../../../src/__tests__/test-local';

/** A booted harness test: the fixture and both loaders. */
export interface HarnessTest<ComponentType> {
	readonly fixture: ComponentFixture<ComponentType>;
	/** Finds surfaces anywhere in the document, portaled ones included. */
	readonly loader: HarnessLoader;
	/** Finds only what renders inside the fixture's host. */
	readonly fixtureLoader: HarnessLoader;
}

/**
 * Boots `host` under `provideC15t()` in local mode with the opt-in test
 * rule, every category and no animation, and waits for the first stable
 * render.
 *
 * @param host - The component to render.
 * @param options - Provider options merged over the defaults.
 * @returns The fixture and its loaders.
 */
export const bootHarnessTest = async function bootHarnessTest<ComponentType>(
	host: new () => ComponentType,
	options: Partial<C15tProviderOptions> = {}
): Promise<HarnessTest<ComponentType>> {
	TestBed.configureTestingModule({
		providers: [
			provideC15t({
				...testOptions(),
				disableAnimation: true,
				...options,
			} as C15tProviderOptions),
		],
	});
	const fixture = TestBed.createComponent(host);
	await fixture.whenStable();
	return {
		fixture,
		fixtureLoader: TestbedHarnessEnvironment.loader(fixture),
		loader: TestbedHarnessEnvironment.documentRootLoader(fixture),
	};
};

/** Tears down the test bed and anything the portals left in `<body>`. */
export const resetHarnessTest = function resetHarnessTest(): void {
	TestBed.resetTestingModule();
	localStorage.clear();
	document.body.replaceChildren();
};

/**
 * Provider options for an IAB test: local mode with an `iab` choice
 * rule, and the sample Global Vendor List inline, so nothing is fetched.
 */
export const iabTestOptions =
	function iabTestOptions(): Partial<C15tProviderOptions> {
		return {
			iab: { cmpId: 28, gvl: completeGVL },
			mode: offlineMode([
				{
					id: 'test-iab',
					match: { fallback: true, isDefault: true },
					model: 'iab',
					prompt: 'choice',
				},
			]),
		} as Partial<C15tProviderOptions>;
	};

/**
 * Waits for a harness that appears after work the fixture does not track,
 * such as the IAB module and vendor list loading.
 *
 * @param find - Looks the harness up, or returns `null`.
 * @returns The harness.
 */
export const waitForHarness = async function waitForHarness<HarnessType>(
	find: () => Promise<HarnessType | null>
): Promise<HarnessType> {
	let found: HarnessType | null = null;
	await vi.waitFor(async () => {
		found = await find();
		expect(found).not.toBeNull();
	});
	return found as HarnessType;
};
