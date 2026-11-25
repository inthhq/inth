/**
 * The prompt's and dialog's receipt and rights bundle read the local
 * opt-out receipt data. The server renders with its own value, so the
 * browser starts from that value and adopts its local data only once
 * mounted, as React's `useSyncExternalStore` does; otherwise SvelteKit
 * would hydrate the server's markup with different data.
 */
import type { ConsentKernel } from '@inth/sdk/engine';
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, expect, test } from 'vite-plus/test';

import Fixture from './fixtures/receipt-data-fixture.svelte';

let mounted: Record<string, unknown> | undefined;

afterEach(() => {
	if (mounted) {
		void unmount(mounted);
		mounted = undefined;
	}
	document.body.innerHTML = '';
});

const receiptData = (reference: string | null) =>
	Object.freeze({ localAct: null, reference, rightsConfirmed: false });

test('[RCPT-01] the receipt data starts from the server value and follows the local data once mounted', () => {
	const kernel = {
		getOptOutReceiptData: () => receiptData('local-reference'),
		getServerOptOutReceiptData: () => receiptData(null),
		onOptOutReceiptDataChange: () => () => undefined,
		subscribe: () => () => undefined,
	} as unknown as ConsentKernel;
	mounted = mount(Fixture, { props: { kernel }, target: document.body });
	const reference = () =>
		document.querySelector('[data-testid="receipt-reference"]')?.textContent;
	// The first render, which hydration matches against the server's.
	expect(reference()).toBe('none');
	flushSync();
	expect(reference()).toBe('local-reference');
});
