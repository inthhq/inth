/**
 * Without `inth.config.ts` (no alias, so the package stub exports
 * `undefined`) and without a `config` prop, `InthProvider` warns once
 * outside production, and throws when nothing gives it a backend URL
 * instead of running a mode the app never chose.
 */
import { renderToString } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vite-plus/test';
import { render } from 'vitest-browser-react';

import { InthProvider } from '../root';
import { testing } from '../testing';
import { policyFixture } from './policy-fixture';

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

const renderRoot = (props: Partial<Parameters<typeof InthProvider>[0]> = {}) =>
	render(
		<InthProvider
			state={policyFixture()}
			persistence={false}
			{...props}
		>
			<div>root</div>
		</InthProvider>
	);

test('stays quiet with a config prop', async () => {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	await renderRoot({ config: { projectUrl: 'https://consent.example.com' } });

	expect(warn).not.toHaveBeenCalled();
});

test('warns once in development when no config is found', async () => {
	// Next.js inlines the variable; this browser test reads it from `process`.
	vi.stubGlobal('process', {
		env: {
			NEXT_PUBLIC_INTH_PROJECT_URL: 'https://consent.example.com',
			NODE_ENV: 'development',
		},
	});
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	await renderRoot();
	await renderRoot();

	const calls = warn.mock.calls.filter(([message]) =>
		String(message).includes('inth.config.ts')
	);
	expect(calls).toHaveLength(1);
	expect(String(calls[0]?.[0])).toContain('withConsentManifest');
});

test('throws with no config and no NEXT_PUBLIC_INTH_PROJECT_URL', () => {
	vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	// The server render, as `next build` prerenders the layout.
	expect(() =>
		renderToString(
			<InthProvider state={policyFixture()}>
				<div>root</div>
			</InthProvider>
		)
	).toThrow('`projectUrl` is required');
});

test('renders testing() without a backend URL', () => {
	const html = renderToString(
		<InthProvider
			config={{ mode: testing() }}
			state={policyFixture()}
		>
			<div>offline root</div>
		</InthProvider>
	);
	expect(html).toContain('offline root');
});
