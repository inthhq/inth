/**
 * Opting back in after an opt-out under an opt-out policy takes two steps
 * (11 CCR §7028(a)): in "Your Privacy Choices" the sale right's Allow opens
 * its confirmation in place, and an Accept from a page control opens the
 * separate opt-in confirmation the dialog hosts. Nothing lifts the opt-out
 * until the visitor confirms, and a banner commit never lifts it (PERM-02).
 */
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
} from '../consent-client.model';
import { mountConsentUI } from '../ui/mount-consent-ui';

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

const find = function find<ElementType extends HTMLElement = HTMLElement>(
	root: ParentNode,
	testId: string
): ElementType | null {
	return root.querySelector<ElementType>(`[data-testid="${testId}"]`);
};

const query = function query<ElementType extends HTMLElement = HTMLElement>(
	root: ParentNode,
	testId: string
): ElementType {
	const element = find<ElementType>(root, testId);
	if (!element) {
		throw new Error(`missing ${testId}`);
	}
	return element;
};

/** The focused element inside the UI's root, or on the page. */
const focused = (root: ParentNode): Element | null =>
	(root as ShadowRoot).activeElement ?? document.activeElement;

/** Open "Your Privacy Choices" and wait for its sale right to render. */
const openDialog = async function openDialog(
	client: ConsentClient,
	root: ParentNode
): Promise<void> {
	client.openDialog();
	await vi.waitFor(() => {
		expect(find(root, 'consent-dialog-rights-row-sale')).not.toBeNull();
	});
};

/** The sale right's in-place confirmation is open (not folded and inert). */
const confirmationOpen = function confirmationOpen(root: ParentNode): boolean {
	const panel = query(root, 'consent-dialog-confirm').closest('[data-open]');
	return panel?.getAttribute('data-open') === 'true';
};

/** A page control the client wires to Accept all (`data-inth-action`). */
const pageAccept = function pageAccept(): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.setAttribute('data-inth-action', 'accept');
	button.textContent = 'Accept all';
	document.body.append(button);
	return button;
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
		// The prompt loads once a choice is owed.
		await vi.waitFor(() => {
			expect(find(root, 'consent-banner-root')).not.toBeNull();
		});
		expect(find(root, 'consent-banner-accept-button')).toBeNull();
		expect(find(root, 'consent-banner-dismiss-button')).not.toBeNull();
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
		expect(find(root, 'consent-banner-root')).toBeNull();

		// Your Privacy Choices shows the opt-out as held: the protective
		// option is selected and the receipt confirms it.
		await openDialog(client, root);
		expect(
			query(root, 'consent-dialog-right-option-sale-protect').getAttribute(
				'aria-pressed'
			)
		).toBe('true');
		expect(
			query(root, 'consent-dialog-right-option-sale-allow').getAttribute(
				'aria-pressed'
			)
		).toBe('false');
		expect(
			query(root, 'consent-dialog-receipt').getAttribute('data-open')
		).toBe('true');
		expect(find(root, 'opt-in-confirmation-root')).toBeNull();
	});
});

