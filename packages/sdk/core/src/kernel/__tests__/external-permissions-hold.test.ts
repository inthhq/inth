/**
 * @vitest-environment jsdom
 *
 * An external CMP owns the consent outcome, so the account hold does not
 * apply under it: the script loader, the iframe blocker and the network
 * blocker allow what the external permissions allow, as the category gate
 * does. Nor does the policy hold the script loader and the iframe blocker
 * add for `userConsent`.
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

// The policy hold in the script loader and the iframe blocker is the account
// layer's addition, so it gives way to an external CMP the same way. The
// network blocker's own policy hold is unchanged.
test.each([
	['set at construction', true],
	['set while the policy loads', false],
])(
	'external permissions start the scripts and iframes they allow while the policy is pending, %s',
	async (_name, atConstruction) => {
		const iframe = document.createElement('iframe');
		iframe.setAttribute('data-category', 'marketing');
		iframe.setAttribute('data-src', 'https://ads.example.test/frame');
		document.body.append(iframe);

		const kernel = createKernel({
			initialExternalPermissions: atConstruction ? { marketing: true } : {},
			initialPolicyPending: true,
			now: NOW,
		});
		if (!atConstruction) {
			kernel.set.externalPermissions({ marketing: true });
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
		const iframes = createIframeBlocker({ kernel });
		try {
			const snapshot = kernel.getSnapshot();
			expect(snapshot.policyPending).toBe(true);
			expect(evaluateCategoryGate({ category: 'marketing' }, snapshot)).toBe(
				true
			);

			await flushMacrotasks();

			expect(loaded).toEqual(['ads-script']);
			expect(iframe.getAttribute('src')).toBe('https://ads.example.test/frame');
		} finally {
			iframes.dispose();
			scripts.dispose();
			kernel.dispose();
		}
	}
);

test('with no external permissions, a pending policy still holds scripts and iframes', async () => {
	const iframe = document.createElement('iframe');
	iframe.setAttribute('data-category', 'necessary');
	iframe.setAttribute('data-vendor', 'ads');
	iframe.setAttribute('data-src', 'https://ads.example.test/frame');
	document.body.append(iframe);

	const kernel = createKernel({ initialPolicyPending: true, now: NOW });
	const loaded: string[] = [];
	const scripts = createScriptLoader({
		kernel,
		scripts: [
			{
				callbackOnly: true,
				category: 'necessary',
				id: 'vendor-script',
				onLoad: () => {
					loaded.push('vendor-script');
				},
				vendor: 'ads',
			},
		],
	});
	const iframes = createIframeBlocker({ kernel });
	try {
		await flushMacrotasks();

		expect(loaded).toEqual([]);
		expect(iframe.getAttribute('src')).toBeNull();
	} finally {
		iframes.dispose();
		scripts.dispose();
		kernel.dispose();
	}
});
