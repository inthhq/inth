import type { ConsentKernel } from '@inth/sdk/engine';
import { policyRulePresets } from '@inth/sdk/engine';
import type { PolicyRule } from '@inth/sdk/schema/types';
import { closeOptOutConfirmation } from '@inth/sdk/surface-actions';
import { useEffect } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { ComponentFixtureProvider as InthProvider } from '~/__tests__/component-fixture-provider';
import { policyFixture } from '~/__tests__/policy-fixture';
import { ConsentDialog, OptOutConfirmation } from '~/aggregate-components';
import { ConsentDialogLink } from '~/components/panel-link/panel-link';
import { ConsentDialogTrigger } from '~/components/panel-trigger';
import { ConsentBanner } from '~/components/prompt';
import { useOptOut } from '~/hooks';
import { testing } from '~/testing';
import { useKernel } from '~/use-kernel-selector';

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

const OptOutButton = () => {
	const optOut = useOptOut();
	return (
		<button
			type="button"
			data-testid="custom-opt-out"
			onClick={() => {
				void optOut();
			}}
		>
			Opt out now
		</button>
	);
};

const noticeRule = (): PolicyRule => ({
	...policyRulePresets.usPrivacyStatesOptOut(),
	prompt: 'notice',
});

afterEach(() => {
	if (activeKernel) {
		closeOptOutConfirmation(activeKernel);
		activeKernel = null;
	}
});

describe('opt-out link behavior by title in React', () => {
	test.each(['privacy-choices', 'california-privacy-choices'] as const)(
		'opens the dialog and records nothing from the footer link and trigger when optOutLink=%s',
		async (optOutLink) => {
			const view = await render(
				<InthProvider
					options={{
						consentCategories: ['functionality', 'marketing', 'measurement'],
						mode: testing(),
						overrides: { country: 'US', region: 'CA' },
						persistence: false,
						prefetch: policyFixture(undefined, noticeRule()),
						presentation: { optOutLink },
						reloadOnConsentRevoked: false,
					}}
				>
					<KernelCapture />
					<ConsentBanner disableAnimation />
					<ConsentDialogLink right="opt-out" />
					<ConsentDialogTrigger showWhen="always" />
					<ConsentDialog disableAnimation />
					<OptOutConfirmation disableAnimation />
				</InthProvider>
			);

			await vi.waitFor(() =>
				expect(query('consent-dialog-link')).not.toBeNull()
			);
			query<HTMLButtonElement>('consent-dialog-link')?.click();
			await vi.waitFor(() =>
				expect(query('consent-dialog-root')).not.toBeNull()
			);
			expect(activeKernel?.getSnapshot().optOut).toBeNull();
			expect(query('opt-out-confirmation-root')).toBeNull();

			activeKernel?.set.activeUI('none');
			await vi.waitFor(() =>
				expect(query('consent-dialog-trigger')).not.toBeNull()
			);

			query<HTMLButtonElement>('consent-dialog-trigger')?.click();
			await vi.waitFor(() =>
				expect(query('consent-dialog-root')).not.toBeNull()
			);
			expect(activeKernel?.getSnapshot().optOut).toBeNull();
			expect(query('opt-out-confirmation-root')).toBeNull();

			await view.unmount();
		}
	);

	test('keeps useOptOut opting out in one step even when optOutLink is privacy-choices', async () => {
		const view = await render(
			<InthProvider
				options={{
					consentCategories: ['functionality', 'marketing', 'measurement'],
					mode: testing(),
					overrides: { country: 'US', region: 'CA' },
					persistence: false,
					prefetch: policyFixture(undefined, noticeRule()),
					presentation: { optOutLink: 'privacy-choices' },
					reloadOnConsentRevoked: false,
				}}
			>
				<KernelCapture />
				<OptOutButton />
				<ConsentDialog disableAnimation />
				<OptOutConfirmation disableAnimation />
			</InthProvider>
		);

		query<HTMLButtonElement>('custom-opt-out')?.click();
		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		expect(activeKernel?.getSnapshot().optOut?.method).toBe('button');
		expect(query('consent-dialog-root')).toBeNull();

		await view.unmount();
	});

	test('follows the resolved optOutLink from an experiment arm on custom-text links', async () => {
		const view = await render(
			<InthProvider
				options={{
					consentCategories: ['functionality', 'marketing', 'measurement'],
					experiment: {
						arm: 'choices',
						arms: { choices: { optOutLink: 'privacy-choices' } },
						id: 'opt-out-link-exp',
					},
					mode: testing(),
					overrides: { country: 'US', region: 'CA' },
					persistence: false,
					prefetch: policyFixture(undefined, noticeRule()),
					reloadOnConsentRevoked: false,
				}}
			>
				<KernelCapture />
				<ConsentDialogLink right="opt-out">
					Custom footer text
				</ConsentDialogLink>
				<ConsentDialog disableAnimation />
				<OptOutConfirmation disableAnimation />
			</InthProvider>
		);

		await vi.waitFor(() =>
			expect(
				query('consent-dialog-link')?.getAttribute('data-opt-out-variant')
			).toBe('privacy-choices')
		);
		query<HTMLButtonElement>('consent-dialog-link')?.click();
		await vi.waitFor(() => expect(query('consent-dialog-root')).not.toBeNull());
		expect(activeKernel?.getSnapshot().optOut).toBeNull();
		expect(query('opt-out-confirmation-root')).toBeNull();

		await view.unmount();
	});
});
