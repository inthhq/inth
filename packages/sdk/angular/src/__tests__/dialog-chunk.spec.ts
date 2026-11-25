/**
 * The dialog's body loads on demand, and the embedded `ConsentWidget` stays
 * out of it: the dialog never renders the widget, so opening it must not
 * download the widget or its stylesheet. A page that renders the widget
 * imports `@inth/angular/consent-widget` itself.
 *
 * Reads the built `dist/`, which `turbo run test` builds first.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vite-plus/test';

const FESM = resolve(import.meta.dirname, '../../dist/fesm2022');

/** What only the widget's code carries. */
const WIDGET =
	/@inth\/angular\/consent-widget|sheets\/widget["']|class ConsentWidget\b/u;

/** The file and every chunk it imports, statically or on demand. */
const chunkGraph = function chunkGraph(entry: string): string[] {
	const seen = new Set<string>();
	const queue = [entry];
	while (queue.length > 0) {
		const file = queue.shift() as string;
		if (seen.has(file)) {
			continue;
		}
		seen.add(file);
		const code = readFileSync(resolve(FESM, file), 'utf8');
		for (const match of code.matchAll(
			/(?:from|import\()\s*["']\.\/(?<file>[^"']+)["']/gu
		)) {
			queue.push(match.groups?.file ?? '');
		}
	}
	return [...seen];
};

describe('the dialog chunk', () => {
	test('carries no embedded widget', () => {
		const body = readdirSync(FESM).find(
			(file) =>
				file.endsWith('.mjs') &&
				readFileSync(resolve(FESM, file), 'utf8').includes(
					'class ConsentDialogBody'
				)
		);
		expect(body).toBeDefined();
		const graph = chunkGraph(body as string);
		// The body reaches its shared parts, so the walk found them.
		expect(graph.length).toBeGreaterThan(1);
		expect(
			graph.filter((file) =>
				WIDGET.test(readFileSync(resolve(FESM, file), 'utf8'))
			)
		).toEqual([]);
	});
});
