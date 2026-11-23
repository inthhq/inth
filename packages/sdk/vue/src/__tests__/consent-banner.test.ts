/**
 * The stock Vue `ConsentBanner`, ported from React's banner tests
 * (`consent-banner.test.tsx`). Each
 * test names the invariant it guards
 * (`prototypes/PRIVACY-CHOICES-REGRESSIONS.md`). Geometry checks stay in
 * React's browser tests and the parity runner: jsdom lays nothing out.
 */
import { EARLY_TAPS_WINDOW_KEY } from '@inth/sdk/runtime/page-globals';
import type { PolicyRule } from '@inth/sdk/schema/types';
import {
	EARLY_CONSENT_TAP_SCRIPT,
	openOptInConfirmation,
} from '@inth/sdk/surface-actions';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { rightsBundleOf } from '../runtime/components/parts/use-surface-session';
import {
	$,
	mountConsentUI as mount,
	must,
	pageAction,
	setPhone,
	setPhoneLive,
	settle,
	unmountConsentUI,
	waitFor,
} from './consent-ui-fixture';

const root = () => must('consent-banner-root');
const waitForRoot = () =>
	waitFor(() => expect($('consent-banner-root')).not.toBeNull());
const waitForPanel = () =>
	waitFor(() =>
		expect(
			document.querySelector('[data-testid="consent-banner-body"] > *')
		).not.toBeNull()
	);
const escape = (target: Element = document.activeElement ?? document.body) =>
	target.dispatchEvent(
		new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
	);

afterEach(async () => {
	await unmountConsentUI();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	Reflect.deleteProperty(window, EARLY_TAPS_WINDOW_KEY);
	document.head.innerHTML = '';
	localStorage.clear();
});

/**
 * A tap on server HTML before the banner hydrated, as the inline script
 * records it. The stand-in root names no model or prompt, so the tap
 * applies to whatever the banner resolves to.
 */
const tapBeforeHydration = (action: string): number | undefined => {
	const server = document.createElement('div');
	server.innerHTML = `<div data-testid="consent-banner-root"><button type="button" data-action="${action}">${action}</button></div>`;
	document.body.append(server);
	// oxlint-disable-next-line no-new-func -- Runs the inline script as server HTML would.
	new Function(EARLY_CONSENT_TAP_SCRIPT)();
	server.querySelector('button')?.click();
	server.remove();
	const host = window as unknown as Record<
		string,
		{ taps?: { at: number }[] } | undefined
	>;
	return host[EARLY_TAPS_WINDOW_KEY]?.taps?.[0]?.at;
};

const later = () =>
	new Promise((resolve) => {
		setTimeout(resolve, 30);
	});

describe('policy', () => {
	test('[BNR-13][BNR-10] US opt-out with no prompt shows nothing and never blocks', async () => {
		await mount({ blockUntilChoice: true, region: 'us-opt-out' });
		await settle();
		expect($('consent-banner-root')).toBeNull();
		expect(Boolean(pageAction().closest('[inert]'))).toBe(false);
	});

	test('with no container set, the prompt is a Card at the start', async () => {
		await mount({ container: null });
		await waitForRoot();
		expect(root().getAttribute('data-placement')).toBe('card-start');
		expect(root().hasAttribute('data-design')).toBe(false);
	});
});

