/**
 * A deferred root starts plain scripts the visitor's state allows before
 * the engine loads. It leaves an `@inth/integrations` script to the
 * loader, which may load it from the script registry instead.
 */
import type { ConsentSnapshot, Script } from '@inth/sdk/engine';
import { afterEach, expect, test } from 'vitest';

import { startPlainScripts } from '../lib/deferred/scripts';

const granted = {
	effectivePermissions: { necessary: true },
} as unknown as ConsentSnapshot;

afterEach(() => {
	document.head.replaceChildren();
	Reflect.deleteProperty(window, '__inthStarted');
});

test('leaves an integration script to the loader', () => {
	const plain: Script = {
		category: 'necessary',
		id: 'plain',
		src: 'https://cdn.example.com/plain.js',
	};
	const integration: Script = {
		category: 'necessary',
		id: 'vendor',
		integration: 'vendor',
		src: 'https://cdn.vendor.example/vendor.js',
	};

	startPlainScripts([plain, integration], granted, undefined);

	expect(
		[...document.querySelectorAll('script')].map((tag) => tag.src)
	).toEqual([plain.src]);
});
