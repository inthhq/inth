/**
 * `testing()` from `@inth/react/testing` in a provider: the banner
 * and the choice work with no backend, and the location override picks the
 * policy.
 */
import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { ConsentBanner, ConsentProvider, useConsent } from '../index';
import { testing } from '../testing';

const Marketing = () => (
	<output data-testid="marketing">{String(useConsent('marketing'))}</output>
);

afterEach(() => {
	localStorage.clear();
	vi.restoreAllMocks();
});

test('shows the opt-in banner for an EEA country and records the choice without a request', async () => {
	const fetchSpy = vi.spyOn(globalThis, 'fetch');
	const screen = await render(
		<ConsentProvider
			options={{
				consentCategories: ['marketing'],
				mode: testing(),
				overrides: { country: 'DE' },
				persistence: false,
			}}
		>
			<Marketing />
			<ConsentBanner />
		</ConsentProvider>
	);

	await screen.getByTestId('consent-banner-accept-button').click();

	await expect
		.element(screen.getByTestId('marketing'))
		.toHaveTextContent('true');
	expect(fetchSpy).not.toHaveBeenCalled();
});

test('shows no banner for a country without a privacy rule', async () => {
	const screen = await render(
		<ConsentProvider
			options={{
				mode: testing(),
				overrides: { country: 'JP' },
				persistence: false,
			}}
		>
			<Marketing />
			<ConsentBanner />
		</ConsentProvider>
	);

	await expect
		.element(screen.getByTestId('marketing'))
		.toHaveTextContent('true');
	await expect
		.element(screen.getByTestId('consent-banner-root'))
		.not.toBeInTheDocument();
});
