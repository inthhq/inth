import { OPT_OUT_REPROMPT_WAIT_MS, policyRulePresets } from '@inth/sdk-core';
import type {
	LiftOptOutPayload,
	LiftOptOutTransportResult,
	ProviderTransportFactory,
} from '@inth/sdk-core';
import { createTestingMode } from '@inth/sdk-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestingConsentClient as createConsentClient } from '../testing-global';
import type {
	ConsentClient,
	ConsentUIHandle,
	ConsentUIOptions,
} from '../types';
import { mountConsentUI } from '../ui/mount';

const clients: ConsentClient[] = [];

const clearCookies = function clearCookies(): void {
	for (const entry of document.cookie.split(';')) {
		const name = entry.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	}
};

const mount = async function mount(
	ui: ConsentUIOptions = {},
	options: Parameters<typeof createConsentClient>[0] = {}
): Promise<{
	client: ConsentClient;
	handle: ConsentUIHandle;
	root: ParentNode;
}> {
	const client = createConsentClient(
		{
			consentCategories: ['functionality', 'marketing', 'measurement'],
			ui: { disableAnimation: true, styles: false, ...ui },
			...options,
		},
		{ mountUI: mountConsentUI, pkg: '@inth/sdk/test' }
	);
	clients.push(client);
	client.start();
	await client.ready();
	const handle = client.ui as ConsentUIHandle;
	return { client, handle, root: handle.root };
};

const query = function query<ElementType extends HTMLElement = HTMLElement>(
	root: ParentNode,
	testId: string
): ElementType {
	const element = root.querySelector<ElementType>(`[data-testid="${testId}"]`);
	if (!element) {
		throw new Error(`missing ${testId}`);
	}
	return element;
};

afterEach(() => {
	for (const client of clients.splice(0)) {
		client.dispose();
	}
	localStorage.clear();
	sessionStorage.clear();
	clearCookies();
	document.body.replaceChildren();
});

const choiceOptOutPolicy = [
	{
		...policyRulePresets.usPrivacyStatesOptOut(),
		id: 'us-opt-out-choice',
		prompt: 'choice' as const,
	},
];

const noticeOptOutPolicy = [
	{
		...policyRulePresets.usPrivacyStatesOptOut(),
		id: 'us-opt-out-notice',
		prompt: 'notice' as const,
		validity: { noticeDays: 1 },
	},
];

const optInPolicy = [
	{
		...policyRulePresets.europeOptIn(),
		categories: ['functionality', 'marketing', 'measurement'] as (
			| 'functionality'
			| 'marketing'
			| 'measurement'
		)[],
		match: { isDefault: true },
		scopeMode: 'strict' as const,
	},
];

const mountOptedOut = function mountOptedOut(
	params: {
		gpc?: boolean;
		heldBy?: 'device' | 'person';
		mode?: ProviderTransportFactory;
		policy?:
			| typeof noticeOptOutPolicy
			| typeof choiceOptOutPolicy
			| typeof optInPolicy;
		rightsConfirmed?: boolean;
	} = {}
) {
	const now = Date.now();
	const gpc = params.gpc ?? false;
	return mount(
		{},
		{
			mode: params.mode,
			overrides: { country: 'US', gpc, region: 'CA' },
			policy: params.policy ?? noticeOptOutPolicy,
			prefetch: {
				initialPrivacySignals: { gpc },
				initialRecords: {
					optOut: {
						heldBy: params.heldBy ?? 'device',
						method: gpc ? 'gpc' : 'button',
						recordedAt: now - 1000,
						rights: ['sale', 'share'],
					},
					optOutRightsConfirmed: params.rightsConfirmed ?? false,
				},
				now,
			},
			reloadOnConsentRevoked: false,
		}
	);
};

