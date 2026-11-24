/**
 * When `InthProvider` makes the provider download the runtime's update
 * module. The root renders again whenever its parent does; with the same
 * props, that rerender should load nothing. Its own file, because a module
 * loads once per test file.
 */
import { expect, test } from 'vite-plus/test';
import { render } from 'vitest-browser-react';

import { InthProvider } from '../root';
import { testing } from '../testing';
import { policyFixture } from './policy-fixture';

/** These tests are not about the backend; testing() needs none. */
const OFFLINE_CONFIG = { mode: testing() };

const updateModuleRequests = () =>
	performance
		.getEntriesByType('resource')
		.filter(({ name }) => name.includes('/core/src/runtime/provider-update'));

test('a rerender with the same props loads no update module', async () => {
	// Vite's module graph can fill the browser's default resource buffer.
	performance.setResourceTimingBufferSize(5000);
	performance.clearResourceTimings();
	const state = policyFixture({});
	const root = () => (
		<InthProvider
			config={OFFLINE_CONFIG}
			persistence={false}
			state={state}
		>
			<div>root rendered</div>
		</InthProvider>
	);
	const screen = await render(root());
	await screen.rerender(root());
	await screen.rerender(root());
	await new Promise((resolve) => {
		setTimeout(resolve, 100);
	});

	expect(updateModuleRequests()).toHaveLength(0);
});
