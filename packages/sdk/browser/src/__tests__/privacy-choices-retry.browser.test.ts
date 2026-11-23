/**
 * A Privacy Choices part that fails to load is tried again (C1). The
 * classic banner leaves as soon as the design applies, so a prompt chunk
 * that never loads must not leave the visitor with no consent UI: the
 * classic banner stands in meanwhile. Its own file, since it mocks the
 * loader for every page it starts.
 */
import { showConsentSurface } from '@inth/sdk-core/surface-actions';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type * as loader from '../ui/privacy-choices/pc-import';
import {
	$,
	all,
	startPrivacyChoicesPage,
	stopPrivacyChoicesPages,
} from './fixtures/privacy-choices';

const failures = vi.hoisted(() => ({ dialog: 0, presentation: 0 }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- A dev server cannot fail one chunk request and serve the next. The factory keeps the real loader and fails only the calls a test asks it to.
vi.mock('../ui/privacy-choices/pc-import', async (importOriginal) => {
	const actual = await importOriginal<typeof loader>();
	return {
		...actual,
		importPresentation: (
			type: Parameters<typeof actual.importPresentation>[0]
		) => {
			if (failures.presentation > 0) {
				failures.presentation -= 1;
				return Promise.reject(new Error('The chunk failed to load.'));
			}
			return actual.importPresentation(type);
		},
		importPrivacyChoicesDialog: () => {
			if (failures.dialog > 0) {
				failures.dialog -= 1;
				return Promise.reject(new Error('The chunk failed to load.'));
			}
			return actual.importPrivacyChoicesDialog();
		},
	};
});

const settle = () =>
	new Promise((resolve) => {
		setTimeout(resolve, 100);
	});

afterEach(() => {
	stopPrivacyChoicesPages();
	failures.dialog = 0;
	failures.presentation = 0;
	vi.restoreAllMocks();
});

describe('a failed Privacy Choices load', () => {
	test('the classic banner stands in for a prompt that failed to load, until the next sync loads it', async () => {
		const error = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		failures.presentation = 1;
		const client = await startPrivacyChoicesPage({ dialog: false });
		await vi.waitFor(() => expect(error).toHaveBeenCalled());
		await settle();
		expect($('consent-banner-root')).not.toBeNull();
		expect($('consent-banner-root')).not.toHaveAttribute('data-design');
		// Any later sync tries again.
		showConsentSurface(client.kernel, 'none');
		showConsentSurface(client.kernel, 'banner');
		await vi.waitFor(
			() =>
				expect($('consent-banner-root')).toHaveAttribute(
					'data-design',
					'privacy-choices'
				),
			{ timeout: 4000 }
		);
		expect(all('[data-testid="consent-banner-root"]')).toHaveLength(1);
	});

	test('the dialog opens on the next open after its first load fails', async () => {
		const error = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		failures.dialog = 1;
		const client = await startPrivacyChoicesPage({
			banner: false,
			region: 'us-opt-out',
		});
		client.openDialog();
		await vi.waitFor(() => expect(error).toHaveBeenCalled());
		expect($('consent-dialog-root')).toBeNull();
		showConsentSurface(client.kernel, 'none');
		client.openDialog();
		await vi.waitFor(
			() =>
				expect($('consent-dialog-root')).toHaveAttribute(
					'data-design',
					'privacy-choices'
				),
			{ timeout: 4000 }
		);
	});
});
