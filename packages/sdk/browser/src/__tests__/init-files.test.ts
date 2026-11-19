/**
 * Where the init script (`inth.js`) looks for the files it loads, and when
 * it loads `inth.records.js`: at once for a visitor with a stored choice,
 * never on a first visit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runInitScript } from '../init/run';
import { version } from '../version';

const OWN_SRC = 'https://cdn.example/npm/@inth/sdk/lib/browser/dist/inth.js';

const tagWith = (attributes: Record<string, string> = {}) => {
	const script = document.createElement('script');
	script.setAttribute('src', OWN_SRC);
	script.setAttribute('data-project-url', 'https://consent.example');
	for (const [name, value] of Object.entries(attributes)) {
		script.setAttribute(name, value);
	}
	return script;
};

const loaded = (file: string) =>
	[...document.head.querySelectorAll('script')]
		.map(({ src }) => src)
		.filter((src) => src.includes(file));

const target = window as unknown as Record<string, unknown>;

beforeEach(() => {
	// `/v1/consent/init` never answers: only what happens before it matters here.
	vi.stubGlobal(
		'fetch',
		vi.fn(
			() =>
				new Promise(() => {
					// Never settles.
				})
		)
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	delete target.inth;
	delete target.__inthRecordsSrc;
	localStorage.clear();
	for (const script of document.head.querySelectorAll('script')) {
		script.remove();
	}
});

describe('inth.records.js', () => {
	it('is not loaded on a first visit', () => {
		runInitScript(tagWith());
		expect(loaded('inth.records.js')).toEqual([]);
	});

	it('loads at once for a stored choice, next to inth.js at its version', () => {
		localStorage.setItem('inth', 'stored');
		runInitScript(tagWith());
		expect(loaded('inth.records.js')).toEqual([
			`https://cdn.example/npm/@inth/sdk/lib/browser/dist/inth.records.js?v=${version}`,
		]);
	});

	it('takes the backend’s URL, then the tag’s data-records-src', () => {
		localStorage.setItem('inth', 'stored');
		target.__inthRecordsSrc = 'https://consent.example/inth.records.js?v=abc';
		runInitScript(tagWith({ 'data-records-src': '/own/records.js' }));
		expect(loaded('records.js')).toEqual([
			'https://consent.example/inth.records.js?v=abc',
		]);

		delete target.inth;
		delete target.__inthRecordsSrc;
		document.head.replaceChildren();
		runInitScript(tagWith({ 'data-records-src': '/own/records.js' }));
		expect(loaded('records.js')).toEqual([
			new URL('/own/records.js', location.href).href,
		]);
	});

	it('ignores a records file from another release', async () => {
		localStorage.setItem('inth', 'stored');
		const standIn = runInitScript(tagWith()) as unknown as {
			__inthBoot: {
				provide: (part: unknown) => void;
			};
		};
		const read = vi.fn(() => ({ found: false }));
		standIn.__inthBoot.provide({
			name: 'records',
			readStoredRecords: read,
			version: '0.0.0-other',
		});
		document.head
			.querySelector('script[src*="inth.records.js"]')
			?.dispatchEvent(new Event('load'));
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		expect(read).not.toHaveBeenCalled();
	});
});