describe('two-step opt-in confirmation (script-tag)', () => {
	it('Allow in Your Privacy Choices requires a separate confirmation, focuses cancel first, and lifts on confirm', async () => {
		const { client, root } = await mountOptedOut();
		await openDialog(client, root);
		expect(confirmationOpen(root)).toBe(false);

		query(root, 'consent-dialog-right-option-sale-allow').click();

		// Step 1 alone keeps the opt-out held and asks first.
		await vi.waitFor(() => {
			expect(confirmationOpen(root)).toBe(true);
		});
		expect(client.getSnapshot().optOut).not.toBeNull();
		expect(client.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(client.getSnapshot().explicitChoice).toBeNull();

		const cancelButton = query<HTMLButtonElement>(
			root,
			'consent-dialog-confirm-cancel'
		);
		await vi.waitFor(() => {
			expect(focused(root)).toBe(cancelButton);
		});

		// Step 2 confirms and lifts the opt-out.
		query(root, 'consent-dialog-confirm-allow').click();
		await vi.waitFor(() => {
			expect(client.getSnapshot().optOut).toBeNull();
		});
		expect(client.getSnapshot().effectivePermissions.marketing).toBe(true);
		await vi.waitFor(() => {
			expect(confirmationOpen(root)).toBe(false);
		});
		expect(client.getSnapshot().activeUI).toBe('dialog');
	});

	it('opt-in confirmation description names confirmed rights once answered by the backend', async () => {
		const accept = pageAccept();
		const { root } = await mountOptedOut({ rightsConfirmed: true });
		accept.click();
		await vi.waitFor(() => {
			expect(find(root, 'opt-in-confirmation-root')).not.toBeNull();
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

	it('Allow then cancel (button and Escape) leaves opt-out held, saves nothing, and keeps dialog open', async () => {
		const { client, root } = await mountOptedOut();
		await openDialog(client, root);

		query(root, 'consent-dialog-right-option-sale-allow').click();
		await vi.waitFor(() => {
			expect(confirmationOpen(root)).toBe(true);
		});

		query(root, 'consent-dialog-confirm-cancel').click();
		await vi.waitFor(() => {
			expect(confirmationOpen(root)).toBe(false);
		});
		expect(client.getSnapshot().optOut).not.toBeNull();
		expect(client.getSnapshot().explicitChoice).toBeNull();
		expect(client.getSnapshot().activeUI).toBe('dialog');

		// Cancel via Escape: it closes the confirmation, not the dialog.
		query(root, 'consent-dialog-right-option-sale-allow').click();
		await vi.waitFor(() => {
			expect(confirmationOpen(root)).toBe(true);
		});
		document.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
		);
		await vi.waitFor(() => {
			expect(confirmationOpen(root)).toBe(false);
		});
		expect(client.getSnapshot().optOut).not.toBeNull();
		expect(client.getSnapshot().explicitChoice).toBeNull();
		expect(client.getSnapshot().activeUI).toBe('dialog');
		expect(find(root, 'consent-dialog-card')).not.toBeNull();
	});

	it('Accept All from a page control defers save to a separate modal confirmation that focuses cancel first, then lifts opt-out and grants categories', async () => {
		const accept = pageAccept();
		const { client, root } = await mountOptedOut();

		accept.click();
		await vi.waitFor(() => {
			expect(find(root, 'opt-in-confirmation-root')).not.toBeNull();
		});
		expect(client.getSnapshot().optOut).not.toBeNull();
		expect(client.getSnapshot().explicitChoice).toBeNull();
		expect(client.getSnapshot().effectivePermissions.marketing).toBe(false);

		const confirmation = query(root, 'opt-in-confirmation-root');
		expect(confirmation.getAttribute('role')).toBe('dialog');
		expect(confirmation.getAttribute('aria-modal')).toBe('true');

		// Unconfirmed rights stay neutral in the description.
		const description = query(root, 'opt-in-confirmation-description');
		expect(description.textContent?.toLowerCase()).not.toMatch(
			/sale|sharing|targeted/u
		);

		const cancelButton = query<HTMLButtonElement>(
			root,
			'opt-in-confirmation-cancel-button'
		);
		await vi.waitFor(() => {
			expect(focused(root)).toBe(cancelButton);
		});

		query(root, 'opt-in-confirmation-confirm-button').click();
		await vi.waitFor(() => {
			expect(client.getSnapshot().optOut).toBeNull();
		});
		expect(client.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(client.getSnapshot().effectivePermissions.measurement).toBe(true);
		expect(find(root, 'opt-in-confirmation-root')).toBeNull();
	});

	it('Accept All from a page control then cancel (button and Escape) leaves opt-out held and saves nothing', async () => {
		const accept = pageAccept();
		const { client, root } = await mountOptedOut();

		accept.click();
		await vi.waitFor(() => {
			expect(find(root, 'opt-in-confirmation-root')).not.toBeNull();
		});
		query(root, 'opt-in-confirmation-cancel-button').click();
		await vi.waitFor(() => {
			expect(find(root, 'opt-in-confirmation-root')).toBeNull();
		});
		expect(client.getSnapshot().optOut).not.toBeNull();
		expect(client.getSnapshot().explicitChoice).toBeNull();

		accept.click();
		await vi.waitFor(() => {
			expect(find(root, 'opt-in-confirmation-root')).not.toBeNull();
		});
		document.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
		);
		await vi.waitFor(() => {
			expect(find(root, 'opt-in-confirmation-root')).toBeNull();
		});
		expect(client.getSnapshot().optOut).not.toBeNull();
		expect(client.getSnapshot().explicitChoice).toBeNull();
		expect(client.getSnapshot().effectivePermissions.marketing).toBe(false);
	});

	it('[PERM-02] Accept All in a banner never lifts a held opt-out and asks nothing', async () => {
		const { client, root } = await mountOptedOut({
			policy: choiceOptOutPolicy,
		});
		client.showBanner();
		await vi.waitFor(() => {
			expect(find(root, 'consent-banner-accept-button')).not.toBeNull();
		});

		query(root, 'consent-banner-accept-button').click();
		// A banner commit keeps sale and sharing off; lifting the opt-out
		// takes the confirmation in Your Privacy Choices.
		await vi.waitFor(() => {
			expect(client.getSnapshot().activeUI).toBe('none');
		});
		expect(find(root, 'opt-in-confirmation-root')).toBeNull();
		expect(client.getSnapshot().optOut).not.toBeNull();
		expect(client.getSnapshot().effectivePermissions.marketing).toBe(false);
	});

	it('[PERM-02] turning Marketing on in the banner options then Save never lifts a held opt-out and asks nothing', async () => {
		const { client, root } = await mountOptedOut({
			policy: choiceOptOutPolicy,
		});
		client.showBanner();
		await vi.waitFor(() => {
			expect(find(root, 'consent-banner-customize-button')).not.toBeNull();
		});
		query(root, 'consent-banner-customize-button').click();
		await vi.waitFor(() => {
			expect(
				find(root, 'consent-banner-category-switch-marketing')
			).not.toBeNull();
		});

		const marketing = query(root, 'consent-banner-category-switch-marketing');
		marketing.click();
		await vi.waitFor(() => {
			expect(
				query(root, 'consent-banner-category-switch-marketing').getAttribute(
					'aria-checked'
				)
			).toBe('true');
		});
		query(root, 'consent-banner-save-button').click();

		await vi.waitFor(() => {
			expect(client.getSnapshot().activeUI).toBe('none');
		});
		expect(find(root, 'opt-in-confirmation-root')).toBeNull();
		expect(client.getSnapshot().optOut).not.toBeNull();
		expect(client.getSnapshot().effectivePermissions.marketing).toBe(false);
	});

	// The dialog's Preferences save only the switched category, and the
	// opt-out, as `/v1/consent/init` sends it, lists no categories: a grant
	// confirmed after the opt-out stands beside it.
	it('saving without granting the deciding category completes with no confirmation', async () => {
		const { client, root } = await mountOptedOut();
		await openDialog(client, root);
		query(root, 'consent-dialog-preferences-row').click();
		await vi.waitFor(() => {
			expect(
				find(root, 'consent-dialog-category-switch-measurement')
			).not.toBeNull();
		});
		// The deciding category follows the sale right, not a switch.
		expect(find(root, 'consent-dialog-category-switch-marketing')).toBeNull();

		query(root, 'consent-dialog-category-switch-measurement').click();

		await vi.waitFor(() => {
			expect(client.getSnapshot().effectivePermissions.measurement).toBe(true);
		});
		expect(find(root, 'opt-in-confirmation-root')).toBeNull();
		expect(confirmationOpen(root)).toBe(false);
		expect(client.getSnapshot().optOut).not.toBeNull();
		expect(client.getSnapshot().effectivePermissions.marketing).toBe(false);
	});

	it('with active GPC signal there is no way to opt back in', async () => {
		const { client, root } = await mountOptedOut({ gpc: true });
		await openDialog(client, root);
		const allow = query(root, 'consent-dialog-right-option-sale-allow');
		expect(allow.getAttribute('aria-disabled')).toBe('true');
		expect(
			query(root, 'consent-dialog-right-option-sale-protect').getAttribute(
				'aria-pressed'
			)
		).toBe('true');

		allow.click();
		expect(confirmationOpen(root)).toBe(false);
		expect(find(root, 'opt-in-confirmation-root')).toBeNull();
		expect(client.getSnapshot().optOut).not.toBeNull();
	});

	it('with held-by-account opt-out shows the confirmation and leaves opt-out held when backend refuses lift', async () => {
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
		const accept = pageAccept();
		const { client, root } = await mountOptedOut({
			heldBy: 'person',
			mode: refusingMode,
		});

		accept.click();
		await vi.waitFor(() => {
			expect(find(root, 'opt-in-confirmation-root')).not.toBeNull();
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
			expect(find(root, 'consent-dialog-accept-all')).not.toBeNull();
		});

		query(root, 'consent-dialog-accept-all').click();
		await vi.waitFor(() => {
			expect(client.getSnapshot().optOut).toBeNull();
		});
		expect(find(root, 'opt-in-confirmation-root')).toBeNull();
		expect(client.getSnapshot().effectivePermissions.marketing).toBe(true);
	});
});
