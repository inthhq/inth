/**
 * `experimentalScriptRegistry` on `ConsentProvider` reaches the core
 * runtime: an integration init lists loads from the registry's URL, and the
 * browser runs it only when its bytes match the hash.
 */
import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands } from 'vitest/browser';

import { ConsentProvider } from '../index';
import {
	integrationScript,
	listing,
	registryFixture,
	sha384,
} from './script-registry-fixtures';

const tag = (src: string) =>
	document.head.querySelector<HTMLScriptElement>(`script[src="${src}"]`);

afterEach(() => {
	delete window.__registryCopy;
});

test('loads an integration from the registry, and the browser runs the copy that matches its hash', async () => {
	const { body, registrySrc, run, vendorSrc } = registryFixture();
	await commands.serveScript(registrySrc, body);
	await commands.serveScript(vendorSrc, "window.__registryCopy = 'vendor';");
	const onLoad = vi.fn();
	const screen = await render(
		<ConsentProvider
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
		</ConsentProvider>
	);

	await vi.waitFor(() => expect(onLoad).toHaveBeenCalled());
	expect(window.__registryCopy).toBe(`registry-${run}`);
	expect({
		crossorigin: tag(registrySrc)?.getAttribute('crossorigin'),
		integrity: tag(registrySrc)?.getAttribute('integrity'),
	}).toEqual({ crossorigin: 'anonymous', integrity: await sha384(body) });
	expect(await commands.servedScriptCount(vendorSrc)).toBe(0);
	await screen.unmount();
});

test('does not run a registry copy whose bytes changed, and does not fall back to the vendor', async () => {
	const { body, registrySrc, vendorSrc } = registryFixture();
	await commands.serveScript(registrySrc, `${body} /* changed */`);
	await commands.serveScript(vendorSrc, "window.__registryCopy = 'vendor';");
	const onError = vi.fn();
	const screen = await render(
		<ConsentProvider
			options={{
				experimentalScriptRegistry: true,
				mode: listing({
					vendor: { integrity: await sha384(body), src: registrySrc },
				}),
				persistence: false,
				scripts: [integrationScript(vendorSrc, { onError })],
			}}
		>
			app
		</ConsentProvider>
	);

	await vi.waitFor(() => expect(onError).toHaveBeenCalled());
	expect(window.__registryCopy).toBeUndefined();
	expect(await commands.servedScriptCount(vendorSrc)).toBe(0);
	await screen.unmount();
});

test('loads the vendor URL without the option, though init lists the script', async () => {
	const { body, registrySrc, vendorSrc } = registryFixture();
	await commands.serveScript(registrySrc, body);
	await commands.serveScript(vendorSrc, "window.__registryCopy = 'vendor';");
	const onLoad = vi.fn();
	const screen = await render(
		<ConsentProvider
			options={{
				mode: listing({
					vendor: { integrity: await sha384(body), src: registrySrc },
				}),
				persistence: false,
				scripts: [integrationScript(vendorSrc, { onLoad })],
			}}
		>
			app
		</ConsentProvider>
	);

	await vi.waitFor(() => expect(onLoad).toHaveBeenCalled());
	expect(window.__registryCopy).toBe('vendor');
	expect(tag(vendorSrc)?.getAttribute('integrity')).toBeNull();
	expect(await commands.servedScriptCount(registrySrc)).toBe(0);
	await screen.unmount();
});
