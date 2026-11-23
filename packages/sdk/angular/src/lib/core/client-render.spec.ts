/**
 * A page rendered in the browser alone, with no server boot: the surfaces
 * render their copy on the first render, before the engine's chunk loads;
 * an app that hands over a `prefetch` gets its banner in the first render,
 * as bootstrap waits for the engine.
 */
import {
	ApplicationRef,
	ChangeDetectionStrategy,
	Component,
	provideZonelessChangeDetection,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { createApplication } from '@angular/platform-browser';
import type { RuntimePrefetch } from '@inth/sdk/runtime';
import {
	createPolicyRuleFingerprints,
	normalizePolicyRule,
} from '@inth/sdk/schema/types';
import { afterEach, describe, expect, test } from 'vitest';

import { testOptions } from '../../__tests__/test-local';
import { ConsentBanner } from '../banner/consent-banner';
import { Branding } from '../shared/branding';
import { provideInth } from './provide-inth';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [Branding, ConsentBanner],
	selector: 'test-host',
	template: `<a
			inth-branding
			surface="dialog"
		></a>
		<inth-consent-banner [disableAnimation]="true" />`,
})
class Host {}

const policy = normalizePolicyRule({
	id: 'csr',
	match: { fallback: true },
	model: 'opt-in',
	prompt: 'choice',
	scopeMode: 'permissive',
});

const firstRender = (prefetch?: RuntimePrefetch) => {
	TestBed.configureTestingModule({
		providers: [provideInth({ ...testOptions(), prefetch })],
	});
	const fixture = TestBed.createComponent(Host);
	fixture.detectChanges();
	return document.body;
};

const resolvedPrefetch = (): RuntimePrefetch => ({
	initialPolicyResolution: {
		fingerprints: createPolicyRuleFingerprints(policy),
		matchedBy: 'fallback',
		policy,
		policyId: policy.id,
		status: 'matched',
	},
});

afterEach(() => {
	TestBed.resetTestingModule();
	document.body.replaceChildren();
});

describe('client-only first render', () => {
	test('renders the stock copy before the engine loads', () => {
		const root = firstRender();
		expect(
			root.querySelector('[data-testid="consent-dialog-branding"]')?.textContent
		).toContain('Consent by');
	});

	test('bootstraps a page with a prefetch with its banner in the first render', async () => {
		const appRef = await createApplication({
			providers: [
				provideZonelessChangeDetection(),
				provideInth({ ...testOptions(), prefetch: resolvedPrefetch() }),
			],
		});
		const host = document.createElement('test-host');
		document.body.append(host);
		appRef.bootstrap(Host, host);
		appRef.tick();
		expect(
			document.querySelector('[data-testid="consent-banner-title"]')
				?.textContent
		).toContain('We value your privacy');
		appRef.destroy();
	});

	test('shows a banner the prefetch resolves once bootstrap is done', async () => {
		const root = firstRender({
			initialPolicyResolution: {
				fingerprints: createPolicyRuleFingerprints(policy),
				matchedBy: 'fallback',
				policy,
				policyId: policy.id,
				status: 'matched',
			},
		});
		await TestBed.inject(ApplicationRef).whenStable();
		expect(
			root.querySelector('[data-testid="consent-banner-title"]')?.textContent
		).toContain('We value your privacy');
	});
});