describe('card:', () => {
	test('[BNR-15] starts collapsed, Customize expands in place and focus moves in', async () => {
		await mount();
		await waitForRoot();
		expect(root().getAttribute('data-placement')).toBe('card-start');
		expect(root().getAttribute('data-flow')).toBe('expand-in-place');
		const customize = must<HTMLButtonElement>(
			'consent-banner-customize-button'
		);
		const panel = must('consent-banner-expand-panel');
		expect(customize.getAttribute('aria-expanded')).toBe('false');
		expect(customize.getAttribute('aria-controls')).toBe(panel.id);
		expect(panel.getAttribute('data-open')).toBe('false');
		expect(panel.hasAttribute('inert')).toBe(true);
		// [BNR-03] A non-blocking prompt does not take focus.
		expect(must('consent-banner-card').contains(document.activeElement)).toBe(
			false
		);
		expect(must('consent-banner-card').getAttribute('role')).toBe('region');

		customize.click();
		await waitForPanel();
		await waitFor(() => {
			expect(panel.getAttribute('data-open')).toBe('true');
			expect(panel.contains(document.activeElement)).toBe(true);
		});
		expect(root().getAttribute('data-expanded')).toBe('true');
		expect($('consent-banner-category-group')).not.toBeNull();
		// [SR-*] The expansion is announced in the card's own status region.
		await waitFor(() =>
			expect(must('consent-banner-status').textContent).toMatch(
				/More options shown\./u
			)
		);
	});

	test('[EU-01] the footer becomes Reject all · Accept all + Save choices, equal pair', async () => {
		await mount();
		await waitForRoot();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		await waitFor(() => expect($('consent-banner-save-button')).not.toBeNull());
		expect($('consent-banner-customize-button')).toBeNull();
		const reject = must('consent-banner-reject-button');
		const accept = must('consent-banner-accept-button');
		expect(reject.textContent?.trim()).toBe('Reject all');
		expect(accept.textContent?.trim()).toBe('Accept all');
		expect(reject.className).toBe(accept.className);
		expect(reject.getAttribute('data-variant')).toBe(
			accept.getAttribute('data-variant')
		);
		expect(reject.getAttribute('data-mode')).toBe(
			accept.getAttribute('data-mode')
		);
	});

	test('[FOC-04][BNR-15] Esc folds back, the banner stays, focus returns to Customize', async () => {
		await mount();
		await waitForRoot();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		await waitFor(() =>
			expect(
				must('consent-banner-expand-panel').contains(document.activeElement)
			).toBe(true)
		);
		escape();
		await waitFor(() =>
			expect(
				must('consent-banner-expand-panel').getAttribute('data-open')
			).toBe('false')
		);
		expect($('consent-banner-root')).not.toBeNull();
		await waitFor(() =>
			expect(document.activeElement).toBe($('consent-banner-customize-button'))
		);
	});

	test('[PERM-15] Esc pressed elsewhere on the page leaves the panel open', async () => {
		await mount();
		await waitForRoot();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		pageAction().focus();
		escape(pageAction());
		await settle(1);
		expect(must('consent-banner-expand-panel').getAttribute('data-open')).toBe(
			'true'
		);
	});

	test('[EU-03] a switch stages the draft, and Save records exactly what is on', async () => {
		const context = await mount();
		await waitForRoot();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		await waitFor(() =>
			expect($('consent-banner-category-switch-marketing')).not.toBeNull()
		);
		const marketing = must<HTMLButtonElement>(
			'consent-banner-category-switch-marketing'
		);
		marketing.click();
		await waitFor(() =>
			expect(marketing.getAttribute('aria-checked')).toBe('true')
		);
		expect(context.snapshot.value.explicitChoice).toBeFalsy();
		must('consent-banner-save-button').click();
		await waitFor(() => expect($('consent-banner-root')).toBeNull());
		const { categories } = context.snapshot.value.explicitChoice ?? {};
		expect(categories?.marketing?.value).toBe(true);
		expect(categories?.measurement?.value).toBe(false);
	});

	test('[CAT-01][SR-06] every switch is named by its row and described inline', async () => {
		await mount();
		await waitForRoot();
		must('consent-banner-customize-button').click();
		await waitForPanel();
		await waitFor(() =>
			expect(document.querySelectorAll('[role="switch"]').length).toBe(4)
		);
		for (const toggle of document.querySelectorAll('[role="switch"]')) {
			const label = document.getElementById(
				toggle.getAttribute('aria-labelledby') ?? ''
			);
			const description = document.getElementById(
				toggle.getAttribute('aria-describedby') ?? ''
			);
			expect(label?.textContent?.trim()).toBeTruthy();
			expect(description?.textContent?.trim()).toBeTruthy();
		}
		// `necessary` reads "Always on" instead of a switch.
		expect(
			document.querySelector('[data-category="necessary"]')?.textContent
		).toMatch(/Always on/u);
	});

	test('[BNR-06] a choice announces on the page and focuses Your Privacy Choices', async () => {
		await mount();
		await waitForRoot();
		must('consent-banner-reject-button').click();
		await waitFor(() => expect($('consent-banner-root')).toBeNull());
		await waitFor(() =>
			expect(document.activeElement).toBe($('privacy-choices-link'))
		);
		await waitFor(() =>
			expect(must('consent-banner-announcement').textContent).toMatch(/\S/u)
		);
	});

	test('[BNR-08] links only the configured policies', async () => {
		await mount();
		await waitForRoot();
		expect($('consent-banner-legal-link-privacyPolicy')).not.toBeNull();
		expect($('consent-banner-legal-link-cookiePolicy')).toBeNull();
	});

	test('[BNR-11] the "Consent by" tag sits in the shell, before the card', async () => {
		await mount();
		await waitForRoot();
		const tag = must('consent-banner-branding');
		expect(tag.parentElement).toBe(must('consent-banner-shell'));
		expect(tag.nextElementSibling).toBe(must('consent-banner-card'));
	});

	test('[ARCH-01] expanding keeps the card, head and footer nodes', async () => {
		await mount();
		await waitForRoot();
		const card = must('consent-banner-card');
		const head = must('consent-banner-header');
		const footer = must('consent-banner-footer');
		must('consent-banner-customize-button').click();
		await waitForPanel();
		expect(must('consent-banner-card')).toBe(card);
		expect(must('consent-banner-header')).toBe(head);
		expect(must('consent-banner-footer')).toBe(footer);
	});
});

