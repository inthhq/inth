import { describe, expect, test } from 'vitest';

import manifest from '../../package.json';
import * as entry from '../lib/dialog-panel';

describe('@c15t/svelte/dialog-panel', () => {
	test('exports the dialog the root ConsentDialog loads on first open', async () => {
		expect(manifest.exports['./dialog-panel']).toEqual({
			default: './dist/dialog-panel.js',
			svelte: './dist/dialog-panel.js',
			types: './dist/dialog-panel.d.ts',
		});
		// The same module the deferred wrapper imports, so a bundle that has
		// both keeps one copy of the dialog.
		const panel = await import('../lib/components/panel.svelte');
		expect(entry.ConsentDialogPanel).toBe(panel.default);
	});
});
