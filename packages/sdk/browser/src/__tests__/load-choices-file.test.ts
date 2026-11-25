/**
 * The engine's loader for `inth.choices.js` (`ui/load-choices-file.ts`):
 * it publishes the engine's shared functions first, carries the nonce,
 * accepts only a file from its own release, and tries again after a
 * failed load. The built files run in Chromium in
 * `init-script.browser.test.ts`.
 */
import { afterEach, describe, expect, it } from 'vite-plus/test';

import {
	CHOICES_ENGINE_KEY,
	CHOICES_KEY,
	loadChoicesFile,
} from '../ui/load-choices-file';
import type { ChoicesEngine, ChoicesFile } from '../ui/load-choices-file';
import * as engine from '../ui/parts/engine';

const target = window as unknown as Record<string, unknown>;

const pendingScript = (): HTMLScriptElement => {
	const script = document.head.querySelector('script');
	if (!script) {
		throw new Error('No script was added.');
	}
	return script;
};

const file = (version: string) => ({ version }) as unknown as ChoicesFile;

const params = {
	engine: engine as ChoicesEngine,
	nonce: 'abc123',
	src: 'https://cdn.example/inth.choices.js?v=1.0.0',
	version: '1.0.0',
};

afterEach(() => {
	target[CHOICES_KEY] = undefined;
	target[CHOICES_ENGINE_KEY] = undefined;
	for (const script of document.head.querySelectorAll('script')) {
		script.remove();
	}
});

describe('loadChoicesFile', () => {
	it('publishes the engine before the file runs, with the nonce', async () => {
		const loading = loadChoicesFile(params);
		const script = pendingScript();
		expect(script.src).toBe(params.src);
		expect(script.nonce).toBe('abc123');
		expect(target[CHOICES_ENGINE_KEY]).toBe(engine);
		target[CHOICES_KEY] = file('1.0.0');
		script.dispatchEvent(new Event('load'));
		await expect(loading).resolves.toBe(target[CHOICES_KEY]);
		// Once loaded, no second request.
		await expect(loadChoicesFile(params)).resolves.toBe(target[CHOICES_KEY]);
		expect(document.head.querySelectorAll('script')).toHaveLength(0);
	});

	it('refuses a file from another release', async () => {
		const loading = loadChoicesFile(params);
		target[CHOICES_KEY] = file('0.9.0');
		pendingScript().dispatchEvent(new Event('load'));
		await expect(loading).rejects.toThrow(/another release/u);
	});

	it('tries again after a failed load', async () => {
		const first = loadChoicesFile(params);
		// Calls while it loads share the request.
		expect(loadChoicesFile(params)).toBe(first);
		pendingScript().dispatchEvent(new Event('error'));
		await expect(first).rejects.toThrow(/did not load/u);
		const second = loadChoicesFile(params);
		expect(second).not.toBe(first);
		target[CHOICES_KEY] = file('1.0.0');
		pendingScript().dispatchEvent(new Event('load'));
		await expect(second).resolves.toBe(target[CHOICES_KEY]);
	});
});