describe('banner:', () => {
	test('[BNR-18] a one-row bar with Reject, Accept and Customize; Customize expands in place', async () => {
		await mount({ container: { edge: 'bottom', type: 'banner' } });
		await waitForRoot();
		expect(root().getAttribute('data-placement')).toBe('banner-bottom');
		// The collapsed bar has no panel to point at (PERM-09).
		const customize = must('consent-banner-customize-button');
		expect(customize.hasAttribute('aria-controls')).toBe(false);
		expect($('consent-banner-reject-button')).not.toBeNull();
		expect($('consent-banner-accept-button')).not.toBeNull();
		expect($('consent-banner-expand-panel')).toBeNull();
		customize.click();
		await waitForPanel();
		await waitFor(() =>
			expect(
				must('consent-banner-expand-panel').getAttribute('data-open')
			).toBe('true')
		);
		expect($('consent-banner-header')).not.toBeNull();
		escape();
		await waitFor(() => expect($('consent-banner-expand-panel')).toBeNull());
	});

	test('[BNR-09] US opt-in bar asks in US terms', async () => {
		await mount({
			container: { edge: 'bottom', type: 'banner' },
			region: 'us-opt-in',
		});
		await waitForRoot();
		expect(root().getAttribute('data-variant')).toBe('us-consent');
		expect(must('consent-banner-reject-button').textContent).toMatch(
			/Don.t allow/u
		);
	});
});

describe('aio', () => {
	test('[BNR-14] a side drawer shows the categories at once, with no Customize', async () => {
		await mount({ container: { side: 'start', type: 'drawer' } });
		await waitForRoot();
		expect(root().getAttribute('data-flow')).toBe('all-in-one');
		expect($('consent-banner-customize-button')).toBeNull();
		await waitFor(() =>
			expect($('consent-banner-category-group')).not.toBeNull()
		);
		expect($('consent-banner-save-button')).not.toBeNull();
		// The tag sits in the panel, over the scroll area.
		expect(
			must('consent-banner-expand-panel').contains(
				must('consent-banner-branding')
			)
		).toBe(true);
	});

	test('[BNR-14] US notice: rights rows inline and OK only; an opt-out applies at once', async () => {
		const context = await mount({
			container: { side: 'start', type: 'drawer' },
			region: 'us-notice',
		});
		await waitForRoot();
		await waitFor(() =>
			expect($('consent-banner-rights-row-sale')).not.toBeNull()
		);
		expect($('consent-banner-dismiss-button')).not.toBeNull();
		expect($('consent-banner-reject-button')).toBeNull();
		must('consent-banner-right-option-sale-protect').click();
		await waitFor(() =>
			expect(
				must('consent-banner-right-option-sale-protect').getAttribute(
					'aria-pressed'
				)
			).toBe('true')
		);
		expect(context.snapshot.value.optOut).toBeTruthy();
	});

	test('[LAW-02][RIGHT-06] US opt-in: Allow needs the confirmation, which opens on Cancel', async () => {
		await mount({
			container: { side: 'start', type: 'drawer' },
			region: 'us-opt-in',
		});
		await waitForRoot();
		await waitFor(() =>
			expect($('consent-banner-rights-row-sale')).not.toBeNull()
		);
		const group = must('consent-banner-rights-row-sale').querySelector(
			'[role="group"]'
		);
		expect(group?.getAttribute('aria-label')).toBeTruthy();
		must('consent-banner-right-option-sale-allow').click();
		await waitFor(() =>
			expect(document.activeElement).toBe($('consent-banner-confirm-cancel'))
		);
		const panel = must('consent-banner-confirm').closest('[data-open]');
		expect(panel?.getAttribute('data-open')).toBe('true');
		// RIGHT-04: pressing Allow again nudges.
		must('consent-banner-right-option-sale-allow').click();
		await waitFor(() =>
			expect(must('consent-banner-confirm').getAttribute('data-nudged')).toBe(
				'true'
			)
		);
		must('consent-banner-confirm-cancel').click();
		await waitFor(() => expect(panel?.getAttribute('data-open')).toBe('false'));
	});

	test('[PERM-13] on phone a side drawer becomes the bottom drawer, summary first', async () => {
		setPhone(true);
		await mount({ container: { side: 'start', type: 'drawer' } });
		await waitForRoot();
		await waitFor(() =>
			expect(root().getAttribute('data-placement')).toBe('drawer-bottom')
		);
		expect(root().getAttribute('data-flow')).toBe('expand-in-place');
		expect($('consent-banner-customize-button')).not.toBeNull();
	});
});

