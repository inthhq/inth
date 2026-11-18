/**
 * Where the init script (`c15t.js`) looks for the files it loads, and when
 * it loads `c15t.records.js`: at once for a visitor with a stored choice,
 * never on a first visit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runInitScript } from '../init/run';
import { version } from '../version';

const OWN_SRC = 'https://cdn.example/npm/@inth/sdk/lib/browser/dist/c15t.js';

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
	// `/init` never answers: only what happens before it matters here.
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
	delete target.c15t;
	delete target.__c15tRecordsSrc;
	localStorage.clear();
	for (const script of document.head.querySelectorAll('script')) {
		script.remove();
	}
});

describe('c15t.records.js', () => {
	it('is not loaded on a first visit', () => {
		runInitScript(tagWith());
		expect(loaded('c15t.records.js')).toEqual([]);
	});

	it('loads at once for a stored choice, next to c15t.js at its version', () => {
		localStorage.setItem('c15t', 'stored');
		runInitScript(tagWith());
		expect(loaded('c15t.records.js')).toEqual([
			`https://cdn.example/npm/@inth/sdk/lib/browser/dist/c15t.records.js?v=${version}`,
		]);
	});

	it('takes the backend’s URL, then the tag’s data-records-src', () => {
		localStorage.setItem('c15t', 'stored');
		target.__c15tRecordsSrc = 'https://consent.example/c15t.records.js?v=abc';
		runInitScript(tagWith({ 'data-records-src': '/own/records.js' }));
		expect(loaded('records.js')).toEqual([
			'https://consent.example/c15t.records.js?v=abc',
		]);

		delete target.c15t;
		delete target.__c15tRecordsSrc;
		document.head.replaceChildren();
		runInitScript(tagWith({ 'data-records-src': '/own/records.js' }));
		expect(loaded('records.js')).toEqual([
			new URL('/own/records.js', location.href).href,
		]);
	});

	it('ignores a records file from another release', async () => {
		localStorage.setItem('c15t', 'stored');
		const standIn = runInitScript(tagWith()) as unknown as {
			__c15tBoot: {
				provide: (part: unknown) => void;
			};
		};
		const read = vi.fn(() => ({ found: false }));
		standIn.__c15tBoot.provide({
			name: 'records',
			readStoredRecords: read,
			version: '0.0.0-other',
		});
		document.head
			.querySelector('script[src*="c15t.records.js"]')
			?.dispatchEvent(new Event('load'));
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		expect(read).not.toHaveBeenCalled();
	});
});
