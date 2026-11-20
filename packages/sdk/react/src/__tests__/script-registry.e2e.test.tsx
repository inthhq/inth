/**
 * `experimentalScriptRegistry` on `InthProvider` reaches the core
 * runtime: an integration init lists loads from the registry's URL, and the
 * browser runs it only when its bytes match the hash.
 */
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands } from 'vitest/browser';

import { InthProvider } from '../index';
import { transportMode } from './fixtures/transport-mode';
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
	delete (window as { __loggerCopy?: string }).__loggerCopy;
});

test('loads an integration from the registry, and the browser runs the copy that matches its hash', async () => {
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
		<InthProvider
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
		</InthProvider>
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
		<InthProvider
			options={{
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

	await vi.waitFor(() => expect(onLoad).toHaveBeenCalled());
	expect(window.__registryCopy).toBe('vendor');
	expect(tag(vendorSrc)?.getAttribute('integrity')).toBeNull();
	expect(await commands.servedScriptCount(registrySrc)).toBe(0);
	await screen.unmount();
});

/** A keyed list React reorders and shrinks, with `insertBefore` and `removeChild`. */
const Rows = () => {
	const [rows, setRows] = useState(['a', 'b', 'c', 'd']);
	return (
		<div>
			<button
				onClick={() => setRows((list) => [...list].reverse())}
				type="button"
			>
				reverse
			</button>
			<button
				onClick={() => setRows((list) => list.slice(1))}
				type="button"
			>
				drop
			</button>
			<ul>
				{rows.map((row) => (
					<li key={row}>{row}</li>
				))}
			</ul>
		</div>
	);
};

test("renders and updates a React tree with the pin on, and pins the file the integration's loader inserts", async () => {
	const { registrySrc, run, vendorSrc } = registryFixture();
	const loggerVendor = `https://cdn.vendor.example/logger-${run}.js`;
	const loggerRegistry = `https://acme.inth.app/scripts/vendor/logger@${run}.js`;
	const loggerBody = "window.__loggerCopy = 'registry';";
	// The registry's copy of the loader inserts its logger from the vendor.
	const loaderBody = `const s = document.createElement('script'); s.src = ${JSON.stringify(loggerVendor)}; document.head.appendChild(s);`;
	await commands.serveScript(registrySrc, loaderBody);
	await commands.serveScript(loggerRegistry, loggerBody);
	await commands.serveScript(loggerVendor, "window.__loggerCopy = 'vendor';");
	const loggerIntegrity = await sha384(loggerBody);
	const loaderIntegrity = await sha384(loaderBody);
	const nativeInsertBefore = Node.prototype.insertBefore;
	const screen = await render(
		<InthProvider
			options={{
				experimentalScriptRegistry: true,
				mode: transportMode({
					init: () =>
						Promise.resolve({
							scriptRegistry: {
								files: {
									[loggerVendor]: {
										integrity: loggerIntegrity,
										src: loggerRegistry,
									},
								},
								sources: {
									vendor: { integrity: loaderIntegrity, src: registrySrc },
								},
							},
						}) as never,
					save: () => Promise.resolve({ ok: true }),
				}),
				persistence: false,
				scripts: [integrationScript(vendorSrc)],
			}}
		>
			<Rows />
		</InthProvider>
	);

	await vi.waitFor(() =>
		expect((window as { __loggerCopy?: string }).__loggerCopy).toBe('registry')
	);
	expect(Node.prototype.insertBefore).not.toBe(nativeInsertBefore);
	await screen.getByRole('button', { name: 'reverse' }).click();
	await screen.getByRole('button', { name: 'drop' }).click();
	expect(
		Array.from(document.querySelectorAll('li'), (item) => item.textContent)
	).toEqual(['c', 'b', 'a']);
	expect(await commands.servedScriptCount(loggerVendor)).toBe(0);
	await screen.unmount();
});