describe('block on + …', () => {
	test('[BNR-13][PERM-08] block on: backdrop, inert page and dialog role on the shell', async () => {
		await mount({ blockUntilChoice: true });
		await waitForRoot();
		await waitFor(() =>
			expect(Boolean(pageAction().closest('[inert]'))).toBe(true)
		);
		expect(root().getAttribute('data-blocking')).toBe('true');
		expect($('consent-banner-overlay')).not.toBeNull();
		const shell = must('consent-banner-shell');
		expect(shell.getAttribute('role')).toBe('dialog');
		expect(shell.getAttribute('aria-modal')).toBe('true');
		expect(must('consent-banner-card').hasAttribute('role')).toBe(false);
		await waitFor(() =>
			expect(document.activeElement).toBe(must('consent-banner-card'))
		);
	});

	test('[BNR-13] the US notice never blocks, even with blockUntilChoice', async () => {
		await mount({ blockUntilChoice: true, region: 'us-notice' });
		await waitForRoot();
		await settle(1);
		expect(root().hasAttribute('data-blocking')).toBe(false);
		expect(Boolean(pageAction().closest('[inert]'))).toBe(false);
	});

	test('[PERM-03] Esc never dismisses a blocking prompt; a choice releases the page', async () => {
		await mount({ blockUntilChoice: true });
		await waitForRoot();
		await waitFor(() =>
			expect(Boolean(pageAction().closest('[inert]'))).toBe(true)
		);
		escape();
		await settle(1);
		expect($('consent-banner-root')).not.toBeNull();
		must('consent-banner-accept-button').click();
		await waitFor(() => expect($('consent-banner-root')).toBeNull());
		expect(Boolean(pageAction().closest('[inert]'))).toBe(false);
	});
});

describe('notice', () => {
	test('[BNR-01][BNR-10] the US notice offers "Do not sell or share my data" and OK, and expands to the rights', async () => {
		await mount({ region: 'us-notice' });
		await waitForRoot();
		const link = must('consent-banner-right-link-opt-out');
		expect(link.textContent).toMatch(/Do not sell or share/u);
		expect($('consent-banner-dismiss-button')).not.toBeNull();
		link.click();
		await waitForPanel();
		await waitFor(() =>
			expect($('consent-banner-rights-row-sale')).not.toBeNull()
		);
	});

	test('OK records no consent and ends the prompt', async () => {
		const context = await mount({ region: 'us-notice' });
		await waitForRoot();
		must('consent-banner-dismiss-button').click();
		await waitFor(() => expect($('consent-banner-root')).toBeNull());
		expect(context.snapshot.value.explicitChoice).toBeFalsy();
	});
});

