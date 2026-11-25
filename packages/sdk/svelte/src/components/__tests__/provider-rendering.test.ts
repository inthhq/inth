import { render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, test } from 'vite-plus/test';

import BannerFixture from '../../__tests__/fixtures/banner-fixture.svelte';
import ProviderOnlyFixture from '../../__tests__/fixtures/provider-only-fixture.svelte';
import { testOffline } from '../../__tests__/test-offline';

describe('InthProvider Rendering Behavior', () => {
	beforeEach(() => {});

	test('should render children immediately without blocking', () => {
		render(ProviderOnlyFixture, {
			options: {
				consentCategories: ['necessary', 'marketing'],
				mode: testOffline(),
			},
		});

		expect(screen.getByTestId('render-child')).toBeInTheDocument();
		expect(screen.getByTestId('render-child')).toHaveTextContent('child');
	});

	test('should render children with custom label', () => {
		render(ProviderOnlyFixture, {
			label: 'custom-content',
			options: {
				mode: testOffline(),
			},
		});

		expect(screen.getByTestId('render-custom-content')).toBeInTheDocument();
		expect(screen.getByTestId('render-custom-content')).toHaveTextContent(
			'custom-content'
		);
	});

	test('should render children with different consent categories', () => {
		render(ProviderOnlyFixture, {
			options: {
				consentCategories: ['necessary'],
				mode: testOffline(),
			},
		});

		expect(screen.getByTestId('render-child')).toBeInTheDocument();
	});

	test('should not render the banner overlay by default', async () => {
		render(BannerFixture, {
			options: {
				mode: testOffline(),
			},
		});

		await waitFor(() => {
			expect(screen.getByTestId('consent-banner-root')).toBeInTheDocument();
		});

		expect(
			screen.queryByTestId('consent-banner-overlay')
		).not.toBeInTheDocument();
	});

	test('[BNR-13] should render the banner overlay when the prompt blocks until a choice', async () => {
		render(BannerFixture, {
			options: {
				mode: testOffline(),
				presentation: { prompt: { blockUntilChoice: true } },
			},
		});

		await waitFor(() => {
			expect(screen.getByTestId('consent-banner-overlay')).toBeInTheDocument();
		});
	});
});
