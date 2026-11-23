import { policyRulePresets } from '@inth/sdk-core';
import type { ConsentPresentation, ConsentSnapshot } from '@inth/sdk-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestingConsentClient as createConsentClient } from '../testing-global';
import type { ConsentClient } from '../types';
// Not `./dialog-surface`: the suites alias that specifier to the dialog
// itself, as the script-tag builds do.
import { createDialog } from '../ui/dialog-surface';
import type { SurfaceContext } from '../ui/surface';

const clients: ConsentClient[] = [];

afterEach(() => {
	vi.unstubAllGlobals();
	for (const client of clients.splice(0)) {
		client.dispose();
	}
	localStorage.clear();
	document.body.replaceChildren();
});

const setup = async function setup(
	presentation?: ConsentPresentation
): Promise<{
	client: ConsentClient;
	ctx: SurfaceContext;
	root: HTMLElement;
}> {
	const client = createConsentClient(
		{
			consentCategories: ['measurement'],
			policy: [
				{
					...policyRulePresets.europeOptIn(),
					categories: ['measurement'],
					match: { isDefault: true },
				},
			],
			presentation,
			ui: false,
		},
		{ pkg: '@inth/sdk/test' }
	);
	clients.push(client);
	client.start();
	await client.ready();
	const root = document.createElement('div');
	document.body.append(root);
	return {
		client,
		ctx: {
			client,
			disableAnimation: true,
			legalLinks: undefined,
			noStyle: false,
			root,
			slot: (element) => element,
		},
		root,
	};
};

const dialogRoot = (root: HTMLElement) =>
	root.querySelector('[data-testid="consent-dialog-root"]');

describe('warming', () => {
	/** Idle callbacks, counted: warming the classic dialog asks for one. */
	const watchIdle = () => {
		const idle = vi.fn(() => 0);
		vi.stubGlobal('requestIdleCallback', idle);
		return idle;
	};

	it('the trigger warms the classic dialog on the classic design', async () => {
		const { client, ctx } = await setup();
		const idle = watchIdle();
		const surface = createDialog(ctx, {}, true);
		surface.sync(client.getSnapshot());
		// Warming waits for the page's load.
		window.dispatchEvent(new Event('load'));
		expect(idle).toHaveBeenCalled();
		surface.destroy();
	});

	it('a Privacy Choices page never downloads the classic dialog', async () => {
		const { client, ctx } = await setup({
			design: 'privacy-choices',
			prompt: { container: { type: 'card' } },
		});
		// Open, so the Privacy Choices dialog loads at once rather than
		// warming in idle time.
		client.openDialog();
		const idle = watchIdle();
		const surface = createDialog(ctx, {}, true);
		surface.sync(client.getSnapshot());
		window.dispatchEvent(new Event('load'));
		expect(idle).not.toHaveBeenCalled();
		surface.destroy();
	});
});

describe('on-demand preference centre', () => {
	it('loads when the dialog opens and renders the newest snapshot', async () => {
		const { client, ctx, root } = await setup();
		const surface = createDialog(ctx, {});
		surface.sync(client.getSnapshot());
		expect(dialogRoot(root)).toBeNull();

		client.openDialog();
		const opened: ConsentSnapshot = client.getSnapshot();
		surface.sync(opened);
		// Not rendered in the task that opened it: the chunk is still loading.
		expect(dialogRoot(root)).toBeNull();
		await vi.waitFor(() => {
			expect(dialogRoot(root)).not.toBeNull();
		});

		client.closeDialog();
		surface.sync(client.getSnapshot());
		expect(
			dialogRoot(root)?.closest('[data-state]')?.getAttribute('data-state')
		).not.toBe('open');
		surface.destroy();
	});

	it('does not render after it is destroyed while loading', async () => {
		const { client, ctx, root } = await setup();
		const surface = createDialog(ctx, {});
		client.openDialog();
		surface.sync(client.getSnapshot());
		surface.destroy();
		// Let the chunk land.
		await import('../ui/dialog');
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 0);
		});
		expect(dialogRoot(root)).toBeNull();
	});

	it('closes without rendering when the dialog closes before the chunk lands', async () => {
		const { client, ctx, root } = await setup();
		const surface = createDialog(ctx, {});
		client.openDialog();
		surface.sync(client.getSnapshot());
		client.closeDialog();
		surface.sync(client.getSnapshot());
		await import('../ui/dialog');
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 0);
		});
		expect(dialogRoot(root)).toBeNull();
		surface.destroy();
	});
});
