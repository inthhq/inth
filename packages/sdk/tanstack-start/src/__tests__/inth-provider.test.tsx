/**
 * Tests for InthProvider, the client component that creates a kernel
 * from loader-produced state and wraps children in InthProvider.
 *
 * Invariants verified:
 * - State is respected (initial consents, initial overrides).
 * - Kernel is per-mount (two mounts produce two kernels).
 * - The state's `projectUrl` and `routePrefix` pick the transport. Init
 *   goes to the backend unless `routePrefix` names the same-origin consent
 *   route.
 */
import {
	useConsent,
	useDeclaredVendors,
	useOverrides,
	useVendorAllowed,
} from '@inth/react';
import { ConsentGPP } from '@inth/react/gpp';
import { describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
// The provider imports this module the first time clearOnRevocation is set.
// Vite compiles it on that first request, which can outlast the test's 1 s
// vi.waitFor while other packages' tests run. Importing it here compiles it
// while the file loads.
import '@inth/sdk/modules/clear-on-revocation';

import { InthProvider } from '../root';
import { testing } from '../testing';
import { policyFixture } from './policy-fixture';

describe('InthProvider: state is honored', () => {
	test('initial consents from state reach useConsent', async () => {
		const MarketingStatus = () => {
			const allowed = useConsent('marketing');
			return <div data-testid="status">{String(allowed)}</div>;
		};

		const { getByTestId } = await render(
			<InthProvider
				state={{
					...policyFixture({ marketing: true, measurement: true }),
				}}
				persistence={false}
			>
				<MarketingStatus />
			</InthProvider>
		);

		await expect.element(getByTestId('status')).toHaveTextContent('true');
	});

	test('initial overrides from state reach useOverrides', async () => {
		const CountryLabel = () => {
			const overrides = useOverrides();
			return (
				<div data-testid="country">
					{overrides.country ?? 'none'}/{overrides.language ?? 'none'}
				</div>
			);
		};

		const { getByTestId } = await render(
			<InthProvider
				state={{
					initialOverrides: { country: 'DE', language: 'de' },
					mode: testing(),
				}}
				persistence={false}
			>
				<CountryLabel />
			</InthProvider>
		);

		await expect.element(getByTestId('country')).toHaveTextContent('DE/de');
	});
});

describe('InthProvider: kernel is per-mount', () => {
	test('two roots do not share consent state', async () => {
		const Status = ({ id }: { id: string }) => {
			const allowed = useConsent('marketing');
			return <div data-testid={id}>{String(allowed)}</div>;
		};

		const { getByTestId } = await render(
			<>
				<InthProvider
					state={{
						...policyFixture({ marketing: true }),
					}}
					persistence={false}
				>
					<Status id="first" />
				</InthProvider>
				<InthProvider
					state={{
						...policyFixture({ marketing: false }),
					}}
					persistence={false}
				>
					<Status id="second" />
				</InthProvider>
			</>
		);

		await expect.element(getByTestId('first')).toHaveTextContent('true');
		await expect.element(getByTestId('second')).toHaveTextContent('false');
	});
});

describe('InthProvider: transport selection', () => {
	const initResponse = () =>
		Response.json({
			branding: 'inth',
			location: { countryCode: 'DE', regionCode: null },
			translations: { language: 'en', translations: { common: {} } },
		});

	test('an absolute projectUrl gets init from the backend by default', async () => {
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockImplementation(() => Promise.resolve(initResponse()));

		try {
			await render(
				<InthProvider
					state={{ projectUrl: 'https://consent.example.com' }}
					persistence={false}
				>
					<span>ready</span>
				</InthProvider>
			);

			await vi.waitFor(() => {
				expect(fetchSpy).toHaveBeenCalled();
			});
			// The query carries the consent journey.
			expect(String(fetchSpy.mock.calls[0]?.[0]).split('?')[0]).toBe(
				'https://consent.example.com/v1/consent/init'
			);
		} finally {
			fetchSpy.mockRestore();
		}
	});

	test('routePrefix runs init through the same-origin route', async () => {
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockImplementation(() => Promise.resolve(initResponse()));

		try {
			await render(
				<InthProvider
					state={{
						mode: { type: 'manifest' },
						projectUrl: 'https://consent.example.com',
						routePrefix: '/api/inth/',
					}}
					persistence={false}
				>
					<span>ready</span>
				</InthProvider>
			);

			await vi.waitFor(() => {
				expect(fetchSpy).toHaveBeenCalled();
			});
			expect(String(fetchSpy.mock.calls[0]?.[0]).split('?')[0]).toBe(
				'/api/inth/v1/consent/init'
			);
		} finally {
			fetchSpy.mockRestore();
		}
	});

	test('a same-origin projectUrl without routePrefix calls its /init directly', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			Response.json({
				branding: 'inth',
				location: { countryCode: 'DE', regionCode: null },
				translations: { language: 'en', translations: { common: {} } },
			})
		);

		try {
			await render(
				<InthProvider
					state={{ projectUrl: '/api/inth' }}
					persistence={false}
				>
					<span>ready</span>
				</InthProvider>
			);

			await vi.waitFor(() => {
				expect(fetchSpy).toHaveBeenCalled();
			});
			// The query carries the consent journey.
			expect(String(fetchSpy.mock.calls[0]?.[0]).split('?')[0]).toBe(
				'/api/inth/v1/consent/init'
			);
		} finally {
			fetchSpy.mockRestore();
		}
	});
});

