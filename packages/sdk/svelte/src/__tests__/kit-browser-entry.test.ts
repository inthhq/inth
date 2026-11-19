import { describe, expect, test } from 'vitest';

import packageJson from '../../package.json';
import * as browserEntry from '../lib/kit/browser';
import InthProvider from '../lib/kit/inth-provider.svelte';

// SvelteKit refuses client code that reaches `$app/server`, which the
// server side of `@inth/svelte/kit` imports.
describe('@inth/svelte/kit in a browser build', () => {
	test('resolves to the browser entry', () => {
		expect(packageJson.exports['./kit']).toMatchObject({
			browser: './dist/kit/browser.js',
		});
	});

	test('the browser entry exports only InthProvider', () => {
		expect(Object.keys(browserEntry)).toEqual(['InthProvider']);
		expect(browserEntry.InthProvider).toBe(InthProvider);
	});
});
