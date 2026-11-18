/**
 * `ConsentRoot` turns the mode in the state `loadConsent` returned into a
 * transport, or takes one through `mode`.
 */
import { render } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { transportMode } from '../../__tests__/fixtures/transport-mode';
import ConsentRoot from '../../lib/components/consent-root.svelte';

const mockFetch = vi.fn();
window.fetch = mockFetch;

type WindowWithInth = Window & { inth?: { mode: string } };

const initResponse = () =>
	new Response(JSON.stringify({ branding: 'inth' }), {
		headers: { 'Content-Type': 'application/json' },
		status: 200,
	});

describe('ConsentRoot', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mockFetch.mockImplementation(() => Promise.resolve(initResponse()));
	});

	afterEach(() => {
		delete (window as WindowWithInth).inth;
	});

	test('re-inits a manifest() page through the consent route', async () => {
		const result = render(ConsentRoot, {
			state: {
				mode: { type: 'manifest' },
				prefetch: {},
				projectUrl: 'https://consent.example.com',
				routePrefix: '/api/inth',
			},
		});

		await vi.waitFor(() => {
			expect(String(mockFetch.mock.calls[0]?.[0])).toMatch(
				/^\/api\/inth\/init/u
			);
		});
		expect((window as WindowWithInth).inth?.mode).toBe('manifest');
		result.unmount();
	});

	test("asks the backend's /init for a hosted() page", async () => {
		const result = render(ConsentRoot, {
			state: {
				mode: { type: 'hosted' },
				prefetch: {},
				projectUrl: 'https://consent.example.com',
			},
		});

		await vi.waitFor(() => {
			expect(String(mockFetch.mock.calls[0]?.[0])).toMatch(
				/^https:\/\/consent\.example\.com\/init/u
			);
		});
		expect((window as WindowWithInth).inth?.mode).toBe('hosted');
		result.unmount();
	});

	test('uses the transport passed as mode', async () => {
		const init = vi.fn(() => Promise.resolve({}));
		const result = render(ConsentRoot, {
			mode: transportMode({ init }),
			state: { mode: { type: 'manifest' }, prefetch: {} },
		});

		await vi.waitFor(() => {
			expect(init).toHaveBeenCalled();
		});
		expect(mockFetch).not.toHaveBeenCalled();
		result.unmount();
	});
});
