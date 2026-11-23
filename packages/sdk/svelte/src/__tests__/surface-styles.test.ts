import { render } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { ConsentManagerOptions } from '../lib/consent-manager-options.model';
import Fixture from './fixtures/banner-dialog-fixture.svelte';
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
	test('the prompt adds the sheets of its one container, once each', () => {
		renderFixture({ nonce: 'test-nonce' });
		renderFixture();

		expect(
			document.querySelector('[data-testid="consent-banner-root"]')
		).not.toBeNull();
		// The fixture renders the dialog too, whose sheets load with its
		// code when it opens.
		expect(sheets()).toEqual([
			'inth-tokens',
			'inth-button',
			'inth-surface',
			'inth-card',
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
		expect(nonces).toEqual(Array.from({ length: 4 }, () => 'kit-nonce'));
	});

	test('adopts the container sheet the server wrote, without loading it again', () => {
		const written = document.createElement('style');
		written.dataset.inthStyles = 'inth-card';
		written.textContent = '/* server copy */';
		document.head.append(written);
		renderFixture();

		const card = document.head.querySelectorAll(
			'style[data-inth-styles="inth-card"]'
		);
		expect(card).toHaveLength(1);
		expect(card[0]?.textContent).toBe('/* server copy */');
	});

	test('a browser-only render loads the prompt sheets and keeps the surfaces hidden until then', async () => {
		renderFixture();

		const element = document.head.querySelector<HTMLStyleElement>(
			'style[data-inth-styles="inth-tokens"]'
		);
		// Inserted in this task, ahead of the container's sheets, holding
		// only the rule that hides the surfaces.
		expect(element?.hasAttribute('data-inth-pending')).toBe(true);
		expect(element?.textContent).toContain('opacity:0');
		await vi.waitFor(() => {
			expect(element?.hasAttribute('data-inth-pending')).toBe(false);
		});
		expect(element?.textContent).toContain('--inth-border');
		expect(sheets()[0]).toBe('inth-tokens');
		// The trigger's, the other containers' and the shared parts' rules
		// are not the prompt's.
		expect(sheets()).not.toContain('inth-first-paint');
		expect(sheets()).not.toContain('inth-trigger');
		expect(sheets()).not.toContain('inth-parts');
		expect(sheets()).not.toContain('inth-banner');
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
