import type { ConsentKernel } from '@inth/sdk/engine';
import { css as iabDialogCSS } from '@inth/sdk/ui/styles/sheets/iab-dialog';
import { css as iabFirstPaintCSS } from '@inth/sdk/ui/styles/sheets/iab-first-paint';
import { render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, test } from 'vite-plus/test';
import '@inth/sdk/iab';

import Fixture from './fixtures/iab-surface-styles.svelte';
import { iabStyleOptions } from './iab-style-options';

const sheets = () =>
	[
		...document.head.querySelectorAll<HTMLStyleElement>(
			'style[data-inth-styles]'
		),
	].map((element) => element.dataset.inthStyles);

const ALL_SHEETS = [
	'inth-first-paint',
	'inth-dialog',
	'inth-primitives',
	'inth-iab-first-paint',
	'inth-iab-dialog',
];

afterEach(() => {
	for (const element of document.head.querySelectorAll(
		'style[data-inth-styles]'
	)) {
		element.remove();
	}
});

describe('automatic IAB styles', () => {
	test('styles the banner first and adds the dialog rules when it opens, once each', async () => {
		let kernel: ConsentKernel | undefined;
		render(Fixture, {
			onKernel: (value) => {
				kernel = value;
			},
			options: iabStyleOptions({ nonce: 'iab-nonce' }),
		});
		await waitFor(() =>
			expect(
				document.querySelector('[data-testid="iab-consent-banner-card"]')
			).not.toBeNull()
		);
		expect(sheets()).toEqual(['inth-first-paint', 'inth-iab-first-paint']);
		const followingContent = document.querySelector(
			'[data-testid="iab-style-following-content"]'
		);
		expect(followingContent?.textContent).toContain('The page after');
		expect(
			document.head.querySelector(
				'style[data-inth-styles="inth-iab-first-paint"]'
			)?.textContent
		).toBe(iabFirstPaintCSS);

		kernel?.set.activeUI('dialog');
		await waitFor(() =>
			expect(
				document.querySelector('[data-testid="iab-consent-dialog-card"]')
			).not.toBeNull()
		);
		expect(sheets().toSorted()).toEqual(ALL_SHEETS.toSorted());
		expect(
			document.head.querySelector('style[data-inth-styles="inth-iab-dialog"]')
				?.textContent
		).toBe(iabDialogCSS);
		kernel?.set.activeUI('banner');
		await waitFor(() =>
			expect(
				document.querySelector('[data-testid="iab-consent-banner-card"]')
			).not.toBeNull()
		);
		kernel?.set.activeUI('dialog');
		await waitFor(() =>
			expect(
				document.querySelector('[data-testid="iab-consent-dialog-card"]')
			).not.toBeNull()
		);
		expect(sheets().toSorted()).toEqual(ALL_SHEETS.toSorted());
		expect(
			[
				...document.head.querySelectorAll<HTMLStyleElement>(
					'style[data-inth-styles]'
				),
			].map((element) => element.nonce)
		).toEqual(ALL_SHEETS.map(() => 'iab-nonce'));
		kernel?.set.activeUI('none');
		await waitFor(() => {
			expect(
				document.querySelector('[data-testid="iab-consent-banner-card"]')
			).toBeNull();
			expect(
				document.querySelector('[data-testid="iab-consent-dialog-card"]')
			).toBeNull();
		});
		expect(
			document.querySelector('[data-testid="iab-style-following-content"]')
		).toBe(followingContent);
		expect(followingContent?.querySelector('button')?.textContent).toBe(
			'Continue'
		);
	});

	test('a standalone IAB dialog adds all its base rules and inherits the page nonce', async () => {
		const script = document.createElement('script');
		script.nonce = 'kit-nonce';
		document.body.append(script);
		try {
			render(Fixture, {
				banner: false,
				open: true,
				options: iabStyleOptions(),
			});
			await waitFor(() =>
				expect(
					document.querySelector('[data-testid="iab-consent-dialog-card"]')
				).not.toBeNull()
			);
			expect(sheets()).toEqual(ALL_SHEETS);
			expect(
				[
					...document.head.querySelectorAll<HTMLStyleElement>(
						'style[data-inth-styles]'
					),
				].map((element) => element.nonce)
			).toEqual(ALL_SHEETS.map(() => 'kit-nonce'));
		} finally {
			script.remove();
		}
	});

	test.each(['styles', 'provider-no-style', 'component-no-style'] as const)(
		'%s opts out of automatic IAB styles',
		async (option) => {
			render(Fixture, {
				noStyle: option === 'component-no-style',
				options: iabStyleOptions({
					noStyle: option === 'provider-no-style',
					styles: option !== 'styles',
				}),
			});
			await waitFor(() =>
				expect(
					document.querySelector('[data-testid="iab-consent-banner-card"]')
				).not.toBeNull()
			);
			render(Fixture, {
				banner: false,
				noStyle: option === 'component-no-style',
				open: true,
				options: iabStyleOptions({
					noStyle: option === 'provider-no-style',
					styles: option !== 'styles',
				}),
			});
			await waitFor(() =>
				expect(
					document.querySelector('[data-testid="iab-consent-dialog-card"]')
				).not.toBeNull()
			);
			expect(sheets()).toEqual([]);
		}
	);
});
