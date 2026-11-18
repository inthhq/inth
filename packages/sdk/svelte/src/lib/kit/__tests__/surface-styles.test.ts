import { css as dialogCSS } from '@inth/sdk/ui/styles/sheets/dialog';
import { css as firstPaintCSS } from '@inth/sdk/ui/styles/sheets/first-paint';
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
				'<title>t</title><meta name="c15t-styles" content="c15t-first-paint"><meta name="c15t-styles" content="c15t-first-paint c15t-dialog">'
			)
		);

		expect(styleTags(html)).toEqual([
			'<style data-c15t-styles="c15t-first-paint">',
			'<style data-c15t-styles="c15t-dialog">',
		]);
		expect(html).toContain(`>${firstPaintCSS}</style>`);
		expect(html).toContain(`>${dialogCSS}</style>`);
		expect(html.indexOf('c15t-dialog">')).toBeLessThan(html.indexOf('</head>'));
		expect(html.indexOf('<title>')).toBeLessThan(
			html.indexOf('<style data-c15t-styles')
		);
	});

	test("uses the marker's nonce, else the one SvelteKit put on its scripts", () => {
		const own = injectSurfaceStyles(
			page(
				'<meta name="c15t-styles" content="c15t-first-paint nonce=own">',
				'<script nonce="kit">1</script>'
			)
		);
		const kit = injectSurfaceStyles(
			page(
				'<meta name="c15t-styles" content="c15t-first-paint">',
				'<script nonce="kit">1</script>'
			)
		);

		expect(styleTags(own)).toEqual([
			'<style data-c15t-styles="c15t-first-paint" nonce="own">',
		]);
		expect(styleTags(kit)).toEqual([
			'<style data-c15t-styles="c15t-first-paint" nonce="kit">',
		]);
	});

	test('leaves a page without a marker, or with the sheet already in it, alone', () => {
		const plain = page('<title>t</title>');
		const done = injectSurfaceStyles(
			page('<meta name="c15t-styles" content="c15t-first-paint">')
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
				'<meta name="c15t-styles" content="c15t-unknown c15t-first-paint nonce=&quot;x">'
			)
		);

		expect(styleTags(html)).toEqual([
			'<style data-c15t-styles="c15t-first-paint">',
		]);
	});

	test("writes a banner's sheets in cascade order, without the trigger's", () => {
		const html = injectSurfaceStyles(
			page(
				'<meta name="c15t-styles" content="c15t-banner c15t-button c15t-tokens">'
			)
		);

		expect(styleTags(html)).toEqual([
			'<style data-c15t-styles="c15t-tokens">',
			'<style data-c15t-styles="c15t-button">',
			'<style data-c15t-styles="c15t-banner">',
		]);
	});
});

describe('nonceEarlyTapScript', () => {
	test('gives the tap script the nonce SvelteKit put on its scripts', () => {
		const html = nonceEarlyTapScript(
			page(
				'',
				'<script data-c15t-early-tap>1</script><script nonce="kit">2</script>'
			)
		);

		expect(html).toContain(
			'<script data-c15t-early-tap nonce="kit">1</script>'
		);
	});

	test('leaves a page without the script, a page nonce, or with its own nonce alone', () => {
		const plain = page('', '<script nonce="kit">2</script>');
		const noNonce = page('', '<script data-c15t-early-tap>1</script>');
		const own = page(
			'',
			'<script data-c15t-early-tap nonce="own">1</script><script nonce="kit">2</script>'
		);

		expect(nonceEarlyTapScript(plain)).toBe(plain);
		expect(nonceEarlyTapScript(noNonce)).toBe(noNonce);
		expect(nonceEarlyTapScript(own)).toBe(own);
	});
});
