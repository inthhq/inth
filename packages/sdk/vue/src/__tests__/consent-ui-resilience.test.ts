/**
 * The Vue consent banner and dialog when something goes
 * wrong or ends early: a chunk that fails to load, a controlled `open`
 * that turns false, a part that unmounts with work still scheduled, a
 * confirmation with no banner or dialog to host it, and the parts the
 * theme and the page reach from outside.
 */
import { openOptInConfirmation } from '@inth/sdk/surface-actions';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';

import ConsentDialogLink from '../runtime/components/consent-dialog-link.vue';
import ConsentDialog from '../runtime/components/dialog/dialog.vue';
import { useOptOutReceiptData } from '../runtime/components/parts/use-surface-session';
import {
	promptContainers,
	promptContainersKey,
} from '../runtime/components/prompt/containers';
import { useConsentKernel } from '../runtime/composables/kernel';
import type { MountOptions } from './consent-ui-fixture';
import {
	$,
	mountConsentUI,
	must,
	settle,
	unmountConsentUI,
	waitFor,
} from './consent-ui-fixture';

let context: Awaited<ReturnType<typeof mountConsentUI>> | null = null;
const mount = async (options: MountOptions = {}) => {
	context = await mountConsentUI(options);
	return context;
};
const kernel = () => {
	if (!context) {
		throw new Error('No kernel yet');
	}
	return context.kernel;
};

/** Open the dialog from "Your Privacy Choices" and wait for its title. */
const openDialog = async function openDialog() {
	const link = must<HTMLButtonElement>('privacy-choices-link');
	link.focus();
	link.click();
	await waitFor(() => expect($('consent-dialog-title')).not.toBeNull());
};

afterEach(async () => {
	await unmountConsentUI();
	context = null;
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('[C1] a chunk that failed to load', () => {
	test('the presentation loads again the next time the banner is owed', async () => {
		// Vue reports the failed load; it is expected here.
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		let attempts = 0;
		const card = () => {
			attempts += 1;
			return attempts === 1
				? Promise.reject(
						new Error('Failed to fetch dynamically imported module')
					)
				: promptContainers.card();
		};
		await mount({
			provide: {
				[promptContainersKey as symbol]: {
					...promptContainers,
					card,
				},
			},
		});
		expect(attempts).toBe(1);
		expect($('consent-banner-root')).toBeNull();
		// The next trigger: the banner is owed again.
		kernel().set.activeUI('none');
		await settle(1);
		expect(attempts).toBe(1);
		kernel().set.activeUI('banner');
		await waitFor(() => expect($('consent-banner-root')).not.toBeNull());
		expect(attempts).toBe(2);
	});
});

describe('[BNR-06] the page status region', () => {
	test('is on the page while the container chunk is still loading, and the container hides and announces through it', async () => {
		let arrive: () => void = () => undefined;
		const arrived = new Promise<void>((resolve) => {
			arrive = resolve;
		});
		await mount({
			provide: {
				[promptContainersKey as symbol]: {
					...promptContainers,
					card: async () => {
						await arrived;
						return promptContainers.card();
					},
				},
			},
		});
		const region = must('consent-banner-announcement');
		expect($('consent-banner-root')).toBeNull();
		expect(region.getAttribute('role')).toBe('status');
		expect(region.getAttribute('aria-live')).toBe('polite');
		arrive();
		await waitFor(() => expect($('consent-banner-root')).not.toBeNull());
		// The same node, now visually hidden by the container's stylesheet.
		expect($('consent-banner-announcement')).toBe(region);
		expect(region.className).not.toBe('');
		must('consent-banner-reject-button').click();
		await waitFor(() => expect(region.textContent).not.toBe(''));
	});
});

describe('[C2] Your Privacy Choices', () => {
	test('the opt-out icon carries its own size, 14px tall at the glyph proportions', async () => {
		await mount({
			config: {
				presentation: {
					optOutLink: 'privacy-choices',
					prompt: { container: { type: 'card' } },
				},
			},
			link: 'stock',
			region: 'us-opt-out',
		});
		const icon = must('privacy-choices-link').querySelector('svg');
		expect(icon?.getAttribute('height')).toBe('14');
		expect(icon?.getAttribute('width')).toBe('30');
	});

	test('ConsentDialogLink sizes the opt-out icon as PrivacyChoicesLink does', async () => {
		await mount({
			config: {
				presentation: {
					optOutLink: 'privacy-choices',
					prompt: { container: { type: 'card' } },
				},
			},
			page: () => h(ConsentDialogLink, { right: 'opt-out' }),
			region: 'us-opt-out',
		});
		// A page that loads no sheet sizing it would let it fill the line.
		const icon = must('consent-dialog-link').querySelector(
			'svg[aria-hidden="true"]'
		);
		expect(icon?.getAttribute('height')).toBe('14');
		expect(icon?.getAttribute('width')).toBe('30');
	});
});

describe('[C3] the dialog root', () => {
	test('is a dialog surface that the consentDialog slot styles', async () => {
		await mount({
			config: {
				theme: {
					slots: {
						consentDialog: 'theme-dialog',
					},
				},
			},
			region: 'us-opt-out',
		});
		await openDialog();
		const root = must('consent-dialog-root');
		expect(root.getAttribute('data-inth-surface')).toBe('dialog');
		expect(root.classList.contains('theme-dialog')).toBe(true);
		// The stock backdrop stays beside the slot's class.
		expect(root.classList.length).toBeGreaterThan(1);
	});

	test('a noStyle consentDialog slot drops the stock backdrop', async () => {
		await mount({
			config: {
				components: {
					dialog: {
						container: { class: 'host-dialog', noStyle: true } as object,
					},
				},
			},
			region: 'us-opt-out',
		});
		await openDialog();
		expect(must('consent-dialog-root').className).toBe('host-dialog');
	});
});

describe('controlled open', () => {
	test('[BNR-05][FOC-03] turning false closes the dialog through the consent manager and focuses the returning banner', async () => {
		const open = ref<boolean | undefined>(undefined);
		await mount({
			region: 'eu',
			// The dialog on its own, controlled, beside a stand-in banner.
			root: defineComponent({
				setup: () => () => [
					h('section', {
						'data-testid': 'consent-banner-card',
						tabindex: -1,
					}),
					h(ConsentDialog, { disableAnimation: true, open: open.value }),
				],
			}),
		});
		expect(kernel().getSnapshot().activeUI).toBe('banner');
		open.value = true;
		await waitFor(() => expect($('consent-dialog-title')).not.toBeNull());
		expect(kernel().getSnapshot().activeUI).toBe('dialog');
		open.value = false;
		await waitFor(() => expect($('consent-dialog-root')).toBeNull());
		// Closed in the consent manager, so the unanswered banner is owed again.
		expect(kernel().getSnapshot().activeUI).toBe('banner');
		await waitFor(() =>
			expect(document.activeElement).toBe(must('consent-banner-card'))
		);
	});
});

describe('[BNR-13] the opt-in confirmation', () => {
	test('the root hosts it when no banner has shown and the dialog is closed', async () => {
		// A US opt-out visitor sees no banner; a widget or gate asks to opt in.
		await mount({ region: 'us-opt-out' });
		expect($('consent-banner-root')).toBeNull();
		expect($('consent-dialog-root')).toBeNull();
		const confirmed = vi.fn();
		openOptInConfirmation(kernel(), confirmed, null);
		await waitFor(() =>
			expect($('opt-in-confirmation-confirm-button')).not.toBeNull()
		);
		must<HTMLButtonElement>('opt-in-confirmation-confirm-button').click();
		await waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1));
	});
});

