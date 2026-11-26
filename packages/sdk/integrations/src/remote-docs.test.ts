// @vitest-environment node
import { expect, it } from 'vite-plus/test';

import { renderRemoteDocs } from './__tests__/remote-docs';

it('the docs list every remote integration with its options', async () => {
	// Fails after a vendor's `remote` export changes; rerun this file with
	// `-u` to rewrite the table.
	await expect(renderRemoteDocs()).toMatchFileSnapshot(
		'../../docs/shared/reference/remote-integrations.mdx'
	);
});