describe('[BNR-06] a tap before hydration', () => {
	test("the root names the policy's model and prompt, and the notice's right-link replays as Customize", async () => {
		await mount({ region: 'us-notice' });
		await waitForRoot();
		// The script records these with a tap, so a replay against another
		// policy is dropped.
		expect(root().getAttribute('data-model')).toBe('opt-out');
		expect(root().getAttribute('data-prompt')).toBe('notice');
		expect(
			must('consent-banner-right-link-opt-out').getAttribute('data-action')
		).toBe('customize');
	});

	test("the collapsed bar's right-link replays as Customize too", async () => {
		await mount({ container: { type: 'banner' }, region: 'us-notice' });
		await waitForRoot();
		expect(
			must('consent-banner-right-link-opt-out').getAttribute('data-action')
		).toBe('customize');
	});

	test("a tap on the notice's right-link before hydration expands the rights in place", async () => {
		tapBeforeHydration('customize');
		const context = await mount({ region: 'us-notice' });
		// The replay waits for the runtime to start.
		context.start();
		await waitForRoot();
		await waitFor(() =>
			expect(root().getAttribute('data-expanded')).toBe('true')
		);
		expect(context.snapshot.value.activeUI).toBe('banner');
		expect(context.snapshot.value.optOut).toBeFalsy();
	});

	test('a choice records the time of the tap, not of the replay', async () => {
		const tappedAt = tapBeforeHydration('reject');
		expect(tappedAt).toBeTypeOf('number');
		await later();
		const context = await mount({ region: 'us-opt-in' });
		context.start();
		await waitFor(() =>
			expect(context.snapshot.value.explicitChoice).toBeTruthy()
		);
		expect(
			context.snapshot.value.explicitChoice?.categories?.marketing?.confirmedAt
		).toBe(tappedAt);
	});

	test('an OK on the notice before hydration records the time of the tap', async () => {
		const tappedAt = tapBeforeHydration('dismiss');
		expect(tappedAt).toBeTypeOf('number');
		await later();
		const context = await mount({ region: 'us-notice' });
		context.start();
		await waitFor(() =>
			expect(context.snapshot.value.noticeDismissal).toBeTruthy()
		);
		expect(context.snapshot.value.noticeDismissal?.dismissedAt).toBe(tappedAt);
	});
});

describe('customization', () => {
	test('a part with noStyle drops its stock classes and keeps its own', async () => {
		await mount({
			config: {
				components: {
					banner: {
						card: { class: 'my-card', noStyle: true } as object,
						saveButton: { class: 'my-save' },
					},
				},
			},
		});
		await waitForRoot();
		expect(must('consent-banner-card').className).toBe('my-card');
		must('consent-banner-customize-button').click();
		await waitForPanel();
		await waitFor(() => expect($('consent-banner-save-button')).not.toBeNull());
		expect(must('consent-banner-save-button').className).toMatch(/my-save/u);
	});
});

