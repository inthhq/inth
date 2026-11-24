import { useConsent, useOverrides } from '@inth/react';
import { describe, expect, test } from 'vite-plus/test';
import { render } from 'vitest-browser-react';

import { InthProvider } from '../root';
import { testing } from '../testing';
import { policyFixture } from './policy-fixture';

/** These tests are not about the backend; testing() needs none. */
const OFFLINE_CONFIG = { mode: testing() };

describe('InthProvider: state is honored', () => {
	test('initial consents from state reach useConsent', async () => {
		const MarketingStatus = () => {
			const allowed = useConsent('marketing');
			return <div data-testid="status">{String(allowed)}</div>;
		};

		const { getByTestId } = await render(
			<InthProvider
				config={OFFLINE_CONFIG}
				state={policyFixture({ marketing: true, measurement: true })}
				persistence={false}
			>
				<MarketingStatus />
			</InthProvider>
		);

		await expect.element(getByTestId('status')).toMatchTextContent('true');
	});

	test('initial overrides from state reach useOverrides', async () => {
		const CountryLabel = () => {
			const o = useOverrides();
			return (
				<div data-testid="country">
					{o.country ?? 'none'}/{o.language ?? 'none'}
				</div>
			);
		};

		const { getByTestId } = await render(
			<InthProvider
				config={OFFLINE_CONFIG}
				state={{ initialOverrides: { country: 'DE', language: 'de' } }}
			>
				<CountryLabel />
			</InthProvider>
		);

		await expect.element(getByTestId('country')).toMatchTextContent('DE/de');
	});
});

describe('InthProvider: kernel is per-mount', () => {
	test('two roots receive independent kernels', async () => {
		const MarketingStatus = ({ label }: { label: string }) => {
			const allowed = useConsent('marketing');
			return (
				<div data-testid={label}>
					{label}:{String(allowed)}
				</div>
			);
		};

		const screen = await render(
			<div>
				<InthProvider
					config={OFFLINE_CONFIG}
					state={policyFixture({ marketing: true })}
					persistence={false}
				>
					<MarketingStatus label="a" />
				</InthProvider>
				<InthProvider
					config={OFFLINE_CONFIG}
					state={policyFixture({ marketing: false })}
					persistence={false}
				>
					<MarketingStatus label="b" />
				</InthProvider>
			</div>
		);

		await expect.element(screen.getByTestId('a')).toMatchTextContent('a:true');
		await expect.element(screen.getByTestId('b')).toMatchTextContent('b:false');
	});
});
