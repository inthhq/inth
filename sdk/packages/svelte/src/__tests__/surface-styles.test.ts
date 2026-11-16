import { custom } from '@c15t/core';
import { render } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { ConsentManagerOptions } from '../lib/types';
import Fixture from './fixtures/notice-banner-fixture.svelte';
import { policyFixture } from './policy-fixture';

/**
 * The stock surfaces insert the sheets they use into `<head>`, once per
 * page, so an app that imports no stylesheet still gets styled surfaces.
 */

const sheets = () =>
	[
		...document.head.querySelectorAll<HTMLStyleElement>(
			'style[data-c15t-styles]'
		),
	].map((element) => element.dataset.c15tStyles);

const renderFixture = (options: Partial<ConsentManagerOptions> = {}) =>
	render(Fixture, {
		capture: () => {},
		options: {
			disableAnimation: true,
			mode: custom({}),
			persistence: false,
			prefetch: policyFixture(),
			...options,
		},
	});

afterEach(() => {
	for (const element of document.head.querySelectorAll(
		'style[data-c15t-styles]'
	)) {
		element.remove();
	}
});

describe('surface styles', () => {
	test('the banner adds its own sheets and the dialog its own, once each', () => {
		renderFixture({ nonce: 'test-nonce' });
		renderFixture();

		expect(
			document.querySelector('[data-testid="consent-banner-root"]')
		).not.toBeNull();
		// The fixture renders the dialog component too, whose code carries
		// the dialog and primitive sheets.
		expect(sheets()).toEqual([
			'c15t-tokens',
			'c15t-button',
			'c15t-banner',
			'c15t-dialog',
			'c15t-primitives',
		]);
		expect(
			document.head.querySelector<HTMLStyleElement>('style[data-c15t-styles]')
				?.nonce
		).toBe('test-nonce');
	});

	test('without a nonce option, takes the nonce SvelteKit put on the page', () => {
		const script = document.createElement('script');
		script.nonce = 'kit-nonce';
		document.body.append(script);
		renderFixture();
		script.remove();

		const nonces = [
			...document.head.querySelectorAll<HTMLStyleElement>(
				'style[data-c15t-styles]'
			),
		].map((element) => element.nonce);
		expect(nonces).toEqual(Array.from({ length: 5 }, () => 'kit-nonce'));
	});

	test('adopts the banner sheet the server wrote, without loading it again', () => {
		const written = document.createElement('style');
		written.dataset.c15tStyles = 'c15t-banner';
		written.textContent = '/* server copy */';
		document.head.append(written);
		renderFixture();

		const banner = document.head.querySelectorAll(
			'style[data-c15t-styles="c15t-banner"]'
		);
		expect(banner).toHaveLength(1);
		expect(banner[0]?.textContent).toBe('/* server copy */');
	});

	test('a browser-only render loads the banner sheets and keeps the surfaces hidden until then', async () => {
		renderFixture();

		const element = document.head.querySelector<HTMLStyleElement>(
			'style[data-c15t-styles="c15t-tokens"]'
		);
		// Inserted in this task, ahead of the dialog's sheets, holding only
		// the rule that hides the surfaces.
		expect(element?.hasAttribute('data-c15t-pending')).toBe(true);
		expect(element?.textContent).toContain('opacity:0');
		await vi.waitFor(() => {
			expect(element?.hasAttribute('data-c15t-pending')).toBe(false);
		});
		expect(element?.textContent).toContain('--c15t-border');
		expect(sheets()[0]).toBe('c15t-tokens');
		// The trigger's and ConsentGate's rules are not the banner's.
		expect(sheets()).not.toContain('c15t-first-paint');
		expect(sheets()).not.toContain('c15t-trigger');
	});

	test('adds nothing with `styles: false` or `noStyle`', () => {
		renderFixture({ styles: false });
		renderFixture({ noStyle: true });

		expect(
			document.querySelector('[data-testid="consent-banner-root"]')
		).not.toBeNull();
		expect(sheets()).toEqual([]);
	});
});
