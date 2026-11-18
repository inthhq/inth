import { render } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { ConsentManagerOptions } from '../lib/types';
import Fixture from './fixtures/notice-banner-fixture.svelte';
import { transportMode } from './fixtures/transport-mode';
import { policyFixture } from './policy-fixture';

/**
 * The stock surfaces insert the sheets they use into `<head>`, once per
 * page, so an app that imports no stylesheet still gets styled surfaces.
 */

const sheets = () =>
	[
		...document.head.querySelectorAll<HTMLStyleElement>(
			'style[data-inth-styles]'
		),
	].map((element) => element.dataset.inthStyles);

const renderFixture = (options: Partial<ConsentManagerOptions> = {}) =>
	render(Fixture, {
		capture: () => {},
		options: {
			disableAnimation: true,
			mode: transportMode({}),
			persistence: false,
			prefetch: policyFixture(),
			...options,
		},
	});

afterEach(() => {
	for (const element of document.head.querySelectorAll(
		'style[data-inth-styles]'
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
			'inth-tokens',
			'inth-button',
			'inth-banner',
			'inth-dialog',
			'inth-primitives',
		]);
		expect(
			document.head.querySelector<HTMLStyleElement>('style[data-inth-styles]')
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
				'style[data-inth-styles]'
			),
		].map((element) => element.nonce);
		expect(nonces).toEqual(Array.from({ length: 5 }, () => 'kit-nonce'));
	});

	test('adopts the banner sheet the server wrote, without loading it again', () => {
		const written = document.createElement('style');
		written.dataset.inthStyles = 'inth-banner';
		written.textContent = '/* server copy */';
		document.head.append(written);
		renderFixture();

		const banner = document.head.querySelectorAll(
			'style[data-inth-styles="inth-banner"]'
		);
		expect(banner).toHaveLength(1);
		expect(banner[0]?.textContent).toBe('/* server copy */');
	});

	test('a browser-only render loads the banner sheets and keeps the surfaces hidden until then', async () => {
		renderFixture();

		const element = document.head.querySelector<HTMLStyleElement>(
			'style[data-inth-styles="inth-tokens"]'
		);
		// Inserted in this task, ahead of the dialog's sheets, holding only
		// the rule that hides the surfaces.
		expect(element?.hasAttribute('data-inth-pending')).toBe(true);
		expect(element?.textContent).toContain('opacity:0');
		await vi.waitFor(() => {
			expect(element?.hasAttribute('data-inth-pending')).toBe(false);
		});
		expect(element?.textContent).toContain('--inth-border');
		expect(sheets()[0]).toBe('inth-tokens');
		// The trigger's and ConsentGate's rules are not the banner's.
		expect(sheets()).not.toContain('inth-first-paint');
		expect(sheets()).not.toContain('inth-trigger');
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
