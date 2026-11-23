/**
 * The consent prompt renders on the server. A server has no
 * global `document`, so anything that touches the page outside a
 * browser-only hook throws there. This process renders under jsdom, whose
 * `document` Angular's own adapter also reads, so the render watches the
 * global page instead: the server render must not listen on it.
 */
import {
	ChangeDetectionStrategy,
	Component,
	provideZonelessChangeDetection,
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
	provideServerRendering,
	renderApplication,
} from '@angular/platform-server';
import type { ConsentContainer } from '@inth/sdk/engine';
import {
	createPolicyRuleFingerprints,
	normalizePolicyRule,
} from '@inth/sdk/schema/types';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { testOptions } from '../../__tests__/test-local';
import { provideInth } from '../core/provide-inth';
import { ConsentBanner } from './prompt';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner],
	selector: 'app-root',
	template: '<inth-consent-banner />',
})
class App {}

const policy = normalizePolicyRule({
	id: 'pc-ssr',
	match: { fallback: true },
	model: 'opt-in',
	prompt: 'choice',
	scopeMode: 'permissive',
});

const render = (container: ConsentContainer, blockUntilChoice = false) =>
	renderApplication(
		(context) =>
			bootstrapApplication(
				App,
				{
					providers: [
						provideZonelessChangeDetection(),
						provideServerRendering(),
						provideInth({
							...testOptions(),
							persistence: false,
							prefetch: {
								initialPolicyResolution: {
									fingerprints: createPolicyRuleFingerprints(policy),
									matchedBy: 'fallback',
									policy,
									policyId: policy.id,
									status: 'matched',
								},
							},
							presentation: {
								prompt: { blockUntilChoice, container },
							},
						}),
					],
				},
				context
			),
		{
			document: '<html><head></head><body><app-root></app-root></body></html>',
			url: '/',
		}
	);

afterEach(() => {
	vi.restoreAllMocks();
});

describe('server render', () => {
	test.each([
		['card', { type: 'card' }, false],
		['blocking card', { type: 'card' }, true],
		['side drawer', { position: 'right', type: 'drawer' }, false],
		['banner', { type: 'banner' }, false],
	] as const)(
		'renders the %s without touching the page',
		async (_name, container, blocking) => {
			const listen = vi.spyOn(document, 'addEventListener');
			const html = await render(container as ConsentContainer, blocking);
			expect(html).toContain('data-testid="consent-banner-root"');
			expect(html).toContain('data-testid="consent-banner-card"');
			expect(listen.mock.calls.map(([type]) => type)).not.toContain('keydown');
		}
	);
});
