/**
 * `disableAnimation` reaches every part of the preference dialog.
 *
 * The dialog's sheet fades the backdrop and the card in with the
 * `consent-dialog-*` keyframes, unless the root carries
 * `data-animation="off"`.
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
	disableAnimation: boolean
): Promise<HTMLElement[]> {
	client = init({
		overrides: { country: 'DE' },
		ui: { colorScheme: 'light', disableAnimation },
	});
	await client.ready();
	client.openDialog();
	const root = client.ui?.root;
	// The dialog loads on demand.
	await expect
		.poll(() => root?.querySelector('[data-testid="consent-dialog-card"]'))
		.toBeTruthy();
	const backdrop = root?.querySelector<HTMLElement>(
		'[data-testid="consent-dialog-root"]'
	);
	const card = root?.querySelector<HTMLElement>(
		'[data-testid="consent-dialog-card"]'
	);
	return [backdrop, card].filter(
		(element): element is HTMLElement => element instanceof HTMLElement
	);
};

const animationsOf = (parts: HTMLElement[]): string[] =>
	parts.flatMap((part) =>
		part
			.getAnimations()
			.map((animation) =>
				'animationName' in animation
					? String(animation.animationName)
					: String((animation as CSSTransition).transitionProperty)
			)
	);

describe('preference dialog motion', () => {
	it('fades the dialog in by default', async () => {
		const parts = await openDialog(false);

		expect(parts).toHaveLength(2);
		expect(animationsOf(parts)).not.toEqual([]);
	});

	it('opens without animating any part when disableAnimation is set', async () => {
		const parts = await openDialog(true);

		expect(parts).toHaveLength(2);
		expect(animationsOf(parts)).toEqual([]);
	});
});
