// Layout assertions below need the documented app-level stylesheet: class
// maps carry no CSS of their own.
import '@inth/sdk/ui/styles.css';
import type { ConsentKernel, KernelConfig } from '@inth/sdk/engine';
import {
	normalizePolicyRule,
	createPolicyRuleFingerprints,
} from '@inth/sdk/schema/types';
import type { PolicyResolution, PolicyRule } from '@inth/sdk/schema/types';
import { useContext, useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { ConsentDialog } from '../aggregate-components';
import { ConsentDialogTrigger } from '../components/panel-trigger';
import { ConsentBanner } from '../components/prompt';
import { CardSurface } from '../components/prompt/card-surface';
import { DrawerSurface } from '../components/prompt/drawer-surface';
import { PromptContainersContext } from '../components/prompt/prompt';
import { BannerSurface } from '../components/prompt/strip';
import { KernelContext } from '../context';
import { ConsentDraftProvider, useConsentDraft } from '../draft';
import { InthProvider } from '../provider';
import { consentMarkup } from './consent-markup';
import { transportMode } from './fixtures/transport-mode';

const EAGER_CONTAINERS = {
	banner: BannerSurface,
	card: CardSurface,
	drawer: DrawerSurface,
};

const now = Date.now();
const resolution = (input: Partial<PolicyRule> = {}): PolicyResolution => {
	const policy = normalizePolicyRule({
		categories: ['marketing', 'measurement'],
		id: 'test',
		match: { fallback: true },
		model: 'opt-in',
		prompt: 'choice',
		scopeMode: 'strict',
		...input,
	});
	return {
		fingerprints: createPolicyRuleFingerprints(policy),
		matchedBy: 'fallback',
		policy,
		policyId: policy.id,
		status: 'matched',
	};
};
let kernel: ConsentKernel;
const Capture = () => {
	const value = useContext(KernelContext);
	useEffect(() => {
		if (value) {
			kernel = value;
		}
	}, [value]);
	return null;
};
const DraftProbe = () => {
	const draft = useConsentDraft();
	return (
		<>
			<output data-testid="draft">
				{JSON.stringify({
					dirty: draft.isDirty,
					stale: draft.isStale,
					values: draft.values,
				})}
			</output>
			<button
				type="button"
				onClick={() => draft.set('marketing', true)}
			>
				Select marketing
			</button>
			<button
				type="button"
				onClick={() => draft.set('necessary', false)}
			>
				Change necessary
			</button>
			<button
				type="button"
				onClick={() => draft.save()}
			>
				Save draft
			</button>
		</>
	);
};
afterEach(() => vi.restoreAllMocks());
describe('policy presentation reference behavior', () => {
	it('dismisses a nonblocking notice without consent callbacks or requests', async () => {
		const choice = vi.fn();
		const save = vi.fn();
		const init = vi.fn();
		const screen = await render(
			<InthProvider
				options={{
					callbacks: { onChoiceRecorded: choice },
					mode: transportMode({ init, save }),
					persistence: false,
					prefetch: {
						initialPolicyResolution: resolution({
							model: 'opt-out',
							prompt: 'notice',
						}),
						now,
					},
				}}
			>
				<Capture />
				<ConsentBanner />
				<ConsentDialogTrigger />
			</InthProvider>
		);
		await expect
			.element(screen.getByTestId('consent-banner-dismiss-button'))
			.toBeVisible();
		expect(
			document.querySelector('[data-testid="consent-banner-accept-button"]')
		).toBeNull();
		expect(
			document.querySelector('[data-testid="consent-banner-overlay"]')
		).toBeNull();
		await screen.getByTestId('consent-banner-dismiss-button').click();
		expect(
			kernel.getSnapshot().noticeDismissal?.dismissedAt
		).toBeGreaterThanOrEqual(now);
		expect(kernel.getSnapshot().explicitChoice).toBeNull();
		expect(choice).not.toHaveBeenCalled();
		expect(save).not.toHaveBeenCalled();
		expect(init).not.toHaveBeenCalled();
	});
	it('seeds GPC-restricted choices off and saves only displayed categories', async () => {
		const policy = resolution({
			privacySignals: { gpc: { denyCategories: ['marketing'] } },
		});
		if (policy.status !== 'matched') {
			throw new Error('Fixture must match');
		}
		const initial: KernelConfig = {
			initialPolicyResolution: policy,
			initialPrivacySignals: { gpc: true },
			initialRecords: {
				choice: {
					categories: {
						marketing: {
							basis: {
								fingerprint: policy.fingerprints.choice,
								kind: 'choice-v1',
							},
							confirmedAt: now - 1,
							value: true,
						},
					},
					version: 3,
				},
			},
			now,
		};
		const choice = vi.fn();
		const screen = await render(
			<InthProvider
				options={{
					callbacks: { onChoiceRecorded: choice },
					mode: transportMode({}),
					persistence: false,
					prefetch: initial,
				}}
			>
				<Capture />
				<ConsentDraftProvider>
					<DraftProbe />
				</ConsentDraftProvider>
			</InthProvider>
		);
		await expect
			.element(screen.getByTestId('draft'))
			.toHaveTextContent('"marketing":false');
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		await screen.getByRole('button', { name: 'Select marketing' }).click();
		await expect
			.element(screen.getByTestId('draft'))
			.toHaveTextContent('"marketing":false');
		await screen.getByRole('button', { name: 'Change necessary' }).click();
		await screen.getByRole('button', { name: 'Save draft' }).click();
		expect(choice).toHaveBeenCalledTimes(1);
		expect(choice.mock.calls[0]?.[0].confirmed).toEqual([
			'measurement',
			'marketing',
		]);
		expect(
			kernel.getSnapshot().explicitChoice?.categories.marketing?.value
		).toBe(false);
		expect(
			kernel.getSnapshot().explicitChoice?.categories.functionality
		).toBeUndefined();
	});
	it('requires review when a material policy changes during a dirty draft', async () => {
		let policy = resolution();
		const choice = vi.fn();
		const screen = await render(
			<InthProvider
				options={{
					callbacks: { onChoiceRecorded: choice },
					mode: transportMode({
						init: () => Promise.resolve({ policyResolution: policy }),
					}),
					persistence: false,
					prefetch: { initialPolicyResolution: policy, now },
				}}
			>
				<Capture />
				<ConsentDraftProvider>
					<DraftProbe />
				</ConsentDraftProvider>
			</InthProvider>
		);
		await screen.getByRole('button', { name: 'Select marketing' }).click();
		policy = resolution({ copyRevision: 'changed' });
		await kernel.commands.init();
		await screen.getByRole('button', { name: 'Save draft' }).click();
		await expect
			.element(screen.getByTestId('draft'))
			.toHaveTextContent('"stale":true');
		expect(choice).not.toHaveBeenCalled();
		expect(kernel.getSnapshot().explicitChoice).toBeNull();
	});
	it('keeps preferences reachable before a choice and preserves a required notice after saving', async () => {
		const screen = await render(
			<InthProvider
				options={{
					mode: transportMode({}),
					persistence: false,
					prefetch: {
						initialPolicyResolution: resolution({
							model: 'opt-out',
							prompt: 'notice',
						}),
						now,
					},
					reloadOnConsentRevoked: false,
				}}
			>
				<Capture />
				<ConsentBanner />
				<ConsentDialogTrigger />
				<ConsentDialog />
			</InthProvider>
		);
		const trigger = document.querySelector<HTMLButtonElement>(
			'[data-testid="consent-dialog-trigger"] button, button[data-testid="consent-dialog-trigger"]'
		);
		expect(trigger).not.toBeNull();
		trigger?.click();
		// The trigger opts out in one step and opens the dialog on its
		// receipt (RCPT-01).
		await expect
			.element(screen.getByTestId('consent-dialog-receipt'))
			.toBeVisible();
		await screen.getByTestId('consent-dialog-done').click();
		// The opt-out the trigger recorded acknowledges the notice.
		expect(kernel.getSnapshot().promptRequirement.kind).toBe('none');
		expect(kernel.getSnapshot().noticeDismissal).not.toBeNull();
	});
});

it('hydrates prepared server HTML without a prompt flash, callback, request or record write', async () => {
	const { renderToString } = await import('react-dom/server');
	const { hydrateRoot } = await import('react-dom/client');
	const { readStoredRecordsFromCookieHeader } =
		await import('@inth/sdk/modules/persistence');
	const clock = Date.now();
	const initialPolicyResolution = resolution({
		model: 'opt-out',
		prompt: 'notice',
	});
	const initialRecords = readStoredRecordsFromCookieHeader(
		document.cookie,
		undefined,
		clock
	);
	const init = vi.fn();
	const onChoiceRecorded = vi.fn();
	const onPermissionsChanged = vi.fn();
	const setItem = vi.spyOn(Storage.prototype, 'setItem');
	const errors = vi.spyOn(console, 'error');
	// A streaming server render waits for the container's chunk; this
	// one-pass render is handed the containers already loaded, as the
	// static banner's build is.
	const app = (
		<InthProvider
			options={{
				callbacks: { onChoiceRecorded, onPermissionsChanged },
				mode: transportMode({ init }),
				prefetch: { initialPolicyResolution, initialRecords, now: clock },
			}}
		>
			<PromptContainersContext.Provider value={EAGER_CONTAINERS}>
				<ConsentBanner />
			</PromptContainersContext.Provider>
		</InthProvider>
	);
	const host = document.createElement('div');
	host.innerHTML = renderToString(app);
	const before = consentMarkup(host);
	document.body.append(host);
	const root = hydrateRoot(host, app);
	// oxlint-disable-next-line promise/avoid-new -- Allow hydration effects to flush before asserting their absence.
	await new Promise<void>((resolve) => {
		setTimeout(resolve, 30);
	});
	expect(consentMarkup(host)).toBe(before);
	expect(
		host.querySelector('[data-testid="consent-banner-dismiss-button"]')
	).not.toBeNull();
	expect(onChoiceRecorded).not.toHaveBeenCalled();
	expect(onPermissionsChanged).not.toHaveBeenCalled();
	expect(init).not.toHaveBeenCalled();
	// A first visit stores nothing.
	expect(setItem).not.toHaveBeenCalled();
	expect(errors).not.toHaveBeenCalled();
	root.unmount();
	host.remove();
});

it('diagnoses theme overrides that give equivalent actions unequal prominence', async () => {
	const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
	const screen = await render(
		<InthProvider
			options={{
				mode: transportMode({}),
				persistence: false,
				prefetch: { initialPolicyResolution: resolution() },
				theme: {
					consentActions: {
						accept: { mode: 'filled', variant: 'primary' },
						reject: { mode: 'ghost', variant: 'neutral' },
					},
				},
			}}
		>
			<ConsentBanner />
		</InthProvider>
	);
	await expect
		.element(screen.getByTestId('consent-banner-accept-button'))
		.toBeVisible();
	expect(
		warning.mock.calls.some(([message]) =>
			String(message).includes('different prominence')
		)
	).toBe(true);
});

it('starts real expiry timers for prepared records without replaying choice or writing storage', async () => {
	const clock = Date.now();
	const policy = resolution({
		categories: ['marketing'],
		validity: { choiceDays: 1 },
	});
	if (policy.status !== 'matched') {
		throw new Error('Expected matched policy');
	}
	const onChoiceRecorded = vi.fn();
	const onPermissionsChanged = vi.fn();
	const writes = vi.spyOn(Storage.prototype, 'setItem');
	const screen = await render(
		<InthProvider
			options={{
				callbacks: { onChoiceRecorded, onPermissionsChanged },
				mode: transportMode({}),
				persistence: false,
				prefetch: {
					initialPolicyResolution: policy,
					initialRecords: {
						choice: {
							categories: {
								marketing: {
									basis: {
										fingerprint: policy.fingerprints.choice,
										kind: 'choice-v1',
									},
									confirmedAt: clock - 86_400_000 + 2500,
									value: true,
								},
							},
							version: 3,
						},
					},
					now: clock,
				},
			}}
		>
			<Capture />
			<ConsentBanner />
		</InthProvider>
	);
	// The stored choice still holds, so nothing is owed yet.
	expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
	await expect
		.element(screen.getByTestId('consent-banner-accept-button'))
		.toBeVisible();
	expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
	expect(onChoiceRecorded).not.toHaveBeenCalled();
	expect(onPermissionsChanged).toHaveBeenCalledTimes(1);
	expect(writes).not.toHaveBeenCalled();
});
