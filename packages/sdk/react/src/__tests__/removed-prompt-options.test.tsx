import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { ComponentFixtureProvider as InthProvider } from '~/__tests__/component-fixture-provider';
import { policyFixture } from '~/__tests__/policy-fixture';
import { ConsentBanner } from '~/components/prompt';

import { testing } from '../testing';

test('a removed prompt option warns in development and names its replacement', async () => {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	try {
		const screen = await render(
			<InthProvider
				options={{
					mode: testing(),
					persistence: false,
					prefetch: policyFixture(),
					presentation: {
						prompt: { blocking: true, variant: 'banner' } as never,
					},
				}}
			>
				<ConsentBanner disableAnimation />
			</InthProvider>
		);
		await vi.waitFor(() => {
			expect(warn).toHaveBeenCalledWith(
				'inth presentation: presentation.prompt.blocking was removed and does nothing; use blockUntilChoice instead.',
				[]
			);
		});
		expect(warn).toHaveBeenCalledWith(
			'inth presentation: presentation.prompt.variant was removed and does nothing; use container instead.',
			[]
		);
		await screen.unmount();
	} finally {
		warn.mockRestore();
	}
});
