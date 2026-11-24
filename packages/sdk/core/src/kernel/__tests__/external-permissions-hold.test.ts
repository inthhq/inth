/**
 * @vitest-environment jsdom
 *
 * An external CMP owns the consent outcome, so the account hold does not
 * apply under it: the script loader, the iframe blocker and the network
 * blocker allow what the external permissions allow, as the category gate
 * does.
 */
import { afterEach, expect, test, vi } from 'vitest';

import {
	matchedResolution,
	NOW,
	optInRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import { consentPending } from '../../consent-pending';
import { evaluateCategoryGate } from '../../modules/category-gate';
import { createIframeBlocker } from '../../modules/iframe-blocker';
import { createNetworkBlocker } from '../../modules/network-blocker';
import { createScriptLoader } from '../../modules/script-loader';
import { createKernel } from '../index';

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

const flushMacrotasks = () =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, 10);
	});

test.each([
	['set at construction', true],
	['armed afterwards', false],
])(
	'external permissions start what they allow with the account hold %s',
	async (_name, atConstruction) => {
		const fetchCalls: string[] = [];
		globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
			fetchCalls.push(String(input));
			return Promise.resolve(new Response('ok', { status: 200 }));
		}) as unknown as typeof fetch;
		const iframe = document.createElement('iframe');
		iframe.setAttribute('data-category', 'marketing');
		iframe.setAttribute('data-src', 'https://ads.example.test/frame');
		document.body.append(iframe);

		const kernel = createKernel({
			initialExternalPermissions: { marketing: true },
			initialPolicyResolution: matchedResolution(optInRule()),
			initialUser: { externalId: 'user_a' },
			initialUserConsentPending: atConstruction,
			now: NOW,
		});
		if (!atConstruction) {
			kernel.setUserConsentPending(true);
		}
		const loaded: string[] = [];
		const scripts = createScriptLoader({
			kernel,
			scripts: [
				{
					callbackOnly: true,
					category: 'marketing',
					id: 'ads-script',
					onLoad: () => {
						loaded.push('ads-script');
					},
				},
			],
		});
		const network = createNetworkBlocker({
			kernel,
			logBlockedRequests: false,
			rules: [{ category: 'marketing', domain: 'ads.example.test', id: 'ads' }],
		});
		const iframes = createIframeBlocker({ kernel });
		try {
			const snapshot = kernel.getSnapshot();
			expect(evaluateCategoryGate({ category: 'marketing' }, snapshot)).toBe(
				true
			);
			expect(consentPending(snapshot)).toBe(false);

			const response = await window.fetch('https://ads.example.test/pixel');
			await flushMacrotasks();

			expect(response.status).toBe(200);
			expect(fetchCalls).toEqual(['https://ads.example.test/pixel']);
			expect(loaded).toEqual(['ads-script']);
			expect(iframe.getAttribute('src')).toBe('https://ads.example.test/frame');
		} finally {
			iframes.dispose();
			network.dispose();
			scripts.dispose();
			kernel.dispose();
		}
	}
);
