import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { ConsentDialog } from '~/aggregate-components';
import { warmDialogChunk } from '~/chunk-warming';
import { ConsentBanner } from '~/components/prompt';

import { ComponentFixtureProvider } from './component-fixture-provider';
import { transportMode } from './fixtures/transport-mode';
// The dialog module loads only once the test warms it, after this observer.
import { moduleRequested } from './module-requests';
import { policyFixture } from './policy-fixture';

// The deferred root's early dialog imports this module. A bundler that
// builds a chunk group per import() call site (Turbopack) duplicates the
// panel when the warmer imports anything else, and a Customize tap after a
// hover downloads both copies.
const EARLY_DIALOG_MODULE = '/src/deferred/dialog.ts';

test('warming the dialog loads the chunk the deferred root opens early', async () => {
	const screen = await render(
		<ComponentFixtureProvider
			options={{
				disableAnimation: true,
				mode: transportMode({}),
				persistence: false,
				prefetch: policyFixture({}, { model: 'opt-in' }),
			}}
		>
			<ConsentBanner disableAnimation />
			<ConsentDialog />
		</ComponentFixtureProvider>
	);
	expect(moduleRequested(EARLY_DIALOG_MODULE)).toBe(false);
	warmDialogChunk();
	await vi.waitFor(
		() => expect(moduleRequested(EARLY_DIALOG_MODULE)).toBe(true),
		{ timeout: 5000 }
	);
	await screen.unmount();
});

test('the dialog chunk carries no embedded widget', async () => {
	const screen = await render(
		<ComponentFixtureProvider
			options={{
				disableAnimation: true,
				mode: transportMode({}),
				persistence: false,
				prefetch: policyFixture({}, { model: 'opt-in' }),
			}}
		>
			<ConsentDialog />
		</ComponentFixtureProvider>
	);
	warmDialogChunk();
	await vi.waitFor(
		() =>
			expect(moduleRequested('/src/components/dialog/dialog.tsx')).toBe(true),
		{ timeout: 5000 }
	);
	// `ConsentWidget` and its sheets load only on a page that renders it.
	await new Promise((resolve) => {
		setTimeout(resolve, 200);
	});
	expect(moduleRequested('/src/components/preferences/index.ts')).toBe(false);
	await screen.unmount();
});
