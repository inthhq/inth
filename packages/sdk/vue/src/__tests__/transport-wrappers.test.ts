import type { HydrationRecords, HydrationResult } from '@inth/sdk/engine';
import { clientMode } from '@inth/sdk/runtime/client-mode';
import {
	createPolicyRuleFingerprints,
	normalizePolicyRule,
	writePolicyResolutionWire,
} from '@inth/sdk/schema/types';
import { translations } from '@inth/sdk/translations/en';
import { hosted } from '@inth/sdk/transports';
import { afterEach, expect, test, vi } from 'vitest';

import { createVueConsentKernelContext } from '../runtime/kernel';
import { manifest } from '../runtime/modes';
import type { ProviderTransportFactory } from '../runtime/modes';

/**
 * `hydrate` applies stored records the way persistence does. It is a verb
 * only core's own modules call, so it is not on `ConsentKernel`.
 */
const hydrateRecords = <KernelType extends object>(
	kernel: KernelType,
	records: HydrationRecords
): HydrationResult =>
	(
		kernel as KernelType & {
			hydrate: (input: HydrationRecords) => HydrationResult;
		}
	).hydrate(records);

type FetchRequest = (
	...args: Parameters<typeof fetch>
) => ReturnType<typeof fetch>;

const now = 1_800_000_000_000;
const subjectId = 'backend+literal';
const linkURL = '/api/review/v1/subjects/backend%2Bliteral/link';
const linkedId = '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c';
const policy = normalizePolicyRule({
	categories: ['marketing', 'measurement'],
	id: 'vue-transport',
	match: { fallback: true },
	model: 'opt-out',
	privacySignals: { gpc: { denyCategories: ['marketing'] } },
	prompt: 'notice',
	scopeMode: 'permissive',
});
const fingerprints = createPolicyRuleFingerprints(policy);
const prefetch = {
	branding: 'inth' as const,
	location: { countryCode: 'DE', regionCode: null },
	policyResolution: writePolicyResolutionWire({
		fingerprints,
		matchedBy: 'fallback',
		policy,
		policyId: policy.id,
		status: 'matched',
	}),
	subjectId,
	translations: { language: 'en', translations },
};
/** Each mode a Vue or Nuxt app can run, built around the test's fetch. */
const modes: [
	string,
	(fetch: typeof globalThis.fetch) => ProviderTransportFactory,
][] = [
	['hosted()', (fetch) => hosted({ fetch, projectUrl: '/api/review' })],
	['manifest()', (fetch) => manifest({ fetch, projectUrl: '/api/review' })],
	[
		'Nuxt manifest()',
		(fetch) => {
			// The Nuxt client mode uses the global fetch, as an app does.
			vi.stubGlobal('fetch', fetch);
			return clientMode(
				{ type: 'manifest' },
				{ projectUrl: '/api/review', routePrefix: '/api/inth' }
			);
		},
	],
];
const disposers: (() => void)[] = [];
afterEach(() => {
	for (const dispose of disposers.splice(0).reverse()) {
		dispose();
	}
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

// Use the public Vue context and real transports: injected kernel transports
// cannot detect methods lost by a framework wrapper.
test.each(modes)(
	'%s transport links an identity without writes',
	async (_name, createMode) => {
		vi.spyOn(Date, 'now').mockReturnValue(now);
		const fetchMock = vi.fn<FetchRequest>((url) =>
			Promise.resolve(
				Response.json(
					String(url) === linkURL
						? {
								externalId: 'person',
								subjectId: linkedId,
								verifiedBy: 'identity_token',
							}
						: {}
				)
			)
		);
		const onChoiceRecorded = vi.fn();
		const context = createVueConsentKernelContext({
			config: { callbacks: { onChoiceRecorded } },
			mode: createMode(Object.assign(fetchMock, { preconnect: vi.fn() })),
			now,
			prefetch,
		});
		disposers.push(context.dispose);
		hydrateRecords(context.kernel, {});
		await context.kernel.commands.identify({
			externalId: 'person',
			identityToken: 'token',
		});
		expect(
			fetchMock.mock.calls
				.filter(([url]) => String(url) === linkURL)
				.map(([, init]) => init?.method)
		).toEqual(['POST']);
		// Only a `sub_` id moves to the id a link answers.
		expect(context.snapshot.value.subject?.subjectId).toBe(subjectId);
		expect(onChoiceRecorded).not.toHaveBeenCalled();
	}
);

test.each(modes)(
	'%s transport keeps detected GPC in the browser',
	async (_name, createMode) => {
		vi.spyOn(Date, 'now').mockReturnValue(now);
		const fetchMock = vi.fn<FetchRequest>((url, init) =>
			Promise.resolve(
				Response.json(
					String(url) === linkURL && init?.method === 'POST'
						? { externalId: 'person', subjectId: linkedId }
						: {}
				)
			)
		);
		const onChoiceRecorded = vi.fn();
		const context = createVueConsentKernelContext({
			config: { callbacks: { onChoiceRecorded } },
			mode: createMode(Object.assign(fetchMock, { preconnect: vi.fn() })),
			now,
			prefetch,
		});
		disposers.push(context.dispose);
		hydrateRecords(context.kernel, {});
		await context.kernel.commands.identify({ externalId: 'person' });
		const requests = fetchMock.mock.calls.length;
		context.kernel.set.privacySignals({ gpc: true });
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 0);
		});
		expect(context.snapshot.value.privacySignals.gpc.active).toBe(true);
		expect(context.snapshot.value.effectivePermissions.marketing).toBe(false);
		expect(fetchMock.mock.calls).toHaveLength(requests);
		expect(context.snapshot.value.subject?.subjectId).toBe(subjectId);
		expect(onChoiceRecorded).not.toHaveBeenCalled();
	}
);
