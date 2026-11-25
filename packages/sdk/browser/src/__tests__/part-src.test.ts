/**
 * Where the engine loads `inth.choices-dialog.js` from, and the URL each
 * retry of a script-tag file asks for (`init/part-src.ts`).
 */
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { choicesDialogSrc, retrySrc } from '../init/part-src';
import { version } from '../version';

const target = window as unknown as Record<string, unknown>;

afterEach(() => {
	target.__inthChoicesDialogSrc = undefined;
});

describe('choicesDialogSrc', () => {
	it('sits next to inth.choices.js, with its query', () => {
		expect(
			choicesDialogSrc(null, 'https://cdn.example/v1/inth.choices.js?v=1.2.3')
		).toBe('https://cdn.example/v1/inth.choices-dialog.js?v=1.2.3');
		expect(
			choicesDialogSrc(null, 'https://cdn.example/inth.choices.js?sig=abc')
		).toBe('https://cdn.example/inth.choices-dialog.js?sig=abc');
	});

	it('sits beside a choices file with another name, at this version', () => {
		expect(choicesDialogSrc(null, 'https://cdn.example/a/ui.js?x=1')).toBe(
			`https://cdn.example/a/inth.choices-dialog.js?v=${version}`
		);
	});

	it('takes the tag attribute, then the backend global, over the default', () => {
		const tag = document.createElement('script');
		tag.setAttribute('data-choices-dialog-src', '/own/dialog.js');
		expect(choicesDialogSrc(tag, 'https://cdn.example/inth.choices.js')).toBe(
			'/own/dialog.js'
		);
		target.__inthChoicesDialogSrc = 'https://backend.example/d.js';
		expect(choicesDialogSrc(tag, 'https://cdn.example/inth.choices.js')).toBe(
			'https://backend.example/d.js'
		);
	});

	it('knows no URL without a choices file or an override', () => {
		expect(choicesDialogSrc(null, null)).toBeNull();
	});
});

describe('retrySrc', () => {
	it('asks for the URL itself first, then a URL of its own per retry', () => {
		const src = 'https://cdn.example/inth.hosted.js?v=1.0.0';
		expect(retrySrc(src, 0)).toBe(src);
		expect(retrySrc(src, 1)).toBe(`${src}&inth-retry=1`);
		expect(retrySrc(src, 2)).toBe(`${src}&inth-retry=2`);
		expect(retrySrc('/inth.hosted.js', 1)).toBe(
			new URL('/inth.hosted.js?inth-retry=1', location.href).href
		);
	});
});