describe('[C5] unmounting', () => {
	test('[LAY-05] a vendor table reveal still waiting is cancelled with its group', async () => {
		const timers = new Map<number, number>();
		const realSetTimeout = globalThis.setTimeout;
		vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
			handler: () => void,
			delay?: number
		) => {
			const id = realSetTimeout(handler, delay) as unknown as number;
			timers.set(id, delay ?? 0);
			return id;
		}) as typeof setTimeout);
		const cleared = vi.spyOn(globalThis, 'clearTimeout');
		await mount({ region: 'eu', vendors: true });
		kernel().set.activeUI('dialog');
		await waitFor(() => expect($('consent-dialog-title')).not.toBeNull());
		const trigger = document.querySelector<HTMLButtonElement>(
			'[data-testid^="consent-dialog-vendor-trigger-"]'
		);
		expect(trigger).not.toBeNull();
		trigger?.click();
		await nextTick();
		await nextTick();
		const reveal = [...timers].find(([, delay]) => delay === 230)?.[0];
		expect(reveal).toBeDefined();
		cleared.mockClear();
		// The dialog leaves before the reveal ran.
		await unmountConsentUI();
		context = null;
		expect(cleared.mock.calls.map(([id]) => id)).toContain(reveal);
	});
});

describe('[C4] receipt data while hydrating', () => {
	test('reads the server copy first and the browser copy once mounted', async () => {
		const local = { optOutRecordRevision: 7 };
		const server = { optOutRecordRevision: 0 };
		const rendered: unknown[] = [];
		await mount({
			region: 'us-opt-out',
			root: defineComponent({
				setup() {
					const internal = useConsentKernel() as unknown as {
						getOptOutReceiptData?: () => unknown;
						getServerOptOutReceiptData?: () => unknown;
					};
					internal.getOptOutReceiptData = () => local;
					internal.getServerOptOutReceiptData = () => server;
					const data = useOptOutReceiptData();
					return function render() {
						rendered.push(data.value);
						return null;
					};
				},
			}),
		});
		// Hydration renders what the server rendered; the browser's own
		// copy follows once mounted.
		expect(rendered[0]).toBe(server);
		expect(rendered.at(-1)).toBe(local);
	});
});
