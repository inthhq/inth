import { publishDevToolsLauncher } from '@inth/sdk/ui/utils/devtools-launcher';
import { useContext, useEffect } from 'react';
import { describe, expect, test, vi } from 'vite-plus/test';
import { render } from 'vitest-browser-react';

import { ComponentFixtureProvider } from '~/__tests__/component-fixture-provider';
import { KernelContext } from '~/context';

import { testing } from '../../../testing';
import { ConsentDialogTrigger } from '../index';

// This file never imports `~/devtools`, so nothing registers the toolbar
// ahead of time: the trigger has to load it on demand.
const PublishLauncher = () => {
	const kernel = useContext(KernelContext);
	useEffect(() => {
		if (!kernel) {
			return;
		}
		return publishDevToolsLauncher(kernel, {
			dock: () => undefined,
			getState: () => ({ isOpen: false }),
			subscribe: () => () => undefined,
			toggle: () => undefined,
		});
	}, [kernel]);
	return null;
};

describe('ConsentDialogTrigger toolbar loading', () => {
	test('keeps the single button until a launcher is published', async () => {
		await render(
			<ComponentFixtureProvider options={{ mode: testing() }}>
				<ConsentDialogTrigger showWhen="always" />
			</ComponentFixtureProvider>
		);
		await vi.waitFor(() => {
			expect(
				document.querySelector('[data-testid="consent-dialog-trigger"]')
			).toBeInTheDocument();
		});
		expect(document.querySelector('[role="toolbar"]')).toBeNull();
	});

	test('loads the toolbar when a launcher appears without the DevTools adapter', async () => {
		await render(
			<ComponentFixtureProvider options={{ mode: testing() }}>
				<PublishLauncher />
				<ConsentDialogTrigger showWhen="always" />
			</ComponentFixtureProvider>
		);
		await vi.waitFor(() => {
			expect(
				document.querySelector('[data-inth-trigger-action="devtools"]')
			).toBeInTheDocument();
		});
		expect(
			document.querySelector('[data-inth-trigger-action="preferences"]')
		).toBeInTheDocument();
	});
});