describe('never ask an opted-out visitor to opt back in automatically (script-tag)', () => {
	it('3a: opt-out policy with choice prompt does not reopen the banner on the next load after a one-click opt-out', async () => {
		const { client, root } = await mountOptedOut({
			policy: choiceOptOutPolicy,
		});

		expect(client.getSnapshot().optOut).not.toBeNull();
		expect(client.getSnapshot().explicitChoice).toBeNull();
		expect(client.getSnapshot().promptRequirement).toEqual({ kind: 'none' });
		expect(client.getSnapshot().activeUI).toBe('none');
		expect(
			root.querySelector('[data-testid="consent-banner-root"]')
		).toBeNull();
	});

	it('3b: opt-out notice returning after expiry or fingerprint change offers no granting action before optInPromptAllowedAt', async () => {
		const now = Date.now();
		const recordedAt = now - Math.floor(OPT_OUT_REPROMPT_WAIT_MS / 2);
		const { client, root } = await mount(
			{},
			{
				overrides: { country: 'US', gpc: false, region: 'CA' },
				policy: noticeOptOutPolicy,
				prefetch: {
					initialRecords: {
						noticeDismissal: {
							dismissedAt: now - 120_000,
							fingerprint: 'stale-notice-fingerprint',
							version: 1,
						},
						optOut: {
							heldBy: 'device',
							method: 'button',
							recordedAt,
							rights: ['sale', 'share'],
						},
					},
					now,
				},
			}
		);

		expect(client.getSnapshot().promptRequirement.kind).toBe('notice');
		expect(
			root.querySelector('[data-testid="consent-banner-root"]')
		).not.toBeNull();
		expect(
			root.querySelector('[data-testid="consent-banner-accept-button"]')
		).toBeNull();
		expect(
			root.querySelector('[data-testid="consent-banner-dismiss-button"]')
		).not.toBeNull();
	});

	it('3c: GPC opt-out persists after GPC turns off, keeps marketing off, shows opted-out block, and opens no prompt', async () => {
		const now = Date.now();
		const { client, root } = await mount(
			{},
			{
				overrides: { country: 'US', gpc: false, region: 'CA' },
				policy: choiceOptOutPolicy,
				prefetch: {
					initialPrivacySignals: { gpc: false },
					initialRecords: {
						optOut: {
							heldBy: 'device',
							method: 'gpc',
							recordedAt: now - 5000,
							rights: ['sale', 'share'],
						},
					},
					now,
				},
			}
		);

		expect(client.getSnapshot().optOut?.method).toBe('gpc');
		expect(client.getSnapshot().privacySignals.gpc.active).toBe(false);
		expect(client.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(client.getSnapshot().activeUI).toBe('none');
		expect(
			root.querySelector('[data-testid="consent-banner-root"]')
		).toBeNull();

		client.openDialog();
		await vi.waitFor(() => {
			expect(
				root.querySelector('[data-testid="consent-widget-opt-out-status"]')
			).not.toBeNull();
		});
		expect(
			root.querySelector('[data-testid="consent-widget-opt-out-button"]')
		).toBeNull();
	});
});

describe('two-step opt-in confirmation (script-tag)', () => {
	it('opt back in link requires separate confirmation, focuses cancel first, stays outside dialog content, and lifts on confirm', async () => {
		const { client, root } = await mountOptedOut();
		client.openDialog();
		await vi.waitFor(() => {
			expect(
				root.querySelector('[data-testid="consent-widget-opt-in-link"]')
			).not.toBeNull();
		});

		query(root, 'consent-widget-opt-in-link').click();

		await vi.waitFor(() => {
			expect(
				root.querySelector('[data-testid="opt-in-confirmation-root"]')
			).not.toBeNull();
		});
		expect(client.getSnapshot().optOut).not.toBeNull();
		expect(client.getSnapshot().effectivePermissions.marketing).toBe(false);

		const confirmation = query(root, 'opt-in-confirmation-root');
		const dialogContent = query(root, 'consent-dialog-content');
		expect(dialogContent.contains(confirmation)).toBe(false);
		expect(confirmation.getAttribute('role')).toBe('dialog');
		expect(confirmation.getAttribute('aria-modal')).toBe('true');

		const description = query(root, 'opt-in-confirmation-description');
		expect(description.textContent?.toLowerCase()).not.toMatch(
			/sale|sharing|targeted/u
		);

		const cancelButton = query<HTMLButtonElement>(
			root,
			'opt-in-confirmation-cancel-button'
		);
		await vi.waitFor(() => {
			const active =
				(root as ShadowRoot).activeElement ?? document.activeElement;
			expect(active).toBe(cancelButton);
		});

		query(root, 'opt-in-confirmation-confirm-button').click();
		await vi.waitFor(() => {
			expect(client.getSnapshot().optOut).toBeNull();
		});
		expect(client.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(
			root.querySelector('[data-testid="opt-in-confirmation-root"]')
		).toBeNull();
	});

	it('opt-in confirmation description names confirmed rights once answered by the backend', async () => {
		const { client, root } = await mountOptedOut({ rightsConfirmed: true });
		client.openDialog();
		await vi.waitFor(() => {
			expect(
				root.querySelector('[data-testid="consent-widget-opt-in-link"]')
			).not.toBeNull();
		});
		query(root, 'consent-widget-opt-in-link').click();
		await vi.waitFor(() => {
			expect(
				root.querySelector('[data-testid="opt-in-confirmation-root"]')
			).not.toBeNull();
		});

		const text =
			query(
				root,
				'opt-in-confirmation-description'
			).textContent?.toLowerCase() ?? '';
		expect(text).toContain('sale');
		expect(text).toContain('sharing');
		expect(text).not.toContain('targeted');

		query(root, 'opt-in-confirmation-cancel-button').click();
	});

	it('opt back in link then cancel (button and Escape) leaves opt-out held, saves nothing, and keeps dialog open', async () => {
		const { client, root } = await mountOptedOut();
		client.openDialog();
		await vi.waitFor(() => {
			expect(
				root.querySelector('[data-testid="consent-widget-opt-in-link"]')
			).not.toBeNull();
		});

		query(root, 'consent-widget-opt-in-link').click();
		await vi.waitFor(() => {
			expect(
				root.querySelector('[data-testid="opt-in-confirmation-root"]')
			).not.toBeNull();
		});

		query(root, 'opt-in-confirmation-cancel-button').click();
		expect(
			root.querySelector('[data-testid="opt-in-confirmation-root"]')
		).toBeNull();
		expect(client.getSnapshot().optOut).not.toBeNull();
		expect(client.getSnapshot().explicitChoice).toBeNull();
		expect(client.getSnapshot().activeUI).toBe('dialog');

		// Cancel via Escape.
		query(root, 'consent-widget-opt-in-link').click();
		await vi.waitFor(() => {
			expect(
				root.querySelector('[data-testid="opt-in-confirmation-root"]')
			).not.toBeNull();
		});
		document.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
		);
		expect(
			root.querySelector('[data-testid="opt-in-confirmation-root"]')
		).toBeNull();
		expect(client.getSnapshot().optOut).not.toBeNull();
		expect(client.getSnapshot().explicitChoice).toBeNull();
		expect(client.getSnapshot().activeUI).toBe('dialog');
	});

	it('Accept All in the dialog defers save until confirmed, then lifts opt-out and grants categories', async () => {
		const { client, root } = await mountOptedOut();
		client.openDialog();
		await vi.waitFor(() => {
			expect(
				root.querySelector(
					'[data-testid="consent-widget-footer-accept-all-button"]'
				)
			).not.toBeNull();
		});

		query(root, 'consent-widget-footer-accept-all-button').click();
		await vi.waitFor(() => {
			expect(
				root.querySelector('[data-testid="opt-in-confirmation-root"]')
			).not.toBeNull();
		});
		expect(client.getSnapshot().optOut).not.toBeNull();
		expect(client.getSnapshot().explicitChoice).toBeNull();
		expect(client.getSnapshot().activeUI).toBe('dialog');

		query(root, 'opt-in-confirmation-confirm-button').click();
		await vi.waitFor(() => {
			expect(client.getSnapshot().optOut).toBeNull();
		});
		expect(client.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(client.getSnapshot().effectivePermissions.measurement).toBe(true);
		expect(client.getSnapshot().activeUI).not.toBe('dialog');
	});

	it('Accept All in a banner defers save until confirmed, then lifts opt-out and grants categories', async () => {
		const { client, root } = await mountOptedOut({
			policy: choiceOptOutPolicy,
		});
		client.showBanner();
		await vi.waitFor(() => {
			expect(
				root.querySelector('[data-testid="consent-banner-accept-button"]')
			).not.toBeNull();
		});

		query(root, 'consent-banner-accept-button').click();
		await vi.waitFor(() => {
			expect(
				root.querySelector('[data-testid="opt-in-confirmation-root"]')
			).not.toBeNull();
		});
		expect(client.getSnapshot().optOut).not.toBeNull();
		expect(client.getSnapshot().explicitChoice).toBeNull();

		query(root, 'opt-in-confirmation-confirm-button').click();
		await vi.waitFor(() => {
			expect(client.getSnapshot().optOut).toBeNull();
		});
		expect(client.getSnapshot().effectivePermissions.marketing).toBe(true);
	});

	it('turning Marketing on then Save opens confirmation and cancelling leaves opt-out held', async () => {
		const { client, root } = await mountOptedOut();
		client.openDialog();
		await vi.waitFor(() => {
			expect(
				root.querySelector('[data-testid="consent-widget-switch-marketing"]')
			).not.toBeNull();
		});

		query(root, 'consent-widget-switch-marketing').click();
		query(root, 'consent-widget-footer-save-button').click();

		await vi.waitFor(() => {
			expect(
				root.querySelector('[data-testid="opt-in-confirmation-root"]')
			).not.toBeNull();
		});
		expect(client.getSnapshot().optOut).not.toBeNull();
		expect(client.getSnapshot().explicitChoice).toBeNull();

		query(root, 'opt-in-confirmation-cancel-button').click();
		expect(
			root.querySelector('[data-testid="opt-in-confirmation-root"]')
		).toBeNull();
		expect(client.getSnapshot().optOut).not.toBeNull();
		expect(client.getSnapshot().explicitChoice).toBeNull();
		expect(client.getSnapshot().effectivePermissions.marketing).toBe(false);
	});

	it('saving without granting the deciding category completes with no confirmation', async () => {
		const { client, root } = await mountOptedOut();
		client.openDialog();
		await vi.waitFor(() => {
			expect(
				root.querySelector('[data-testid="consent-widget-switch-measurement"]')
			).not.toBeNull();
		});

		query(root, 'consent-widget-switch-measurement').click();
		query(root, 'consent-widget-footer-save-button').click();

		expect(client.getSnapshot().effectivePermissions.measurement).toBe(true);
		expect(
			root.querySelector('[data-testid="opt-in-confirmation-root"]')
		).toBeNull();
		expect(client.getSnapshot().optOut).not.toBeNull();
		expect(client.getSnapshot().effectivePermissions.marketing).toBe(false);
	});

	it('with active GPC signal there is no opt back in link', async () => {
		const { client, root } = await mountOptedOut({ gpc: true });
		client.openDialog();
		await vi.waitFor(() => {
			expect(
				root.querySelector('[data-testid="consent-widget-opt-out-status"]')
			).not.toBeNull();
		});
		expect(
			root.querySelector('[data-testid="consent-widget-opt-in-link"]')
		).toBeNull();
	});

	it('with held-by-account opt-out shows link and leaves opt-out held when backend refuses lift', async () => {
		const liftCalls: LiftOptOutPayload[] = [];
		const base = createTestingMode('@inth/sdk/test', {
			policy: noticeOptOutPolicy,
		}).transport;
		const refusingMode: ProviderTransportFactory = Object.assign(
			(context: Parameters<ProviderTransportFactory>[0]) => ({
				...base(context),
				liftOptOut: (
					payload: LiftOptOutPayload
				): Promise<LiftOptOutTransportResult> => {
					liftCalls.push(payload);
					return Promise.resolve({
						ok: true,
						optOut: {
							heldBy: 'person',
							method: 'button',
							recordedAt: payload.givenAt - 1000,
							rights: ['sale', 'share'],
						},
					});
				},
			}),
			{ kind: 'offline' as const }
		);
		const { client, root } = await mountOptedOut({
			heldBy: 'person',
			mode: refusingMode,
		});
		client.openDialog();
		await vi.waitFor(() => {
			expect(
				root.querySelector('[data-testid="consent-widget-opt-in-link"]')
			).not.toBeNull();
		});

		query(root, 'consent-widget-opt-in-link').click();
		await vi.waitFor(() => {
			expect(
				root.querySelector('[data-testid="opt-in-confirmation-root"]')
			).not.toBeNull();
		});
		expect(liftCalls).toHaveLength(0);

		query(root, 'opt-in-confirmation-confirm-button').click();
		await vi.waitFor(() => {
			expect(liftCalls).toHaveLength(1);
		});
		expect(client.getSnapshot().optOut?.heldBy).toBe('person');
		expect(client.getSnapshot().effectivePermissions.marketing).toBe(false);
	});

	it('under an opt-in policy with an opt-out held, Accept lifts in one step without confirmation', async () => {
		const { client, root } = await mountOptedOut({ policy: optInPolicy });
		client.openDialog();
		await vi.waitFor(() => {
			expect(
				root.querySelector(
					'[data-testid="consent-widget-footer-accept-all-button"]'
				)
			).not.toBeNull();
		});

		query(root, 'consent-widget-footer-accept-all-button').click();
		expect(client.getSnapshot().optOut).toBeNull();
		expect(
			root.querySelector('[data-testid="opt-in-confirmation-root"]')
		).toBeNull();
		expect(client.getSnapshot().effectivePermissions.marketing).toBe(true);
	});
});
