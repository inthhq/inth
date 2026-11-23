/**
 * Server render of the Privacy Choices (v6) prompt: the server renders the
 * desktop container (ARCH-01), names only the shell and the resolved
 * presentation's sheet in its `<meta>` marker, and `inthHandle` writes
 * exactly those sheets into the page, so the first paint is styled and
 * carries no other presentation.
 */
import type { ConsentContainer, ConsentPresentation } from '@inth/sdk/engine';
import { render } from 'svelte/server';
import { describe, expect, test } from 'vitest';

import { injectSurfaceStyles } from '../lib/kit/surface-styles';
import { testing } from '../lib/testing';
import type { ConsentManagerOptions } from '../lib/types';
import BannerFixture from './fixtures/banner-fixture.svelte';
import { policyFixture } from './policy-fixture';

const renderPage = function renderPage(container: ConsentContainer): string {
	const presentation: ConsentPresentation = {
		design: 'privacy-choices',
		prompt: { container },
	};
	const { body, head } = render(BannerFixture, {
		props: {
			options: {
				mode: testing(),
				persistence: false,
				prefetch: policyFixture(undefined, { id: 'pc-ssr' }),
				presentation,
			} as ConsentManagerOptions,
		},
	});
	return `<html><head>${head}</head><body>${body}</body></html>`;
};

const styleIds = (html: string): string[] =>
	[...html.matchAll(/<style data-inth-styles="(?<id>[^"]+)"/gu)].map(
		(match) => match.groups?.id ?? ''
	);

describe('Privacy Choices server render', () => {
	test('[ARCH-01] a side Drawer renders its desktop placement, with the Drawer sheet only', () => {
		const html = renderPage({ side: 'start', type: 'drawer' });
		expect(html).toMatch(/data-design="privacy-choices"/u);
		expect(html).toMatch(/data-placement="drawer-start"/u);
		expect(html).toMatch(/data-flow="all-in-one"/u);
		expect(styleIds(injectSurfaceStyles(html))).toEqual([
			'inth-tokens',
			'inth-button',
			'inth-surface',
			'inth-drawer',
		]);
	});

	test('a Card names the Card sheet and no classic banner sheet', () => {
		const ids = styleIds(
			injectSurfaceStyles(renderPage({ position: 'end', type: 'card' }))
		);
		expect(ids).toContain('inth-card');
		expect(ids).not.toContain('inth-bar');
		expect(ids).not.toContain('inth-drawer');
		expect(ids).not.toContain('inth-banner');
	});
});
