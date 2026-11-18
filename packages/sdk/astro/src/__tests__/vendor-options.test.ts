import {
	buildConsentManifestFromConfig,
	policyRulePresets,
} from '@inth/sdk/schema/types';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveOptions } from '../integration';
import { manifest as manifestMode } from '../mode';
import { clearManifestCache, resolveConsentContext } from '../server';
import { testing as testingMode } from '../testing';
import { testRule } from './policy-fixture';

afterEach(() => {
	clearManifestCache();
});

describe('the vendors option on the server', () => {
	it('asks about the categories code-declared vendors sit in, as the browser does', async () => {
		const inth = await resolveConsentContext({
			headers: new Headers(),
			options: resolveOptions({
				mode: testingMode({ policy: [testRule] }),
				vendors: [
					{
						category: 'measurement',
						id: 'posthog',
						name: 'PostHog',
						privacyPolicyUrl: 'https://posthog.com/privacy',
					},
				],
			}),
		});
		expect(inth.snapshot.evaluationPolicy.choiceScope).toEqual(['measurement']);
		expect(inth.shouldShowBanner).toBe(true);
	});
});

describe('vendors from the backend manifest', () => {
	it('reach the page config beside the code-declared ones', async () => {
		const manifest = await buildConsentManifestFromConfig({
			policyRules: [policyRulePresets.europeOptIn()],
			vendors: [
				{
					category: 'marketing',
					id: 'x-pixel',
					name: 'X Pixel',
					privacyPolicyUrl: 'https://x.com/en/privacy',
				},
			],
		});
		const inth = await resolveConsentContext({
			headers: new Headers({ 'x-vercel-ip-country': 'DE' }),
			options: resolveOptions({
				mode: manifestMode({ snapshot: manifest }),
				projectUrl: 'https://consent.example.com',
				vendors: [
					{
						category: 'measurement',
						id: 'posthog',
						name: 'PostHog',
						privacyPolicyUrl: 'https://posthog.com/privacy',
					},
				],
			}),
		});
		expect(
			inth.config.initialVendors?.declared.map((vendor) => vendor.id)
		).toEqual(['x-pixel']);
		expect(inth.snapshot.evaluationPolicy.choiceScope).toEqual(
			expect.arrayContaining(['marketing', 'measurement'])
		);
	});
});
