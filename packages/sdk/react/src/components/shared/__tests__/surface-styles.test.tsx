import { renderToString } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-react';

import { ComponentFixtureProvider } from '~/__tests__/component-fixture-provider';
import type { ComponentFixtureOptions } from '~/__tests__/component-fixture-provider';
import { ConsentDialog } from '~/aggregate-components';
import { ConsentBanner } from '~/components/prompt';

import { testing } from '../../../testing';

/**
 * The stock surfaces render the Inth rules they use, so an app that imports
 * no stylesheet still gets styled surfaces: the banner the tokens, button
 * and banner sheets, the dialog those and its own. React 19 hoists them into
 * `<head>` and renders each once. These tests share one document, whose
 * hoisted styles outlive the trees that rendered them, so the cases that
 * expect no styles run first.
 */

const hoistedStyles = () =>
	[
		...document.head.querySelectorAll<HTMLStyleElement>(
			'style[data-precedence="inth"]'
		),
	].map((element) => element.dataset.href);

const fixture = (options: Partial<ComponentFixtureOptions> = {}) => ({
	mode: testing(),
	...options,
});

describe('surface styles', () => {
	test('styles: false renders no stylesheet', async () => {
		const screen = await render(
			<ComponentFixtureProvider options={fixture({ styles: false })}>
				<ConsentBanner />
			</ComponentFixtureProvider>
		);
		await expect
			.element(screen.getByTestId('consent-banner-root'))
			.toBeInTheDocument();

		expect(hoistedStyles()).toEqual([]);
		await screen.unmount();
	});

	test('noStyle renders no stylesheet', async () => {
		const screen = await render(
			<ComponentFixtureProvider options={fixture({ noStyle: true })}>
				<ConsentBanner />
			</ComponentFixtureProvider>
		);
		await expect
			.element(screen.getByTestId('consent-banner-root'))
			.toBeInTheDocument();

		expect(hoistedStyles()).toEqual([]);
		await screen.unmount();
	});

	test('the server-rendered banner carries its own sheets only', () => {
		const html = renderToString(
			<ComponentFixtureProvider options={fixture()}>
				<ConsentBanner />
				<ConsentDialog />
			</ComponentFixtureProvider>
		);

		expect(html).toContain('data-testid="consent-banner-root"');
		// React merges same-precedence styles into one element and lists
		// their ids in `data-href`.
		const ids = [
			...html.matchAll(/<style[^>]*data-href="(?<ids>[^"]+)"/gu),
		].flatMap((match) => match.groups?.ids?.split(' ') ?? []);
		expect(ids).toEqual(['inth-tokens', 'inth-button', 'inth-surface', 'inth-card']);
		// Not the trigger's, the ConsentGate's, another container's or the
		// dialog's rules.
		expect(html).not.toContain('inth-first-paint');
		expect(html).not.toContain('inth-dialog');
		expect(html).not.toContain('inth-drawer');
		// The rules reach the HTML as written, not entity-escaped.
		expect(html).not.toMatch(/<style[^>]*>[^<]*&gt;/u);
	});

	test('with a nonce, the banner renders its sheet in place, carrying it', () => {
		// React drops the nonce of a style it hoists unless the server
		// renderer was given the same one.
		const html = renderToString(
			<ComponentFixtureProvider options={fixture({ nonce: 'test-nonce' })}>
				<ConsentBanner />
			</ComponentFixtureProvider>
		);

		expect(
			[
				...html.matchAll(
					/<style data-inth-styles="(?<id>[^"]+)" nonce="test-nonce">/gu
				),
			].map((match) => match.groups?.id)
		).toEqual(['inth-tokens', 'inth-button', 'inth-surface', 'inth-card']);
		expect(html).not.toContain('data-precedence="inth"');
		expect(html).not.toMatch(/<style[^>]*>[^<]*&gt;/u);
	});

	test('the banner adds its sheets, the dialog adds its own after them', async () => {
		const banner = await render(
			<ComponentFixtureProvider options={fixture()}>
				<ConsentBanner />
			</ComponentFixtureProvider>
		);
		await expect
			.element(banner.getByTestId('consent-banner-root'))
			.toBeInTheDocument();

		expect(hoistedStyles()).toEqual([
			'inth-tokens',
			'inth-button',
			'inth-surface',
			'inth-card',
		]);
		await banner.unmount();

		// The app's own token rules win wherever the hoisted sheet lands:
		// here it comes after them.
		const appTokens = document.createElement('style');
		appTokens.textContent =
			':root{--inth-surface:rgb(1, 2, 3)}:root.inth-dark{--inth-surface:rgb(4, 5, 6)}';
		document.head.prepend(appTokens);
		const surface = () =>
			getComputedStyle(document.documentElement)
				.getPropertyValue('--inth-surface')
				.trim();
		expect(surface()).toBe('rgb(1, 2, 3)');
		document.documentElement.classList.add('inth-dark');
		expect(surface()).toBe('rgb(4, 5, 6)');
		document.documentElement.classList.remove('inth-dark');
		appTokens.remove();

		const dialog = await render(
			<ComponentFixtureProvider options={fixture({ initialUI: 'dialog' })}>
				<ConsentBanner />
				<ConsentDialog />
			</ComponentFixtureProvider>
		);
		await expect
			.element(dialog.getByTestId('consent-dialog-root'))
			.toBeInTheDocument();

		expect(hoistedStyles()).toEqual([
			'inth-tokens',
			'inth-button',
			'inth-surface',
			'inth-card',
			'inth-expand',
			'inth-dialog',
		]);
		const card = document.querySelector<HTMLElement>(
			'[data-testid="consent-dialog-root"]'
		);
		expect(card && getComputedStyle(card).display).not.toBe('inline');
		await dialog.unmount();
	});
});
