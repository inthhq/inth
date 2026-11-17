/**
 * `ConsentProvider` for client-rendered pages with a mode other than
 * `hosted()`, as a browser build resolves it: the engine loads with the
 * page, and the stock surfaces under the provider find its kernel. Its own
 * file: the provider loads its engine once per page.
 */
import { policyRulePresets } from '@c15t/schema/types';
import { afterEach, expect, test } from 'vitest';
import { render } from 'vitest-browser-react';

import { offlineMode } from '../../__tests__/fixtures/transport-mode';
import { policyFixture } from '../../__tests__/policy-fixture';
import { ConsentDialog } from '../../aggregate-components';
import { ConsentDialogTrigger } from '../../components/panel-trigger';
import { createConsentProvider } from '../client-provider';

const ConsentProvider = createConsentProvider();

const rule = policyRulePresets.europeOptIn();

afterEach(() => {
	localStorage.clear();
});

const renderTrigger = (prefetch?: ReturnType<typeof policyFixture>) =>
	render(
		<ConsentProvider
			options={{
				mode: offlineMode([rule]),
				prefetch,
			}}
		>
			<ConsentDialogTrigger />
			<ConsentDialog />
		</ConsentProvider>
	);

test('offline(): the trigger renders under the provider and opens the dialog', async () => {
	const screen = await renderTrigger();
	const trigger = screen.getByTestId('consent-dialog-trigger');
	await expect.element(trigger).toBeVisible();
	await trigger.click();
	await expect.element(screen.getByTestId('consent-dialog-root')).toBeVisible();
	await screen.unmount();
});

test('offline() with a resolved policy in prefetch: the same, with the engine from the first render', async () => {
	const screen = await renderTrigger(policyFixture({}, rule));
	const trigger = screen.getByTestId('consent-dialog-trigger');
	await expect.element(trigger).toBeVisible();
	await trigger.click();
	await expect.element(screen.getByTestId('consent-dialog-root')).toBeVisible();
	await screen.unmount();
});
