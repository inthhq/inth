import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import {
	checkWebViewConsentScripts,
	readScripts,
	renderKotlin,
	renderSwift,
	renderTypeScript,
} from './generate-webview-consent-scripts';

describe('generate-webview-consent-scripts', () => {
	it('matches the committed Swift, Kotlin and TypeScript copies', () => {
		// Fails after a script edit until `bun run generate:webview-consent-scripts`.
		expect(checkWebViewConsentScripts()).toEqual([]);
	});

	it('embeds each script byte for byte', () => {
		const scripts = readScripts();
		for (const render of [renderSwift, renderKotlin]) {
			const output = render(scripts);
			expect(output).toContain(scripts.documentStart);
			expect(output).toContain(scripts.update);
		}
		expect(renderTypeScript(scripts)).toContain(
			JSON.stringify(scripts.documentStart)
		);
	});

	it('refuses a script that a raw string literal would change', () => {
		const directory = mkdtempSync(join(tmpdir(), 'inth-webview-'));
		writeFileSync(
			join(directory, 'document-start.js'),
			`(function (origins, token, initial) { return \`${['$', '{token}'].join('')}\`; })`
		);
		writeFileSync(join(directory, 'update.js'), '(function (a, b, c) {})');
		expect(() => readScripts(directory)).toThrow(/must not contain/u);
	});
});
