/**
 * A UI part that fails to load is tried again (C1): a prompt or dialog
 * chunk that failed once must not leave the visitor without a consent UI
 * for good. Its own file, since it mocks the loader for every page it
 * starts.
 */
import { showConsentSurface } from '@inth/sdk-core/surface-actions';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import type * as loader from '../ui/parts/load';
import {
	$,
	all,
	startConsentPage,
	stopConsentPages,
} from './fixtures/consent-ui';

const failures = vi.hoisted(() => ({ dialog: 0, presentation: 0 }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- A dev server cannot fail one chunk request and serve the next. The factory keeps the real loader and fails only the calls a test asks it to.
vi.mock('../ui/parts/load', async (importOriginal) => {
	const actual = await importOriginal<typeof loader>();
	return {
		...actual,
		importDialog: () => {
			if (failures.dialog > 0) {
				failures.dialog -= 1;
				return Promise.reject(new Error('The chunk failed to load.'));
			}
			return actual.importDialog();
		},
		importPresentation: (
			type: Parameters<typeof actual.importPresentation>[0]
		) => {
			if (failures.presentation > 0) {
				failures.presentation -= 1;
				return Promise.reject(new Error('The chunk failed to load.'));
			}
			return actual.importPresentation(type);
		},
	};
});

const settle = () =>
	new Promise((resolve) => {
		setTimeout(resolve, 100);
	});

afterEach(() => {
	stopConsentPages();
	failures.dialog = 0;
	failures.presentation = 0;
	vi.restoreAllMocks();
});

describe('a failed load', () => {
	test('a prompt that failed to load loads on the next sync', async () => {
		const error = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		failures.presentation = 1;
		const client = await startConsentPage({ dialog: false });
		await vi.waitFor(() => expect(error).toHaveBeenCalled());
		await settle();
		expect($('consent-banner-root')).toBeNull();
		// Any later sync tries again.
		showConsentSurface(client.kernel, 'none');
		showConsentSurface(client.kernel, 'banner');
		await vi.waitFor(() => expect($('consent-banner-root')).not.toBeNull(), {
			timeout: 4000,
		});
		expect(all('[data-testid="consent-banner-root"]')).toHaveLength(1);
	});

	test('the dialog opens on the next open after its first load fails', async () => {
		const error = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		failures.dialog = 1;
		const client = await startConsentPage({
			banner: false,
			region: 'us-opt-out',
		});
		client.openDialog();
		await vi.waitFor(() => expect(error).toHaveBeenCalled());
		expect($('consent-dialog-root')).toBeNull();
		showConsentSurface(client.kernel, 'none');
		client.openDialog();
		await vi.waitFor(() => expect($('consent-dialog-root')).not.toBeNull(), {
			timeout: 4000,
		});
	});
});
