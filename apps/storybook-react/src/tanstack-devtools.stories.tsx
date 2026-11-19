import {
	devToolsProviderOptions,
	getDevToolsCategories,
} from '@inth/conformance/fixtures/devtools';
import { devToolsFlow } from '@inth/conformance/play/devtools';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TanStackDevtools } from '@tanstack/react-devtools';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { inthDevtools } from '../../../packages/sdk/react/src/devtools';
import { InthProvider } from '../../../packages/sdk/react/src/index';

const plugins = [
	inthDevtools({
		defaultOpen: true,
		getConsentCategories: getDevToolsCategories,
	}),
];
const TanStackExample = () => {
	const [mounted, setMounted] = useState(true);
	return (
		<InthProvider options={devToolsProviderOptions}>
			<button
				onClick={() => setMounted((value) => !value)}
				type="button"
			>
				Toggle host
			</button>
			{mounted ? (
				<TanStackDevtools
					config={{ defaultOpen: true }}
					plugins={plugins}
				/>
			) : null}
		</InthProvider>
	);
};

const meta = {
	component: TanStackExample,
	parameters: { layout: 'fullscreen' },
	tags: ['devtools'],
	// Deliberately unpaired. Verify integration behavior, not TanStack's appearance.
	title: 'Integrations/TanStack Devtools',
} satisfies Meta<typeof TanStackExample>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ConsentAndScriptsFlow: Story = {
	play: async (context) => {
		await devToolsFlow(context);
		const panelRoot = () =>
			document
				.querySelector('[data-inth-dev-tools-host]')
				?.shadowRoot?.querySelector('[data-inth-dev-tools]') ?? null;
		const root = panelRoot();
		expect(root?.classList.contains('inth-dev-tools--embedded')).toBe(true);
		expect(
			within(document.body).queryByRole('button', {
				name: 'Open Inth DevTools',
			})
		).toBeNull();
		await userEvent.click(
			within(document.body).getByRole('button', { name: 'Toggle host' })
		);
		await waitFor(() => expect(panelRoot()).toBeNull());
		await userEvent.click(
			within(document.body).getByRole('button', { name: 'Toggle host' })
		);
		await waitFor(() => {
			expect(
				document.querySelectorAll('[data-inth-dev-tools-host]')
			).toHaveLength(1);
			expect(panelRoot()).not.toBeNull();
		});
	},
};
