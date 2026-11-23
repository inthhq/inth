import { css as partsCSS } from '@inth/sdk/ui/styles/sheets/parts';
import { css as widgetCSS } from '@inth/sdk/ui/styles/sheets/widget';
import { describe, expect, test } from 'vitest';

import { injectSurfaceStyles, nonceEarlyTapScript } from '../surface-styles';

const page = (head: string, body = '<p>page</p>') =>
	`<html><head>${head}</head><body>${body}</body></html>`;

const styleTags = (html: string) =>
	[...html.matchAll(/<style[^>]*>/gu)].map((match) => match[0]);

describe('injectSurfaceStyles', () => {
	test('writes each named sheet once, at the end of <head>', () => {
		const html = injectSurfaceStyles(
			page(
				'<title>t</title><meta name="inth-styles" content="inth-parts"><meta name="inth-styles" content="inth-parts inth-widget">'
			)
		);

		expect(styleTags(html)).toEqual([
			'<style data-inth-styles="inth-parts">',
			'<style data-inth-styles="inth-widget">',
		]);
		expect(html).toContain(`>${partsCSS}</style>`);
		expect(html).toContain(`>${widgetCSS}</style>`);
		expect(html.indexOf('inth-widget">')).toBeLessThan(html.indexOf('</head>'));
		expect(html.indexOf('<title>')).toBeLessThan(
			html.indexOf('<style data-inth-styles')
		);
	});

	test("uses the marker's nonce, else the one SvelteKit put on its scripts", () => {
		const own = injectSurfaceStyles(
			page(
				'<meta name="inth-styles" content="inth-parts nonce=own">',
				'<script nonce="kit">1</script>'
			)
		);
		const kit = injectSurfaceStyles(
			page(
				'<meta name="inth-styles" content="inth-parts">',
				'<script nonce="kit">1</script>'
			)
		);

		expect(styleTags(own)).toEqual([
			'<style data-inth-styles="inth-parts" nonce="own">',
		]);
		expect(styleTags(kit)).toEqual([
			'<style data-inth-styles="inth-parts" nonce="kit">',
		]);
	});

	test('leaves a page without a marker, or with the sheet already in it, alone', () => {
		const plain = page('<title>t</title>');
		const done = injectSurfaceStyles(
			page('<meta name="inth-styles" content="inth-parts">')
		);

		expect(injectSurfaceStyles(plain)).toBe(plain);
		expect(injectSurfaceStyles(done)).toBe(done);
		expect(injectSurfaceStyles('<div>chunk without head</div>')).toBe(
			'<div>chunk without head</div>'
		);
	});

	test('ignores ids it does not know and a nonce it cannot trust', () => {
		const html = injectSurfaceStyles(
			page(
				'<meta name="inth-styles" content="inth-unknown inth-parts nonce=&quot;x">'
			)
		);

		expect(styleTags(html)).toEqual(['<style data-inth-styles="inth-parts">']);
	});

	test("writes a banner's sheets in cascade order, without the trigger's", () => {
		const html = injectSurfaceStyles(
			page(
				'<meta name="inth-styles" content="inth-banner inth-button inth-tokens">'
			)
		);

		expect(styleTags(html)).toEqual([
			'<style data-inth-styles="inth-tokens">',
			'<style data-inth-styles="inth-button">',
			'<style data-inth-styles="inth-banner">',
		]);
	});
});

describe('nonceEarlyTapScript', () => {
	test('gives the tap script the nonce SvelteKit put on its scripts', () => {
		const html = nonceEarlyTapScript(
			page(
				'',
				'<script data-inth-early-tap>1</script><script nonce="kit">2</script>'
			)
		);

		expect(html).toContain(
			'<script data-inth-early-tap nonce="kit">1</script>'
		);
	});

	test('leaves a page without the script, a page nonce, or with its own nonce alone', () => {
		const plain = page('', '<script nonce="kit">2</script>');
		const noNonce = page('', '<script data-inth-early-tap>1</script>');
		const own = page(
			'',
			'<script data-inth-early-tap nonce="own">1</script><script nonce="kit">2</script>'
		);

		expect(nonceEarlyTapScript(plain)).toBe(plain);
		expect(nonceEarlyTapScript(noNonce)).toBe(noNonce);
		expect(nonceEarlyTapScript(own)).toBe(own);
	});
});
