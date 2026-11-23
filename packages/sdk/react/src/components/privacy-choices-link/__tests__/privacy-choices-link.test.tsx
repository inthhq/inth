import type {
	ConsentKernel,
	ConsentState,
	OptOutLinkVariant,
} from '@inth/sdk/engine';
import { policyRulePresets } from '@inth/sdk/engine';
import { createRef, useEffect } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';

import { ComponentFixtureProvider as InthProvider } from '~/__tests__/component-fixture-provider';
import { transportMode } from '~/__tests__/fixtures/transport-mode';
import { policyFixture } from '~/__tests__/policy-fixture';
import { ConsentDialog } from '~/aggregate-components';
import { PrivacyChoicesLink } from '~/components/privacy-choices-link';
import { useKernel } from '~/kernel-selector';
import { InthProvider as RawInthProvider } from '~/provider';
import { testing } from '~/testing';

const query = <Element extends HTMLElement>(testId: string) =>
	document.querySelector<Element>(`[data-testid="${testId}"]`);

let activeKernel: ConsentKernel | null = null;

const KernelCapture = () => {
	const kernel = useKernel();
	useEffect(() => {
		activeKernel = kernel;
	}, [kernel]);
	return null;
};

afterEach(() => {
	activeKernel = null;
});

describe('PrivacyChoicesLink', () => {
	test.each([
		['do-not-sell', false],
		['privacy-choices', true],
		['california-privacy-choices', true],
	] as [OptOutLinkVariant, boolean][])(
		'opens the preference dialog and records nothing for presentation.optOutLink=%s (icon=%s)',
		async (optOutLink, expectIcon) => {
			const view = await render(
				<InthProvider
					options={{
						consentCategories: ['functionality', 'marketing', 'measurement'],
						mode: testing(),
						overrides: { country: 'US', region: 'CA' },
						persistence: false,
						prefetch: policyFixture(
							undefined,
							policyRulePresets.usPrivacyStatesOptOut()
						),
						presentation: { optOutLink },
						reloadOnConsentRevoked: false,
					}}
				>
					<KernelCapture />
					<PrivacyChoicesLink />
					<ConsentDialog disableAnimation />
				</InthProvider>
			);

			await vi.waitFor(() =>
				expect(query('privacy-choices-link')).not.toBeNull()
			);
			const link = query<HTMLButtonElement>(
				'privacy-choices-link'
			) as HTMLButtonElement;
			expect(Boolean(link.querySelector('svg[aria-hidden="true"]'))).toBe(
				expectIcon
			);
			expect(Boolean(link.querySelector('svg'))).toBe(expectIcon);

			await userEvent.click(link);

			await vi.waitFor(() =>
				expect(query('consent-dialog-root')).not.toBeNull()
			);
			expect(activeKernel?.getSnapshot().optOut).toBeNull();
			expect(query('opt-out-confirmation-root')).toBeNull();

			await view.unmount();
		}
	);

	test('lets the variant prop override presentation.optOutLink', async () => {
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
					presentation: { optOutLink: 'do-not-sell' },
				}}
			>
				<KernelCapture />
				<PrivacyChoicesLink variant="california-privacy-choices" />
				<ConsentDialog disableAnimation />
			</InthProvider>
		);

		await vi.waitFor(() =>
			expect(query('privacy-choices-link')).not.toBeNull()
		);
		const link = query<HTMLButtonElement>(
			'privacy-choices-link'
		) as HTMLButtonElement;
		expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull();

		await userEvent.click(link);
		await vi.waitFor(() => expect(query('consent-dialog-root')).not.toBeNull());
		expect(activeKernel?.getSnapshot().optOut).toBeNull();

		await view.unmount();
	});

	test('[BNR-05] reopens the dialog under an opt-in rule, with no opt-out icon', async () => {
		const view = await render(
			<InthProvider
				options={{
					mode: testing(),
					overrides: { country: 'DE' },
					persistence: false,
					prefetch: policyFixture(undefined, policyRulePresets.europeOptIn()),
					presentation: { optOutLink: 'privacy-choices' },
				}}
			>
				<KernelCapture />
				<PrivacyChoicesLink />
			</InthProvider>
		);

		await vi.waitFor(() =>
			expect(activeKernel?.getSnapshot().resolution.status).toBe('matched')
		);
		await vi.waitFor(() =>
			expect(query('privacy-choices-link')).toHaveTextContent(
				'Your Privacy Choices'
			)
		);
		expect(query('privacy-choices-link')?.querySelector('svg')).toBeNull();

		await view.unmount();
	});

	test('renders nothing under a none rule even when it grants preferences', async () => {
		const view = await render(
			<InthProvider
				options={{
					mode: testing(),
					persistence: false,
					prefetch: policyFixture(undefined, {
						id: 'none-with-preferences',
						match: { isDefault: true },
						model: 'none',
						prompt: 'none',
						rights: ['preferences'],
					}),
					presentation: { optOutLink: 'privacy-choices' },
				}}
			>
				<KernelCapture />
				<PrivacyChoicesLink />
			</InthProvider>
		);

		await vi.waitFor(() =>
			expect(activeKernel?.getSnapshot().resolution.status).toBe('matched')
		);
		expect(query('privacy-choices-link')).toBeNull();

		await view.unmount();
	});

	test('renders nothing under a none rule even when it carries the opt-out right', async () => {
		const view = await render(
			<InthProvider
				options={{
					mode: testing(),
					persistence: false,
					prefetch: policyFixture(undefined, {
						id: 'none-with-opt-out-right',
						match: { isDefault: true },
						model: 'none',
						prompt: 'none',
						rights: ['opt-out'],
					}),
					presentation: { optOutLink: 'privacy-choices' },
				}}
			>
				<KernelCapture />
				<PrivacyChoicesLink />
			</InthProvider>
		);

		await vi.waitFor(() =>
			expect(activeKernel?.getSnapshot().resolution.status).toBe('matched')
		);
		expect(query('privacy-choices-link')).toBeNull();

		await view.unmount();
	});

	test('renders nothing before a policy resolves', async () => {
		let resolveInit: (() => void) | undefined;
		const view = await render(
			<RawInthProvider
				options={{
					mode: transportMode({
						init: () =>
							new Promise((resolve) => {
								resolveInit = () => resolve({});
							}),
					}),
					persistence: false,
					presentation: { optOutLink: 'privacy-choices' },
				}}
			>
				<PrivacyChoicesLink />
			</RawInthProvider>
		);

		expect(query('privacy-choices-link')).toBeNull();
		resolveInit?.();
		await view.unmount();
	});

	test('renders nothing when an external consent source owns consent', async () => {
		const permissions: Partial<ConsentState> = { marketing: true };
		const source = {
			getPermissions: () => permissions,
			openPreferences: vi.fn(),
			subscribe: () => () => undefined,
		};

		const view = await render(
			<RawInthProvider
				options={{
					consentSource: source,
					iframeBlocker: false,
					mode: transportMode({}),
					persistence: false,
					prefetch: policyFixture(
						undefined,
						policyRulePresets.usPrivacyStatesOptOut()
					),
					presentation: { optOutLink: 'privacy-choices' },
				}}
			>
				<KernelCapture />
				<PrivacyChoicesLink />
			</RawInthProvider>
		);

		await vi.waitFor(() =>
			expect(activeKernel?.getSnapshot().externalPermissions).toBeDefined()
		);
		expect(query('privacy-choices-link')).toBeNull();

		await view.unmount();
	});

	test('forwards ref, className, noStyle and asChild', async () => {
		const buttonRef = createRef<HTMLButtonElement>();
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
				<KernelCapture />
				<PrivacyChoicesLink
					ref={buttonRef}
					className="footer-privacy-link"
				/>
				<PrivacyChoicesLink
					asChild
					data-testid="privacy-choices-anchor"
				>
					<a href="#privacy-choices">Manage privacy choices</a>
				</PrivacyChoicesLink>
				<ConsentDialog disableAnimation />
			</InthProvider>
		);

		await vi.waitFor(() =>
			expect(query('privacy-choices-link')).not.toBeNull()
		);
		const button = query<HTMLButtonElement>(
			'privacy-choices-link'
		) as HTMLButtonElement;
		expect(buttonRef.current).toBe(button);
		expect(button.className).toBe('footer-privacy-link');

		const anchor = query<HTMLAnchorElement>(
			'privacy-choices-anchor'
		) as HTMLAnchorElement;
		expect(anchor.tagName).toBe('A');
		expect(anchor.querySelector('svg[aria-hidden="true"]')).not.toBeNull();

		await userEvent.click(anchor);
		await vi.waitFor(() => expect(query('consent-dialog-root')).not.toBeNull());
		expect(activeKernel?.getSnapshot().optOut).toBeNull();

		await view.unmount();
	});
});