test('forwards clearOnRevocation and removes denied category storage', async () => {
	localStorage.setItem('analytics:visitor', 'visitor');
	const screen = await render(
		<InthProvider
			state={policyFixture({ measurement: false })}
			persistence={false}
			clearOnRevocation={{
				measurement: { localStorage: ['analytics:visitor'] },
			}}
		>
			<div>cleanup configured</div>
		</InthProvider>
	);
	await vi.waitFor(() =>
		expect(localStorage.getItem('analytics:visitor')).toBeNull()
	);
	screen.unmount();
});

test('forwards vendors so the preference center lists them and gates their scripts', async () => {
	const Probe = () => {
		const declared = useDeclaredVendors();
		const allowed = useVendorAllowed('meta-pixel');
		return (
			<output data-testid="probe">
				{JSON.stringify({ allowed, ids: declared.map((vendor) => vendor.id) })}
			</output>
		);
	};
	const { getByTestId } = await render(
		<InthProvider
			state={policyFixture({ marketing: true })}
			persistence={false}
			vendors={[
				{
					category: 'marketing',
					id: 'meta-pixel',
					name: 'Meta Pixel',
					privacyPolicyUrl: 'https://www.facebook.com/privacy/policy/',
				},
			]}
		>
			<Probe />
		</InthProvider>
	);
	await expect
		.element(getByTestId('probe'))
		.toHaveTextContent('{"allowed":true,"ids":["meta-pixel"]}');
});

test('ConsentGPP mounts __gpp inside InthProvider, and unmount removes it', async () => {
	type GPPPing = (
		command: 'ping',
		callback: (data: { cmpStatus: string }) => void
	) => void;
	const cmpStatus = () => {
		let status: string | undefined;
		(window as { __gpp?: GPPPing }).__gpp?.('ping', (data) => {
			status = data.cmpStatus;
		});
		return status;
	};
	const screen = await render(
		<InthProvider
			state={policyFixture()}
			persistence={false}
		>
			<ConsentGPP />
			<div>gpp configured</div>
		</InthProvider>
	);
	await vi.waitFor(() => expect(cmpStatus()).toBe('loaded'), {
		timeout: 5000,
	});
	await screen.unmount();
	expect((window as { __gpp?: GPPPing }).__gpp).toBeUndefined();
});
