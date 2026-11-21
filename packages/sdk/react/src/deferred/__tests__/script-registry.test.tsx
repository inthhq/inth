/**
 * `experimentalScriptRegistry` on the deferred `InthProvider`, the one
 * a browser build of `@inth/react` exports, reaches the engine it loads.
 * Its own file: the provider loads its engine once per page.
 */
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands } from 'vitest/browser';

import {
	integrationScript,
	listing,
	registryFixture,
	sha384,
} from '../../__tests__/script-registry-fixtures';
import { createConsentProvider } from '../client-provider';

const InthProvider = createConsentProvider(() => import('../client-engine'));

test('loads an integration from the registry source init lists', async () => {
	const { body, registrySrc, run, vendorSrc } = registryFixture();
	await commands.serveScript(registrySrc, body);
	await commands.serveScript(vendorSrc, "window.__registryCopy = 'vendor';");
	const onLoad = vi.fn();
	const screen = await render(
		<InthProvider
			options={{
				experimentalScriptRegistry: true,
				mode: listing({
					vendor: { integrity: await sha384(body), src: registrySrc },
				}),
				persistence: false,
				scripts: [integrationScript(vendorSrc, { onLoad })],
			}}
		>
			app
		</InthProvider>
	);

	await vi.waitFor(() => expect(onLoad).toHaveBeenCalled(), { timeout: 5000 });
	expect(window.__registryCopy).toBe(`registry-${run}`);
	expect(await commands.servedScriptCount(vendorSrc)).toBe(0);
	await screen.unmount();
	delete window.__registryCopy;
});

test('holds an unsigned entry when signatures are required', async () => {
	const { body, registrySrc, vendorSrc } = registryFixture();
	await commands.serveScript(registrySrc, body);
	await commands.serveScript(vendorSrc, "window.__registryCopy = 'vendor';");
	const onDebug = vi.fn();
	const onLoad = vi.fn();
	const screen = await render(
		<InthProvider
			options={{
				experimentalScriptRegistry: { requireSignatures: true },
				mode: listing({
					vendor: { integrity: await sha384(body), src: registrySrc },
				}),
				persistence: false,
				scriptLoader: { onDebug },
				scripts: [integrationScript(vendorSrc, { onLoad })],
			}}
		>
			app
		</InthProvider>
	);

	await vi.waitFor(
		() =>
			expect(onDebug).toHaveBeenCalledWith(
				expect.objectContaining({
					message: expect.stringContaining(
						'without a release signature Inth can verify'
					),
				})
			),
		{ timeout: 5000 }
	);
	expect(onLoad).not.toHaveBeenCalled();
	expect(await commands.servedScriptCount(registrySrc)).toBe(0);
	expect(await commands.servedScriptCount(vendorSrc)).toBe(0);
	await screen.unmount();
});