describe('wave B round 1', () => {
	test('[BNR-13] an opt-in confirmation opens while the banner is on the page', async () => {
		const context = await mount({ region: 'us-opt-in' });
		await waitForRoot();
		const confirmed = vi.fn();
		openOptInConfirmation(context.kernel, confirmed, null);
		const confirm = await (async () => {
			await waitFor(() =>
				expect($('opt-in-confirmation-confirm-button')).not.toBeNull()
			);
			return must<HTMLButtonElement>('opt-in-confirmation-confirm-button');
		})();
		confirm.click();
		await waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1));
	});

	test('[PERM-05][SR-05] collapsed panels carry a real inert attribute', async () => {
		await mount();
		await waitForRoot();
		const panel = must('consent-banner-expand-panel');
		// A real attribute: jsdom has no `inert` property, so Vue writes the
		// attribute; a browser reflects the property onto it.
		expect(panel.hasAttribute('inert')).toBe(true);
		must('consent-banner-customize-button').click();
		await waitForPanel();
		await waitFor(() => expect(panel.hasAttribute('inert')).toBe(false));
		expect(root().hasAttribute('inert')).toBe(false);
	});

	test('[BNR-15] the summary shows only the actions the policy allows, in every presentation', async () => {
		const actions = { actions: ['accept', 'reject'] } as Partial<PolicyRule>;
		await mount({ rule: actions });
		await waitForRoot();
		expect($('consent-banner-customize-button')).toBeNull();
		expect($('consent-banner-reject-button')).not.toBeNull();
		expect($('consent-banner-accept-button')).not.toBeNull();
		await unmountConsentUI();
		await mount({ container: { type: 'banner' }, rule: actions });
		await waitForRoot();
		expect(root().getAttribute('data-placement')).toBe('banner-bottom');
		expect($('consent-banner-customize-button')).toBeNull();
		expect($('consent-banner-reject-button')).not.toBeNull();
	});

	test('[BNR-15] the summary follows the host layout order', async () => {
		await mount({ prompt: { layout: ['customize', ['accept', 'reject']] } });
		await waitForRoot();
		const footer = must('consent-banner-footer');
		expect(footer.firstElementChild).toBe($('consent-banner-customize-button'));
		const group = must('consent-banner-footer-sub-group');
		expect(group.firstElementChild).toBe($('consent-banner-accept-button'));
	});

	test('[BNR-15] the collapsed Banner keeps the host groups and their slot', async () => {
		await mount({
			config: {
				components: { banner: { actionGroup: { class: 'group-marker' } } },
			},
			container: { type: 'banner' },
			prompt: { layout: ['customize', ['accept', 'reject']] },
		});
		await waitForRoot();
		expect(root().getAttribute('data-placement')).toBe('banner-bottom');
		const footer = must('consent-banner-footer');
		expect(footer.firstElementChild).toBe($('consent-banner-customize-button'));
		const group = must('consent-banner-footer-sub-group');
		expect(group.parentElement).toBe(footer);
		expect(group.classList.contains('group-marker')).toBe(true);
		expect(group.firstElementChild).toBe($('consent-banner-accept-button'));
		expect(group.lastElementChild).toBe($('consent-banner-reject-button'));
	});

	test('[PERM-13] an expansion made on phone does not survive a pass through all-in-one', async () => {
		const resize = setPhoneLive(true);
		await mount({ container: { side: 'start', type: 'drawer' } });
		await waitForRoot();
		await waitFor(() =>
			expect(root().getAttribute('data-flow')).toBe('expand-in-place')
		);
		must('consent-banner-customize-button').click();
		await waitFor(() =>
			expect(root().getAttribute('data-expanded')).toBe('true')
		);
		resize(false);
		await waitFor(() =>
			expect(root().getAttribute('data-flow')).toBe('all-in-one')
		);
		await settle(1);
		// Esc on desktop has nothing to fold, so it is left to the page.
		const press = new KeyboardEvent('keydown', {
			bubbles: true,
			cancelable: true,
			key: 'Escape',
		});
		document.dispatchEvent(press);
		expect(press.defaultPrevented).toBe(false);
		resize(true);
		await waitFor(() =>
			expect(root().getAttribute('data-flow')).toBe('expand-in-place')
		);
		expect(root().hasAttribute('data-expanded')).toBe(false);
		expect(must('consent-banner-expand-panel').getAttribute('data-open')).toBe(
			'false'
		);
	});

	test('[COPY-01][SR-04] the rights bundle reads the backend-confirmed rights from the local receipt', () => {
		const snapshot = {
			optOut: {
				heldBy: 'device',
				method: 'button',
				recordedAt: 1,
				rights: ['sale', 'share'],
			},
		} as unknown as Parameters<typeof rightsBundleOf>[0];
		expect(
			rightsBundleOf(snapshot, {
				localAct: 'button',
				reference: 'ref',
				rightsConfirmed: true,
			})
		).toBe('sale-share');
		expect(rightsBundleOf(snapshot, null)).toBe('all');
	});

	test('the collapsed bar merges the title, description and footer slots', async () => {
		await mount({
			config: {
				components: {
					banner: {
						footer: { class: 'footer-marker' },
						title: { class: 'title-marker' },
					},
					description: { banner: { class: 'description-marker' } },
				},
			},
			container: { type: 'banner' },
		});
		await waitForRoot();
		expect(must('consent-banner-title').classList).toContain('title-marker');
		expect(must('consent-banner-description').classList).toContain(
			'description-marker'
		);
		expect(must('consent-banner-footer').classList).toContain('footer-marker');
	});

	test('the root carries direction, the surface marker and the animation switch', async () => {
		await mount({ language: 'he' });
		await waitForRoot();
		expect(root().getAttribute('dir')).toBe('rtl');
		expect(root().getAttribute('data-inth-surface')).toBe('banner');
		expect(root().getAttribute('data-animation')).toBe('off');
	});

	test('the Preferences body spacing lives in the stylesheet, so noStyle drops it', async () => {
		await mount({ container: { type: 'banner' }, region: 'us-opt-in' });
		await waitForRoot();
		must('consent-banner-customize-button').click();
		await waitFor(() =>
			expect($('consent-banner-preferences-row')).not.toBeNull()
		);
		const row = must('consent-banner-preferences-row');
		const panel = document.getElementById(
			row.getAttribute('aria-controls') ?? ''
		);
		const body = panel?.querySelector(':scope > * > *') as HTMLElement;
		expect(body.getAttribute('style')).toBeNull();
		expect(body.className).not.toBe('');
	});
});
