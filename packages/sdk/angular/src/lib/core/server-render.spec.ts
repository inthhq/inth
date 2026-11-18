import {
	ChangeDetectionStrategy,
	Component,
	inject,
	provideZonelessChangeDetection,
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
	provideServerRendering,
	renderApplication,
} from '@angular/platform-server';
import {
	createPolicyRuleFingerprints,
	normalizePolicyRule,
} from '@inth/sdk/schema/types';
import { describe, expect, test } from 'vitest';

import { testOptions } from '../../__tests__/test-local';
import { ConsentBanner } from '../banner/consent-banner';
import { ConsentManager } from './consent-manager';
import { BANNER_SHEETS, STYLE_ATTRIBUTE } from './consent-styles';
import { IfConsent } from './if-consent';
import { provideC15t } from './provide-c15t';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner, IfConsent],
	selector: 'app-root',
	template: `<p data-testid="ui">{{ consent.activeUI() }}</p>
		<p *c15tIfConsent="'measurement'; else off">on</p>
		<ng-template #off><p data-testid="off">off</p></ng-template>
		<c15t-consent-banner />`,
})
class App {
	protected readonly consent = inject(ConsentManager);
}

const policy = normalizePolicyRule({
	id: 'ssr',
	match: { fallback: true },
	model: 'opt-in',
	prompt: 'choice',
	scopeMode: 'permissive',
});

const render = (nonce?: string, persistence?: false) =>
	renderApplication(
		(context) =>
			bootstrapApplication(
				App,
				{
					providers: [
						provideZonelessChangeDetection(),
						provideServerRendering(),
						provideC15t({
							...testOptions(),
							nonce,
							persistence,
							prefetch: {
								initialPolicyResolution: {
									fingerprints: createPolicyRuleFingerprints(policy),
									matchedBy: 'fallback',
									policy,
									policyId: policy.id,
									status: 'matched',
								},
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

/** The boot the render left in `TransferState`. */
const bootOf = (html: string) =>
	(
		JSON.parse(
			/<script id="ng-state" type="application\/json">(?<state>.*?)<\/script>/su.exec(
				html
			)?.groups?.state ?? '{}'
		) as Record<string, { d?: number; s?: { activeUI?: string } } | undefined>
	)['c15t-boot'];

describe('server render', () => {
	test('renders from the prefetched snapshot without starting the runtime', async () => {
		const html = await render(undefined, false);
		expect(html).toContain('data-testid="ui">banner</p>');
		expect(html).toContain('data-testid="off"');
	});

	test('leaves the snapshot it rendered for the browser, which may load the engine later', async () => {
		const boot = bootOf(await render());
		expect(boot?.s?.activeUI).toBe('banner');
		// The banner asks for a choice the first-load code can record.
		expect(boot?.d).toBe(1);
	});

	test('keeps the engine at once without persistence, which a tap cannot record early', async () => {
		const boot = bootOf(await render(undefined, false));
		expect(boot?.s?.activeUI).toBe('banner');
		expect(boot?.d).toBeUndefined();
	});

	test('writes the surface stylesheets, with their text, into the head', async () => {
		const html = await render('abc123', false);
		for (const sheet of BANNER_SHEETS) {
			expect(html).toContain(`${STYLE_ATTRIBUTE}="${sheet.id}"`);
		}
		expect(html).toContain('nonce="abc123"');
		expect(html).not.toContain('data-c15t-pending');
	});
});
