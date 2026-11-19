/**
 * `ConsentRoot` reads `inth.config.ts` through the `@inth/nextjs/user-config`
 * alias `withConsentManifest` sets, so a Server Component layout renders it
 * with nothing but `state`.
 */
import { useSaveConsents } from '@inth/react';
import { writePolicyResolutionWire } from '@inth/sdk/schema/types';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { ConsentRoot } from '../root';
import { policyFixture } from './policy-fixture';

// oxlint-disable-next-line anti-slop/no-module-mocking -- In an app build, the bundler alias `withConsentManifest` sets swaps this module for the app's inth.config.ts. The mock is that alias; ConsentRoot is real.
vi.mock('@inth/nextjs/user-config', () => ({
	default: {
		// Manifest mode, so the browser inits through the route prefix.
		mode: { type: 'manifest' },
		projectUrl: 'https://consent.example.com',
		routePrefix: '/api/consent',
		scripts: [
			{
				category: 'marketing',
				id: 'config-script',
				src: 'https://example.com/from-config.js',
			},
		],
	},
}));

const scriptCount = (src: string) =>
	document.head.querySelectorAll(`script[src="${src}"]`).length;

afterEach(() => {
	vi.restoreAllMocks();
	for (const script of document.head.querySelectorAll('script[src]')) {
		script.remove();
	}
});

describe('ConsentRoot with inth.config.ts', () => {
	test("loads the config's scripts", async () => {
		const screen = await render(
			<ConsentRoot
				state={policyFixture({ marketing: true })}
				persistence={false}
			>
				<div>config root</div>
			</ConsentRoot>
		);

		await expect.element(screen.getByText('config root')).toBeInTheDocument();
		await vi.waitFor(() =>
			expect(scriptCount('https://example.com/from-config.js')).toBe(1)
		);
	});

	test("props win over the config's options", async () => {
		const screen = await render(
			<ConsentRoot
				state={policyFixture({ marketing: true })}
				persistence={false}
				scripts={[
					{
						category: 'marketing',
						id: 'prop-script',
						src: 'https://example.com/from-props.js',
					},
				]}
			>
				<div>prop root</div>
			</ConsentRoot>
		);

		await expect.element(screen.getByText('prop root')).toBeInTheDocument();
		await vi.waitFor(() =>
			expect(scriptCount('https://example.com/from-props.js')).toBe(1)
		);
		expect(scriptCount('https://example.com/from-config.js')).toBe(0);
	});

	test('without state, the browser inits through the route prefix and saves to the backend', async () => {
		const prepared = policyFixture({}, { id: 'gdpr' });
		const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
			Promise.resolve(
				Response.json(
					String(input).includes('/v1/consent/records')
						? {
								recordId: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
								subjectId: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
							}
						: {
								branding: 'inth',
								location: { countryCode: 'DE', regionCode: null },
								policyResolution: writePolicyResolutionWire(
									prepared.initialPolicyResolution
								),
								translations: {
									language: 'en',
									translations: { common: {} },
								},
							}
				)
			)
		);
		const Save = () => {
			const save = useSaveConsents();
			return (
				<button
					type="button"
					onClick={() => {
						void save('all');
					}}
				>
					save
				</button>
			);
		};

		const screen = await render(
			<ConsentRoot persistence={false}>
				<Save />
			</ConsentRoot>
		);

		await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
		await screen.getByText('save').click();
		await vi.waitFor(() =>
			expect(
				fetch.mock.calls.map(([input]) => String(input).split('?')[0])
			).toEqual([
				'/api/consent/v1/consent/init',
				'https://consent.example.com/v1/consent/records',
			])
		);
	});
});
