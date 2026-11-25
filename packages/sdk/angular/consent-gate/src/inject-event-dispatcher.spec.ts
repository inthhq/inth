import {
	ChangeDetectionStrategy,
	Component,
	Injector,
	runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { offlineMode } from '../../src/__tests__/fixtures/transport-mode';
import { TEST_OPT_IN_RULE } from '../../src/__tests__/test-local';
import { ConsentManager } from '../../src/lib/core/consent-manager';
import { provideInth } from '../../src/lib/core/provide-inth';
import { injectEventDispatcher } from './inject-event-dispatcher';

const capture = vi.fn();
const globals = { posthog: { capture } };

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'test-tracker',
	template: '',
})
class Tracker {
	readonly events = injectEventDispatcher(() => ({
		globals,
		pageviews: ['posthog'],
	}));
}

afterEach(() => {
	TestBed.resetTestingModule();
	capture.mockReset();
});

test('follows the provider scripts, live consent and one pageview history', async () => {
	TestBed.configureTestingModule({
		providers: [
			provideInth({
				iframeBlocker: false,
				mode: offlineMode([
					{
						...TEST_OPT_IN_RULE,
						categories: ['measurement'],
						scopeMode: 'permissive',
					},
				]),
				persistence: false,
				scripts: [
					{
						callbackOnly: true,
						category: 'measurement',
						id: 'posthog',
						vendor: 'posthog',
					},
				],
			}),
		],
	});
	const firstFixture = TestBed.createComponent(Tracker);
	const first = firstFixture.componentInstance.events;
	const second = TestBed.createComponent(Tracker).componentInstance.events;
	// The runtime starts after the first render.
	await firstFixture.whenStable();
	const consent = TestBed.inject(ConsentManager);
	await vi.waitFor(() => expect(consent.hasPolicy()).toBe(true));

	first.pageview('/');
	await consent.saveConsents('all');
	// The other component's dispatcher shares the history, so this is the
	// first send.
	second.pageview('/pricing');
	first.pageview('/pricing');
	expect(capture.mock.calls).toEqual([['$pageview']]);

	await consent.saveConsents('necessary');
	first.track('add_to_cart');
	expect(capture).toHaveBeenCalledOnce();
});

test('throws outside an injection context', () => {
	expect(() => injectEventDispatcher()).toThrow(/injection context/u);
	// And without provideInth, as `inject(ConsentManager)` does.
	expect(() =>
		runInInjectionContext(Injector.create({ providers: [] }), () =>
			injectEventDispatcher()
		)
	).toThrow(/ConsentManager/u);
});
