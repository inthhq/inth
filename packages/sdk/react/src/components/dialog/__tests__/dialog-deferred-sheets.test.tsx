/**
 * The consent dialog under a controlled `open` while its deferred
 * stylesheet is still loading. The sheet's load waits on a gate this file
 * opens, so the consent manager shows the dialog before it can paint.
 */
import { useEffect } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';

import { ComponentFixtureProvider as InthProvider } from '~/__tests__/component-fixture-provider';
import { policyFixture } from '~/__tests__/policy-fixture';
import { ConsentDialog } from '~/aggregate-components';
import type * as DialogSheets from '~/components/dialog/sheets';
import { ConsentBanner } from '~/components/prompt';
import { useSnapshot } from '~/hooks';

import { testing } from '../../../testing';

const gate = vi.hoisted(() => {
	let release: (css: string) => void = () => undefined;
	const loaded = new Promise<string>((resolve) => {
		release = resolve;
	});
	return { loaded, release: (css = '') => release(css) };
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- The property under test is what happens while the dialog's deferred sheet loads, and only a framework that put the sheet in the server HTML gives it a load. The factory keeps the real sheets and adds one whose load waits on this file.
vi.mock('~/components/dialog/sheets', async (importOriginal) => {
	const actual = await importOriginal<typeof DialogSheets>();
	return {
		DIALOG_SHEETS: [
			...actual.DIALOG_SHEETS,
			{ id: 'inth-test-gated-dialog', load: () => gate.loaded },
		],
	};
});

const probe: { snapshot: ReturnType<typeof useSnapshot> | null } = {
	snapshot: null,
};
const SnapshotProbe = () => {
	const snapshot = useSnapshot();
	useEffect(() => {
		probe.snapshot = snapshot;
	}, [snapshot]);
	return null;
};

const $ = (testId: string) =>
	document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
const waitFor = <T,>(check: () => T) => vi.waitFor(check, { timeout: 4000 });

afterEach(() => {
	gate.release();
});

test('[PERM-01] a controlled open turning false before the styles load closes the dialog, and the banner comes back', async () => {
	await page.viewport(1280, 800);
	const tree = (open: boolean) => (
		<InthProvider
			options={{
				consentCategories: ['necessary', 'measurement', 'marketing'],
				mode: testing(),
				persistence: false,
				prefetch: policyFixture(undefined, { id: 'pcd-deferred-sheets' }),
				presentation: {
					prompt: { container: { type: 'card' } },
				},
			}}
		>
			<ConsentBanner disableAnimation />
			<ConsentDialog
				disableAnimation
				open={open}
			/>
			<SnapshotProbe />
		</InthProvider>
	);
	const screen = await render(tree(true));
	// The consent manager hands over to the dialog, which waits on its styles.
	await waitFor(() => expect(probe.snapshot?.activeUI).toBe('dialog'));
	expect($('consent-dialog-card')).toBeNull();
	expect($('consent-banner-root')).toBeNull();

	await screen.rerender(tree(false));
	await waitFor(() => expect(probe.snapshot?.activeUI).toBe('banner'));
	await waitFor(() => expect($('consent-banner-root')).toBeInTheDocument());

	// Once the styles arrive, the closed dialog stays closed.
	gate.release();
	await waitFor(() => expect($('consent-banner-root')).toBeInTheDocument());
	expect($('consent-dialog-card')).toBeNull();
	expect(probe.snapshot?.activeUI).toBe('banner');
});
