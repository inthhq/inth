/**
 * InthProvider runs the mode the state carries.
 *
 * `testing()` from the server function resolves the recommended rules in the
 * browser, with no backend. That the offline code stays out of the root's
 * first-load JavaScript is checked on the built package in
 * `client-chunks.test.ts`.
 */
import { useActiveUI, useModel } from '@inth/react';
import { describe, expect, test, vi } from 'vite-plus/test';
import { render } from 'vitest-browser-react';

import { InthProvider } from '../root';
import { testing } from '../testing';

const PolicyStatus = () => {
	const model = useModel();
	const activeUI = useActiveUI();
	return (
		<div data-testid="policy">
			{model ?? 'pending'}/{activeUI}
		</div>
	);
};

describe('InthProvider offline mode', () => {
	test('offline() in the state resolves the recommended rules locally', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		try {
			const { getByTestId } = await render(
				<InthProvider
					persistence={false}
					state={{
						initialOverrides: { country: 'DE' },
						mode: testing(),
					}}
				>
					<PolicyStatus />
				</InthProvider>
			);

			await expect
				.element(getByTestId('policy'))
				.toMatchTextContent('opt-in/banner');
			expect(fetchSpy).not.toHaveBeenCalled();
		} finally {
			fetchSpy.mockRestore();
		}
	});

	test('a state without a backend URL fails loudly instead of guessing', async () => {
		const error = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		try {
			await expect(
				render(
					<InthProvider
						persistence={false}
						state={{}}
					>
						<PolicyStatus />
					</InthProvider>
				)
			).rejects.toThrow('`projectUrl` is required');
		} finally {
			error.mockRestore();
		}
	});
});
