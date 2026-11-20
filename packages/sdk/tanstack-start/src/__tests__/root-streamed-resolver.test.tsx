/**
 * InthProvider applies a streamed state with code it loaded up front.
 *
 * A streamed root loader hands the root its consent state unawaited. If
 * the code that applies a pending state loaded only once the root saw the
 * promise, the banner would wait for one more request after hydration: a
 * full round trip on a phone. Here any load of that code after the root
 * mounts never finishes, so the banner shows only if the root brought the
 * code with it.
 */
import { useActiveUI, useModel } from '@inth/react';
import { describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { InthProvider } from '../root';
import type { ConsentState } from '../server';
import { policyFixture } from './policy-fixture';

const streamedInit = vi.hoisted(() => ({ mounted: false }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- The property under test is when the resolver module loads: one load after mount stands in for a chunk the network never delivers.
vi.mock('@inth/sdk/runtime/streamed-init', async (importOriginal) => {
	if (streamedInit.mounted) {
		await new Promise(() => {
			// Never settles.
		});
	}
	return await importOriginal();
});

const Status = () => {
	const model = useModel();
	const activeUI = useActiveUI();
	return <div data-testid="status">{`${model ?? 'pending'}/${activeUI}`}</div>;
};

describe('InthProvider: streamed state', () => {
	test('shows the banner without loading code after mount', async () => {
		let resolveState: (state: ConsentState) => void = () => undefined;
		const state = new Promise<ConsentState>((resolve) => {
			resolveState = resolve;
		});
		streamedInit.mounted = true;

		const { getByTestId } = await render(
			<InthProvider
				persistence={false}
				state={state}
			>
				<Status />
			</InthProvider>
		);
		await expect
			.element(getByTestId('status'))
			.toHaveTextContent('pending/none');

		resolveState(policyFixture());
		await expect
			.element(getByTestId('status'))
			.toHaveTextContent('opt-in/banner');
	});
});
