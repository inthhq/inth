import { policyRulePresets } from '@inth/sdk/engine';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';

import { ComponentFixtureProvider as InthProvider } from '~/__tests__/component-fixture-provider';
import { policyFixture } from '~/__tests__/policy-fixture';
import { ConsentDialog } from '~/aggregate-components';
import { ConsentDialogLink } from '~/components/panel-link';
import { ConsentDialogTrigger } from '~/components/panel-trigger';

import { testing } from '../../../testing';

describe('ConsentDialogLink', () => {
	beforeEach(() => {
		window.localStorage.clear();
		vi.clearAllMocks();
	});

	test.each(['opt-in', 'opt-out'] as const)(
		'exposes the rights of the %s policy on preferences controls',
		async (model) => {
			render(
				<InthProvider
					options={{
						mode: testing(),
						prefetch: policyFixture({}, { model }),
					}}
				>
					<ConsentDialogLink>Preferences</ConsentDialogLink>
					<ConsentDialogTrigger />
				</InthProvider>
			);
			await vi.waitFor(() => {
				for (const testId of [
					'consent-dialog-link',
					'consent-dialog-trigger',
				]) {
					expect(
						document.querySelector(`[data-testid="${testId}"]`)
					).toHaveAttribute(
						'data-inth-rights',
						model === 'opt-out'
							? 'disclosure opt-out preferences'
							: 'disclosure preferences'
					);
				}
			});
		}
	);

	test('sizes the CPPA icon of an opt-out link, as PrivacyChoicesLink does', async () => {
		const view = await render(
			<InthProvider
				options={{
					mode: testing(),
					overrides: { country: 'US', region: 'CA' },
					persistence: false,
					prefetch: policyFixture(
						undefined,
						policyRulePresets.usPrivacyStatesOptOut()
					),
					presentation: { optOutLink: 'privacy-choices' },
				}}
			>
				<ConsentDialogLink right="opt-out" />
			</InthProvider>
		);
		const icon = await vi.waitFor(() => {
			const svg = document.querySelector(
				'[data-testid="consent-dialog-link"] svg[aria-hidden="true"]'
			);
			expect(svg).not.toBeNull();
			return svg as SVGSVGElement;
		});
		// A page that loads no sheet sizing it would let it fill the line.
		expect(icon).toHaveAttribute('height', '14');
		expect(icon.getBoundingClientRect().height).toBe(14);
		await view.unmount();
	});

	test('renders custom text and opens the dialog when clicked', async () => {
		render(
			<InthProvider options={{ mode: testing() }}>
				<ConsentDialog />
				<ConsentDialogLink>Your privacy settings</ConsentDialogLink>
			</InthProvider>
		);

		await vi.waitFor(
			() => {
				const link = document.querySelector(
					'[data-testid="consent-dialog-link"]'
				) as HTMLButtonElement | null;
				expect(link).toBeInTheDocument();
				expect(link?.textContent).toContain('Your privacy settings');
				expect(link?.className ?? '').toBe('');
			},
			{ timeout: 3000 }
		);

		const link = document.querySelector(
			'[data-testid="consent-dialog-link"]'
		) as HTMLButtonElement;
		await userEvent.click(link);

		await vi.waitFor(
			() => {
				const dialog = document.querySelector(
					'[data-testid="consent-dialog-root"]'
				);
				expect(dialog).toBeInTheDocument();
			},
			{ timeout: 3000 }
		);
	});

	test('supports asChild for anchor-based footer links', async () => {
		render(
			<InthProvider options={{ mode: testing() }}>
				<ConsentDialog />
				<ConsentDialogLink asChild>
					<a
						href="#privacy-settings"
						data-testid="consent-preferences-anchor"
					>
						Manage Preferences
					</a>
				</ConsentDialogLink>
			</InthProvider>
		);

		await vi.waitFor(
			() => {
				const anchor = document.querySelector(
					'[data-testid="consent-preferences-anchor"]'
				) as HTMLAnchorElement | null;
				expect(anchor).toBeInTheDocument();
				expect(anchor?.hasAttribute('noStyle')).toBe(false);
				expect(anchor?.hasAttribute('nostyle')).toBe(false);
			},
			{ timeout: 3000 }
		);

		const anchor = document.querySelector(
			'[data-testid="consent-preferences-anchor"]'
		) as HTMLAnchorElement;
		await userEvent.click(anchor);

		await vi.waitFor(
			() => {
				const dialog = document.querySelector(
					'[data-testid="consent-dialog-root"]'
				);
				expect(dialog).toBeInTheDocument();
			},
			{ timeout: 3000 }
		);
	});
});
