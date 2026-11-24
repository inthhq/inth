import styles from '@inth/sdk/ui/styles/components/consent-dialog-trigger';
import { render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, test } from 'vite-plus/test';

import type { ConsentManagerOptions } from '../lib/types';
import Fixture from './fixtures/panel-trigger-fixture.svelte';
import { transportMode } from './fixtures/transport-mode';
import { policyFixture } from './policy-fixture';

describe('ConsentDialogTrigger disableAnimation', () => {
	test.each([true, false])(
		'marks the trigger for the stylesheet when disableAnimation is %s',
		async (disableAnimation) => {
			render(Fixture, {
				options: {
					disableAnimation,
					mode: transportMode({}),
					persistence: false,
					prefetch: policyFixture(),
				} as ConsentManagerOptions,
			});
			await waitFor(() =>
				expect(
					document.querySelector('[data-testid="consent-dialog-trigger"]')
				).not.toBeNull()
			);
			// The stylesheet stops the hover and snap transitions on it.
			expect(
				document
					.querySelector('[data-testid="consent-dialog-trigger"]')
					?.hasAttribute('data-disable-animation')
			).toBe(disableAnimation);
		}
	);

	test('snaps to the corner it is dragged toward until its transition ends', async () => {
		window.localStorage.clear();
		HTMLElement.prototype.setPointerCapture ??= () => undefined;
		HTMLElement.prototype.releasePointerCapture ??= () => undefined;
		render(Fixture, {
			options: {
				mode: transportMode({}),
				persistence: false,
				prefetch: policyFixture(),
			} as ConsentManagerOptions,
		});
		const trigger = await waitFor(() => {
			const element = document.querySelector<HTMLElement>(
				'[data-testid="consent-dialog-trigger"]'
			);
			expect(element).not.toBeNull();
			return element as HTMLElement;
		});

		// jsdom has no PointerEvent; a MouseEvent carries the coordinates.
		const pointer = (type: string, clientX: number) =>
			trigger.dispatchEvent(
				new MouseEvent(type, {
					bubbles: true,
					button: 0,
					clientX,
					clientY: 500,
				})
			);
		pointer('pointerdown', 500);
		pointer('pointermove', 300);
		pointer('pointerup', 300);
		await tick();

		expect(trigger.classList).toContain(styles.bottomLeft);
		expect(trigger.classList).toContain(styles.snapping);
		trigger.dispatchEvent(new Event('transitionend'));
		await tick();
		expect(trigger.classList).not.toContain(styles.snapping);
	});
});
