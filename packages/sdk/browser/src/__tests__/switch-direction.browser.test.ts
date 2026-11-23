/**
 * A checked switch moves its thumb toward the inline end in either writing
 * direction, so it stays inside the track in right-to-left copy.
 *
 * The thumb is the switch's `::after`. It starts at the inline start of
 * the track, which is the right edge in RTL, so the checked state has to
 * move it left there. No adapter puts `dir` on the switch itself: it
 * inherits it from the dialog.
 */
import { clearBrowserConsentStorage } from '@inth/conformance/suite';
import { afterEach, describe, expect, it } from 'vitest';

import type { ConsentClient } from '../consent-client.model';
import { init } from './fixtures/factory-init';

let client: ConsentClient | undefined;

afterEach(() => {
	client?.dispose();
	client = undefined;
	clearBrowserConsentStorage();
});

const openDialog = async function openDialog(
	language: string
): Promise<ParentNode> {
	client = init({
		consentCategories: ['necessary', 'measurement', 'marketing'],
		// Offline mode renders a language only when it has copy for it.
		i18n: { messages: { he: { consentManagerDialog: { title: 'פרטיות' } } } },
		overrides: { country: 'DE', language },
		policy: ['europeOptIn'],
		ui: { colorScheme: 'light', disableAnimation: true },
	});
	await client.ready();
	client.openDialog();
	const root = client.ui?.root;
	if (!root) {
		throw new Error('The UI did not mount');
	}
	// The dialog loads on demand.
	await expect
		.poll(() => root.querySelector('[role="switch"][data-state="unchecked"]'), {
			timeout: 4000,
		})
		.toBeTruthy();
	return root;
};

describe('switch thumb direction', () => {
	it.each([
		['en', 'ltr', '16px'],
		['he', 'rtl', '-16px'],
	])(
		'moves a checked thumb toward the inline end in %s',
		async (language, dir, translate) => {
			const root = await openDialog(language);
			expect(
				root
					.querySelector('[data-testid="consent-dialog-root"]')
					?.getAttribute('dir')
			).toBe(dir);

			const control = root.querySelector<HTMLElement>(
				'[role="switch"][data-state="unchecked"]'
			);
			control?.click();
			await expect
				.poll(() =>
					root.querySelector<HTMLElement>(
						'[role="switch"][aria-checked="true"]'
					)
				)
				.toBeTruthy();
			const thumb = root.querySelector<HTMLElement>(
				'[role="switch"][aria-checked="true"]'
			);
			if (!thumb) {
				throw new Error('No checked switch');
			}
			// Once the thumb's slide has run.
			await expect
				.poll(() => getComputedStyle(thumb, '::after').translate, {
					timeout: 2000,
				})
				.toBe(translate);
		}
	);
});
